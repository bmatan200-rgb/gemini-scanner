/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signIn, signOut } from './lib/firebase';
import { getProducts, getPriceHistory, getStats, getInvoices, getSuppliers, deleteInvoice, deleteProduct, fixExistingInvoices, Product, PriceRecord, Invoice, Supplier } from './lib/productService';
import Scanner from './components/Scanner';
import PriceAlerts from './components/PriceAlerts';
import ProductList from './components/ProductList';
import PriceHistoryChart from './components/PriceHistoryChart';
import InvoiceList from './components/InvoiceList';
import InvoiceDetail from './components/InvoiceDetail';
import SupplierList from './components/SupplierList';
import ComparisonView from './components/ComparisonView';
import AIPriceAnalysisView from './components/AIPriceAnalysisView';
import { ShieldCheck, LogIn, LogOut, Wallet, X, Menu, Loader2, LayoutDashboard, FileText, Building2, Columns, Trash2, Mail, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [view, setView] = useState<'dashboard' | 'invoices' | 'products' | 'suppliers' | 'alerts' | 'comparison' | 'ai_analysis'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState({ totalExpenses: 0, productsCount: 0, storesCount: 0, alertsCount: 0 });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [comparisonInvoices, setComparisonInvoices] = useState<[Invoice, Invoice] | null>(null);
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSendingReport, setIsSendingReport] = useState(false);

  const handleSendReport = async () => {
    setIsSendingReport(true);
    try {
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          products: products,
          invoices: invoices.map(inv => ({
            id: inv.id,
            date: inv.date,
            store: inv.store,
            total: inv.total,
            invoiceNumber: inv.invoiceNumber
          }))
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to send report');
      }
      
      alert('הדו"ח נשלח למייל בהצלחה!');
    } catch (error: any) {
      console.error('Error sending report:', error);
      alert('שליחת הדו"ח נכשלה: ' + error.message);
    } finally {
      setIsSendingReport(false);
    }
  };

  useEffect(() => {
    // Fail-safe: if after 10 seconds we are still loading, force loading to false
    // so the user can at least see the sign-in screen if auth failed to initialize
    const failSafeTimer = setTimeout(() => {
      if (loading) {
        console.warn("Auth initialization timed out, forcing loading to false");
        setLoading(false);
      }
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("Auth state changed:", u ? "user logged in" : "no user");
      setUser(u);
      setLoading(false);
      if (u) {
        fetchData();
      }
    }, (error) => {
      console.error("Auth state change error:", error);
      setLoading(false);
    });

    const timer = setTimeout(() => {
      if (loading) setLoadingTimeout(true);
    }, 6000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearTimeout(failSafeTimer);
    };
  }, []);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [p, s, i, sup] = await Promise.all([
        getProducts(), 
        getStats(), 
        getInvoices(), 
        getSuppliers()
      ]);
      setProducts(p || []);
      setStats(s || { totalExpenses: 0, productsCount: 0, storesCount: 0, alertsCount: 0 });
      setInvoices(i || []);
      setSuppliers(sup || []);
    } catch (err) {
      console.error("Error fetching initial data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFetchInvoices = async () => {
    setIsRefreshing(true);
    try {
      const i = await getInvoices();
      setInvoices(i);
      const p = await getProducts();
      setProducts(p);
      const s = await getStats();
      setStats(s);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!invoiceId) return;
    
    // Optimistic update: remove from local state immediately
    const previousInvoices = [...invoices];
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    
    // Close views if they were showing the deleted invoice
    if (selectedInvoice?.id === invoiceId) setSelectedInvoice(null);
    if (comparisonInvoices?.some(inv => inv.id === invoiceId)) {
      setComparisonInvoices(null);
      setView('dashboard');
    }

    setIsRefreshing(true);
    try {
      console.log(`Deleting invoice: ${invoiceId}`);
      await deleteInvoice(invoiceId);
      
      console.log(`Invoice ${invoiceId} deleted, syncing product states...`);
      await fixExistingInvoices(); 
      await fetchData();
      
      console.log('החשבונית נמחקה בהצלחה.');
    } catch (error) {
      console.error('Delete failed:', error);
      // Rollback optimistic update
      setInvoices(previousInvoices);
      console.log('מחיקת החשבונית נכשלה. אנא נסה שוב מאוחר יותר.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteAllInvoices = async () => {
    const previousInvoices = [...invoices];
    setInvoices([]);
    setIsRefreshing(true);
    try {
      // Process deletions in parallel for speed
      const deletionPromises = invoices.map(inv => inv.id ? deleteInvoice(inv.id) : Promise.resolve());
      await Promise.all(deletionPromises);
      
      await fixExistingInvoices(); 
      await fetchData();
      console.log('כל החשבוניות נמחקו בהצלחה.');
    } catch (error) {
      console.error('Delete all failed:', error);
      setInvoices(previousInvoices);
      console.log('מחיקת כל החשבוניות נכשלה.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewInvoiceById = async (invoiceId: string) => {
    let inv = invoices.find(i => i.id === invoiceId);
    if (!inv) {
      // Re-fetch if not found (maybe it's new)
      setIsRefreshing(true);
      const freshInvoices = await getInvoices();
      setInvoices(freshInvoices);
      inv = freshInvoices.find(i => i.id === invoiceId);
    }
    if (inv) {
      setSelectedInvoice(inv);
    } else {
      alert("החשבונית המבוקשת לא נמצאה (ייתכן שנמחקה או שיש חוסר סנכרון נתונים).");
    }
    setIsRefreshing(false);
  };

  const handleCompareInvoices = async (oldId: string, newId: string) => {
    setIsRefreshing(true);
    let invs = invoices;
    const oldInv = invs.find(i => i.id === oldId);
    const newInv = invs.find(i => i.id === newId);

    if (!oldInv || !newInv) {
      invs = await getInvoices();
      setInvoices(invs);
    }

    const finalOld = invs.find(i => i.id === oldId);
    const finalNew = invs.find(i => i.id === newId);

    if (finalOld && finalNew) {
      // Ensure chronological ordering based on invoice date
      const parseDateSafe = (dStr?: string) => {
        if (!dStr) return 0;
        let d = new Date(dStr);
        if (!isNaN(d.getTime())) return d.getTime();
        const parts = dStr.split(/[\/\.\-]/);
        if (parts.length === 3) {
          d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`);
          if (!isNaN(d.getTime())) return d.getTime();
        }
        return 0;
      };

      const d1 = parseDateSafe(finalOld.date);
      const d2 = parseDateSafe(finalNew.date);

      if (d1 > d2 && d2 > 0) {
        setComparisonInvoices([finalNew, finalOld]);
      } else {
        setComparisonInvoices([finalOld, finalNew]);
      }
      setView('comparison');
    } else {
      alert("אחת מהחשבוניות להשוואה לא נמצאה (ייתכן שנמחקה).");
    }
    setIsRefreshing(false);
  };

  const handleDeleteProduct = async (productId: string) => {
    setIsRefreshing(true);
    try {
      await deleteProduct(productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
      console.log('המוצר נמחק מהרשימה.');
    } catch (error) {
      console.error('Product delete failed:', error);
      console.log('מחיקת המוצר נכשלה.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectProduct = async (product: Product) => {
    setSelectedProduct(product);
    setLoadingHistory(true);
    
    // Compute history locally from the current valid invoices to prevent ghost data
    const localHistory: PriceRecord[] = [];
    invoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.name.trim() === product.name.trim()) {
          localHistory.push({
            price: item.price,
            date: inv.date,
            store: inv.store,
            invoiceId: inv.id
          });
        }
      });
    });
    
    setHistory(localHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    setLoadingHistory(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F7FA] p-6 text-center gap-6">
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </motion.div>
        </div>
        
        <div>
          <h2 className="text-xl font-black text-slate-900 mb-2">מערכת בטעינה...</h2>
          <p className="text-sm text-slate-400 font-medium">מתחבר לשרת בצורה מאובטחת</p>
        </div>

        {loadingTimeout && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-6 bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xs"
          >
            <p className="text-sm text-slate-500 mb-6 font-bold leading-relaxed">הטעינה לוקחת זמן רב מהרגיל. ייתכן שיש בעיית חיבור.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
            >
              רענן דף
            </button>
          </motion.div>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F7FA] p-6 text-center" dir="rtl">
        <div className="max-w-md w-full">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-12 rounded-3xl shadow-2xl shadow-blue-500/10"
          >
            <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-600/30">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-4">סוכן רכש חכם</h1>
            <p className="text-gray-500 mb-8 leading-relaxed">
              סקירה כללית של ההוצאות והתראות מחירים בזמן אמת.
            </p>
            <button 
              onClick={signIn}
              className="w-full bg-[#3d5afe] text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#304ffe] transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/20"
            >
              <LogIn className="w-5 h-5" />
              התחבר למערכת
            </button>
          </motion.div>
          <p className="mt-12 text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">AI POWERED PRICE TRACKING</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FA] text-[#1c2b41] flex flex-row relative" dir="rtl">
      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMobileMenu(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "bg-[#0f172a] text-white flex flex-col p-6 fixed inset-y-0 right-0 z-50 w-72 lg:sticky lg:h-screen lg:z-auto transition-transform duration-300 border-l border-white/10 shadow-2xl",
        showMobileMenu ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-lg font-black block leading-none tracking-tight">סוכן רכש</span>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Enterprise</span>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <NavLink icon={<LayoutDashboard className="w-5 h-5" />} label="לוח מחוונים" active={view === 'dashboard'} onClick={() => { setView('dashboard'); setShowMobileMenu(false); }} />
          <NavLink icon={<LogIn className="w-5 h-5 rotate-180" />} label="סרוק חשבונית" onClick={() => { setShowScanner(true); setShowMobileMenu(false); }} />
          <NavLink icon={<FileText className="w-5 h-5" />} label="חשבוניות" active={view === 'invoices'} onClick={() => { setView('invoices'); setShowMobileMenu(false); }} />
          <NavLink icon={<Building2 className="w-5 h-5" />} label="ספקים" active={view === 'suppliers'} onClick={() => { setView('suppliers'); setShowMobileMenu(false); }} />
          <NavLink icon={<Wallet className="w-5 h-5" />} label="מוצרים" active={view === 'products'} onClick={() => { setView('products'); setShowMobileMenu(false); }} />
          <NavLink icon={<ShieldCheck className="w-5 h-5" />} label="התראות" active={view === 'alerts'} onClick={() => { setView('alerts'); setShowMobileMenu(false); }} />
          <NavLink icon={<BrainCircuit className="w-5 h-5" />} label="דו״ח AI" active={view === 'ai_analysis'} onClick={() => { setView('ai_analysis'); setShowMobileMenu(false); }} />
        </nav>

        <div className="mt-auto pt-8 border-t border-white/5">
          <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center font-black text-sm">
              {user.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-black truncate">{user.email}</p>
              <button onClick={signOut} className="text-[10px] text-white/40 hover:text-red-400 transition-colors font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                <LogOut className="w-3 h-3" /> התנתק
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-12 overflow-y-auto w-full bg-slate-50/50">
        <header className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-16">
          <div className="flex-1">
             <div className="flex items-center gap-3 mb-4">
               <div className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 uppercase tracking-widest shadow-md shadow-blue-600/20">
                 <LayoutDashboard className="w-3.5 h-3.5" /> לוח בקרה חכם
               </div>
               <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">מחובר בזמן אמת</span>
             </div>
             <h1 className="text-5xl font-black text-slate-900 mb-3 tracking-tight leading-tight">
               סוכן רכישה <span className="text-blue-600">חכם.</span>
             </h1>
             <p className="text-slate-500 text-lg font-medium max-w-2xl leading-relaxed">
               ברוך הבא למערכת הניהול שלך. עקוב אחר הוצאות, סנכרן חשבוניות וזהה עליות מחיר באופן אוטומטי.
             </p>
          </div>

          <div className="flex items-center gap-4">
             <button 
              onClick={() => setShowScanner(true)}
              className="bg-blue-600 text-white px-10 py-5 rounded-2xl font-black flex items-center gap-4 shadow-2xl shadow-blue-600/30 hover:bg-blue-700 hover:scale-[1.03] active:scale-95 transition-all text-lg uppercase tracking-wider"
            >
              <LogIn className="w-6 h-6 rotate-180" /> סרוק חשבונית
            </button>
            <button 
              onClick={async () => {
                if (confirmDeleteId === 'all') {
                  setConfirmDeleteId(null);
                  await handleDeleteAllInvoices();
                } else {
                  setConfirmDeleteId('all');
                  setTimeout(() => setConfirmDeleteId(c => c === 'all' ? null : c), 3000);
                }
              }}
              disabled={isRefreshing}
              className={cn(
                "px-6 py-5 rounded-2xl border transition-all shadow-sm flex items-center gap-3",
                confirmDeleteId === 'all'
                  ? "bg-red-500 text-white border-red-500 hover:bg-red-600 shadow-red-500/20"
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
              )}
            >
              <Trash2 className="w-7 h-7" />
              <span className="font-black text-sm uppercase tracking-widest hidden sm:block">
                {confirmDeleteId === 'all' ? 'לחץ שוב למחיקה' : 'מחיקת הכל'}
              </span>
            </button>
            <button 
              onClick={handleSendReport}
              disabled={isSendingReport || products.length === 0}
              className="px-6 py-5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              title="ייצא ושלח במייל"
            >
              {isSendingReport ? <Loader2 className="w-7 h-7 animate-spin" /> : <Mail className="w-7 h-7" />}
              <span className="font-black text-sm uppercase tracking-widest hidden sm:block">
                {isSendingReport ? 'שולח...' : 'שולח דו"ח מדדים'}
              </span>
            </button>
            <button 
              onClick={async () => {
                setIsRefreshing(true);
                await fixExistingInvoices();
                await fetchData();
              }}
              className="px-6 py-5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-3"
            >
              <FileText className="w-7 h-7" />
              <span className="font-black text-sm uppercase tracking-widest hidden sm:block">סנכרון נתונים והתראות</span>
            </button>
            <button 
              onClick={fetchData}
              disabled={isRefreshing}
              className="p-5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
            >
              <Loader2 className={cn("w-7 h-7", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </header>

        {view === 'dashboard' ? (
          <div className="space-y-8">
            {/* Scorecards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Scorecard 
                icon={<Wallet className="w-5 h-5 text-indigo-600" />} 
                label="סה״כ הוצאות" 
                value={`₪ ${stats.totalExpenses.toFixed(2)}`} 
                color="bg-indigo-50" 
              />
              <Scorecard 
                icon={<FileText className="w-5 h-5 text-emerald-600" />} 
                label="חשבוניות" 
                value={`${invoices.length}`} 
                color="bg-emerald-50" 
                onClick={() => setView('invoices')}
              />
              <Scorecard 
                icon={<Wallet className="w-5 h-5 text-amber-600" />} 
                label="התראות מחיר" 
                value={`${stats.alertsCount}`} 
                color="bg-amber-50" 
                onClick={() => setView('alerts')}
              />
              <Scorecard 
                icon={<ShieldCheck className="w-5 h-5 text-cyan-600" />} 
                label="ספקים פעילים" 
                value={`${stats.storesCount}`} 
                color="bg-cyan-50" 
                onClick={() => setView('suppliers')}
              />
            </div>

            {stats.alertsCount > 0 && (
              <div className="bg-amber-50/50 p-8 rounded-3xl border border-amber-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-amber-900 leading-tight">שינויי מחיר שזוהו</h3>
                        <p className="text-xs text-amber-600/60 font-bold uppercase tracking-widest mt-1">מוצרים עם תנודות מחיר</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setView('alerts')}
                      className="text-[10px] text-amber-600 font-black uppercase tracking-widest bg-amber-100 px-4 py-2 rounded-xl hover:bg-amber-200 transition-all"
                    >
                      צפה בכל ההתראות
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.filter(p => p.previousPrice !== undefined && Math.abs(p.currentPrice - p.previousPrice) > 0.01).slice(0, 3).map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => handleSelectProduct(p)}
                      className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                         <div className={cn(
                           "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm",
                           p.currentPrice > (p.previousPrice || 0) ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"
                         )}>
                            {p.currentPrice > (p.previousPrice || 0) ? "↑" : "↓"}
                         </div>
                         <div>
                           <p className="text-sm font-black text-slate-800 truncate max-w-[120px]">{p.name}</p>
                           <p className="text-[10px] text-slate-400 font-bold">{p.store}</p>
                         </div>
                      </div>
                      
                       <div className="flex gap-2 mr-auto px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          {p.previousInvoiceId && p.lastInvoiceId && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCompareInvoices(p.previousInvoiceId!, p.lastInvoiceId!);
                              }}
                              className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                              title="השווה חשבוניות"
                            >
                              <Columns className="w-4 h-4" />
                            </button>
                          )}
                          {p.lastInvoiceId && (
                            <div className="flex gap-1">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewInvoiceById(p.lastInvoiceId!);
                                }}
                                className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100"
                                title="צפה בחשבונית"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirmDeleteId === p.lastInvoiceId) {
                                    setConfirmDeleteId(null);
                                    handleDeleteInvoice(p.lastInvoiceId!).catch(err => console.error(err));
                                  } else {
                                    setConfirmDeleteId(p.lastInvoiceId!);
                                    setTimeout(() => setConfirmDeleteId(c => c === p.lastInvoiceId ? null : c), 3000);
                                  }
                                }}
                                className={cn(
                                  "p-2 rounded-lg transition-colors",
                                  confirmDeleteId === p.lastInvoiceId ? "bg-red-500 text-white hover:bg-red-600" : "bg-red-50 text-red-500 hover:bg-red-100"
                                )}
                                title="מחק חשבונית"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                       </div>

                      <div className="text-left font-mono">
                        <p className={cn(
                          "text-sm font-black",
                          p.currentPrice > (p.previousPrice || 0) ? "text-red-500" : "text-emerald-500"
                        )}>
                          ₪{p.currentPrice.toFixed(1)}
                        </p>
                        <p className="text-[8px] text-slate-300 line-through">₪{p.previousPrice?.toFixed(1)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[300px] flex flex-col">
                <div className="flex justify-between items-center mb-12">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">ספקים מובילים</h3>
                   <span 
                    onClick={() => setView('suppliers')}
                    className="text-[10px] text-blue-500 font-bold uppercase tracking-widest cursor-pointer hover:underline flex items-center gap-1"
                   >
                     כל הספקים <LogIn className="w-3 h-3 rotate-180" />
                   </span>
                </div>
                
                {suppliers.length > 0 ? (
                  <div className="space-y-4">
                    {suppliers.slice(0, 4).map((sup, idx) => (
                      <div key={sup.name} className="flex items-center justify-between p-3 hover:bg-blue-50 rounded-2xl transition-colors cursor-pointer group" onClick={() => setView('suppliers')}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900 leading-tight">{sup.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{sup.invoiceCount} {sup.invoiceCount === 1 ? 'חשבונית' : 'חשבוניות'}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors">₪{sup.totalSpent.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-60">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                      <Building2 className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-black text-gray-900">טרם נרשמו ספקים</p>
                  </div>
                )}
              </div>
              
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[300px] flex flex-col">
                <div className="flex justify-between items-center mb-12">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">מגמת הוצאות</h3>
                   <button onClick={() => setView('invoices')} className="text-[10px] text-blue-500 font-bold uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-2">
                     <FileText className="w-3 h-3 text-blue-500" /> כל החשבוניות
                   </button>
                </div>
                
                {invoices.length > 0 ? (
                  <div className="flex-1 flex flex-col justify-end">
                    <div className="flex items-end gap-2 h-32 mb-4">
                      {invoices.slice(0, 10).reverse().map((inv, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-blue-500/20 rounded-t-lg hover:bg-blue-500 transition-all cursor-pointer relative group" 
                          style={{ height: `${Math.min(100, (inv.total / (Math.max(...invoices.map(x => x.total)) || 1)) * 100)}%` }}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            ₪{inv.total}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] font-black text-gray-300 uppercase tracking-tighter">
                      <span>ישן</span>
                      <span>חדש</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-60">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                      <Wallet className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-black text-gray-900">אין מספיק נתונים</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[400px]">
               <div className="flex justify-between items-center mb-12">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">חשבוניות אחרונות</h3>
                   <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded text-[10px] font-black flex items-center gap-2 cursor-pointer" onClick={() => setView('invoices')}>
                     <FileText className="w-3 h-3" /> לכל החשבוניות <LogIn className="w-3 h-3 rotate-180" />
                   </span>
                </div>
                
                {invoices.length > 0 ? (
                  <InvoiceList invoices={invoices.slice(0, 5)} onDelete={handleDeleteInvoice} onView={setSelectedInvoice} onDeleteAll={handleDeleteAllInvoices} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20">
                     <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6">
                       <LayoutDashboard className="w-10 h-10" />
                     </div>
                     <h4 className="text-md font-black text-gray-900 mb-2">אין חשבוניות עדיין</h4>
                     <p className="text-xs text-gray-400 mb-8 max-w-[280px] text-center leading-relaxed">סרוק את החשבוניות הראשונה שלך ותתחיל לנהל את הרכש בצורה חכמה.</p>
                     <button 
                       onClick={() => setShowScanner(true)}
                       className="bg-[#3d5afe] text-white px-10 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20"
                     >
                       סרוק חשבונית ראשונה
                     </button>
                  </div>
                )}
            </div>

            <AnimatePresence>
              {selectedProduct && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setSelectedProduct(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.9, opacity:0}} className="relative w-full max-w-4xl z-[120] bg-white rounded-3xl p-8 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-8">
                       <h2 className="text-2xl font-black">{selectedProduct.name}</h2>
                       <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-6 h-6" /></button>
                    </div>
                    {loadingHistory ? (
                      <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>
                    ) : (
                      <PriceHistoryChart history={history} productName={selectedProduct.name} onViewInvoice={handleViewInvoiceById} />
                    )}
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : view === 'invoices' ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">היסטוריית חשבוניות</h2>
                <p className="text-sm text-gray-400">נהל את כל החשבוניות שסרקת במקום אחד.</p>
              </div>
              <button 
                onClick={() => setView('dashboard')}
                className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors"
              >
                חזרה ללוח הבקרה
              </button>
            </div>
            <InvoiceList invoices={invoices} onDelete={handleDeleteInvoice} onView={setSelectedInvoice} onDeleteAll={handleDeleteAllInvoices} />
          </div>
        ) : view === 'products' ? (
          <div className="space-y-8">
             <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">רשימת מוצרים</h2>
                <p className="text-sm text-gray-400">מעקב אחרי מחירים ושינויים במוצרים שלך.</p>
              </div>
              <button onClick={() => setView('dashboard')} className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl">חזרה ללוח הבקרה</button>
            </div>
            <ProductList products={products} onSelect={handleSelectProduct} onDelete={handleDeleteProduct} />
          </div>
        ) : view === 'suppliers' ? (
          <div className="space-y-8">
             <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">ספקי שירות וקניות</h2>
                <p className="text-sm text-gray-400">ריכוז כל הספקים שלך והוצאותיהם האחרונות.</p>
              </div>
              <button onClick={() => setView('dashboard')} className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl">חזרה ללוח הבקרה</button>
            </div>
            <SupplierList suppliers={suppliers} />
          </div>
        ) : view === 'alerts' ? (
          <div className="space-y-8">
             <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">התראות מחיר</h2>
                <p className="text-sm text-gray-400">מוצרים שמחירם השתנה בקניות האחרונות.</p>
              </div>
              <button onClick={() => setView('dashboard')} className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl">חזרה ללוח הבקרה</button>
            </div>
            <PriceAlerts products={products} invoices={invoices} onSelect={handleSelectProduct} onViewInvoice={handleViewInvoiceById} onDeleteInvoice={handleDeleteInvoice} onCompare={handleCompareInvoices} />
          </div>
        ) : view === 'comparison' && comparisonInvoices ? (
          <ComparisonView 
            invoiceOld={comparisonInvoices[0]} 
            invoiceNew={comparisonInvoices[1]} 
            onClose={() => setView('alerts')} 
            onDeleteInvoice={handleDeleteInvoice}
          />
        ) : view === 'ai_analysis' ? (
          <AIPriceAnalysisView invoices={invoices} onClose={() => setView('dashboard')} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl">
            <ShieldCheck className="w-16 h-16 text-blue-100 mb-4" />
            <h2 className="text-xl font-bold">התצוגה בבנייה</h2>
            <button onClick={() => setView('dashboard')} className="mt-4 text-blue-600">חזרה ללוח הבקרה</button>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowScanner(false)}
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="relative w-full max-w-xl z-[210] bg-white rounded-3xl p-8"
             >
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black">סרוק חשבונית חדשה</h2>
                 <button onClick={() => setShowScanner(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-6 h-6" /></button>
               </div>
               <Scanner onComplete={() => { setShowScanner(false); fetchData(); }} knownProducts={products.map(p => p.name)} />
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedInvoice && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setSelectedInvoice(null)}
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="relative w-full max-w-2xl z-[120]"
             >
               <InvoiceDetail 
                 invoice={selectedInvoice} 
                 onClose={() => setSelectedInvoice(null)} 
                 onDelete={async () => {
                   if (selectedInvoice.id) {
                     await handleDeleteInvoice(selectedInvoice.id);
                     setSelectedInvoice(null);
                   }
                 }}
               />
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRefreshing && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 bg-gray-900/90 backdrop-blur-md text-white px-8 py-3 rounded-2xl flex items-center gap-3 shadow-2xl z-[100] border border-white/10"
          >
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider">סנכרון נתונים...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavLink({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full p-4 px-5 rounded-2xl flex items-center gap-4 transition-all text-right group relative overflow-hidden",
        active ? "bg-blue-600 text-white font-black shadow-lg shadow-blue-600/30" : "text-slate-400 hover:bg-white/10 hover:text-white",
        !onClick && "opacity-20 cursor-default"
      )}
    >
       <div className={cn("transition-colors", active ? "text-white" : "text-slate-500 group-hover:text-blue-400")}>
         {icon}
       </div>
       <span className="text-base font-black tracking-tight">{label}</span>
       {!onClick && <span className="mr-auto text-[10px] font-black opacity-40 uppercase tracking-widest">Soon</span>}
       {active && <motion.div layoutId="nav-glow" className="absolute left-0 top-0 bottom-0 w-1.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] rounded-full my-3" />}
    </button>
  );
}

function Scorecard({ icon, label, value, color, onClick }: { icon: React.ReactNode, label: string, value: string, color: string, onClick?: () => void }) {
  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      onClick={onClick}
      className={cn(
        "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-2xl hover:shadow-blue-600/5 hover:border-blue-200 transition-all",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border border-white/50", color)}>
        {icon}
      </div>
      <div className="text-right">
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{label}</p>
        <p className="text-3xl font-black text-slate-900 tracking-tight">{value}</p>
      </div>
    </motion.div>
  );
}
