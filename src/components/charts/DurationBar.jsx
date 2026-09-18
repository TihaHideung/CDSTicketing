import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';

function makeTopLabel(total) {
  return function TopLabel(props) {
    const { x, y, width, value } = props;
    if (!value) return null;
    const pct = total ? ((value / total) * 100).toFixed(0) : 0;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#334155">
        {value} ({pct}%)
      </text>
    );
  };
}

export default function DurationBar({ summary }) {
  const { durationOverall, overview } = summary;
  const worst = durationOverall.find((a) => a.duration === '>7 Days');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">Duration</h3>
      <p className="text-xs text-slate-500 mb-3">
        Lama ticket sejak Last Occurred On sampai sekarang, dikelompokkan per rentang waktu.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={durationOverall} margin={{ top: 24 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="duration" />
          <YAxis />
          <Tooltip />
          <Legend
            formatter={(value) => {
              const total = durationOverall.reduce((s, a) => s + (value === 'CellDown' ? a.cellDown : a.siteDown), 0);
              const pct = overview.total ? ((total / overview.total) * 100).toFixed(1) : '0.0';
              return `${value} — ${total} (${pct}%)`;
            }}
          />
          <Bar dataKey="cellDown" name="CellDown" fill="#e0301e">
            <LabelList dataKey="cellDown" content={makeTopLabel(overview.total)} />
          </Bar>
          <Bar dataKey="siteDown" name="SiteDown" fill="#0ea5e9">
            <LabelList dataKey="siteDown" content={makeTopLabel(overview.total)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {worst && (
        <p className="text-xs text-slate-600 mt-2">
          Ticket usia &gt;7 hari: <strong>{worst.total}</strong> (
          {overview.total ? ((worst.total / overview.total) * 100).toFixed(1) : '0.0'}% dari total) — perlu perhatian
          prioritas.
        </p>
      )}
    </div>
  );
}
