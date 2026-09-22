import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

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

      <div className="mb-2 overflow-x-auto">
        <div className="flex min-w-max items-center justify-center gap-3 text-[11px] text-slate-600">
          {siteClass.map((d, i) => {
            const color = COLOR_MAP[d.siteClass] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
            const pct = total ? ((d.total / total) * 100).toFixed(1) : '0.0';
            return (
              <div key={d.siteClass || i} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span>
                  {d.siteClass} — {d.total} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={siteClass}
            dataKey="total"
            nameKey="siteClass"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
            label={renderLabel}
            labelLine
          >
            {siteClass.map((d, i) => (
              <Cell key={i} fill={COLOR_MAP[d.siteClass] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
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
