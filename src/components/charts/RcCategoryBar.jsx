import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DURATION_COLORS } from '../../lib/constants.js';

export default function RcCategoryBar({
  title,
  data,
  underReviewCount = 0,
  categoryKey = 'rcCategory',
  label = 'RC Category',
  emptyText = 'RC Category',
}) {
  const total = data.reduce((s, d) => s + d.total, 0);
  const top = data[0];
  const topLabel = top?.[categoryKey] || '';
  const orderedBuckets = ['<12H', '12H-24H', '1-3 Days', '3-7 Days', '>7 Days'];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">
        Jumlah ticket per {label} ({total} ticket terisi {label}), warna tiap segmen menunjukkan Duration-nya.
      </p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">
          Belum ada ticket dengan {emptyText} terisi.
        </div>
      ) : (
        <>
          <div className="overflow-y-auto max-h-[240px]">
            <ResponsiveContainer width="100%" height={Math.max(220, data.length * 40)}>
            <BarChart data={data} layout="vertical" margin={{ left: 30, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey={categoryKey} width={180} />
              <Tooltip />
              {orderedBuckets.map((bucket) => (
                <Bar key={bucket} dataKey={bucket} name={bucket} stackId="duration" fill={DURATION_COLORS[bucket]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3">
            {orderedBuckets.map((bucket) => (
              <div key={bucket} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: DURATION_COLORS[bucket] }}
                />
                <span>{bucket}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {top && (
        <p className="text-xs text-slate-600 mt-2">
          {label} terbanyak: <strong>{topLabel}</strong> ({top.total} ticket,{' '}
          {total ? ((top.total / total) * 100).toFixed(1) : '0.0'}% dari {label.toLowerCase()} ini).
        </p>
      )}

    </div>
  );
}
