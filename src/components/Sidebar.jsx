import React from 'react';
import { LayoutDashboard, UploadCloud, ListChecks, Rocket, Activity, Wrench } from 'lucide-react';

const MENU = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'upload', label: 'Upload Data', Icon: UploadCloud },
  { key: 'tickets', label: 'Detail Ticket Active', Icon: ListChecks },
  { key: 'eas-vswr', label: 'EAS & VSWR Tracking', Icon: Activity },
  { key: 'pm-tracking', label: 'PM Tracking', Icon: Wrench },
  { key: 'ekpi', label: 'eKPI Automation', Icon: Rocket, externalUrl: 'https://3e-sumatera.com/' },
];

export default function Sidebar({ active, onNavigate }) {
  const handleMenuClick = (item) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    onNavigate(item.key);
  };

  return (
    <aside className="w-64 shrink-0 bg-navy-950 text-slate-200 flex flex-col min-h-screen">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
        <img
          src="/dragonova-icon.png"
          alt="Dragonova"
          className="h-16 w-16 rounded-full object-cover"
        />
        <div>
          <div className="text-xl font-bold text-white leading-tight">
            <span className="dragon-title">Dragon</span> Monitoring
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4">
        {MENU.map(({ key, label, Icon, externalUrl }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => handleMenuClick({ key, externalUrl })}
              className={`w-full flex items-center gap-3 px-5 py-6 text-sm text-left transition-colors ${
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

    </aside>
  );
}
