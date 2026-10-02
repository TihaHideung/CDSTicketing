import { useMemo, useState } from 'react'
import StatCard from './StatCard.jsx'
import { COMPARE_METRICS, rankNops } from '../lib/compare.js'
import { idNumber, idPP } from '../lib/format.js'

const hasDelta = (m) => m && Number.isFinite(m.delta)
const tone = (delta) => (delta > 0 ? 'green' : delta < 0 ? 'red' : 'blue')
const arrow = (delta) => (delta > 0 ? '↗' : delta < 0 ? '↘' : '→')
const deltaClass = (delta) => (delta > 0 ? 'text-green' : delta < 0 ? 'text-red' : 'text-flat')
const range = (m) => `${idNumber(m.prev)}% → ${idNumber(m.now)}%`

export default function AnalyticsPanel({ comparison }) {
  const [metricKey, setMetricKey] = useState('easTotal')
  const [regional, setRegional] = useState(null) // null = semua regional
  const [showAll, setShowAll] = useState(false)

  const ranking = useMemo(
    () => (comparison ? rankNops(comparison.nops, metricKey, regional) : null),
    [comparison, metricKey, regional]
  )

  if (!comparison) {
    return (
      <section className="panel">
        <h2 className="panel__title">Analisa Peningkatan</h2>
        <div className="placeholder">
          Analisa peningkatan muncul setelah ada minimal 2 tanggal data tersimpan.
          Generate data untuk tanggal berikutnya untuk melihat perbandingannya.
        </div>
      </section>
    )
  }

  const { overall, regionals, nops, previousLabel, gapDays, newNopCount } = comparison
  const overallByKey = Object.fromEntries(overall.map((o) => [o.key, o]))
  const metricLabel = COMPARE_METRICS.find((m) => m.key === metricKey).label
  const gapText = gapDays === 1 ? 'kemarin' : `${gapDays} hari sebelumnya`

  return (
    <section className="panel">
      <div className="panel__header-row">
        <h2 className="panel__title">Analisa Peningkatan</h2>
        <span className="panel__note">Selisih % Closed dalam poin persentase (pp)</span>
      </div>

      <p className="an-baseline">
        Dibandingkan dengan <strong>{previousLabel}</strong> ({gapText})
        {newNopCount > 0 && (
          <span className="an-baseline__extra">
            {' '}
            · {newNopCount} NOP baru belum dibandingkan
          </span>
        )}
      </p>

      <h3 className="an-section">Peningkatan Keseluruhan</h3>
      <div className="stat-grid">
        {overall.map((o) => (
          <StatCard
            key={o.key}
            tone={hasDelta(o) ? tone(o.delta) : 'blue'}
            icon={hasDelta(o) ? arrow(o.delta) : '-'}
            label={o.label}
            value={hasDelta(o) ? idPP(o.delta) : '-'}
            sub={hasDelta(o) ? range(o) : 'Data tidak tersedia'}
            barPct={o.now ?? 0}
          />
        ))}
      </div>

      <h3 className="an-section">Peningkatan per Regional</h3>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th className="rtable__name">Regional</th>
              {COMPARE_METRICS.map((m) => (
                <th key={m.key}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regionals.map((r) => (
              <tr key={r.regional}>
                <td className="rtable__name">{r.regional}</td>
                {COMPARE_METRICS.map((m) => (
                  <DeltaCell key={m.key} m={r.metrics[m.key]} />
                ))}
              </tr>
            ))}
            <tr className="rtable__total">
              <td className="rtable__name">TOTAL</td>
              {COMPARE_METRICS.map((m) => (
                <DeltaCell key={m.key} m={overallByKey[m.key]} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="an-section">Peningkatan per NOP</h3>
      <div className="an-controls">
        <div className="seg" role="group" aria-label="Metrik">
          {COMPARE_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`seg__btn ${metricKey === m.key ? 'seg__btn--active' : ''}`}
              onClick={() => setMetricKey(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Regional">
          <button
            type="button"
            className={`seg__btn ${regional === null ? 'seg__btn--active' : ''}`}
            onClick={() => setRegional(null)}
          >
            Semua Regional
          </button>
          {regionals.map((r) => (
            <button
              key={r.regional}
              type="button"
              className={`seg__btn ${regional === r.regional ? 'seg__btn--active' : ''}`}
              onClick={() => setRegional(r.regional)}
            >
              {r.regional}
            </button>
          ))}
        </div>
      </div>

      {ranking.total === 0 ? (
        <div className="placeholder">Tidak ada NOP yang bisa dibandingkan untuk pilihan ini.</div>
      ) : (
        <>
          <div className="an-counts">
            <span className="text-green">↗ {ranking.improvedCount} naik</span>
            <span className="text-red">↘ {ranking.declinedCount} turun</span>
            <span className="text-flat">→ {ranking.unchangedCount} tetap</span>
            <span className="an-counts__total">dari {ranking.total} NOP ({metricLabel})</span>
          </div>

          <div className="movers-grid">
            <MoverList
              title={`Peningkatan Tertinggi · ${metricLabel}`}
              icon="↗"
              tone="green"
              items={ranking.top}
            />
            <MoverList
              title={`Peningkatan Terendah · ${metricLabel}`}
              icon="↘"
              tone="red"
              items={ranking.bottom}
            />
          </div>

          <button type="button" className="an-toggle" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Sembunyikan semua NOP ▲' : `Lihat semua ${ranking.total} NOP ▾`}
          </button>

          {showAll && (
            <div className="detail-list">
              <div className="detail-list__header">
                <h3>Semua NOP · {metricLabel} (urut dari peningkatan tertinggi)</h3>
                <button
                  className="detail-list__close"
                  onClick={() => setShowAll(false)}
                  aria-label="Tutup"
                >
                  ✕
                </button>
              </div>
              <div className="detail-list__items">
                {ranking.all.map((item, i) => (
                  <NopRow key={item.label} item={item} rank={i + 1} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

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
        {arrow(m.delta)} {idPP(m.delta)}
      </div>
      <div className="rtable__sub">{range(m)}</div>
    </td>
  )
}

function NopRow({ item, rank }) {
  return (
    <div className="mover-row">
      <div className="mover-row__rank">{String(rank).padStart(2, '0')}</div>
      <div className="mover-row__body">
        <div className="mover-row__name">{item.label.toUpperCase()}</div>
        <div className="mover-row__range">
          {item.regional} · {range(item)}
        </div>
      </div>
      <div className={`mover-row__delta ${deltaClass(item.delta)}`}>{idPP(item.delta)}</div>
    </div>
  )
}

function MoverList({ title, icon, tone: listTone, items }) {
  return (
    <div className={`mover-list mover-list--${listTone}`}>
      <h3 className="mover-list__title">
        <span>{icon}</span> {title}
      </h3>
      <div className="mover-list__items">
        {items.length === 0 ? (
          <div className="detail-list__empty">Tidak ada data.</div>
        ) : (
          items.map((item, i) => <NopRow key={item.label} item={item} rank={i + 1} />)
        )}
      </div>
    </div>
  )
}
