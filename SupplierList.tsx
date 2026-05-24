import React from 'react';
import { Store, Package, Trash2 } from 'lucide-react';
import { Product } from '../lib/productService';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface ProductListProps {
  products: Product[];
  onSelect: (product: Product) => void;
  onDelete?: (id: string) => void;
}

export default function ProductList({ products, onSelect, onDelete }: ProductListProps) {
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  if (products.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] shadow-sm border border-slate-200">
      <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6 border border-slate-200">
        <Package className="w-10 h-10 text-slate-400" />
      </div>
      <h3 className="text-xl font-black text-slate-900 tracking-tight">אין מוצרים עדיין</h3>
      <p className="text-sm font-bold text-slate-500 mt-1">התחל בסריקת חשבוניות כדי לראות את רשימת המוצרים שלך!</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">מוצרים שנסרקו</h3>
          <p className="text-sm text-slate-500 font-bold mt-2">רשימת פריטים והשוואת מחירים היסטורית.</p>
        </div>
        <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-4 py-2 border border-blue-100 rounded-xl uppercase tracking-widest">{products.length} פריטים</span>
      </div>

      <div className="space-y-5">
        {products.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()).map((product) => {
          const isChanged = product.previousPrice !== undefined && product.previousPrice !== null && Math.abs(product.currentPrice - product.previousPrice) > 0.01;
          const isIncrease = isChanged && product.currentPrice > (product.previousPrice || 0);

          return (
            <div 
              key={product.id} 
              onClick={() => onSelect(product)}
              className="p-6 flex flex-col lg:flex-row lg:items-center gap-6 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:shadow-blue-600/5 hover:border-blue-200 transition-all group cursor-pointer"
            >
              <div className="flex-1 flex items-center gap-6">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner transition-all duration-500 group-hover:scale-110 border border-transparent",
                  isChanged 
                    ? (isIncrease ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100") 
                    : "bg-slate-50 text-slate-400 border-slate-100"
                )}>
                  {isChanged ? (isIncrease ? "↑" : "↓") : "•"}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-xl font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase leading-none mb-2 tracking-tight truncate">{product.name}</h3>
                  <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1.5"><Store className="w-3.5 h-3.5" /> {product.store}</span>
                    <span className="opacity-30">|</span>
                    <span>{format(new Date(product.lastUpdated), 'dd MMM yyyy', { locale: he })}</span>
                  </div>
                </div>
                {onDelete && product.id && (
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirmId === product.id) {
                        setConfirmId(null);
                        await onDelete(product.id!);
                      } else {
                        setConfirmId(product.id || null);
                        setTimeout(() => setConfirmId(c => c === product.id ? null : c), 3000);
                      }
                    }}
                    className={cn(
                      "p-3 rounded-2xl transition-all border",
                      confirmId === product.id
                        ? "bg-red-500 text-white border-red-500 hover:bg-red-600"
                        : "text-slate-400 hover:text-red-600 hover:bg-red-50 border-transparent hover:border-red-100"
                    )}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-6 text-left border-t lg:border-t-0 pt-4 lg:pt-0 lg:pr-6 lg:border-r border-slate-100">
                {product.previousPrice !== undefined && product.previousPrice !== null && Math.abs(product.currentPrice - product.previousPrice) > 0.01 && (
                  <div className="text-left">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">היה קודם</p>
                    <p className="text-sm font-bold line-through text-slate-400">₪{product.previousPrice.toFixed(2)}</p>
                  </div>
                )}
                <div className="text-left bg-slate-50 border border-slate-100 px-6 py-3 rounded-2xl group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">מחיר נוכחי</p>
                  <p className={cn(
                    "text-2xl font-black tracking-tight",
                    isIncrease ? "text-red-600" : (isChanged ? "text-emerald-600" : "text-slate-900")
                  )}>
                    ₪{product.currentPrice.toFixed(2)}
                  </p>
                  {product.printedPrice != null && Math.abs(product.printedPrice - product.currentPrice) > 0.01 && (
                    <p className="text-[10px] mt-1">
                      <span className="text-slate-400 line-through">(₪{product.printedPrice.toFixed(2)})</span>{' '}
                      <span className="text-red-500 font-black">{(((product.printedPrice - product.currentPrice) / product.printedPrice) * 100).toFixed(0)}% הנחה</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
