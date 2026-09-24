import React, { useState } from 'react';
import { LayoutDashboard, UploadCloud, ListChecks, Rocket } from 'lucide-react';

const MENU = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'upload', label: 'Upload Data', Icon: UploadCloud },
  { key: 'tickets', label: 'Detail Ticket Active', Icon: ListChecks },
  { key: 'ekpi', label: 'eKPI Automation', Icon: Rocket, externalUrl: 'https://3e-sumatera.com/' },
];

const UPLOAD_PASSWORD = 'cds123';
const UPLOAD_AUTH_KEY = 'cds_upload_authenticated';

export default function Sidebar({ active, onNavigate }) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);gi
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleMenuClick = (item) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (item.key === 'upload') {
      const isAuthenticated = sessionStorage.getItem(UPLOAD_AUTH_KEY) === 'true';

      if (!isAuthenticated) {
        setPassword('');
        setPasswordError('');
        setShowPasswordModal(true);
        return;
      }
    }

    onNavigate(item.key);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();

    if (password === UPLOAD_PASSWORD) {
      sessionStorage.setItem(UPLOAD_AUTH_KEY, 'true');
      setPassword('');
      setPasswordError('');
      setShowPasswordModal(false);
      onNavigate('upload');
      return;
    }

    setPasswordError('Password salah. Silakan coba lagi.');
  };

  const handleCloseModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setPasswordError('');
  };

  return (
    <>
      <aside className="w-64 shrink-0 bg-navy-950 text-slate-200 flex flex-col min-h-screen">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <img
            src="/triple-e-logo.png"
            alt="Triple-E logo"
            className="h-14 w-14 rounded-md object-contain"
          />
          <div>
            <div className="font-semibold text-white leading-tight">CDS Monitoring</div>
            <div className="text-xs text-slate-400">Cell Down &amp; Site Down</div>
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

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              Akses Upload Data
            </h2>

            <p className="text-sm text-slate-500 mb-4">
              Masukkan password untuk membuka halaman Upload Data.
            </p>

            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Masukkan password"
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
              />

              {passwordError && (
                <p className="text-sm text-red-500 mt-2">
                  {passwordError}
                </p>
              )}

              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-md border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-brand-red text-white text-sm font-medium hover:opacity-90"
                >
                  Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}