import React, { useEffect, useRef } from 'react';
import { fileSizeLabel } from '../lib/excelIO.js';

function FileSlot({ label, hint, file, onChange }) {
  const inputRef = useRef(null);

  // Kalau `file` di-reset jadi null dari parent (mis. setelah proses berhasil), kosongkan
  // juga nilai input asli-nya — supaya user bisa pilih file yang SAMA lagi tanpa
  // "onChange" gagal terpicu karena browser menganggap tidak ada perubahan.
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = '';
  }, [file]);

  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-white hover:border-navy-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-800">{label}</div>
          <div className="text-xs text-slate-400">{hint}</div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-navy-900 text-white hover:bg-navy-800"
        >
          Pilih File
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {file && (
        <div className="mt-3 flex items-center justify-between text-xs bg-emerald-50 text-emerald-700 rounded px-3 py-2">
          <span className="truncate">{file.name}</span>
          <span>{fileSizeLabel(file.size)}</span>
        </div>
      )}
    </div>
  );
}

export default function UploadPanel({
  mergeFile,
  swfmFile,
  onMergeFileChange,
  onSwfmFileChange,
  onProcess,
  processing,
  progressMessage,
  error,
  masterFile,
  onMasterFileChange,
  onImportMaster,
  masterImporting,
  masterCount,
}) {
  const readyCount = [mergeFile].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-1">Upload Data Harian</h2>
        <p className="text-sm text-slate-500 mb-4">
          Upload file data harian untuk regional yang dipilih.
        </p>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileSlot
            label="Merge CellDown + SiteDown"
            hint="File gabungan"
            file={mergeFile}
            onChange={onMergeFileChange}
          />
          <FileSlot
            label="SWFM - Check"
            hint="Opsional"
            file={swfmFile}
            onChange={onSwfmFileChange}
          />
        </div>

        {error && (
          <div className="mt-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4">
          <button
            disabled={!mergeFile || processing}
            onClick={onProcess}
            className="px-5 py-2.5 rounded-md bg-brand-red text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
          >
            {processing ? 'Memproses...' : 'Proses & Bersihkan Data'}
          </button>
          <span className="text-sm text-slate-500">{readyCount}/1 file utama siap</span>
          {processing && progressMessage && (
            <span className="text-sm text-navy-700 animate-pulse">{progressMessage}</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-1">Master Site Detail</h2>
        <p className="text-sm text-slate-500 mb-4">
          Data master site.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <FileSlot
            label="ExportMasterSiteDetail (Excel/CSV)"
            hint="Kolom wajib: Site ID, Cluster (+ Site Name, NOP, Regional, Site Class). Dapat berupa .xlsx, .xls, atau .csv"
            file={masterFile}
            onChange={onMasterFileChange}
          />
          <button
            disabled={!masterFile || masterImporting}
            onClick={onImportMaster}
            className="px-4 py-2 rounded-md bg-navy-900 text-white text-sm font-medium disabled:opacity-40"
          >
            {masterImporting ? 'Mengimpor...' : 'Import ke Database'}
          </button>
          {masterCount != null && (
            <span className="text-xs text-slate-500">{masterCount.toLocaleString('id-ID')} site tersimpan di database</span>
          )}
        </div>
      </div>

    </div>
  );
}
