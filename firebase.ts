import React from 'react';
import { Supplier } from '../lib/productService';
import { Building2, Calendar, FileText, TrendingUp, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface SupplierListProps {
  suppliers: Supplier[];
}

export default function SupplierList({ suppliers }: SupplierListProps) {
  if (suppliers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
          <Building2 className="w-12 h-12" />
        </div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">אין ספקים עדיין</h3>
        <p className="text-slate-400 mt-2 font-medium">סרוק חשבוניות כדי לראות את רשימת הספקים שלך.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {suppliers.map((supplier, index) => (
        <motion.div
          key={supplier.name}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-2xl hover:shadow-blue-600/5 hover:-translate-y-1 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full -mr-16 -mt-16 group-hover:bg-blue-600/10 transition-colors pointer-events-none" />
          
          <div className="flex items-start justify-between mb-8 relative">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-inner">
              <Building2 className="w-8 h-8" />
            </div>
            <div className="text-left font-mono">
               <div className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                 <FileText className="w-3 h-3" /> {supplier.invoiceCount} {supplier.invoiceCount === 1 ? 'חשבונית' : 'חשבוניות'}
               </div>
            </div>
          </div>

          <h3 className="text-2xl font-black text-slate-900 mb-2 group-hover:text-blue-600 transition-colors uppercase tracking-tight leading-none">{supplier.name}</h3>
          
          <div className="space-y-5 mt-8 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">סה"כ רכש</span>
              </div>
              <span className="font-black text-xl text-slate-900 tracking-tight">₪{supplier.totalSpent.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">קנייה אחרונה</span>
              </div>
              <span className="font-bold text-sm text-slate-600">
                {format(new Date(supplier.lastInvoiceDate), 'dd MMM yyyy', { locale: he })}
              </span>
            </div>

            {supplier.lastInvoiceNumber && (
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3 text-slate-400">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest">חשבונית אחרונה</span>
                </div>
                <span className="font-mono text-xs bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg text-slate-500 font-bold">#{supplier.lastInvoiceNumber}</span>
              </div>
            )}
          </div>

          <div className="mt-10 pt-6 border-t border-slate-50 flex items-center justify-between text-blue-600 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-300">
            <span className="text-xs font-black uppercase tracking-widest">צפה בהיסטוריית רכש</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
