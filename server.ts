import express from "express";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import cron from "node-cron";
import ExcelJS from "exceljs";
import cors from "cors";

import twilio from "twilio";
import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Support URL-encoded bodies (Twilio sends data this way)
app.use(express.urlencoded({ extended: false }));

// Initialize Firebase Admin SDK (for server-side writes without user auth)
const FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0382531831",
  databaseId: "ai-studio-9aba83fd-c712-49ad-9611-1918152daff2"
};

let adminDb: any;
try {
  if (getAdminApps().length === 0) {
    initAdminApp({ projectId: FIREBASE_CONFIG.projectId });
  }
  adminDb = getAdminFirestore();
  // Use the specific database ID
  adminDb = getAdminFirestore(getAdminApps()[0]!, FIREBASE_CONFIG.databaseId);
} catch(e) {
  console.error("Firebase Admin init error:", e);
}

// Twilio config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const twilioFromRaw = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886"; // Sandbox number
const TWILIO_WHATSAPP_FROM = twilioFromRaw.startsWith("whatsapp:") ? twilioFromRaw : `whatsapp:${twilioFromRaw}`;
const myWhatsappRaw = process.env.MY_WHATSAPP || "whatsapp:+972543111408"; // Your number
const MY_WHATSAPP = myWhatsappRaw.startsWith("whatsapp:") ? myWhatsappRaw : `whatsapp:${myWhatsappRaw}`;

const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID.startsWith("AC")) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// 1. Setup email transporter
function createTransporter() {
  const user = process.env.EMAIL_ADDRESS;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    throw new Error("Missing EMAIL_ADDRESS or EMAIL_PASSWORD environment variables");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });
}

// Helper: Reverses Hebrew strings to fake RTL display if needed by base fonts
function reverseHebrew(str: string): string {
    if(!str) return str;
    const hebrewRegex = /[\u0590-\u05FF]/;
    if (hebrewRegex.test(str)) {
        return str.split(' ').map(word => {
            if (hebrewRegex.test(word)) {
                return word.split('').reverse().join('');
            }
            return word;
        }).reverse().join(' ');
    }
    return str;
}

