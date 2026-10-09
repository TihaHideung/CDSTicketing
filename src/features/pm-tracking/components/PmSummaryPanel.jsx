import { useCallback, useMemo, useState } from 'react'

const TABS = [
  ['site', 'Site'],
  ['genset', 'Genset'],
]

// Ringkasan teks dipisah per jenis (Site / Genset), masing-masing bisa disalin sendiri.
export default function PmSummaryPanel({ texts, dateLabel }) {
  const [kind, setKind] = useState('site')
  const [copied, setCopied] = useState(false)
  const summary = texts?.[kind] || ''

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
        <h2 className="panel__title">Ringkasan{dateLabel ? `: ${dateLabel}` : ''}</h2>
        {summary && (
          <button className="btn btn--ghost btn--sm" onClick={handleCopy}>
            {copied ? 'Tersalin ✓' : `Copy teks ${kind === 'site' ? 'Site' : 'Genset'}`}
          </button>
        )}
      </div>

      <div className="an-controls">
        <div className="seg" role="group" aria-label="Jenis ringkasan">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`seg__btn ${kind === key ? 'seg__btn--active' : ''}`}
              onClick={() => setKind(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!summary && (
        <div className="placeholder">
          Belum ada data untuk tanggal ini. Upload file PM Site &amp; PM Genset lalu klik Generate Summary.
        </div>
      )}

      {summary && (
        <pre className="summary">
          {lines.map((line, i) => (
            <div key={i} className="summary__line">
              {line || ' '}
            </div>
          ))}
        </pre>
      )}
    </section>
  )
}
