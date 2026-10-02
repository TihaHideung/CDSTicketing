import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { relativeHeatColorCss } from '../lib/colorScale.js'
import { timestampToWIB } from '../lib/format.js'

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

// "Total" (combined EAS) and the trailing overall "% Closed" (VSWR) columns
// render as a progress bar — width maps directly to the value on an
// absolute 0-100% scale (100% = full, 0% = empty), and the fill color
// follows the same red-yellow-green scale based on that same absolute
// value, so both the length and the color track the actual percentage.
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

export default function ProgressTable({ table, dateLabel, generatedAt }) {
  const captureRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = useCallback(async () => {
    const container = captureRef.current
    const wrap = container?.querySelector('.ptable-wrap')
    if (!container || !wrap) return

    setDownloading(true)
    // .ptable-wrap scrolls horizontally when the table is wider than the
    // panel, so a plain capture only grabs the visible slice. Temporarily
    // force it to its full content width so nothing is cropped, then
    // capture at that full size before reverting.
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
      a.download = `Progress-EAS-VSWR-${dateLabel || 'summary'}.png`
      a.click()
    } catch (err) {
      console.error(err)
    } finally {
      wrap.style.width = prevWidth
      wrap.style.overflow = prevOverflow
      setDownloading(false)
    }
  }, [dateLabel])

  if (!table) return null
  const ranges = table.columnRanges

  return (
    <section className="panel">
      <div className="panel__header-row">
        <h2 className="panel__title">Visualisasi Progress</h2>
        <button className="btn btn--ghost btn--sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Menyiapkan…' : '⭳ Download Gambar'}
        </button>
      </div>

      <div ref={captureRef} className="ptable-export">
        <div className="ptable-wrap">
          <table className="ptable">
            <thead>
              <tr>
                <th rowSpan={2}>Regional</th>
                <th rowSpan={2}>NOP</th>
                <th colSpan={3}>Validasi EAS (% Closed)</th>
                <th colSpan={5}>VSWR Tracking</th>
                <th rowSpan={2}>% Closed</th>
              </tr>
              <tr>
                <th>% Quickwin</th>
                <th>% Extended</th>
                <th>Total</th>
                <th>P1</th>
                <th>P2</th>
                <th>P3</th>
                <th>P4</th>
                <th>P5</th>
              </tr>
            </thead>
            <tbody>
              {table.regionals.map((reg) => (
                <RegionalGroup key={reg.regional} reg={reg} ranges={ranges} />
              ))}
              <tr className="ptable__grand">
                <td colSpan={2}>Grand Total</td>
                <Cell value={table.grandTotal.quickwinPct} />
                <Cell value={table.grandTotal.extendedPct} />
                <Cell value={table.grandTotal.easTotalPct} />
                {table.grandTotal.vswrP.map((v, i) => (
                  <Cell key={i} value={v} />
                ))}
                <Cell value={table.grandTotal.vswrTotalPct} />
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

function RegionalGroup({ reg, ranges }) {
  return (
    <>
      <tr className="ptable__regional-total">
        <td colSpan={2}>Total {reg.regional}</td>
        <Cell value={reg.quickwinPct} />
        <Cell value={reg.extendedPct} />
        <Cell value={reg.easTotalPct} />
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
          <Cell value={nop.quickwinPct} range={ranges.quickwinPct} />
          <Cell value={nop.extendedPct} range={ranges.extendedPct} />
          <BarCell value={nop.easTotalPct} />
          {nop.vswrP.map((v, j) => (
            <Cell key={j} value={v} range={ranges.vswrP[j]} />
          ))}
          <BarCell value={nop.vswrTotalPct} />
        </tr>
      ))}
    </>
  )
}
