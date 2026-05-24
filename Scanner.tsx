import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { PriceRecord } from '../lib/productService';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { FileText } from 'lucide-react';

interface PriceHistoryChartProps {
  history: PriceRecord[];
  productName: string;
  onViewInvoice?: (invoiceId: string) => void;
}

export default function PriceHistoryChart({ history, productName, onViewInvoice }: PriceHistoryChartProps) {
  const chartData = history.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(record => ({
    date: format(new Date(record.date), 'dd/MM'),
    price: record.price,
    fullDate: format(new Date(record.date), 'dd MMMM yyyy', { locale: he }),
    store: record.store
  }));

  const sortedHistory = history.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm mb-8">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-blue-500 mb-1">מגמות מחיר</p>
        <h3 className="text-2xl font-bold text-gray-900">{productName}</h3>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#999', fontWeight: 'bold' }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#999', fontWeight: 'bold' }}
              tickFormatter={(value) => `₪${value}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1c2b41', 
                color: '#fff', 
                border: 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                padding: '12px',
                borderRadius: '16px'
              }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px', paddingBottom: '4px', color: '#60a5fa' }}
              formatter={(value: any) => [`₪${value}`, 'מחיר']}
              labelFormatter={(label, payload) => {
                const item = payload[0]?.payload;
                return item ? `${item.fullDate}` : label;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#3d5afe" 
              strokeWidth={3} 
              dot={{ r: 4, fill: '#3d5afe', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#ef4444' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {sortedHistory.length > 0 && (
        <div className="mt-8 pt-8 border-t border-gray-100">
          <h4 className="text-sm font-bold text-gray-900 mb-4">מופיע בחשבוניות הבאות:</h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pl-2">
            {sortedHistory.map((record, i) => (
              <div key={record.id || i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black text-sm">
                    ₪{record.price.toFixed(1)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900">{record.store}</p>
                    <p className="text-xs text-gray-400 font-medium">{format(new Date(record.date), 'dd/MM/yyyy')}</p>
                  </div>
                </div>
                {record.invoiceId && onViewInvoice && (
                  <button 
                    onClick={() => onViewInvoice(record.invoiceId!)}
                    className="p-2.5 bg-white text-blue-600 rounded-lg shadow-sm border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-all active:scale-95 group-hover:shadow-md"
                    title="צפה בחשבונית"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
