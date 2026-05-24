import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  Timestamp, 
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { ScannedInvoice } from "./gemini";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Product {
  id?: string;
  name: string;
  currentPrice: number;
  previousPrice?: number;
  previousInvoiceId?: string;
  previousDate?: string;
  lastUpdated: string;
  userId: string;
  store?: string;
  lastInvoiceId?: string;
  printedPrice?: number; // Original price before hidden discount
}

export interface PriceRecord {
  id?: string;
  price: number;
  date: string;
  store?: string;
  invoiceId?: string;
  userId: string;
}

export interface Invoice {
  id?: string;
  date: string;
  store: string;
  total: number;
  invoiceNumber?: string;
  userId: string;
  createdAt: any;
  items: { lineNumber?: number, name: string, price: number, quantity: number, total?: number, discount?: number, remarks?: string, printed_price?: number }[];
  images?: string[]; // Base64 images
  remarks?: string;
}

export interface Supplier {
  name: string;
  lastInvoiceDate: string;
  lastInvoiceNumber?: string;
  totalSpent: number;
  invoiceCount: number;
}

export const getProducts = async (): Promise<Product[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, "products"), where("userId", "==", user.uid));
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "products");
    return [];
  }
};

export const getPriceHistory = async (productId: string): Promise<PriceRecord[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, `products/${productId}/history`),
    where("userId", "==", user.uid)
  );
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PriceRecord))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `products/${productId}/history`);
    return [];
  }
};

export const getStats = async () => {
  const user = auth.currentUser;
  if (!user) return { totalExpenses: 0, productsCount: 0, storesCount: 0, alertsCount: 0 };

  const productsRef = collection(db, "products");
  const q = query(productsRef, where("userId", "==", user.uid));
  
  try {
    const querySnapshot = await getDocs(q);
    const products = querySnapshot.docs.map(doc => doc.data() as Product);
    
    const stores = new Set(products.map(p => p.store).filter(Boolean));
    const alertsCount = products.filter(p => p.previousPrice !== undefined && p.previousPrice !== null && Math.abs(p.currentPrice - p.previousPrice) > 0.01).length;
    
    // For total expenses, ideally we sum up invoice totals, but as a shortcut we can sum current prices or fetch from invoices collection
    const invoicesRef = collection(db, "invoices");
    const invQ = query(invoicesRef, where("userId", "==", user.uid));
    const invSnapshot = await getDocs(invQ);
    const invoicesData = invSnapshot.docs.map(doc => doc.data() as Invoice);
    const totalExpenses = invoicesData.reduce((acc, inv) => acc + (inv.total || 0), 0);
    const storesCount = new Set(invoicesData.map(inv => (inv.store || '').trim().toLowerCase()).filter(Boolean)).size;

    return {
      totalExpenses,
      productsCount: products.length,
      storesCount,
      alertsCount
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "stats");
    return { totalExpenses: 0, productsCount: 0, storesCount: 0, alertsCount: 0 };
  }
};

export const getInvoices = async (): Promise<Invoice[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, "invoices"), where("userId", "==", user.uid));
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "invoices");
    return [];
  }
};

export const getSuppliers = async (): Promise<Supplier[]> => {
  const invoices = await getInvoices();
  const summary: Record<string, Supplier> = {};

  invoices.forEach(inv => {
    const storeName = (inv.store || 'ספק לא ידוע').trim();
    const key = storeName.toLowerCase();
    
    if (!summary[key]) {
      summary[key] = {
        name: storeName,
        lastInvoiceDate: inv.date,
        lastInvoiceNumber: inv.invoiceNumber,
        totalSpent: 0,
        invoiceCount: 0
      };
    }
    
    summary[key].totalSpent += inv.total;
    summary[key].invoiceCount += 1;
    
    if (new Date(inv.date) > new Date(summary[key].lastInvoiceDate)) {
      summary[key].lastInvoiceDate = inv.date;
      summary[key].lastInvoiceNumber = inv.invoiceNumber;
      summary[key].name = storeName; // Keep the cased version of the newest invoice
    }
  });

  return Object.values(summary).sort((a, b) => b.totalSpent - a.totalSpent);
};

export const deleteInvoice = async (invoiceId: string) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(db, "invoices", invoiceId));
    console.log(`Successfully deleted invoice: ${invoiceId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`);
  }
};

