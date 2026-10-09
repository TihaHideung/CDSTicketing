import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { relativeHeatColorCss, columnRange } from '../../eas-vswr/lib/colorScale.js'
import { timestampToWIB, periodLabel } from '../lib/format.js'

const HEADERS = [
  ['#Ticket', 'ticket'],
  ['Takeout', 'takeout'],
  ['Scope', 'scope'],
  ['New', 'newCount'],
  ['Assigned', 'assigned'],
  ['In Progress', 'inProgress'],
  ['Submit', 'submit'],
  ['Reject', 'reject'],
  ['Closed', 'closed'],
  ['Waiting Approval', 'waiting'],
  ['Waiting Approval Amesty', 'waitingAmesty'],
  ['Gap Progress', 'gapProgress'],
  ['Gap Closed', 'gapClosed'],
]
// Blok ringkasan "All Area" di bawah tabel (baris 27-28 / 55-56 di sheet Summary NOP).
const SUMMARY = [
  ['#of Ticket', 'ticket'],
  ['Takeout', 'takeout'],
  ['SCOPE', 'scope'],
  ['NEW', 'newCount'],
  ['ASSIGNED', 'assigned'],
  ['IN PROGRESS', 'inProgress'],
  ['SUBMIT', 'submit'],
  ['Reject', 'reject'],
  ['Closed', 'closed'],
  ['WAITING APPROVAL', 'waiting'],
  ['WAITING APPROVAL AMESTY', 'waitingAmesty'],
]
const PCT = [
  ['pctVisit', '% Visit'],
  ['pctSubmit', '% Submit'],
  ['pctClosed', '% Closed'],
]

function PctCell({ value, range }) {
  if (!Number.isFinite(value)) return <td className="ptable__cell ptable__cell--empty">-</td>
  const bg = range ? relativeHeatColorCss(value, range.min, range.max) : null
  return (
    <td className="ptable__cell" style={bg ? { background: bg } : undefined}>
      {value.toFixed(2)}%
    </td>
  )
}

function CountCells({ row }) {
  return HEADERS.map(([, key]) => (
    <td key={key} className={`pmtable__num ${key === 'gapProgress' || key === 'gapClosed' ? 'pmtable__num--gap' : ''}`}>
      {row[key]}
    </td>
  ))
}

/**
 * Satu kartu tabel progress (Site atau Genset). Tiap kartu punya tombol Download
 * Gambar sendiri, jadi gambar Site dan Genset terpisah.
 */
export default function PmTable({ kind, table, dateLabel, generatedAt, dateISO }) {
  const captureRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const name = kind === 'site' ? 'Site' : 'Genset'

  const handleDownload = useCallback(async () => {
    const container = captureRef.current
    const wrap = container?.querySelector('.ptable-wrap')
    if (!container || !wrap) return
    setDownloading(true)
    // tabel lebar bisa scroll horizontal; paksa selebar isinya supaya tidak terpotong
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
      a.download = `Progress-PM-${name}-${dateLabel || 'summary'}.png`
      a.click()
    } catch (err) {
      console.error(err)
    } finally {
      wrap.style.width = prevWidth
      wrap.style.overflow = prevOverflow
      setDownloading(false)
    }
  }, [dateLabel, name])

  if (!table) return null
  const title = `Progress Maintenance ${name} Bulan ${periodLabel(table.period, dateISO)}`
  const area = (table.area || 'Area 1').replace(/\s+/g, '')
  const areaLabel = area.charAt(0).toUpperCase() + area.slice(1).toLowerCase()

  return (
    <section className="panel">
      <div className="panel__header-row">
        <h2 className="panel__title">Visualisasi Progress: Maintenance {name}</h2>
        <button className="btn btn--ghost btn--sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Menyiapkan…' : '⭳ Download Gambar'}
        </button>
      </div>

      <div ref={captureRef} className="ptable-export">
        <div className="pmtable__title">{title}</div>
        <div className="ptable-wrap">
          <table className="ptable pmtable">
            <thead>
              <tr>
                <th>Regional</th>
                <th>NOP</th>
                {HEADERS.map(([label, key]) => (
                  <th key={key}>{label}</th>
                ))}
                {PCT.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.regionals.map((reg) => {
                const ranges = Object.fromEntries(
                  PCT.map(([key]) => [key, columnRange(reg.nops.map((n) => n[key]))])
                )
                const band = { background: `#${reg.color}` }
                return (
                  <RegionalGroup key={reg.regional} reg={reg} ranges={ranges} band={band} />
                )
              })}
              <tr className="pmtable__spacer">
                <td colSpan={18} />
              </tr>
              <tr className="pmsum__head">
                <td colSpan={2}>Maintenance {name}</td>
                {SUMMARY.map(([label, key]) => (
                  <td key={key} className={`pmsum__h pmsum__h--${key}`}>
                    {label}
                  </td>
                ))}
                <td colSpan={5}>GAP Scope to Closed</td>
              </tr>
              <tr className="pmsum__row">
                <td colSpan={2} className="pmsum__label">
                  All {areaLabel}
                </td>
                {SUMMARY.map(([, key]) => (
                  <td key={key} className={`pmsum__v pmsum__v--${key}`}>
                    {table.grand[key]}
                  </td>
                ))}
                <td colSpan={5} className="pmsum__v pmsum__v--gap">
                  {table.grand.gapClosed}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {dateLabel && (
          <div className="ptable__caption">
            Summary {dateLabel}
            {generatedAt && `/${timestampToWIB(generatedAt)}`}
          </div>
        )}
      </div>
    </section>
  )
}

function RegionalGroup({ reg, ranges, band }) {
  return (
    <>
      {reg.nops.map((nop, i) => (
        <tr key={nop.nop}>
          {i === 0 && (
            <td className="ptable__regional-label" rowSpan={reg.nops.length + 1} style={band}>
              {reg.label}
            </td>
          )}
          <td className="ptable__nop">{nop.nop}</td>
          <CountCells row={nop} />
          {PCT.map(([key]) => (
            <PctCell key={key} value={nop[key]} range={ranges[key]} />
          ))}
        </tr>
      ))}
      <tr className="pmtable__regional-total" style={band}>
        <td>Grand Total</td>
        <CountCells row={reg.total} />
        {PCT.map(([key]) => (
          <td key={key} className="pmtable__pct-total">
            {Number.isFinite(reg.total[key]) ? `${reg.total[key].toFixed(2)}%` : '-'}
          </td>
        ))}
      </tr>
    </>
  )
}
