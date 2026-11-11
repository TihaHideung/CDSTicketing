import { useCallback, useState } from 'react'

export function DropZone({ label, hint, file, onFile, accent }) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) onFile(f)
    },
    [onFile]
  )

  return (
    <label
      className={`dropzone ${isDragging ? 'dropzone--active' : ''} ${
        file ? 'dropzone--filled' : ''
      }`}
      style={{ '--accent': accent }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          // reset supaya memilih file yang sama lagi (mis. setelah Generate) tetap memicu onChange
          e.target.value = ''
        }}
      />
      <div className="dropzone__icon">{file ? '✓' : '↑'}</div>
      <div className="dropzone__label">{label}</div>
      <div className="dropzone__hint">{file ? file.name : hint}</div>
    </label>
  )
}

export default function UploadPanel({
  easFile,
  vswrFile,
  detailFile,
  onEasFile,
  onVswrFile,
  onDetailFile,
  dateISO,
  onDateChange,
  revisiDateLabel, // Date Revisi otomatis = tanggal upload - 1 hari (H-1)
  onUpload,
  loading,
  error,
}) {
  // File EAS dan Upload Data Streamlit satu paket (harus bareng). VSWR berdiri sendiri.
  const easPairIncomplete = Boolean(easFile) !== Boolean(detailFile)
  const hasEasPair = Boolean(easFile && detailFile)
  const canUpload = !loading && !easPairIncomplete && (hasEasPair || Boolean(vswrFile))

  return (
    <section className="panel">
      <h2 className="panel__title">Upload Data</h2>

      <div className="dropzones dropzones--three">
        <DropZone
          label="Upload Data Streamlit"
          hint="EAS_Detail_Site_All → Baseline (prioritas site)"
          file={detailFile}
          onFile={onDetailFile}
          accent="#2952A3"
        />
        <DropZone
          label="File EAS"
          hint="Manual Validation (Site_List) → Ach Validasi"
          file={easFile}
          onFile={onEasFile}
          accent="#2952A3"
        />
        <DropZone
          label="File VSWR"
          hint="Sheet PIV_PPT — Closed / Open per NOP"
          file={vswrFile}
          onFile={onVswrFile}
          accent="#2952A3"
        />
      </div>

      <p className={`upload-hint ${easPairIncomplete ? 'upload-hint--warn' : ''}`}>
        {easPairIncomplete
          ? 'File EAS dan Upload Data Streamlit harus diupload bersamaan.'
          : 'Upload Data Streamlit menjadi Baseline, File EAS (Manual Validation) mengisi Ach Validasi. Keduanya diupload bersamaan; File VSWR boleh terpisah.'}
      </p>

      <div className="fields">
        <label className="field">
          <span>Tanggal upload</span>
          <input type="date" value={dateISO} onChange={(e) => onDateChange(e.target.value)} />
        </label>
        <p className="field-hint">
          Ach Validasi diambil dari Date Revisi <strong>{revisiDateLabel}</strong> (otomatis H-1).
        </p>
      </div>

      <button className="btn btn--primary btn--full" disabled={!canUpload} onClick={onUpload}>
        {loading ? 'Memproses… (file besar, bisa 10-30 detik)' : 'Upload Data'}
      </button>

      {error && <div className="error">{error}</div>}
    </section>
  )
}
