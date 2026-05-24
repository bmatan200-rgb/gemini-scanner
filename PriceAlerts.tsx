import React from 'react';
import { X, Store, Calendar, CreditCard, CheckCircle2, Trash2 } from 'lucide-react';
import { Invoice } from '../lib/productService';
import { format } from 'date-fns';

interface InvoiceDetailProps {
  invoice: Invoice;
  onClose: () => void;
  onDelete?: () => void;
}

export default function InvoiceDetail({ invoice, onClose, onDelete }: InvoiceDetailProps) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const handleDelete = async () => {
    if (confirmDelete && onDelete) {
      setConfirmDelete(false);
      await onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xl flex flex-col max-h-[90vh]">
      <div className="flex justify-between items-start mb-6 shrink-0">
        <div className="flex items-center gap-4">
           <button onClick={handleDelete} className={`p-2.5 rounded-xl transition-all shadow-sm border order-last sm:order-first ${confirmDelete ? 'bg-red-500 text-white border-red-500 hover:bg-red-600' : 'bg-red-50 text-red-500 hover:bg-red-100 border-red-100'}`}>
             <Trash2 className="w-5 h-5" />
           </button>
           <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#1c2b41] mb-2">{invoice.store}</h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span className="flex items-center gap-1"><Store className="w-4 h-4" /> ספק</span>
              <span className="opacity-30 hidden sm:inline">|</span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {format(new Date(invoice.date), 'dd/MM/yyyy')}</span>
              {invoice.invoiceNumber && (
                <>
                  <span className="opacity-30 hidden sm:inline">|</span>
                  <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded">מס' חשבונית: {invoice.invoiceNumber}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-red-50 text-red-400 rounded-full transition-colors shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-1 mb-6 min-h-0">
        {invoice.remarks && (
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4">
            <p className="text-orange-800 text-sm font-medium"><strong className="font-bold border-b border-orange-200">הערות מערכת: </strong>{invoice.remarks}</p>
          </div>
        )}
        {invoice.items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center py-3 sm:py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 px-2 rounded-xl transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0 mt-0.5">
                {item.lineNumber || idx + 1}
              </div>
              <div>
                <p className="font-bold text-[#1c2b41] mb-0.5 sm:mb-1 text-sm sm:text-base">{item.name}</p>
                <div className="flex gap-3 text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest flex-wrap items-center mt-1">
                  <span>כמות: {item.quantity}</span>
                  <span>|</span>
                  <div className="flex items-center gap-1.5 flex-wrap normal-case tracking-normal">
                    {/* @ts-ignore - printed_price is available in later invoices */}
                    {item.printed_price != null && item.printed_price !== item.price ? (
                      <span className="text-sm sm:text-base font-black text-emerald-600">
                        ₪{item.price.toFixed(2)}{' '}
                        <span className="text-slate-400 font-bold text-[11px] line-through">(₪{item.printed_price.toFixed(2)})</span>{' '}
                        <span className="text-red-500 font-black text-[11px]">{(((item.printed_price - item.price) / item.printed_price) * 100).toFixed(0)}% הנחה</span>
                      </span>
                    ) : (
                      <span className="text-sm sm:text-base font-black text-blue-600">
                        ₪{item.price.toFixed(2)} ליחידה
                      </span>
                    )}
                  </div>
                  {item.discount ? (
                    <>
                      <span>|</span>
                      <span className="text-red-400">הנחה: ₪{item.discount.toFixed(2)}</span>
                    </>
                  ) : null}
                </div>
                {item.remarks && (
                  <p className="text-xs text-orange-600 mt-1 font-medium bg-orange-50 px-2 py-0.5 rounded-md inline-block">
                    ⚠️ {item.remarks}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className="font-black text-blue-600 text-sm sm:text-base">₪ {(item.total != null ? item.total : (item.price * item.quantity - (item.discount || 0))).toFixed(2)}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest">סה״כ שורה</p>
            </div>
          </div>
        ))}
        {invoice.images && invoice.images.length > 0 && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h4 className="font-bold text-gray-400 mb-4 text-xs uppercase tracking-widest text-center">צילום חשבונית מקורית</h4>
            <div className="flex flex-col gap-4 items-center">
              {invoice.images.map((img, idx) => (
                <img key={idx} src={img} alt={`צילום מקורי ${idx + 1}`} className="max-w-full rounded-xl border border-gray-200 shadow-sm" />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 text-white p-4 sm:p-6 rounded-2xl flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-[9px] sm:text-[10px] opacity-50 uppercase font-bold tracking-widest mb-0.5">סה״כ לתשלום</p>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-[9px] sm:text-[10px] text-emerald-400 font-bold uppercase">מאומת מע״מ</span>
            </div>
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-black italic tracking-tighter">
          ₪ {invoice.total.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
