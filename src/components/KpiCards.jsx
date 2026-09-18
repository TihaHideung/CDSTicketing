import React from 'react';

function Card({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accent || 'text-slate-800'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function KpiCards({ summary, removedStats }) {
  if (!summary) return null;
  const { overview } = summary;
  const pctCell = overview.total ? ((overview.cellDown / overview.total) * 100).toFixed(1) : '0.0';
  const pctSite = overview.total ? ((overview.siteDown / overview.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <Card label="Total Ticket Active" value={overview.total} sub="setelah cleaning & matching SWFM" />
      <Card label="Cell Down" value={overview.cellDown} sub={`${pctCell}% dari total`} accent="text-orange-600" />
      <Card label="Site Down" value={overview.siteDown} sub={`${pctSite}% dari total`} accent="text-sky-600" />
    </div>
  );
}
