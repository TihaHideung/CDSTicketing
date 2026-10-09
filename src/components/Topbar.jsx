import React from 'react';

const TITLES = {
  dashboard: 'Dashboard',
  upload: 'Upload Data',
  tickets: 'Detail Ticket Active',
  'eas-vswr': 'EAS & VSWR Tracking',
  'pm-tracking': 'PM Tracking',
};

function formatUploadTimestamp(value) {
  if (!value) return 'Belum ada data';
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Topbar({ active, lastInapUploadAt }) {
  return (
    <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{TITLES[active]}</h1>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span>Last data uploaded at: {formatUploadTimestamp(lastInapUploadAt)}</span>
      </div>
    </header>
  );
}
  