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
  uploadDateMode = 'device',
  onUploadDateModeChange,
  uploadDate,
  onUploadDateChange,
  uploadTime = '23:59',
  onUploadTimeChange,
  todayDate,
  maxCustomDate,
  uploadedDates = [],
  processMessage,
  processing,
  progressMessage,
  error,
  masterFile,
  onMasterFileChange,
  onImportMaster,
  masterImporting,
  masterCount,
  noimFile,
  onNoimFileChange,
  onUploadNoim,
  noimUploading,
  noimCount,
  noimDate,
  onNoimDateChange,
  noimDates = [],
  noimBcTime,
  noimMessage,
  noimError,
}) {
  const readyCount = [mergeFile].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-1">Upload Data Harian</h2>
        <p className="text-sm text-slate-500 mb-4">
          Upload file data harian untuk regional yang dipilih.
        </p>

        <fieldset className="mb-4">
          <legend className="text-sm font-medium text-slate-800 mb-2">Tanggal upload</legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="upload-date-mode"
                checked={uploadDateMode === 'device'}
                onChange={() => onUploadDateModeChange('device')}
              />
              Waktu perangkat <span className="text-slate-400">(hari ini{todayDate ? `: ${todayDate}` : ''})</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer flex-wrap">
              <input
                type="radio"
                name="upload-date-mode"
                checked={uploadDateMode === 'custom'}
                onChange={() => onUploadDateModeChange('custom')}
              />
              Pilih tanggal dan jam snapshot
              <input
                type="date"
                aria-label="Tanggal upload"
                value={uploadDate || ''}
                max={maxCustomDate}
                disabled={uploadDateMode !== 'custom'}
                onChange={(e) => onUploadDateChange(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40 disabled:bg-slate-50"
              />
              <input
                type="time"
                aria-label="Jam snapshot upload"
                value={uploadTime}
                step="60"
                disabled={uploadDateMode !== 'custom'}
                onChange={(e) => onUploadTimeChange(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40 disabled:bg-slate-50"
              />
            </label>
          </div>
          {uploadDateMode === 'custom' && (
            <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
              Untuk mengisi hari yang terlewat. Data disimpan ke <span className="font-medium">riwayat &amp; trend</span> tanggal
              yang dipilih; <span className="font-medium">data aktif dan Dashboard tidak diubah</span> (hanya berubah lewat
              &ldquo;Waktu perangkat&rdquo;). Duration dihitung sampai akhir menit snapshot yang dipilih (WIB).{' '}
              <span className="font-medium">SWFM yang dipakai hanya file yang kamu upload di sini</span>, bukan SWFM yang
              tersimpan di database (isinya kondisi terkini), jadi hasilnya seperti kondisi pada tanggal tersebut. File SWFM
              ini tidak disimpan.
            </p>
          )}
          {uploadDateMode === 'custom' && !swfmFile && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Belum ada file SWFM: semua ticket di file Merge akan dihitung belum selesai. Upload file SWFM tanggal tersebut
              di kotak SWFM di bawah agar ticket yang sudah selesai pada tanggal itu ikut keluar.
            </p>
          )}
          {uploadDateMode === 'custom' && uploadDate && uploadedDates.includes(uploadDate) && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Tanggal ini sudah punya data. Regional yang ada di file akan menggantikan riwayat regional itu di tanggal ini.
            </p>
          )}
        </fieldset>


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
        {processMessage && (
          <div className="mt-4 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-4 py-3">
            {processMessage}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4">
          <button
            disabled={!mergeFile || (uploadDateMode === 'custom' && !uploadDate) || processing}
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
        <h2 className="font-semibold text-slate-800 mb-1">Data NOIM</h2>
        <p className="text-sm text-slate-500 mb-4">
          Data Site Down versi NOIM, dipakai sebagai pembanding hasil validasi INAP &amp; SWFM di Dashboard.
          Pilih <span className="font-medium">tanggal data</span> NOIM yang diupload. Data tersimpan terus per tanggal;
          upload ulang di tanggal yang sama hanya <span className="font-medium">menggantikan</span> data tanggal itu.
        </p>
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <label htmlFor="noim-date" className="text-sm font-medium text-slate-800">
            Tanggal data NOIM
          </label>
          <input
            id="noim-date"
            type="date"
            value={noimDate || ''}
            onChange={(e) => onNoimDateChange(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {noimDate && noimDates.some((d) => d.date === noimDate) && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Tanggal ini sudah ada datanya ({noimDates.find((d) => d.date === noimDate).count.toLocaleString('id-ID')} site) dan akan diganti.
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <FileSlot
            label="Data NOIM (Excel/CSV)"
            hint="Kolom wajib: Site ID, Start Time, Duration (+ Regional, NOP, Ticket, RC Category Validasi, dst). Dapat berupa .xlsx, .xls, atau .csv"
            file={noimFile}
            onChange={onNoimFileChange}
          />
          <button
            disabled={!noimFile || !noimDate || noimUploading}
            onClick={onUploadNoim}
            className="px-4 py-2 rounded-md bg-navy-900 text-white text-sm font-medium disabled:opacity-40"
          >
            {noimUploading ? 'Menyimpan...' : 'Simpan ke Database'}
          </button>
          {noimCount != null && noimCount > 0 && (
            <span className="text-xs text-slate-500">
              {noimCount.toLocaleString('id-ID')} site NOIM pada tanggal terpilih di dashboard
              {noimBcTime ? ` (BC Time ${new Date(noimBcTime).toLocaleString('id-ID')})` : ''}
            </span>
          )}
        </div>
        {noimDates.length > 0 && (
          <div className="mt-4 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Tanggal tersimpan ({noimDates.length}): </span>
            {noimDates.slice(0, 14).map((d) => `${d.date} (${d.count.toLocaleString('id-ID')})`).join(' · ')}
            {noimDates.length > 14 ? ` · +${noimDates.length - 14} tanggal lainnya` : ''}
          </div>
        )}
        {noimError && (
          <div className="mt-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md px-4 py-3">{noimError}</div>
        )}
        {noimMessage && (
          <div className="mt-4 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-4 py-3">
            {noimMessage}
          </div>
        )}
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
