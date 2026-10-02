import { todayISO } from '../lib/format'

// Toolbar ringan di atas halaman EAS & VSWR. Judul halaman sudah ditampilkan
// oleh Topbar CDS, jadi di sini cuma deskripsi + kalender history + Export.
export default function Header({ selectedDateISO, onSelectDate, onExport, exportDisabled }) {
  return (
    <div className="eas-toolbar">
      <p className="eas-toolbar__desc">Performance Monitoring &amp; Automated Reporting</p>
      <div className="app-header__actions">
        <label className="app-header__calendar" title="Lihat data tanggal lain">
          <span>🗓</span>
          <input
            type="date"
            value={selectedDateISO || ''}
            max={todayISO()}
            onChange={(e) => e.target.value && onSelectDate(e.target.value)}
          />
        </label>
        <button className="btn btn--primary" onClick={onExport} disabled={exportDisabled}>
          ⭳ Export Excel
        </button>
      </div>
    </div>
  )
}
