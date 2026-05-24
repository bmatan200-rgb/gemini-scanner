import React, { useState } from 'react';
import { FileText, TrendingUp, TrendingDown, Store, AlertCircle, Pencil, X, Columns, Trash2 } from 'lucide-react';
import { Product } from '../lib/productService';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface PriceAlertsProps {
  products: Product[];
  invoices: Invoice[];
  onSelect: (product: Product) => void;
  onViewInvoice?: (invoiceId: string) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
  onCompare?: (oldId: string, newId: string) => void;
}

export default function PriceAlerts({ products, invoices, onSelect, onViewInvoice, onDeleteInvoice, onCompare }: PriceAlertsProps) {
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  // Compute all changes across all invoices
  const changesList = React.useMemo(() => {
    const list: {
      productName: string;
      product: Product;
      fromPrice: number;
      toPrice: number;
      fromDate?: string;
      toDate?: string;
      fromInvoiceId?: string;
      toInvoiceId?: string;
      store: string;
      diff: number;
      fullHistory: { date: string; price: number; store: string; invoiceId: string }[];
    }[] = [];

    const productMap = new Map<string, { date: string; price: number; store: string; invoiceId: string }[]>();

    invoices.forEach(inv => {
      inv.items.forEach(item => {
        const normalizedName = item.name.trim();
        if (!productMap.has(normalizedName)) productMap.set(normalizedName, []);
        productMap.get(normalizedName)!.push({
          date: inv.date,
          price: item.price,
          store: inv.store,
          invoiceId: inv.id!
        });
      });
    });

    productMap.forEach((history, name) => {
      const sortedHistory = [...history].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      for (let i = 1; i < sortedHistory.length; i++) {
        const current = sortedHistory[i];
        const previous = sortedHistory[i - 1];

        if (Math.abs(current.price - previous.price) > 0.01) {
          const matchProduct = products.find(p => p.name.trim() === name);
          if (matchProduct) {
            list.push({
              productName: name,
              product: matchProduct,
              fromPrice: previous.price,
              toPrice: current.price,
              fromDate: previous.date,
              toDate: current.date,
              fromInvoiceId: previous.invoiceId,
              toInvoiceId: current.invoiceId,
              store: current.store,
              diff: current.price - previous.price,
              fullHistory: sortedHistory
            });
          }
        }
      }
    });

    return list;
  }, [invoices, products]);

  // Sort alerts by newest change first
  const alerts = changesList.sort((a, b) => {
    return new Date(b.toDate || 0).getTime() - new Date(a.toDate || 0).getTime();
  });


  if (alerts.length === 0) return null;

  return (
    <div className="max-w-6xl mx-auto py-10 px-4" dir="rtl">
      {/* Header Section */}
      <div className="flex flex-col items-center text-center mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-4xl font-black text-red-500 tracking-tight">התראות מחיר פועלות</h1>
          <AlertCircle className="w-10 h-10 text-red-500" strokeWidth={3} />
        </div>
        <p className="text-lg text-slate-500 font-medium max-w-2xl">
          כל פריט שמחירו השתנה לעומת הרכישה הקודמת. ניתן לפתוח כל אחת מהחשבוניות ולתקן מחיר שנקרא שגוי.
        </p>
      </div>

      {/* Main Alerts Container */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
        {/* Inner Counter Header */}
        <div className="bg-white px-8 py-6 flex items-center justify-end border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-slate-900">{alerts.length} שינויי מחיר פתוחים</span>
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
        </div>

        {/* Table Headers */}
        <div className="grid grid-cols-[2.5fr,1.5fr,1.2fr,1.2fr,1.5fr,1.5fr,0.8fr] px-8 py-4 bg-slate-50 text-slate-500 text-[13px] font-black border-b border-slate-200">
          <div>מוצר</div>
          <div>ספק</div>
          <div className="text-center">מחיר ישן</div>
          <div className="text-center">מחיר חדש</div>
          <div className="text-center">הפרש</div>
          <div className="text-center">חשבוניות</div>
          <div></div>
        </div>

        {/* Alerts List */}
        <div className="divide-y divide-slate-100">
          {alerts.map((change, idx) => {
            const product = change.product;
            let prevP = change.fromPrice;
            let prevD = change.fromDate;
            let currP = change.toPrice;
            let currD = change.toDate;
            let oldInvId = change.fromInvoiceId;
            let newInvId = change.toInvoiceId;

            const diff = change.diff;
            const diffPercent = ((diff / (prevP || 1)) * 100).toFixed(1);
            const isIncrease = diff > 0;
            
            const formatDate = (dateStr?: string) => {
              if (!dateStr) return '';
              try {
                return format(new Date(dateStr), 'dd/MM/yyyy');
              } catch {
                return '';
              }
            };

            const formatMinimalDate = (dateStr?: string) => {
              if (!dateStr) return '';
              try {
                const d = new Date(dateStr);
                return format(d, 'dd.MM.yyyy');
              } catch {
                return '';
              }
            };

            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={`${product.id}-${idx}`} 
                className="flex flex-col border-b border-slate-100 last:border-b-0 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="grid grid-cols-[2.5fr,1.5fr,1.2fr,1.2fr,1.5fr,1.5fr,0.8fr] px-8 py-8 items-center">
                  {/* Product Name */}
                  <div className="pr-4">
                    <h3 className="text-base font-black text-slate-900 leading-snug group-hover:text-blue-600 transition-colors">
                      {change.productName}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-black mt-1">מ-{formatDate(currD)}</p>
                    {product.printedPrice != null && Math.abs(product.printedPrice - product.currentPrice) > 0.01 && currP === product.currentPrice && (
                      <p className="text-[10px] mt-1">
                        <span className="text-slate-400 line-through">(₪{product.printedPrice.toFixed(2)})</span>{' '}
                        <span className="text-red-500 font-black">{(((product.printedPrice - product.currentPrice) / product.printedPrice) * 100).toFixed(0)}% הנחה</span>
                      </p>
                    )}
                  </div>

                  {/* Supplier */}
                  <div className="text-slate-500 font-black text-[13px]">
                    {change.store || 'לא ידוע'}
                  </div>

                  {/* Old Price */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-900 font-black text-lg">
                      <Pencil className="w-3.5 h-3.5 text-slate-300 cursor-pointer hover:text-blue-500" onClick={() => onSelect(product)} />
                      <span>₪ {prevP.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-black whitespace-pre-line mt-1 opacity-70 leading-tight">
                      {formatMinimalDate(prevD)}
                    </div>
                  </div>

                  {/* New Price */}
                  <div className="text-center">
                    <div className={cn("flex items-center justify-center gap-2 font-black text-lg", isIncrease ? "text-red-600" : "text-emerald-600")}>
                      <Pencil className={cn("w-3.5 h-3.5 cursor-pointer hover:text-blue-500", isIncrease ? "text-red-300" : "text-emerald-300")} onClick={() => onSelect(product)} />
                      <span>₪ {currP.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-black whitespace-pre-line mt-1 opacity-70 leading-tight">
                      {formatMinimalDate(currD)}
                    </div>
                  </div>

                  {/* Difference Badge */}
                  <div className="flex justify-center">
                    <div className={cn(
                      "px-4 py-2 rounded-full font-black text-[13px] flex items-center gap-1.5 shadow-sm",
                      isIncrease ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    )}>
                      <span>({isIncrease ? '+' : ''}{diffPercent}%)</span>
                      <span>₪ {Math.abs(diff).toFixed(2)}</span>
                      {isIncrease ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {/* Invoices Comparison */}
                  <div className="flex flex-col gap-2 items-center justify-center">
                    <div className="flex flex-col gap-2 w-full">
                      <button 
                        onClick={() => onViewInvoice && oldInvId && onViewInvoice(oldInvId)}
                        disabled={!oldInvId}
                        className={cn(
                          "flex items-center justify-center gap-2 font-black text-[11px] transition-colors px-3 py-2 rounded-xl border w-full uppercase tracking-tighter",
                          oldInvId 
                            ? "text-slate-700 bg-slate-50 border-slate-300 hover:bg-slate-100" 
                            : "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-50"
                        )}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>חשבונית מוקדמת</span>
                      </button>
                      
                      <button 
                        onClick={() => onViewInvoice && newInvId && onViewInvoice(newInvId)}
                        disabled={!newInvId}
                        className={cn(
                          "flex items-center justify-center gap-2 font-black text-[11px] transition-colors px-3 py-2 rounded-xl border w-full uppercase tracking-tighter shadow-sm",
                          newInvId 
                            ? "text-slate-950 bg-white border-slate-300 hover:bg-slate-50 hover:border-slate-400" 
                            : "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-50"
                        )}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>חשבונית מאוחרת</span>
                      </button>
                    </div>
                    
                    {onCompare && oldInvId && newInvId && oldInvId !== newInvId && (
                      <button 
                        onClick={() => onCompare(oldInvId!, newInvId!)}
                        className="flex items-center justify-center gap-2 text-blue-700 hover:text-blue-800 font-black text-[11px] transition-all bg-blue-50 px-3 py-2 rounded-xl border border-blue-200/50 w-full mt-1 uppercase tracking-tighter hover:bg-blue-100 shadow-sm"
                      >
                        <Columns className="w-3.5 h-3.5" />
                        <span>השוואה מהירה</span>
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 justify-center pl-4 border-r border-slate-200 pr-4">
                    <button 
                      onClick={() => onSelect(product)}
                      className="flex justify-start items-center gap-2 text-slate-500 hover:text-blue-600 font-black text-[12px] group/close transition-colors"
                    >
                      <X className="w-4 h-4 group-hover/close:scale-110 transition-transform" />
                      <span>סגור התראה</span>
                    </button>
                    
                    {onDeleteInvoice && newInvId && (
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirmId === newInvId) {
                            setConfirmId(null);
                            try {
                              if (newInvId) {
                                await onDeleteInvoice(newInvId!);
                              }
                            } catch (err) {
                              console.error("Deletion from alerts failed", err);
                            }
                          } else {
                            setConfirmId(newInvId || null);
                            setTimeout(() => setConfirmId(c => c === newInvId ? null : c), 3000);
                          }
                        }}
                        className={cn(
                          "flex justify-start items-center gap-2 font-black text-[12px] group/delete transition-colors",
                          confirmId === newInvId ? "text-red-600" : "text-slate-500 hover:text-red-700"
                        )}
                      >
                        <Trash2 className="w-4 h-4 group-hover/delete:scale-110 transition-transform" />
                        <span>{confirmId === newInvId ? 'לחץ שוב למחיקה' : 'מחק חשבונית'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Full History Section */}
                {change.fullHistory.length > 0 && (
                  <div className="bg-slate-50/50 px-8 py-4 border-t border-slate-100/50">
                    <h4 className="text-xs font-black text-slate-500 mb-3 flex items-center gap-2">
                      <Store className="w-4 h-4" />
                      היסטוריית סריקות מלאה לפריט זה
                    </h4>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {change.fullHistory.map((hist, hidx) => (
                        <div key={hidx} className="flex-shrink-0 bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-1 min-w-[140px] shadow-sm">
                          <span className="text-[10px] font-bold text-slate-400">{formatMinimalDate(hist.date)}</span>
                          <span className="font-black text-slate-800 text-sm">₪ {hist.price.toFixed(2)}</span>
                          <span className="text-[11px] font-medium text-slate-500 truncate max-w-[120px]">{hist.store}</span>
                          <button 
                            onClick={() => onViewInvoice && onViewInvoice(hist.invoiceId)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 font-black mt-1 text-right flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" /> צפה
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );

}
