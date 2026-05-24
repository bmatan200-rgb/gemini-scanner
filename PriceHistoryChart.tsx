import React from 'react';
import { FileText, Trash2, Calendar, Store, CreditCard } from 'lucide-react';
import { Invoice, deleteInvoice } from '../lib/productService';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface InvoiceListProps {
  invoices: Invoice[];
  onDelete: (id: string) => void;
  onView: (invoice: Invoice) => void;
  onDeleteAll?: () => void;
}

export default function InvoiceList({ invoices, onDelete, onView, onDeleteAll }: InvoiceListProps) {
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmId === id) {
      setConfirmId(null);
      await onDelete(id);
    } else {
      setConfirmId(id);
      // Reset after 3 seconds
      setTimeout(() => {
        setConfirmId(current => current === id ? null : current);
      }, 3000);
    }
  };

  const handleDeleteAll = () => {
    if (confirmId === 'all') {
      setConfirmId(null);
      if (onDeleteAll) onDeleteAll();
    } else {
      setConfirmId('all');
      setTimeout(() => {
        setConfirmId(current => current === 'all' ? null : current);
      }, 3000);
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] shadow-sm border border-slate-200">
        <FileText className="w-16 h-16 text-slate-300 mb-4" />
        <h3 className="text-xl font-black text-slate-900 tracking-tight">טרם נסרקו חשבוניות</h3>
        <p className="text-sm text-slate-500 mt-1">התחל בסריקת חשבוניות כדי לעקוב אחר הוצאות הרכש שלך.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {onDeleteAll && (
        <div className="flex justify-end">
          <button 
            onClick={handleDeleteAll}
            className="flex items-center gap-2 text-xs font-black text-red-600 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-all border border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            מחק את כל החשבוניות
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {invoices.map((invoice) => (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          key={invoice.id}
          onClick={() => onView(invoice)}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-2xl hover:shadow-blue-600/5 hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-600/5 rounded-full -ml-16 -mt-16 group-hover:bg-blue-600/10 transition-colors pointer-events-none" />
          
          <div className="flex justify-between items-start mb-8 relative">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-slate-50 text-slate-500 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 border border-slate-100 shadow-inner">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight leading-none">{invoice.store}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 font-black uppercase tracking-widest mt-2">
                   <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {format(new Date(invoice.date), 'dd/MM/yyyy')}</span>
                   {invoice.invoiceNumber && (
                     <>
                       <span className="opacity-30">•</span>
                       <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-slate-600">#{invoice.invoiceNumber}</span>
                     </>
                   )}
                </div>
              </div>
            </div>
            
            <button 
              onClick={(e) => invoice.id && handleDelete(e, invoice.id)}
              className={cn(
                "p-3 rounded-2xl transition-all relative z-20 border",
                confirmId === invoice.id 
                  ? "bg-red-500 text-white border-red-500 hover:bg-red-600"
                  : "text-[#ff0023] hover:text-red-700 hover:bg-red-50 border-transparent hover:border-red-100"
              )}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-auto pt-8 border-t border-slate-100 relative">
             <div className="flex flex-col gap-1">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">סה"כ לתשלום</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight">
                  <span className="text-lg font-bold ml-1 text-slate-500">₪</span>
                  {invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
             </div>
             <div className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all shadow-lg shadow-blue-600/20">
                פרטים מלאים
             </div>
          </div>
        </motion.div>
      ))}
      </div>
    </div>
  );
}
