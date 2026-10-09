import { isoToShortLabel } from './format.js'

export const COMPARE_METRICS = [
  { key: 'visit', label: '% Visit', field: 'pctVisit' },
  { key: 'submit', label: '% Submit', field: 'pctSubmit' },
  { key: 'closed', label: '% Closed', field: 'pctClosed' },
]

// Selisih di bawah ini (poin persentase) dianggap tetap.
const FLAT_EPSILON = 0.005

function daysBetween(isoA, isoB) {
  return Math.round((new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / 86400000)
}

function diff(cur, prev, field) {
  const now = cur?.[field]
  const before = prev?.[field]
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null
  const raw = now - before
  return { now, prev: before, delta: Math.abs(raw) < FLAT_EPSILON ? 0 : raw }
}

function diffAll(cur, prev) {
  return Object.fromEntries(COMPARE_METRICS.map((m) => [m.key, diff(cur, prev, m.field)]))
}

function compareTable(cur, prev) {
  if (!cur || !prev) return null
  const prevRegionals = new Map(prev.regionals.map((r) => [r.label, r]))
  const prevNops = new Map(prev.regionals.flatMap((r) => r.nops).map((n) => [n.nop, n]))

  return {
    overall: diffAll(cur.grand, prev.grand),
    regionals: cur.regionals.map((r) => ({
      label: r.label,
      metrics: diffAll(r.total, prevRegionals.get(r.label)?.total),
    })),
    nops: cur.regionals.flatMap((r) =>
      r.nops.map((n) => ({ label: n.nop, regional: r.label, metrics: diffAll(n, prevNops.get(n.nop)) }))
    ),
  }
}

/** Membandingkan record tanggal terpilih dengan record tersimpan sebelumnya. */
export function comparePmRecords(current, previous) {
  if (!current || !previous) return null
  const cur = current.metrics
  const prev = previous.metrics
  if (!cur?.site || !prev?.site) return null
  return {
    previousLabel: isoToShortLabel(previous.dateISO),
    gapDays: daysBetween(previous.dateISO, current.dateISO),
    site: compareTable(cur.site, prev.site),
    genset: compareTable(cur.genset, prev.genset),
  }
}
