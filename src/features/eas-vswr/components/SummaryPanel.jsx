import { useCallback, useMemo, useState } from 'react'
import { buildSummaryText, SUMMARY_FOCUS } from '../lib/buildSummary.js'

const FOCUS_OPTIONS = [
  { key: SUMMARY_FOCUS.QUICKWIN, label: 'Quickwin' },
  { key: SUMMARY_FOCUS.EXTENDED, label: 'Extended' },
]

export default function SummaryPanel({ record, placeholder }) {
  const [copied, setCopied] = useState(false)
  const [focus, setFocus] = useState(SUMMARY_FOCUS.QUICKWIN)

  const dateLabel = record?.dateLabel

  // Quickwin = format yang sudah tersimpan (tidak berubah). Extended dibangun
  // ulang dari metrics, jadi record lama pun langsung punya versi Extended.
  const summary = useMemo(() => {
    if (!record) return ''
    if (focus === SUMMARY_FOCUS.QUICKWIN && record.summaryText) return record.summaryText
    if (!record.metrics) return record.summaryText || ''
    return buildSummaryText(record.metrics, {
      dateLabel: record.dateLabel,
      areaLabel: record.areaLabel,
      focus,
    })
  }, [record, focus])

  const handleCopy = useCallback(async () => {
    if (!summary) return
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [summary])

  const lines = useMemo(() => (summary ? summary.split('\n') : []), [summary])

  return (
    <section className="panel">
      <div className="panel__header-row">
        <h2 className="panel__title">
          Ringkasan{dateLabel ? ` — ${dateLabel}` : ''}
        </h2>
        {summary && (
          <div className="summary-actions">
            <div className="seg" role="group" aria-label="Fokus ringkasan">
              {FOCUS_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`seg__btn ${focus === o.key ? 'seg__btn--active' : ''}`}
                  aria-pressed={focus === o.key}
                  onClick={() => setFocus(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={handleCopy}>
              {copied ? 'Tersalin ✓' : 'Copy teks'}
            </button>
          </div>
        )}
      </div>

      {!summary && (
        <div className="placeholder">
          {placeholder ||
            'Belum ada data untuk tanggal ini. Upload file EAS & VSWR lalu klik Generate Summary.'}
        </div>
      )}

      {summary && (
        <pre className="summary">
          {lines.map((line, i) => (
            <div key={i} className="summary__line">
              {line || '\u00A0'}
            </div>
          ))}
        </pre>
      )}
    </section>
  )
}
