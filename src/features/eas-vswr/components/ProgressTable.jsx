import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { relativeHeatColorCss } from '../lib/colorScale.js'
import { timestampToWIB } from '../lib/format.js'
import { BUCKETS, BUCKET_LABELS, CATEGORIES } from '../lib/easReport.js'

/* ---------------------------------------------------------------- sel VSWR (tidak berubah) */

function Cell({ value, range }) {
  if (value == null || !Number.isFinite(value)) {
    return <td className="ptable__cell ptable__cell--empty">-</td>
  }
  const bg = range ? relativeHeatColorCss(value, range.min, range.max) : null
  return (
    <td className="ptable__cell" style={bg ? { background: bg } : undefined}>
      {value.toFixed(2)}%
    </td>
  )
}

// Kolom "% Closed" (VSWR) dan "Ach%" (EAS) tampil sebagai progress bar: panjang dan warna
// mengikuti nilai persen pada skala absolut 0-100%.
function BarCell({ value }) {
  if (value == null || !Number.isFinite(value)) {
    return <td className="ptable__cell ptable__cell--empty">-</td>
  }
  const widthPct = Math.max(0, Math.min(100, value))
  const barColor = relativeHeatColorCss(value, 0, 100)
  return (
    <td className="ptable__barcell">
      <div className="ptable__barcell-track">
        <div
          className="ptable__barcell-fill"
          style={{ width: `${widthPct}%`, background: barColor }}
        />
        <span className="ptable__barcell-label">{value.toFixed(2)}%</span>
      </div>
    </td>
  )
}

/* ---------------------------------------------------------------- panel + download gambar */

