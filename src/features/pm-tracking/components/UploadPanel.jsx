import { DropZone } from '../../eas-vswr/components/UploadPanel.jsx'

export default function UploadPanel({
  siteFile,
  gensetFile,
  onSiteFile,
  onGensetFile,
  dateISO,
  onDateChange,
  onGenerate,
  loading,
  error,
}) {
  const canGenerate = siteFile && gensetFile && !loading

  return (
    <section className="panel">
      <h2 className="panel__title">Upload Data</h2>

      <div className="dropzones">
        <DropZone
          label="File PM Site"
          hint="PM_Site_*.xlsx — tiket PMS per NOP"
          file={siteFile}
          onFile={onSiteFile}
          accent="#2952A3"
        />
        <DropZone
          label="File PM Genset"
          hint="PM_Genset_*.xlsx — tiket PMG per NOP"
          file={gensetFile}
          onFile={onGensetFile}
          accent="#2952A3"
        />
      </div>

      <div className="fields">
        <label className="field">
          <span>Tanggal update</span>
          <input type="date" value={dateISO} onChange={(e) => onDateChange(e.target.value)} />
        </label>
      </div>

      <button className="btn btn--primary btn--full" disabled={!canGenerate} onClick={onGenerate}>
        {loading ? 'Memproses…' : 'Generate Summary'}
      </button>

      {error && <div className="error">{error}</div>}
    </section>
  )
}
