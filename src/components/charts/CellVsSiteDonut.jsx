import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#e0301e', '#0ea5e9'];

function renderLabel({ name, value, percent }) {
  return `${name}: ${value} (${(percent * 100).toFixed(1)}%)`;
}

export default function CellVsSiteDonut({ summary }) {
  const { overview } = summary;
  const data = [
    { name: 'CellDown', value: overview.cellDown },
    { name: 'SiteDown', value: overview.siteDown },
  ];
  const pctCell = overview.total ? ((overview.cellDown / overview.total) * 100).toFixed(1) : '0.0';
  const pctSite = overview.total ? ((overview.siteDown / overview.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">Cell Down vs Site Down</h3>
      <p className="text-xs text-slate-500 mb-3">Komposisi total ticket active saat ini.</p>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            label={renderLabel}
            labelLine
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend
            formatter={(value, entry) => {
              const pct = overview.total ? ((entry.payload.value / overview.total) * 100).toFixed(1) : '0.0';
              return `${value} — ${entry.payload.value} (${pct}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-600 mt-2">
        CellDown: <strong>{overview.cellDown}</strong> ticket ({pctCell}%) · SiteDown:{' '}
        <strong>{overview.siteDown}</strong> ticket ({pctSite}%) · Total: <strong>{overview.total}</strong> ticket.
      </p>
    </div>
  );
}
