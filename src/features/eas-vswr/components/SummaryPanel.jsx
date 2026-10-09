import { useCallback, useMemo, useState } from 'react'

export default function SummaryPanel({ summary, dateLabel, placeholder }) {
  const [copied, setCopied] = useState(false)

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
          <button className="btn btn--ghost btn--sm" onClick={handleCopy}>
            {copied ? 'Tersalin ✓' : 'Copy teks'}
          </button>
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
