import React from 'react';
import { LayoutDashboard, UploadCloud, ListChecks } from 'lucide-react';

const MENU = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'upload', label: 'Upload Data', Icon: UploadCloud },
  { key: 'tickets', label: 'Detail Ticket Active', Icon: ListChecks },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="w-64 shrink-0 bg-navy-950 text-slate-200 flex flex-col min-h-screen">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
        <div className="w-9 h-9 rounded-md bg-brand-red flex items-center justify-center font-bold text-white text-sm">
          CD
        </div>
        <div>
          <div className="font-semibold text-white leading-tight">CDS Monitoring</div>
          <div className="text-xs text-slate-400">Cell Down &amp; Site Down</div>
        </div>
      </div>

      <nav className="flex-1 py-4">
        {MENU.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm text-left transition-colors ${
                isActive
                  ? 'bg-brand-red text-white font-medium'
                  : 'text-slate-300 hover:bg-navy-900 hover:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-xs text-slate-500 border-t border-white/10">
        Data tersimpan kumulatif di database — bisa diakses lintas sesi/perangkat.
      </div>
    </aside>
  );
}