// 2. Export logic (Excel + PDF)
async function generateReports(products: any[], invoices: any[] = []) {
  // Parsing for monthly spending per supplier
  function getMonthYear(dateString: string) {
    if (!dateString) return "UNKNOWN";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "UNKNOWN";
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  const monthlyData: Record<string, Record<string, number>> = {};
  invoices.forEach(inv => {
    const month = getMonthYear(inv.date);
    const store = inv.store || "UNKNOWN";
    if (!monthlyData[month]) monthlyData[month] = {};
    if (!monthlyData[month][store]) monthlyData[month][store] = 0;
    monthlyData[month][store] += (Number(inv.total) || 0);
  });

  // A. Generate Excel
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("היסטוריית סריקות", {
    views: [{ rightToLeft: true }] // Excellent built-in RTL support
  });

  sheet.columns = [
    { header: "שם המוצר", key: "name", width: 30 },
    { header: "מחיר עדכני (₪)", key: "currentPrice", width: 15 },
    { header: "מחיר קודם (₪)", key: "previousPrice", width: 15 },
    { header: "הפרש (₪)", key: "diff", width: 15 },
    { header: "מחיר מקורי (לפני הנחה)", key: "originalPrice", width: 20 },
    { header: "% הנחה", key: "discountPct", width: 12 },
    { header: "ספק אחרון", key: "store", width: 20 },
    { header: "תאריך עדכון", key: "lastUpdated", width: 20 },
  ];

  sheet.getRow(1).font = { bold: true };

  products.forEach(_p => {
    const p = { ..._p }; // clone
    const currentPrice = parseFloat(p.currentPrice) || 0;
    const previousPrice = p.previousPrice ? parseFloat(p.previousPrice) : currentPrice;
    const diff = currentPrice - previousPrice;
    
    // Check if there's a hidden discount (printed_price from latest invoice)
    let originalPrice: string | number = "-";
    let discountPctStr: string | number = "-";
    if (p.printedPrice && Math.abs(p.printedPrice - currentPrice) > 0.01) {
      originalPrice = p.printedPrice;
      discountPctStr = (((p.printedPrice - currentPrice) / p.printedPrice) * 100).toFixed(0) + "%";
    }

    const row = sheet.addRow({
      name: p.name,
      currentPrice: currentPrice,
      previousPrice: p.previousPrice ? previousPrice : "-",
      diff: p.previousPrice ? diff.toFixed(2) : "-",
      originalPrice: originalPrice,
      discountPct: discountPctStr,
      store: p.store || "-",
      lastUpdated: p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString("he-IL") : "-"
    });

    // Style: red for price increase, green for price drop
    if (diff > 0 && p.previousPrice) {
      row.getCell("currentPrice").font = { color: { argb: "FFFF0000" } };
      row.getCell("diff").font = { color: { argb: "FFFF0000" } };
    } else if (diff < 0 && p.previousPrice) {
      row.getCell("diff").font = { color: { argb: "FF00B050" } };
    }
    
    // Style: highlight hidden discount in green
    if (originalPrice !== "-") {
      row.getCell("originalPrice").font = { color: { argb: "FF808080" }, strike: true };
      row.getCell("discountPct").font = { color: { argb: "FF00B050" }, bold: true };
    }
  });

  const summarySheet = workbook.addWorksheet("סיכום לפי ספק וחודש", {
    views: [{ rightToLeft: true }]
  });
  summarySheet.columns = [
    { header: "חודש", key: "month", width: 15 },
    { header: "ספק", key: "store", width: 30 },
    { header: "סה״כ קניות (₪)", key: "total", width: 20 },
  ];
  summarySheet.getRow(1).font = { bold: true };

  const sortedMonths = Object.keys(monthlyData).sort((a,b) => {
    const [m1, y1] = a.split('.');
    const [m2, y2] = b.split('.');
    return `${y2}${m2}`.localeCompare(`${y1}${m1}`); // descending
  });

  for (const month of sortedMonths) {
    const stores = Object.keys(monthlyData[month]).sort((a, b) => monthlyData[month][b] - monthlyData[month][a]);
    let monthTotal = 0;
    for (const store of stores) {
      summarySheet.addRow({ month, store, total: monthlyData[month][store].toFixed(2) });
      monthTotal += monthlyData[month][store];
    }
    const subRow = summarySheet.addRow({ month: `${month} סה״כ`, store: "-", total: monthTotal.toFixed(2) });
    subRow.font = { italic: true, bold: true };
    summarySheet.addRow({});
  }

  const excelBuffer = await workbook.xlsx.writeBuffer();

  // B. Generate Products CSV
  const productsCsvRows: string[] = [];
  // Add BOM for Excel UTF-8 display
  productsCsvRows.push('\uFEFFשם המוצר;מחיר עדכני (₪);מחיר קודם (₪);הפרש (₪);מחיר מקורי (לפני הנחה);% הנחה;ספק אחרון;תאריך עדכון');

  products.forEach(p => {
    const currentPrice = parseFloat(p.currentPrice) || 0;
    const previousPrice = p.previousPrice ? parseFloat(p.previousPrice) : currentPrice;
    const diff = currentPrice - previousPrice;
    const diffStr = p.previousPrice ? diff.toFixed(2) : "-";
    const prevStr = p.previousPrice ? previousPrice.toFixed(2) : "-";
    const dateStr = p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString("he-IL") : "-";
    const storeStr = p.store || "-";
    
    // Hidden discount columns
    let originalPriceStr = "-";
    let discountPctStr = "-";
    if (p.printedPrice && Math.abs(p.printedPrice - currentPrice) > 0.01) {
      originalPriceStr = p.printedPrice.toFixed(2);
      discountPctStr = (((p.printedPrice - currentPrice) / p.printedPrice) * 100).toFixed(0) + "%";
    }
    
    // escape quotes and commas
    const escapeCsv = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

    productsCsvRows.push(`${escapeCsv(p.name || "")};${currentPrice.toFixed(2)};${prevStr};${diffStr};${originalPriceStr};${discountPctStr};${escapeCsv(storeStr)};${dateStr}`);
  });

  const productsCsvBuffer = Buffer.from(productsCsvRows.join('\n'), 'utf8');

  // C. Generate Monthly Purchases Summary CSV
  const summaryCsvRows: string[] = [];
  summaryCsvRows.push('\uFEFFחודש;ספק;סה״כ קניות (₪)');

  for (const month of sortedMonths) {
    const stores = Object.keys(monthlyData[month]).sort((a, b) => monthlyData[month][b] - monthlyData[month][a]);
    let monthTotal = 0;
    for (const store of stores) {
      const escapeCsv = (str: string) => `"${String(str).replace(/"/g, '""')}"`;
      summaryCsvRows.push(`${escapeCsv(month)};${escapeCsv(store)};${monthlyData[month][store].toFixed(2)}`);
      monthTotal += monthlyData[month][store];
    }
    summaryCsvRows.push(`"${month} סה״כ";"-";${monthTotal.toFixed(2)}`);
    summaryCsvRows.push(""); // empty row separation
  }

  const summaryCsvBuffer = Buffer.from(summaryCsvRows.join('\n'), 'utf8');

  return { excelBuffer, productsCsvBuffer, summaryCsvBuffer };
}

// 3. Endpoint for manual trigger
app.post("/api/send-report", async (req, res) => {
  try {
    const { products, invoices, targetEmail } = req.body;
    const toEmail = targetEmail || process.env.TARGET_EMAIL;

    if (!toEmail) {
      return res.status(400).json({ error: "Missing Target Email (TARGET_EMAIL)" });
    }
    if (!products || !Array.isArray(products)) {
        return res.status(400).json({ error: "Missing or invalid products array" });
    }

    const { excelBuffer, productsCsvBuffer, summaryCsvBuffer } = await generateReports(products, invoices || []);
    const transporter = createTransporter();

    const timestamp = new Date().toISOString().split("T")[0];
    
    // Compute summary text for email body
    function getMonthYear(dateString: string) {
      if (!dateString) return "UNKNOWN";
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return "UNKNOWN";
      return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }
  
    const monthlyData: Record<string, Record<string, number>> = {};
    (invoices || []).forEach((inv: any) => {
      const month = getMonthYear(inv.date);
      const store = inv.store || "UNKNOWN";
      if (!monthlyData[month]) monthlyData[month] = {};
      if (!monthlyData[month][store]) monthlyData[month][store] = 0;
      monthlyData[month][store] += (Number(inv.total) || 0);
    });

    const sortedMonths = Object.keys(monthlyData).sort((a,b) => {
      const [m1, y1] = a.split('.');
      const [m2, y2] = b.split('.');
      return `${y2}${m2}`.localeCompare(`${y1}${m1}`);
    });

    let emailHtml = `<div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2>דו"ח סריקות מחיר עתיר נתונים</h2>
      <p>מצורף הדו"ח העדכני סוכן הרכש החכם שלך (Excel ו-CSV).</p>
      <h3>סיכום קניות לפי ספק וחודש:</h3>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; text-align: right;">
        <tr style="background-color: #f2f2f2;">
          <th>חודש</th>
          <th>ספק</th>
          <th>סה״כ (₪)</th>
        </tr>`;

    let emailText = `מצורף הדו"ח העדכני מתוך סוכן הרכש החכם שלך (Excel ו-CSV).\n\nסיכום לפי ספק וחודש:\n--------------------\n`;

    for (const month of sortedMonths) {
      const stores = Object.keys(monthlyData[month]).sort((a, b) => monthlyData[month][b] - monthlyData[month][a]);
      let monthTotal = 0;
      for (const store of stores) {
        let val = monthlyData[month][store].toFixed(2);
        emailHtml += `<tr><td>${month}</td><td>${store}</td><td>₪ ${val}</td></tr>`;
        emailText += `${month} | ${store} : ₪ ${val}\n`;
        monthTotal += monthlyData[month][store];
      }
      emailHtml += `<tr style="font-weight: bold; background-color: #e6f7ff;"><td>${month} סה״כ</td><td>-</td><td>₪ ${monthTotal.toFixed(2)}</td></tr>`;
      emailText += `${month} סה״כ | - : ₪ ${monthTotal.toFixed(2)}\n\n`;
    }
    emailHtml += `</table></div>`;

    await transporter.sendMail({
      from: process.env.EMAIL_ADDRESS,
      to: toEmail,
      subject: `דו"ח מחירי מוצרים חודשי - ${timestamp}`,
      text: emailText,
      html: emailHtml,
      attachments: [
        {
          filename: `report_excel_${timestamp}.xlsx`,
          content: Buffer.from(excelBuffer),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        },
        {
          filename: `monthly_purchases_${timestamp}.csv`,
          content: Buffer.from(summaryCsvBuffer),
          contentType: "text/csv"
        }
      ]
    });

    res.json({ success: true, message: "האימייל נשלח בהצלחה!" });
  } catch (error: any) {
    console.error("Error sending report:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

// ============================================
// WhatsApp Integration - Receive & Scan Invoices
// ============================================

// Helper: Scan invoice image using Gemini (same logic as frontend gemini.ts)
async function scanInvoiceFromWhatsApp(imageBase64: string, mimeType: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const systemPrompt = `אתה קורא חשבוניות ותעודות משלוח של חברות וסופרמרקטים בישראל. קרא היטב את התמונה כחשבונית.
מטרתך היא למשוך את הנתונים בדיוק רב, ללא השערות או המצאות.

חוקי ברזל לסריקה נכונה:
1. קריאה מימין לשמאל: בישראל, עמודות מופיעות מימין לשמאל.
2. מבנה נפוץ: [מס' שורה] -> [מק"ט] -> [שם המוצר] -> [כמות] -> [מחיר ליחידה] -> [סה"כ לפריט]
3. אל תחליף בין "מחיר ליחידה" ל"כמות"!
4. מבחן מתמטי: כמות * מחיר = סה"כ שורה. אם לא תואם = הנחה סמויה.
   - printed_price = מחיר מקורי, price = מחיר אחרי הנחה
5. סכום סופי: חבר את כל השורות ובדוק שמגיע ל-total.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { text: systemPrompt },
        { inlineData: { data: imageBase64, mimeType } }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          success: { type: Type.BOOLEAN },
          errorReason: { type: Type.STRING },
          invoices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                store: { type: Type.STRING },
                date: { type: Type.STRING },
                total: { type: Type.NUMBER },
                invoiceNumber: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                      printed_price: { type: Type.NUMBER },
                      quantity: { type: Type.NUMBER },
                      total: { type: Type.NUMBER },
                      discount: { type: Type.NUMBER }
                    },
                    required: ["name", "price", "quantity"]
                  }
                }
              },
              required: ["store", "date", "total", "items"]
            }
          }
        },
        required: ["success", "invoices"]
      }
    }
  });

  if (!response.text) return null;
  
  let text = response.text.trim();
  if (text.includes(`\`\`\``)) {
    text = text.replace(/\`\`\`json\s?/g, "").replace(/\`\`\`/g, "").trim();
  }
  
  const parsed = JSON.parse(text);
  if (!parsed.success) throw new Error(parsed.errorReason || "החשבונית לא קריאה");
  return parsed.invoices;
}

// Helper: Save invoice to Firestore via Admin SDK (same logic as productService.ts)
async function saveInvoiceFromWhatsApp(invoice: any, userId: string) {
  if (!adminDb) throw new Error("Firebase Admin not initialized");

  const items = (invoice.items || []).map((item: any) => {
    const rawPrice = Number(Number(item.price || 0).toFixed(2));
    const rawQuantity = item.quantity || 1;
    const rawTotal = item.total != null ? Number(Number(item.total).toFixed(2)) : null;
    const rawDiscount = item.discount != null ? Number(Number(item.discount).toFixed(2)) : null;
    
    const rowTotalCalculated = rawTotal != null ? rawTotal : (rawPrice * rawQuantity - (rawDiscount || 0));
    const actualPrice = Number((rowTotalCalculated / rawQuantity).toFixed(2));

    let printedPrice: number | null = null;
    if (Math.abs(actualPrice - rawPrice) > 0.05) {
      printedPrice = rawPrice;
    }

    return {
      name: item.name || 'מוצר ללא שם',
      price: actualPrice || 0,
      printed_price: printedPrice,
      quantity: rawQuantity || 0,
      total: rowTotalCalculated || 0,
      discount: rawDiscount || null
    };
  });

  const calculatedTotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
  const extractedTotal = Number(invoice.total) || 0;
  let finalTotal = (Math.abs(calculatedTotal - extractedTotal) > 0.5 && calculatedTotal > 0) 
    ? calculatedTotal : extractedTotal;

  // Save invoice
  const invoiceRef = await adminDb.collection("invoices").add({
    store: invoice.store || 'ספק לא ידוע',
    date: invoice.date || new Date().toISOString(),
    total: Number(finalTotal.toFixed(2)),
    invoiceNumber: invoice.invoiceNumber || '',
    items,
    images: [],
    userId,
    createdAt: FieldValue.serverTimestamp()
  });

  // Update products
  let alertsCount = 0;
  for (const item of items) {
    const normalizedName = item.name.trim().toLowerCase()
      .replace(/[0-9]+/g, '')
      .replace(/[\/\\()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    let safeName = normalizedName.replace(/[^a-z0-9\u0590-\u05FF]/g, '_').substring(0, 50);
    if (!safeName || safeName.replace(/_/g, '') === '') {
      safeName = `product_${invoiceRef.id.substring(0, 5)}`;
    }
    
    const productDocId = `${userId}_${safeName}`;
    const productRef = adminDb.collection("products").doc(productDocId);
    const productSnap = await productRef.get();
    const printedPriceValue = (item.printed_price != null && Math.abs(item.printed_price - item.price) > 0.05) ? item.printed_price : null;

    if (productSnap.exists) {
      const existing = productSnap.data();
      if (Math.abs((existing.currentPrice || 0) - item.price) > 0.01) {
        await productRef.update({
          previousPrice: existing.currentPrice,
          previousInvoiceId: existing.lastInvoiceId || null,
          previousDate: existing.lastUpdated || null,
          currentPrice: item.price,
          printedPrice: printedPriceValue,
          lastUpdated: invoice.date,
          store: invoice.store,
          lastInvoiceId: invoiceRef.id
        });
        alertsCount++;
      } else {
        await productRef.update({
          printedPrice: printedPriceValue,
          lastUpdated: invoice.date,
          store: invoice.store,
          lastInvoiceId: invoiceRef.id
        });
      }
    } else {
      await productRef.set({
        name: item.name,
        currentPrice: item.price,
        printedPrice: printedPriceValue,
        lastUpdated: invoice.date,
        userId,
        store: invoice.store,
        lastInvoiceId: invoiceRef.id
      });
    }

    // Add to price history
    await productRef.collection("history").add({
      price: item.price,
      date: invoice.date,
      store: invoice.store,
      invoiceId: invoiceRef.id,
      userId
    });
  }

  return { invoiceId: invoiceRef.id, itemsCount: items.length, alertsCount, total: finalTotal };
}

// Helper: Send WhatsApp reply
async function sendWhatsAppReply(to: string, message: string) {
  if (!twilioClient) {
    console.log("Twilio not configured. Would send:", message);
    return;
  }
  await twilioClient.messages.create({
    body: message,
    from: TWILIO_WHATSAPP_FROM,
    to: to
  });
}

app.post("/api/whatsapp", handleWhatsAppWebhook);
app.post("/", handleWhatsAppWebhook); // Alias explicitly for Twilio Sandbox

async function handleWhatsAppWebhook(req: express.Request, res: express.Response) {
  try {
    const from = req.body.From; // e.g. "whatsapp:+972543111408"
    const numMedia = parseInt(req.body.NumMedia || "0");
    const body = (req.body.Body || "").trim();

    console.log(`WhatsApp message from ${from}: "${body}", media: ${numMedia}`);

    // Security check disabled for testing, but log if it doesn't match:
    if (MY_WHATSAPP && from !== MY_WHATSAPP) {
      console.warn(`Message from unknown number: ${from} (Expected: ${MY_WHATSAPP}) - Allowing for now.`);
      // res.type("text/xml").send("<Response></Response>");
      // return;
    }

    // Your Firebase user ID (find it in Firebase Console > Authentication)
    // For now, we'll use a fixed userId. Update this with your actual Firebase UID.
    const userId = process.env.WHATSAPP_USER_ID || "whatsapp_user";

    // Check credentials early
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.error("Missing Twilio credentials! Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
      res.type("text/xml").send(`
        <Response>
          <Message>שגיאה: חסרים פרטי התחברות לטויליו במערכת. אנא הגדר TWILIO_ACCOUNT_SID ו-TWILIO_AUTH_TOKEN.</Message>
        </Response>
      `);
      return;
    }

    if (numMedia === 0) {
      // Text-only message
      res.type("text/xml").send(`
        <Response>
          <Message>שלח לי תמונה של חשבונית ואני אסרוק אותה עבורך! 📸</Message>
        </Response>
      `);
      return;
    }

    // Process each image
    await sendWhatsAppReply(from, `⏳ מקבל ${numMedia} תמונות, סורק...`);

    let totalInvoices = 0;
    let totalItems = 0;
    let totalAlerts = 0;
    let totalAmount = 0;
    const invoiceSummaries: string[] = [];

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const mediaType = req.body[`MediaContentType${i}`] || "image/jpeg";

      // Download image from Twilio
      const imageResponse = await fetch(mediaUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")
        }
      });
      
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const imageBase64 = imageBuffer.toString("base64");

      // Scan with Gemini
      const invoices = await scanInvoiceFromWhatsApp(imageBase64, mediaType);

      if (invoices && invoices.length > 0) {
        for (const inv of invoices) {
          const result = await saveInvoiceFromWhatsApp(inv, userId);
          totalInvoices++;
          totalItems += result.itemsCount;
          totalAlerts += result.alertsCount;
          totalAmount += result.total;
          invoiceSummaries.push(`📄 ${inv.store} | ₪${result.total.toFixed(2)} | ${result.itemsCount} פריטים`);
        }
      }
    }

    // Send summary
    let summary = `✅ סריקה הושלמה!\n\n`;
    summary += invoiceSummaries.join("\n");
    summary += `\n\n📊 סה"כ: ${totalInvoices} חשבוניות | ${totalItems} פריטים | ₪${totalAmount.toFixed(2)}`;
    
    if (totalAlerts > 0) {
      summary += `\n\n⚠️ ${totalAlerts} שינויי מחיר זוהו!`;
    }

    summary += `\n\n🔗 צפה באפליקציה:\nhttps://ai.studio/apps/9aba83fd-c712-49ad-9611-1918152daff2`;

    await sendWhatsAppReply(from, summary);
    res.type("text/xml").send("<Response></Response>");

  } catch (error: any) {
    console.error("WhatsApp webhook error:", error);
    
    // Try to notify user about the error
    try {
      const from = req.body?.From;
      if (from) {
        await sendWhatsAppReply(from, `❌ שגיאה בסריקה: ${error.message || "נסה שוב"}`);
      }
    } catch(e) {}

    res.type("text/xml").send("<Response></Response>");
  }
}

// 4. Scheduling logic (Automation for 30th of month)
// NOTE: Since the backend cannot read Firebase without a service account JSON, 
// this cron requires fetching from an internal storage or expecting 
// the client to ping an automated endpoint. For now, it logs the attempt.
// In a full production app, you would use firebase-admin initialized with a Service Account.
cron.schedule("0 9 30 * *", async () => {
    console.log("Running scheduled monthly report generation (30th of the month at 9:00 AM)...");
    
    // To make this fully automated, ensure you have initialized firebase-admin with 
    // real service account credentials so it can query all users' products and email them.
    console.log("Note: Automated email sending requires a Firebase Admin SDK setup to query user data.");
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, you would serve static files
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
