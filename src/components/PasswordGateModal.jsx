import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { UPLOAD_PAGE_PASSWORD } from '../lib/constants.js';

/**
 * Modal password sederhana untuk membuka halaman "Upload Data".
 * Password dicek di sisi frontend (lihat catatan di constants.js), jadi ini bukan
 * pengaman tingkat tinggi — cukup untuk mencegah orang iseng klik-klik menu Upload,
 * bukan untuk menahan orang yang niat membongkar kode.
 */
export default function PasswordGateModal({ onSuccess, onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value === UPLOAD_PAGE_PASSWORD) {
      setError('');
      setValue('');
      onSuccess();
    } else {
      setError('Password salah. Coba lagi.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-full bg-brand-red/10 flex items-center justify-center">
            <Lock size={18} className="text-brand-red" />
          </div>
          <h3 className="font-semibold text-slate-800">Halaman Terkunci</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Masukkan password untuk membuka halaman Upload Data.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError('');
            }}
            placeholder="Password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/40"
          />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-brand-red text-white font-medium hover:bg-brand-red/90"
            >
              Buka
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
