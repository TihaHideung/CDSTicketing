import React from 'react';
import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';

const REGION_COLORS = { Sumbagut: '#e0301e', Sumbagteng: '#0ea5e9', Sumbagsel: '#22c55e' };


function totalLabel(props) {
  const { x, y, value } = props;
  if (!value) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f172a">
      {value}
    </text>
  );
}

function barLabel(props) {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#334155">
      {value}
    </text>
  );
}

/**
 * `dataByRegion` diisi (array of {date, Sumbagut, Sumbagteng, Sumbagsel}) kalau filter
 * yang aktif adalah "Semua Regional" — batang tiap regional dijejerkan per hari, TIDAK
 * dijumlahkan jadi satu. `dataSingle` (array of {date, cellDown, siteDown, total})
 * dipakai kalau filter-nya 1 regional tertentu.
 */
export default function TrendChart({ dataByRegion, dataSingle, regions }) {
  const isByRegion = Array.isArray(dataByRegion);
  const data = isByRegion ? dataByRegion : dataSingle;

  if (!data || data.length < 1) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Trend Harian</h3>
        <p className="text-xs text-slate-500">
          Trend akan terbentuk setelah kamu memproses data harian. Saat ini belum ada hari yang tersimpan.
        </p>
      </div>
    );
  }

  if (isByRegion) {
    const lineData = data.map((entry) => ({
      ...entry,
      total: regions.reduce((sum, reg) => sum + Number(entry[reg] || 0), 0),
    }));

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Trend Harian — Perbandingan Antar Regional</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={lineData} margin={{ top: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            {regions.map((reg) => (
              <Bar key={reg} dataKey={reg} name={reg} fill={REGION_COLORS[reg] || '#94a3b8'}>
                <LabelList dataKey={reg} content={barLabel} />
              </Bar>
            ))}
            <Line
              type="monotone"
              dataKey="total"
              name="Total"
              stroke="#0f172a"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            >
              <LabelList dataKey="total" content={totalLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const last = data[data.length - 1];
  const prev = data[data.length - 2] || null;
  const delta = prev ? last.total - prev.total : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">Trend Harian</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 24 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="cellDown" name="CellDown" fill="#e0301e" stackId="a" />
          <Bar dataKey="siteDown" name="SiteDown" fill="#0ea5e9" stackId="a" />
          <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }}>
            <LabelList dataKey="total" content={totalLabel} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-600 mt-2">
        {last.date}: <strong>{last.total}</strong> ticket
        {prev ? `, ${delta >= 0 ? 'naik' : 'turun'} <strong>${Math.abs(delta)}</strong> ticket dibanding ${prev.date} (${prev.total}).` : '.'}
      </p>
    </div>
  );
}
