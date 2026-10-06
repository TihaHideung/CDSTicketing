import React, { useState } from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';
import { TREND_PERIODS } from '../lib/aggregate.js';

// Daftar grafik yang bisa dipilih untuk PDF. `full` = lebar penuh halaman PDF,
// sisanya dijejerkan 2 per baris.
export const EXPORT_CHARTS = [
  { id: 'kpi', label: 'Ringkasan KPI', full: true },
  { id: 'trend', label: 'Trend', full: true },
  { id: 'donut', label: 'Cell Down vs Site Down' },
  { id: 'siteclass', label: 'Site Class Distribution' },
  { id: 'rc-cell', label: 'RC Category — Cell Down' },
  { id: 'rc-site', label: 'RC Category — Site Down' },
  { id: 'rcsub-cell', label: 'RC Subcategory — Cell Down' },
  { id: 'rcsub-site', label: 'RC Subcategory — Site Down' },
];

// Periode trend yang bisa dipilih (urutan = urutan di PDF).
export const TREND_EXPORT_PERIODS = TREND_PERIODS;

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
 * Pop up pilihan export Dashboard. `onConfirm({ excel, pdf, charts, trendPeriods })`.
 * Komponen ini di-mount hanya saat dibuka, jadi pilihan selalu mulai dari default.
 */
export default function ExportModal({ onClose, onConfirm, exporting, error, trendAvailable, trendUnavailableReason }) {
  const [excel, setExcel] = useState(false);
  const [uploadDateFrom, setUploadDateFrom] = useState('');
  const [uploadDateTo, setUploadDateTo] = useState('');
  const [pdf, setPdf] = useState(false);
  const [charts, setCharts] = useState([]);
  const [trendPeriods, setTrendPeriods] = useState([]);

  const selectableIds = EXPORT_CHARTS.filter((c) => c.id !== 'trend' || trendAvailable).map((c) => c.id);
  const trendSelected = charts.includes('trend') && trendAvailable;
  const trendNeedsPeriod = trendSelected && trendPeriods.length === 0;
  const uploadDateInvalid = excel && (!uploadDateFrom || !uploadDateTo || uploadDateFrom > uploadDateTo);
  // Urutan periode mengikuti TREND_PERIODS, bukan urutan klik.
  const orderedPeriods = TREND_EXPORT_PERIODS.map((p) => p.key).filter((k) => trendPeriods.includes(k));
  // Trend tanpa periode tidak dihitung sebagai grafik yang akan diexport.
  const activeCharts = charts.filter((id) => selectableIds.includes(id) && !(id === 'trend' && trendNeedsPeriod));

  const toggleChart = (id, on) => setCharts((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  const toggleTrendPeriod = (key, on) => setTrendPeriods((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
  const canExport = !exporting && !uploadDateInvalid && !(pdf && trendNeedsPeriod) && (excel || (pdf && activeCharts.length > 0));

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
              <span className="font-medium">PDF (grafik)</span>
            </Check>
            <p className="ml-6 mt-1 text-xs text-slate-400">Pilih grafik mana saja yang dimasukkan.</p>

            {pdf && (
              <div className="ml-6 mt-3 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => setCharts(selectableIds)}
                    className="font-medium text-sky-700 hover:underline disabled:opacity-40"
                  >
                    Pilih semua
                  </button>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => setCharts([])}
                    className="font-medium text-slate-500 hover:underline disabled:opacity-40"
                  >
                    Kosongkan
                  </button>
                  <span className="text-slate-400">{activeCharts.length} grafik dipilih</span>
                </div>

                <div className="space-y-1.5">
                  {EXPORT_CHARTS.map((c) => {
                    const isTrend = c.id === 'trend';
                    const disabled = exporting || (isTrend && !trendAvailable);
                    return (
                      <div key={c.id}>
                        <Check
                          checked={charts.includes(c.id) && !(isTrend && !trendAvailable)}
                          onChange={(on) => toggleChart(c.id, on)}
                          disabled={disabled}
                        >
                          {c.label}
                        </Check>
                        {isTrend && !trendAvailable && (
                          <p className="ml-6 text-[11px] text-slate-400">{trendUnavailableReason}</p>
                        )}
                        {isTrend && trendAvailable && charts.includes('trend') && (
                          <div className="ml-6 mt-1 space-y-1 rounded-md bg-slate-50 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Periode trend</div>
                            {TREND_EXPORT_PERIODS.map((p) => (
                              <Check
                                key={p.key}
                                checked={trendPeriods.includes(p.key)}
                                onChange={(on) => toggleTrendPeriod(p.key, on)}
                                disabled={exporting}
                              >
                                {p.label}
                              </Check>
                            ))}
                            {trendPeriods.length === 0 && (
                              <p className="text-[11px] text-red-500">Pilih minimal satu periode trend.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
            onClick={() => onConfirm({ excel, pdf, charts: activeCharts, trendPeriods: orderedPeriods, uploadDateFrom, uploadDateTo })}
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? 'Mengekspor...' : 'Export'}
          </button>
        </div>
        {!excel && pdf && activeCharts.length === 0 && (
          <p className="mt-2 text-right text-xs text-slate-400">Pilih minimal satu grafik untuk PDF.</p>
        )}
        {!excel && !pdf && <p className="mt-2 text-right text-xs text-slate-400">Pilih minimal satu format export.</p>}
      </div>
    </div>
  );
}
