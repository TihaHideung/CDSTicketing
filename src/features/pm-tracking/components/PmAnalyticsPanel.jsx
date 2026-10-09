import { useState } from 'react'
import StatCard from '../../eas-vswr/components/StatCard.jsx'
import { COMPARE_METRICS } from '../lib/compare.js'
import { idNumber, idSigned } from '../lib/format.js'

const hasDelta = (m) => m && Number.isFinite(m.delta)
const tone = (d) => (d > 0 ? 'green' : d < 0 ? 'red' : 'blue')
const arrow = (d) => (d > 0 ? '↗' : d < 0 ? '↘' : '→')
const deltaClass = (d) => (d > 0 ? 'text-green' : d < 0 ? 'text-red' : 'text-flat')
const range = (m) => `${idNumber(m.prev)}% → ${idNumber(m.now)}%`

function DeltaCell({ m }) {
  if (!hasDelta(m)) {
    return (
      <td className="rtable__cell">
        <span className="text-flat">-</span>
      </td>
    )
  }
  return (
    <td className="rtable__cell">
      <div className={`rtable__delta ${deltaClass(m.delta)}`}>
        {arrow(m.delta)} {idSigned(m.delta)} %
      </div>
      <div className="rtable__sub">{range(m)}</div>
    </td>
  )
}

function DeltaTable({ firstHeader, rows, totalRow }) {
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>
            <th className="rtable__name">{firstHeader}</th>
            {COMPARE_METRICS.map((m) => (
              <th key={m.key}>{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="rtable__name">{r.label}</td>
              {COMPARE_METRICS.map((m) => (
                <DeltaCell key={m.key} m={r.metrics[m.key]} />
              ))}
            </tr>
          ))}
          {totalRow && (
            <tr className="rtable__total">
              <td className="rtable__name">{totalRow.label}</td>
              {COMPARE_METRICS.map((m) => (
                <DeltaCell key={m.key} m={totalRow.metrics[m.key]} />
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function PmAnalyticsPanel({ comparison }) {
  const [kind, setKind] = useState('site')

  if (!comparison) {
    return (
      <section className="panel">
        <h2 className="panel__title">Analisa Peningkatan</h2>
        <div className="placeholder">
          Analisa peningkatan muncul setelah ada minimal 2 tanggal data tersimpan. Generate data untuk
          tanggal berikutnya untuk melihat perbandingannya.
        </div>
      </section>
    )
  }

  const data = comparison[kind]
  const gapText = comparison.gapDays === 1 ? 'kemarin' : `${comparison.gapDays} hari sebelumnya`

  return (
    <section className="panel">
      <div className="panel__header-row">
        <h2 className="panel__title">Analisa Peningkatan</h2>
        <span className="panel__note">Selisih persen dalam poin persentase (pp)</span>
      </div>

      <p className="an-baseline">
        Dibandingkan dengan <strong>{comparison.previousLabel}</strong> ({gapText})
      </p>

      <div className="an-controls">
        <div className="seg" role="group" aria-label="Jenis PM">
          {[
            ['site', 'Maintenance Site'],
            ['genset', 'Maintenance Genset'],
          ].map(([key, label]) => (
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

      {!data ? (
        <div className="placeholder">Data pembanding tidak tersedia.</div>
      ) : (
        <>
          <h3 className="an-section">Peningkatan Keseluruhan</h3>
          <div className="stat-grid">
            {COMPARE_METRICS.map((m) => {
              const o = data.overall[m.key]
              return (
                <StatCard
                  key={m.key}
                  tone={hasDelta(o) ? tone(o.delta) : 'blue'}
                  icon={hasDelta(o) ? arrow(o.delta) : '-'}
                  label={m.label}
                  value={hasDelta(o) ? `${idSigned(o.delta)} %` : '-'}
                  sub={hasDelta(o) ? range(o) : 'Data tidak tersedia'}
                  barPct={o?.now ?? 0}
                />
              )
            })}
          </div>

          <h3 className="an-section">Peningkatan per Regional</h3>
          <DeltaTable firstHeader="Regional" rows={data.regionals} />

          <h3 className="an-section">Peningkatan per NOP</h3>
          <DeltaTable firstHeader="NOP" rows={data.nops} />
        </>
      )}
    </section>
  )
}
