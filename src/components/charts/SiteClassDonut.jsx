import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLOR_MAP = {
  Platinum: '#94a3b8',
  Gold: '#d4af37',
  Silver: '#c0c0c0',
  Bronze: '#b08d57',
};
const FALLBACK_COLORS = ['#0ea5e9', '#e0301e', '#22c55e', '#a855f7'];

function renderLabel({ name, value, percent }) {
  return `${name}: ${value} (${(percent * 100).toFixed(1)}%)`;
}

export default function SiteClassDonut({ summary }) {
  const { siteClass } = summary;
  const total = siteClass.reduce((s, d) => s + d.total, 0);
  const top = [...siteClass].sort((a, b) => b.total - a.total)[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">Distribusi Site Class</h3>
      <p className="text-xs text-slate-500 mb-3">Sebaran ticket active berdasarkan kelas site.</p>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={siteClass}
            dataKey="total"
            nameKey="siteClass"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            label={renderLabel}
            labelLine
          >
            {siteClass.map((d, i) => (
              <Cell key={i} fill={COLOR_MAP[d.siteClass] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend
            formatter={(value, entry) => {
              const pct = total ? ((entry.payload.total / total) * 100).toFixed(1) : '0.0';
              return `${value} — ${entry.payload.total} (${pct}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {top && (
        <p className="text-xs text-slate-600 mt-2">
          Site class terbanyak: <strong>{top.siteClass}</strong> ({top.total} ticket,{' '}
          {total ? ((top.total / total) * 100).toFixed(1) : '0.0'}%) — CellDown {top.cellDown}, SiteDown{' '}
          {top.siteDown}.
        </p>
      )}
    </div>
  );
}
