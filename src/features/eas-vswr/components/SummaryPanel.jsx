import { useCallback, useMemo, useState } from 'react'
import { buildSummaryText } from '../lib/buildSummary.js'

export default function SummaryPanel({ record, placeholder }) {
  const [copied, setCopied] = useState(false)

  const dateLabel = record?.dateLabel

  // Ringkasan khusus VSWR, dibangun dari metrics supaya record lama pun ikut berformat baru.
  // Kosong kalau data VSWR untuk tanggal ini belum diupload.
  const summary = useMemo(() => {
    if (!record?.metrics) return ''
    return buildSummaryText(record.metrics, {
      dateLabel: record.dateLabel,
      areaLabel: record.areaLabel,
    })
  }, [record])

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
          Ringkasan VSWR{dateLabel ? ` — ${dateLabel}` : ''}
        </h2>
        {summary && (
          <div className="summary-actions">
            <button className="btn btn--ghost btn--sm" onClick={handleCopy}>
              {copied ? 'Tersalin ✓' : 'Copy teks'}
            </button>
          </div>
        )}
      </div>

      {!summary && (
        <div className="placeholder">
          {placeholder ||
            (record
              ? 'Data VSWR untuk tanggal ini belum diupload. Upload File VSWR lalu klik Upload Data.'
              : 'Belum ada data untuk tanggal ini. Upload File VSWR lalu klik Upload Data.')}
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
