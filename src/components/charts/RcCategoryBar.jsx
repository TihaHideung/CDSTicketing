import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DURATION_BUCKETS, DURATION_COLORS } from '../../lib/constants.js';

export default function RcCategoryBar({ title, data, underReviewCount = 0 }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  const top = data[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">
        Jumlah ticket per RC Category ({total} ticket sudah punya RC), warna tiap segmen menunjukkan Duration-nya.
      </p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">
          Belum ada ticket dengan RC Category terisi.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 30, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="rcCategory" width={140} />
            <Tooltip />
            <Legend />
            {DURATION_BUCKETS.map((bucket) => (
              <Bar key={bucket} dataKey={bucket} name={bucket} stackId="duration" fill={DURATION_COLORS[bucket]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      {top && (
        <p className="text-xs text-slate-600 mt-2">
          RC terbanyak: <strong>{top.rcCategory}</strong> ({top.total} ticket,{' '}
          {total ? ((top.total / total) * 100).toFixed(1) : '0.0'}% dari kategori ini).
        </p>
      )}

    </div>
  );
}
