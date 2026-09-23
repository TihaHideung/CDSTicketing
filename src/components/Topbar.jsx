import React from 'react';

const TITLES = {
  dashboard: 'Dashboard',
  upload: 'Upload Data',
  tickets: 'Detail Ticket Active',
};

export default function Topbar({ active, lastProcessedAt }) {
  return (
    <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{TITLES[active]}</h1>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-500">
        {lastProcessedAt && <span>Terakhir diproses: {lastProcessedAt}</span>}
      </div>
    </header>
  );
}
  