function TablePanel({ title, subtitle, fileName, caption, children }) {
  const captureRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = useCallback(async () => {
    const container = captureRef.current
    const wrap = container?.querySelector('.ptable-wrap')
    if (!container || !wrap) return

    setDownloading(true)
    // .ptable-wrap scroll horizontal kalau tabel lebih lebar dari panel, jadi sementara
    // dipaksa selebar isinya supaya hasil gambar tidak terpotong.
    const prevWidth = wrap.style.width
    const prevOverflow = wrap.style.overflow
    wrap.style.width = `${wrap.scrollWidth}px`
    wrap.style.overflow = 'visible'
    try {
      const dataUrl = await toPng(container, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: container.scrollWidth,
        height: container.scrollHeight,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = fileName
      a.click()
    } catch (err) {
      console.error(err)
    } finally {
      wrap.style.width = prevWidth
      wrap.style.overflow = prevOverflow
      setDownloading(false)
    }
  }, [fileName])

  return (
    <section className="panel">
      <div className="panel__header-row">
        <div>
          <h2 className="panel__title">{title}</h2>
          {subtitle && <p className="panel__subtitle">{subtitle}</p>}
        </div>
        <button className="btn btn--ghost btn--sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Menyiapkan…' : '⭳ Download Gambar'}
        </button>
      </div>

      <div ref={captureRef} className="ptable-export">
        <div className="ptable-wrap">{children}</div>
        {caption && <div className="ptable__caption">{caption}</div>}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- tabel EAS (Extended / Quickwin) */

const nf = new Intl.NumberFormat('id-ID')

function Num({ value, strong, className = '' }) {
  const zero = !value
  return (
    <td className={`ptable__num ${zero ? 'ptable__num--zero' : ''} ${strong ? 'ptable__num--strong' : ''} ${className}`}>
      {nf.format(value || 0)}
    </td>
  )
}

function DailyAchCell({ value }) {
  if (value == null || !Number.isFinite(value)) {
    return <td className="ptable__cell ptable__cell--empty">-</td>
  }
  return (
    <td className={`ptable__num ptable__num--strong ${value >= 100 ? 'ptable__daily--ok' : ''}`}>
      {value.toFixed(2)}%
    </td>
  )
}

function SisaCell({ value }) {
  return (
    <td className={`ptable__num ptable__num--strong ${value < 0 ? 'ptable__sisa--neg' : ''}`}>
      {nf.format(value || 0)}
    </td>
  )
}

// Sel-sel angka satu baris, urutan kolom sama dengan sheet Report Extended / Report Quickwin.
function ReportCells({ row, bar }) {
  return (
    <>
      {BUCKETS.map((k) => (
        <Num key={`b-${k}`} value={row.baseline[k]} />
      ))}
      <Num value={row.baseline.total} strong />
      <Num value={row.target} />
      {BUCKETS.map((k) => (
        <Num key={`a-${k}`} value={row.ach[k]} />
      ))}
      <Num value={row.ach.total} strong />
      <DailyAchCell value={row.dailyAchPct} />
      <Num value={row.total} />
      <Num value={row.done} />
      {bar ? <BarCell value={row.donePct} /> : <Cell value={row.donePct} />}
      <SisaCell value={row.sisa} />
    </>
  )
}

function EasReportTable({ report }) {
  return (
    <table className="ptable ptable--eas">
      <thead>
        <tr>
          <th rowSpan={2}>Regional</th>
          <th rowSpan={2}>NOP</th>
          <th colSpan={5}>Site Belum Validasi (Baseline)</th>
          <th rowSpan={2} className="th--ach">Target D-1</th>
          <th colSpan={5} className="th--ach">Ach Validasi Daily</th>
          <th rowSpan={2} className="th--ach">% Daily Ach</th>
          <th colSpan={4}>Ach Total</th>
        </tr>
        <tr>
          {BUCKETS.map((k) => (
            <th key={`hb-${k}`}>{BUCKET_LABELS[k]}</th>
          ))}
          <th>Total</th>
          {BUCKETS.map((k) => (
            <th key={`ha-${k}`} className="th--ach">{BUCKET_LABELS[k]}</th>
          ))}
          <th className="th--ach">Total</th>
          <th>Baseline</th>
          <th>Done</th>
          <th>Ach%</th>
          <th>Sisa Target</th>
        </tr>
      </thead>
      <tbody>
        {report.regionals.map((reg) => (
          <EasRegionalGroup key={reg.regional} reg={reg} />
        ))}
        <tr className="ptable__grand">
          <td colSpan={2}>Area 1</td>
          <ReportCells row={report.area} />
        </tr>
      </tbody>
    </table>
  )
}

function EasRegionalGroup({ reg }) {
  return (
    <>
      <tr className="ptable__regional-total">
        <td colSpan={2}>Total {reg.regional}</td>
        <ReportCells row={reg} />
      </tr>
      {reg.nops.map((nop, i) => (
        <tr key={nop.label}>
          {i === 0 && (
            <td className="ptable__regional-label" rowSpan={reg.nops.length}>
              {reg.regional}
            </td>
          )}
          <td className="ptable__nop">{nop.label}</td>
          <ReportCells row={nop} bar />
        </tr>
      ))}
    </>
  )
}

/* ---------------------------------------------------------------- tabel VSWR (kolom tetap seperti sebelumnya) */

function VswrTable({ table }) {
  const ranges = table.columnRanges
  return (
    <table className="ptable ptable--vswr">
      <thead>
        <tr>
          <th rowSpan={2}>Regional</th>
          <th rowSpan={2}>NOP</th>
          <th colSpan={5}>VSWR Tracking</th>
          <th rowSpan={2}>% Closed</th>
        </tr>
        <tr>
          <th>P1</th>
          <th>P2</th>
          <th>P3</th>
          <th>P4</th>
          <th>P5</th>
        </tr>
      </thead>
      <tbody>
        {table.regionals.map((reg) => (
          <VswrRegionalGroup key={reg.regional} reg={reg} ranges={ranges} />
        ))}
        <tr className="ptable__grand">
          <td colSpan={2}>Grand Total</td>
          {table.grandTotal.vswrP.map((v, i) => (
            <Cell key={i} value={v} />
          ))}
          <Cell value={table.grandTotal.vswrTotalPct} />
        </tr>
      </tbody>
    </table>
  )
}

function VswrRegionalGroup({ reg, ranges }) {
  return (
    <>
      <tr className="ptable__regional-total">
        <td colSpan={2}>Total {reg.regional}</td>
        {reg.vswrP.map((v, i) => (
          <Cell key={i} value={v} />
        ))}
        <Cell value={reg.vswrTotalPct} />
      </tr>
      {reg.nops.map((nop, i) => (
        <tr key={nop.label}>
          {i === 0 && (
            <td className="ptable__regional-label" rowSpan={reg.nops.length}>
              {reg.regional}
            </td>
          )}
          <td className="ptable__nop">NOP {nop.label.toUpperCase()}</td>
          {nop.vswrP.map((v, j) => (
            <Cell key={j} value={v} range={ranges.vswrP[j]} />
          ))}
          <BarCell value={nop.vswrTotalPct} />
        </tr>
      ))}
    </>
  )
}

/* ---------------------------------------------------------------- halaman: 3 tabel terpisah */

export default function ProgressTable({ table, easReport, easInfo, hasVswr = true, dateLabel, generatedAt }) {
  if (!table) return null

  const caption = dateLabel
    ? `Summary ${dateLabel}${generatedAt ? `/${timestampToWIB(generatedAt)}` : ''}`
    : null
  const safeDate = dateLabel || 'summary'

  const dmy = (iso) => (iso ? iso.split('-').reverse().join('-') : '')
  // Catatan di atas tabel EAS: dari mana Baseline dan Ach Validasi hari ini berasal.
  // Record format lama (tanpa field `matched`) tidak menampilkan catatan.
  const revisiNote =
    easInfo && 'matched' in easInfo ? (
      easInfo.baselineFromDateISO == null ? (
        <p className="eas-note eas-note--warn">
          Belum ada baseline sebelumnya, jadi Ach Validasi masih kosong. Baseline hari ini sudah tersimpan
          ({easInfo.baselineStats?.open?.toLocaleString('id-ID')} site terbuka dari{' '}
          {easInfo.baselineStats?.sites?.toLocaleString('id-ID')} site) dan akan dipakai untuk mengisi Ach Validasi
          pada upload berikutnya.
        </p>
      ) : (
        <p className={`eas-note ${easInfo.matched ? '' : 'eas-note--warn'}`}>
          Ach Validasi: <strong>{easInfo.matched}</strong> site Date Revisi{' '}
          <strong>{easInfo.revisiDateLabel}</strong> yang terisi di File EAS (Manual Validation) dihitung Ach, prioritas awalnya dari baseline Streamlit{' '}
          {dmy(easInfo.baselineFromDateISO)}.
          {easInfo.unmatched > 0 && <> {easInfo.unmatched} site tidak ada di baseline tersebut (dilewati).</>}
          {!easInfo.matched && easInfo.availableDates?.length > 0 && (
            <>
              {' '}
              Tanggal Date Revisi terakhir di file:{' '}
              {easInfo.availableDates.map((d) => `${dmy(d.dateISO)} (${d.count})`).join(', ')}.
            </>
          )}{' '}
          Baseline = {easInfo.baselineStats?.open?.toLocaleString('id-ID')} site terbuka per Final Priority Streamlit{easInfo.snapshotLabel ? ` (${easInfo.snapshotLabel})` : ''}.
        </p>
      )
    ) : null

  return (
    <>
      {easReport && revisiNote}

      {CATEGORIES.map((cat) =>
        easReport?.[cat.key] ? (
          <TablePanel
            key={cat.key}
            title={`Validasi EAS ${cat.label}`}
            subtitle="Progress validasi harian: baseline, target D-1, achievement, dan sisa target"
            fileName={`Progress-EAS-${cat.label}-${safeDate}.png`}
            caption={caption}
          >
            <EasReportTable report={easReport[cat.key]} />
          </TablePanel>
        ) : (
          <section className="panel" key={cat.key}>
            <h2 className="panel__title">Validasi EAS {cat.label}</h2>
            <div className="placeholder">
              Data EAS {cat.label} untuk tanggal ini belum ada. Upload File EAS dan Upload Data Streamlit
              bersamaan lalu klik Upload Data.
            </div>
          </section>
        )
      )}

      {hasVswr ? (
        <TablePanel
          title="VSWR Tracking"
          subtitle="% Closed per prioritas dan total"
          fileName={`Progress-VSWR-${safeDate}.png`}
          caption={caption}
        >
          <VswrTable table={table} />
        </TablePanel>
      ) : (
        <section className="panel">
          <h2 className="panel__title">VSWR Tracking</h2>
          <div className="placeholder">
            Data VSWR untuk tanggal ini belum ada. Upload File VSWR lalu klik Upload Data.
          </div>
        </section>
      )}
    </>
  )
}
