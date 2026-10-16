import React, { useMemo, useState } from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';

function Check({ checked, onChange, disabled, children, className = '' }) {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${disabled ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700'} ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-red focus:ring-brand-red/40"
      />
      {children}
    </label>
  );
}

/**
 * Pop up pilihan export Dashboard. `onConfirm({ excel, pdf, reportKey, uploadDateFrom, uploadDateTo })`.
 * PDF = laporan Weekly (1 minggu, Jumat-Kamis), bukan kumpulan grafik.
 * `getReportWeeks()` mengembalikan daftar minggu yang punya data: [{ key, label }] (terbaru dulu).
 * Komponen ini di-mount hanya saat dibuka, jadi pilihan selalu mulai dari default.
 */
export default function ExportModal({ onClose, onConfirm, exporting, error, getReportWeeks }) {
  const [excel, setExcel] = useState(false);
  const [uploadDateFrom, setUploadDateFrom] = useState('');
  const [uploadDateTo, setUploadDateTo] = useState('');
  const [pdf, setPdf] = useState(false);
  const [reportKeyState, setReportKeyState] = useState(null);

  const periodOptions = useMemo(() => (getReportWeeks ? getReportWeeks() : []), [getReportWeeks]);
  // Kalau pilihan belum ada, otomatis pakai minggu terbaru.
  const reportKey = periodOptions.some((o) => o.key === reportKeyState) ? reportKeyState : periodOptions[0]?.key || null;
  const reportReady = Boolean(reportKey);

  const uploadDateInvalid = excel && (!uploadDateFrom || !uploadDateTo || uploadDateFrom > uploadDateTo);
  const canExport = !exporting && !uploadDateInvalid && (excel || (pdf && reportReady)) && !(pdf && !reportReady);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          disabled={exporting}
          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        <h3 className="mb-1 font-semibold text-slate-800">Export Dashboard</h3>
        <p className="mb-4 text-sm text-slate-500">Pilih apa yang mau diexport. Data mengikuti filter yang sedang aktif.</p>

        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <Check checked={excel} onChange={setExcel} disabled={exporting}>
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span className="font-medium">Excel (.xlsx)</span>
            </Check>
            <p className="ml-6 mt-1 text-xs text-slate-400">Data snapshot upload, ringkasan, dan trend berdasarkan tanggal upload.</p>
            {excel && (
              <div className="ml-6 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  Upload dari tanggal
                  <input
                    type="date"
                    value={uploadDateFrom}
                    max={uploadDateTo || undefined}
                    onChange={(event) => setUploadDateFrom(event.target.value)}
                    disabled={exporting}
                    className="mt-1 block w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-700"
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Sampai tanggal
                  <input
                    type="date"
                    value={uploadDateTo}
                    min={uploadDateFrom || undefined}
                    onChange={(event) => setUploadDateTo(event.target.value)}
                    disabled={exporting}
                    className="mt-1 block w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-700"
                  />
                </label>
              </div>
            )}
            {excel && uploadDateInvalid && uploadDateFrom && uploadDateTo && uploadDateFrom > uploadDateTo && (
              <p className="ml-6 mt-1 text-xs text-red-500">Tanggal awal tidak boleh melewati tanggal akhir.</p>
            )}
            {excel && (!uploadDateFrom || !uploadDateTo) && (
              <p className="ml-6 mt-1 text-xs text-slate-500">Pilih tanggal awal dan akhir upload untuk ekspor Excel.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <Check checked={pdf} onChange={setPdf} disabled={exporting}>
              <FileText size={16} className="text-brand-red" />
              <span className="font-medium">PDF (Report)</span>
            </Check>
            <p className="ml-6 mt-1 text-xs text-slate-400">
              Laporan mingguan ringkas: trend mingguan &amp; harian, kenaikan/penurunan tertinggi beserta Regional/NOP penyebabnya.
            </p>

            {pdf && (
              <div className="ml-6 mt-3 space-y-2 border-t border-slate-100 pt-3">
                <label className="block text-xs font-medium text-slate-600">
                  Minggu
                  <select
                    value={reportKey || ''}
                    onChange={(event) => setReportKeyState(event.target.value)}
                    disabled={exporting || !reportReady}
                    className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-700 disabled:bg-slate-50"
                  >
                    {periodOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                {!reportReady && (
                  <p className="text-[11px] text-red-500">Belum ada data trend untuk filter ini, jadi report belum bisa dibuat.</p>
                )}
                <p className="text-[11px] text-slate-400">Mengikuti filter Dashboard yang aktif. Minggu = Jumat s/d Kamis.</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canExport}
            onClick={() => onConfirm({ excel, pdf, reportKey, uploadDateFrom, uploadDateTo })}
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? 'Mengekspor...' : 'Export'}
          </button>
        </div>
        {!excel && pdf && !reportReady && (
          <p className="mt-2 text-right text-xs text-slate-400">Belum ada minggu yang punya data untuk filter ini.</p>
        )}
        {!excel && !pdf && <p className="mt-2 text-right text-xs text-slate-400">Pilih minimal satu format export.</p>}
      </div>
    </div>
  );
}
