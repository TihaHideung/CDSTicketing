import { useCallback, useState } from 'react'

function DropZone({ label, hint, file, onFile, accent }) {
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
  onEasFile,
  onVswrFile,
  dateISO,
  onDateChange,
  onGenerate,
  loading,
  error,
}) {
  const canGenerate = easFile && vswrFile && !loading

  return (
    <section className="panel">
      <h2 className="panel__title">Upload Data</h2>

      <div className="dropzones">
        <DropZone
          label="File EAS"
          hint="Sheet A1 — tabel Quickwin / Extended"
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

      <div className="fields">
        <label className="field">
          <span>Tanggal update</span>
          <input
            type="date"
            value={dateISO}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </label>
      </div>

      <button className="btn btn--primary btn--full" disabled={!canGenerate} onClick={onGenerate}>
        {loading ? 'Memproses…' : 'Generate Summary'}
      </button>

      {error && <div className="error">{error}</div>}
    </section>
  )
}
