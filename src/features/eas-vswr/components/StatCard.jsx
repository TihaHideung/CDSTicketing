export default function StatCard({ tone, icon, label, value, sub, barPct, onClick, active }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      className={`stat-card stat-card--${tone} ${clickable ? 'stat-card--clickable' : ''} ${
        active ? 'stat-card--active' : ''
      }`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick(e)
            }
          : undefined
      }
    >
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__icon">{icon}</span>
      </div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__sub">{sub}</div>
      <div className="stat-card__bar">
        <div
          className="stat-card__bar-fill"
          style={{ width: `${Math.max(0, Math.min(100, barPct ?? 0))}%` }}
        />
      </div>
      {clickable && <div className="stat-card__hint">{active ? 'Sembunyikan ▲' : 'Lihat detail ▾'}</div>}
    </div>
  )
}