export const deleteProduct = async (productId: string) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(db, "products", productId));
    console.log(`Successfully deleted product: ${productId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
};

export const fixExistingInvoices = async () => {
  const user = auth.currentUser;
  if (!user) return;

  console.log("Starting fixExistingInvoices...");
  const invoices = await getInvoices();
  // Sort by date ascending to process chronological history
  const sortedInvoices = [...invoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Track existing product IDs to know what to delete later
  const existingProductDocs = await getDocs(query(collection(db, "products"), where("userId", "==", user.uid)));
  const existingProductIds = new Set(existingProductDocs.docs.map(doc => doc.id));

  // Track product states locally to reconstruct the latest "current" and "previous" prices
  const productStates: Record<string, { 
    name: string, 
    currentPrice: number, 
    previousPrice?: number, 
    previousInvoiceId?: string,
    previousDate?: string,
    printedPrice?: number | null,
    lastUpdated: string, 
    store: string, 
    lastInvoiceId: string 
  }> = {};

  const invoiceUpdates: Promise<void>[] = [];

  for (const inv of sortedInvoices) {
    if (!inv.id) continue;
    
    const sumOfItems = inv.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (Math.abs(sumOfItems - inv.total) > 0.1 && sumOfItems > 0) {
      console.log(`Planning fix for invoice ${inv.id}: ${inv.total} -> ${sumOfItems}`);
      invoiceUpdates.push(updateDoc(doc(db, "invoices", inv.id), {
        total: sumOfItems
      }).catch(e => console.error(`Failed to update invoice ${inv.id}`, e)));
    }

    // Process products chronological state
    for (const item of inv.items) {
      const normalizedName = item.name.trim().toLowerCase();
      const lookupName = normalizedName
        .replace(/[0-9]+/g, '') // Remove numbers (often quantities)
        .replace(/[\/\\()\[\]]/g, ' ') // Remove slashes/brackets
        .replace(/\s+/g, ' ')
        .trim();

      let safeName = lookupName.replace(/[^a-z0-9\u0590-\u05FF]/g, '_').substring(0, 50);
      if (!safeName || safeName.replace(/_/g, '') === '') {
        safeName = `fixed_prod_${inv.id.substring(0,5)}`;
      }
      
      const productDocId = `${user.uid}_${safeName}`;
      const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0;

      if (!productStates[productDocId]) {
        productStates[productDocId] = {
          name: item.name,
          currentPrice: price,
          previousPrice: null,
          previousInvoiceId: null,
          previousDate: null,
          printedPrice: (item.printed_price != null && Math.abs(item.printed_price - price) > 0.05) ? item.printed_price : null,
          lastUpdated: inv.date,
          store: inv.store,
          lastInvoiceId: inv.id
        };
      } else {
        const existing = productStates[productDocId];
        const printedPriceValue = (item.printed_price != null && Math.abs(item.printed_price - price) > 0.05) ? item.printed_price : null;
        // If price changed, update previousPrice. Otherwise keep it as is.
        if (Math.abs(existing.currentPrice - price) > 0.01) {
          const isSameInvoice = existing.lastInvoiceId === inv.id;
          productStates[productDocId] = {
            ...existing,
            previousPrice: isSameInvoice ? existing.previousPrice : existing.currentPrice,
            previousInvoiceId: isSameInvoice ? existing.previousInvoiceId : (existing.lastInvoiceId || null),
            previousDate: isSameInvoice ? existing.previousDate : (existing.lastUpdated || null),
            currentPrice: price,
            printedPrice: printedPriceValue,
            lastUpdated: inv.date,
            store: inv.store,
            lastInvoiceId: inv.id
          };
        } else {
          productStates[productDocId] = {
            ...existing,
            printedPrice: printedPriceValue,
            lastUpdated: inv.date,
            store: inv.store,
            lastInvoiceId: inv.id
          };
        }
      }
    }
  }

  // Await invoice total fixes
  if (invoiceUpdates.length > 0) {
    await Promise.all(invoiceUpdates);
  }

  // Update all product documents with the final calculated state
  const updatedIds = new Set(Object.keys(productStates));
  const productSyncs: Promise<void>[] = [];
  
  for (const [docId, state] of Object.entries(productStates)) {
    productSyncs.push(
      setDoc(doc(db, "products", docId), {
        ...state,
        userId: user.uid
      }, { merge: true }).catch(error => console.error(`Error syncing product ${docId}:`, error))
    );
  }

  // Run product syncs in parallel
  if (productSyncs.length > 0) {
    await Promise.all(productSyncs);
  }

  // Delete products that no longer exist in any invoice (orphaned)
  const deletions: Promise<void>[] = [];
  for (const oldId of existingProductIds) {
    if (!updatedIds.has(oldId)) {
      deletions.push(
        deleteDoc(doc(db, "products", oldId))
          .then(() => console.log(`Deleted orphaned product: ${oldId}`))
          .catch(error => console.error(`Error deleting orphaned product ${oldId}:`, error))
      );
    }
  }

  if (deletions.length > 0) {
    await Promise.all(deletions);
  }
  
  console.log("fixExistingInvoices completed.");
};

export const saveInvoice = async (scanned: ScannedInvoice & { images?: string[] }): Promise<number> => {
  const user = auth.currentUser;
  if (!user) return 0;

  const items = (scanned.items || []).map(item => {
    const rawPrice = Number((typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0).toFixed(2));
    const rawQuantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 1;
    const rawTotal = item.total != null ? Number(Number(item.total).toFixed(2)) : null;
    const rawDiscount = item.discount != null ? Number(Number(item.discount).toFixed(2)) : null;
    
    const rowTotalCalculated = rawTotal != null ? rawTotal : (rawPrice * rawQuantity - (rawDiscount || 0));
    const actualPrice = Number((rowTotalCalculated / rawQuantity).toFixed(2));

    let printedPrice: number | null = null;
    if (Math.abs(actualPrice - rawPrice) > 0.05) {
      printedPrice = rawPrice;
    }

    return {
      lineNumber: item.lineNumber !== undefined ? item.lineNumber : null,
      name: item.name || 'מוצר ללא שם',
      price: actualPrice || 0, // The calculated true unit price
      printed_price: printedPrice, // The original printed unit price, if different
      quantity: rawQuantity || 0,
      total: rowTotalCalculated || 0,
      discount: rawDiscount || null,
      remarks: item.remarks || null
    };
  });

  // Calculate sum of items to verify total
  const calculatedTotal = items.reduce((sum, item) => sum + item.total, 0);
  const extractedTotal = typeof scanned.total === 'number' ? scanned.total : parseFloat(String(scanned.total)) || 0;

  // Verification logic: If difference is more than 0.5, prefer the sum of items if it's greater than 0
  let finalTotal = (Math.abs(calculatedTotal - extractedTotal) > 0.5 && calculatedTotal > 0) 
    ? calculatedTotal 
    : extractedTotal;
  finalTotal = Number(finalTotal.toFixed(2));

  // Limit images size to stay within 1MB Firestore limit
  let finalImages = scanned.images || [];
  let totalChars = finalImages.reduce((sum, img) => sum + img.length, 0);
  
  // Roughly 1 character per byte in base64. 
  // We want to stay well below 1,048,576 bytes.
  const MAX_ALLOWED_CHARS = 800000; 

  if (totalChars > MAX_ALLOWED_CHARS) {
    console.warn(`Images total size (${totalChars}) exceeds limit. Pruning...`);
    const pruned: string[] = [];
    let currentSize = 0;
    
    for (const img of finalImages) {
      if (currentSize + img.length < MAX_ALLOWED_CHARS) {
        pruned.push(img);
        currentSize += img.length;
      } else {
        break; // Stop adding images that would exceed the limit
      }
    }
    finalImages = pruned;
    if (finalImages.length === 0 && (scanned.images?.length || 0) > 0) {
      // If even the first image is too big, just keep it but it might fail save (meaning compression failed or image is HUGE)
      finalImages = [scanned.images![0]];
    }
  }

  const invoiceData = {
    store: scanned.store || 'חנות לא ידועה',
    date: scanned.date || new Date().toISOString(),
    total: finalTotal,
    invoiceNumber: scanned.invoiceNumber || '',
    items,
    images: finalImages,
    remarks: scanned.remarks || null,
    userId: user.uid,
    createdAt: Timestamp.now(),
  };

  try {
    const docRef = await addDoc(collection(db, "invoices"), invoiceData);
    
    // Group items by product ID to prevent race conditions within the same invoice
    const itemsByProductId: Record<string, typeof items[0]> = {};
    for (const item of items) {
      const normalizedName = item.name.trim().toLowerCase();
      const lookupName = normalizedName
        .replace(/[0-9]+/g, '') 
        .replace(/[\/\\()\[\]]/g, ' ') 
        .replace(/\s+/g, ' ')
        .trim();
      
      let safeName = lookupName.replace(/[^a-z0-9\u0590-\u05FF]/g, '_').substring(0, 50);
      if (!safeName || safeName.replace(/_/g, '') === '') {
        safeName = `fixed_prod_${docRef.id.substring(0,5)}`;
      }
      const productDocId = `${user.uid}_${safeName}`;
      
      // If we have duplicates in the same invoice, prefer the one with highest price (or just keep one)
      if (!itemsByProductId[productDocId] || item.price > itemsByProductId[productDocId].price) {
        itemsByProductId[productDocId] = item;
      }
    }

    // Process unique items in parallel
    const productPromises = Object.values(itemsByProductId).map((item: any) => 
      processProductPrice(item, invoiceData.store, user.uid, invoiceData.date, docRef.id)
        .catch(itemError => { console.error("Error processing item:", item.name, itemError); return false; })
    );
    
    const results = await Promise.all(productPromises);
    const alertsCount = results.filter(r => r === true).length;
    return alertsCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "invoices");
    return 0;
  }
};

async function processProductPrice(item: {name: string, price: number, printed_price?: number | null}, store: string, userId: string, invoiceDate: string, invoiceId?: string): Promise<boolean> {
  const normalizedName = item.name.trim().toLowerCase();
  
  // More robust cleanup for safe document ID
  // Remove common prefix/suffix words that might vary between invoices
  const cleanup = (name: string) => {
    return name
      .replace(/[0-9]+/g, '') // Remove numbers (often quantities)
      .replace(/[\/\\()\[\]]/g, ' ') // Remove slashes/brackets
      .replace(/\s+/g, ' ')
      .trim();
  };

  const processedName = cleanup(normalizedName);
  
  // Allow Hebrew characters (\u0590-\u05FF) in the document ID
  let safeName = processedName.replace(/[^a-z0-9\u0590-\u05FF]/g, '_').substring(0, 50);
  if (!safeName || safeName.replace(/_/g, '') === '') {
    // Fallback if name is empty or only special characters
    safeName = `product_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  const productDocId = `${userId}_${safeName}`;
  const productRef = doc(db, "products", productDocId);

  // Ensure price is a valid number
  const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0;

  const productSnap = await getDoc(productRef);
  const dateToStore = invoiceDate || new Date().toISOString();
  let isPriceAlert = false;

  try {
    const printedPriceValue = (item.printed_price != null && Math.abs(item.printed_price - price) > 0.05) ? item.printed_price : null;
    
    if (productSnap.exists()) {
        const existing = productSnap.data() as Product;
        // If price changed, update previousPrice. Otherwise keep it as is.
        if (Math.abs((existing.currentPrice || 0) - price) > 0.01) {
          const isSameInvoice = existing.lastInvoiceId === invoiceId;
          await updateDoc(productRef, {
            name: existing.name || item.name,
            userId: userId,
            previousPrice: isSameInvoice ? existing.previousPrice : (existing.currentPrice !== undefined ? existing.currentPrice : price),
            previousInvoiceId: isSameInvoice ? existing.previousInvoiceId : (existing.lastInvoiceId || null),
            previousDate: isSameInvoice ? existing.previousDate : (existing.lastUpdated || null),
            currentPrice: price,
            printedPrice: printedPriceValue,
            lastUpdated: dateToStore,
            store: store,
            lastInvoiceId: invoiceId || null
          });
          isPriceAlert = !isSameInvoice; // only alert if it is a new invoice
        } else {
          await updateDoc(productRef, {
            name: existing.name || item.name,
            userId: userId,
            printedPrice: printedPriceValue,
            lastUpdated: dateToStore,
            store: store,
            lastInvoiceId: invoiceId || null
          });
        }
      } else {
        // First time? previousPrice remains undefined to signal no history yet
        await setDoc(productRef, {
          name: item.name,
          currentPrice: price,
          printedPrice: printedPriceValue,
          lastUpdated: dateToStore,
          userId: userId,
          store: store,
          lastInvoiceId: invoiceId || null
        });
      }
    } catch (productError) {
      console.error("Product update/create failed:", productError);
      handleFirestoreError(productError, OperationType.WRITE, `products/${productDocId}`);
      return false;
    }

    try {
      const historyRef = collection(db, `products/${productDocId}/history`);
      await addDoc(historyRef, {
        price: price,
        date: dateToStore,
        store: store,
        invoiceId: invoiceId || null,
        userId: userId
      });
      
      return isPriceAlert;
    } catch (historyError) {
      console.error("History add failed:", historyError);
      handleFirestoreError(historyError, OperationType.WRITE, `products/${productDocId}/history`);
      return false;
    }
}
