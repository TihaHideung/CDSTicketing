import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const SITE_CLASS_COLORS = {
  Platinum: '#4f46e5',
  Gold: '#d4af37',
  Silver: '#c0c0c0',
  Bronze: '#a76c3f',
  Unclassified: '#64748b',
};

function renderLabel({ name, value, percent }) {
  return `${name}: ${value} (${(percent * 100).toFixed(1)}%)`;
}

export default function AreaContributorBar({ summary }) {
  const { siteClass, overview } = summary;
  const chartData = siteClass.map((item) => ({
    name: item.siteClass,
    value: item.total,
    fill: SITE_CLASS_COLORS[item.siteClass] || '#64748b',
  }));
  const top = [...chartData].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">Site Class Distribution</h3>
      <p className="text-xs text-slate-500 mb-3">Distribusi ticket berdasarkan kelas site.</p>
      <ResponsiveContainer width="100%" height={290}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={82}
            cx="50%"
            cy="46%"
            paddingAngle={2}
            label={renderLabel}
            labelLine
            minAngle={12}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [`${value} ticket`, 'Total']} />
          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{
              paddingTop: 10,
              maxWidth: '100%',
              overflow: 'hidden',
            }}
            iconSize={10}
            formatter={(value, entry) => {
              const pct = overview.total ? ((entry.payload.value / overview.total) * 100).toFixed(1) : '0.0';
              return `${value} ${entry.payload.value} (${pct}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {top && (
        <p className="text-xs text-slate-600 mt-2">
          Kelas site tertinggi: <strong>{top.name}</strong> dengan {top.value} ticket (
          {overview.total ? ((top.value / overview.total) * 100).toFixed(1) : '0.0'}% dari total).
        </p>
      )}
    </div>
  );
}
