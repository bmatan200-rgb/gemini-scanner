import React from 'react';
import { FileText, Calendar, Store, CreditCard, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react';
import { Invoice } from '../lib/productService';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface ComparisonViewProps {
  invoiceOld: Invoice;
  invoiceNew: Invoice;
  onClose: () => void;
  onDeleteInvoice?: (id: string) => void;
}

export default function ComparisonView({ invoiceOld, invoiceNew, onClose, onDeleteInvoice }: ComparisonViewProps) {
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return format(d, 'd MMMM yyyy', { locale: he });
    } catch {
      return dateStr;
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmId === id) {
      setConfirmId(null);
      if (onDeleteInvoice) {
        await onDeleteInvoice(id);
        onClose();
      }
    } else {
      setConfirmId(id);
      setTimeout(() => setConfirmId(c => c === id ? null : c), 3000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4" dir="rtl">
      <div className="flex justify-between items-center mb-10">
        <h2 className="text-3xl font-black text-slate-900">השוואת חשבוניות</h2>
        <button 
          onClick={onClose}
          className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm transition-all"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Old Invoice Column */}
        <div className="relative">
          {onDeleteInvoice && invoiceOld.id && (
            <button 
              onClick={() => handleDelete(invoiceOld.id!)}
              className={cn(
                "absolute top-8 left-8 z-10 p-2 rounded-lg transition-all border",
                confirmId === invoiceOld.id ? "bg-red-500 text-white border-red-500 hover:bg-red-600" : "bg-red-50 text-red-500 hover:bg-red-100 border-red-100"
              )}
              title="מחק חשבונית"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <InvoiceCard 
            invoice={invoiceOld} 
            label="חשבונית קודמת" 
            badgeColor="bg-slate-100 text-slate-600" 
          />
        </div>

        {/* New Invoice Column */}
        <div className="relative">
          {onDeleteInvoice && invoiceNew.id && (
            <button 
              onClick={() => handleDelete(invoiceNew.id!)}
              className={cn(
                "absolute top-8 left-8 z-10 p-2 rounded-lg transition-all border",
                confirmId === invoiceNew.id ? "bg-red-500 text-white border-red-500 hover:bg-red-600" : "bg-red-50 text-red-500 hover:bg-red-100 border-red-100"
              )}
              title="מחק חשבונית"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <InvoiceCard 
            invoice={invoiceNew} 
            label="חשבונית נוכחית" 
            badgeColor="bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
          />
        </div>
      </div>

      {/* Images Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
              <FileText className="w-4 h-4" />
            </div>
            צילום חשבונית ישנה
          </h3>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col gap-4">
            {invoiceOld.images && invoiceOld.images.length > 0 ? (
              invoiceOld.images.map((img, idx) => (
                <img 
                  key={idx} 
                  src={img} 
                  alt={`Old Invoice ${idx}`} 
                  className="w-full h-auto rounded-2xl object-contain border border-slate-50 shadow-inner" 
                />
              ))
            ) : (
              <div className="aspect-[3/4] bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100">
                <FileText className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm font-bold opacity-40">אין צילום זמין</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
              <FileText className="w-4 h-4" />
            </div>
            צילום חשבונית חדשה
          </h3>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col gap-4">
            {invoiceNew.images && invoiceNew.images.length > 0 ? (
              invoiceNew.images.map((img, idx) => (
                <img 
                  key={idx} 
                  src={img} 
                  alt={`New Invoice ${idx}`} 
                  className="w-full h-auto rounded-2xl object-contain border border-slate-50 shadow-inner" 
                />
              ))
            ) : (
              <div className="aspect-[3/4] bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100">
                <FileText className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm font-bold opacity-40">אין צילום זמין</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceCard({ invoice, label, badgeColor }: { invoice: Invoice, label: string, badgeColor: string }) {
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return format(d, 'd MMMM yyyy', { locale: he });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col relative h-full">
      <div className={cn("px-6 py-3 font-black text-[10px] uppercase tracking-[0.2em] self-start m-6 rounded-xl", badgeColor)}>
        {label}
      </div>
      
      <div className="px-8 pb-10">
        <div className="flex justify-between items-start mb-8">
          <div>
             <h4 className="text-3xl font-black text-slate-900 mb-1">{invoice.store}</h4>
             <p className="text-sm text-slate-400 font-bold flex items-center gap-2">
               <Calendar className="w-4 h-4" />
               {formatDate(invoice.date)}
             </p>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">סה״כ לתשלום</p>
            <p className="text-3xl font-black text-slate-900">₪{invoice.total.toFixed(2)}</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">פריטים בחשבונית</p>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {invoice.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-lg px-2 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-black text-slate-700 block truncate">{item.name}</span>
                    {item.printed_price != null && item.printed_price !== item.price && (
                      <span className="text-[10px] text-emerald-600 font-bold mt-0.5 block">
                        ₪{item.price.toFixed(2)} <span className="text-slate-400 line-through">(₪{item.printed_price.toFixed(2)})</span> <span className="text-red-500">{(((item.printed_price - item.price) / item.printed_price) * 100).toFixed(0)}% הנחה</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">x{item.quantity}</span>
                  <span className="text-sm font-black text-slate-900">₪{item.price.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
