import { isoToShortLabel } from './format.js'

// Metrik yang dibandingkan antar tanggal. `field` adalah nama properti persen
// di metrics.table (grandTotal, regionals[], dan regionals[].nops[]), jadi semua
// angka analisa berasal dari sumber yang sama dengan tabel progress di layar.
export const COMPARE_METRICS = [
  { key: 'easTotal', label: 'EAS Total', field: 'easTotalPct' },
  { key: 'quickwin', label: 'Quickwin', field: 'quickwinPct' },
  { key: 'extended', label: 'Extended', field: 'extendedPct' },
  { key: 'vswr', label: 'VSWR', field: 'vswrTotalPct' },
]

// Selisih di bawah ini (dalam poin persentase) dianggap "tetap": tampilannya
// dibulatkan 2 desimal, jadi +0,003 akan terlihat sebagai +0,00.
const FLAT_EPSILON = 0.005

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00')
  const b = new Date(isoB + 'T00:00:00')
  return Math.round((b - a) / 86400000)
}

export function formatDateRangeLabel(previous, current) {
  return `${isoToShortLabel(previous.dateISO)} - ${isoToShortLabel(current.dateISO)}`
}

// { now, prev, delta } untuk satu metrik, atau null kalau salah satu sisi
// tidak punya nilainya (mis. NOP yang tidak ada di data VSWR).
function diff(currentObj, previousObj, field) {
  const now = currentObj?.[field]
  const prev = previousObj?.[field]
  if (!Number.isFinite(now) || !Number.isFinite(prev)) return null
  const raw = now - prev
  return { now, prev, delta: Math.abs(raw) < FLAT_EPSILON ? 0 : raw }
}

function diffAll(currentObj, previousObj) {
  const out = {}
  for (const m of COMPARE_METRICS) out[m.key] = diff(currentObj, previousObj, m.field)
  return out
}

const regionalKey = (name) => (name || '').trim().toUpperCase()
const nopKey = (label) => (label || '').trim().toLowerCase()

/**
 * Membandingkan dua record history (tanggal terpilih vs tanggal tersimpan
 * sebelumnya). Mengembalikan null kalau belum ada pembanding.
 *
 * Hasil:
 *  - overall   : peningkatan keseluruhan per metrik
 *  - regionals : peningkatan per regional (SUMBAGUT/SUMBAGSEL/SUMBAGTENG, dst)
 *  - nops      : peningkatan per NOP (beserta regional-nya), untuk di-ranking
 *                lewat rankNops()
 * Semua selisih dalam poin persentase (pp) dari % Closed.
 */
export function compareRecords(current, previous) {
  if (!current || !previous) return null
  const curTable = current.metrics?.table
  const prevTable = previous.metrics?.table
  if (!curTable || !prevTable) return null

  const overallDiffs = diffAll(curTable.grandTotal, prevTable.grandTotal)
  const overall = COMPARE_METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    ...(overallDiffs[m.key] || { now: null, prev: null, delta: null }),
  }))

  const prevRegionals = new Map(prevTable.regionals.map((r) => [regionalKey(r.regional), r]))
  const prevNops = new Map(
    prevTable.regionals.flatMap((r) => r.nops).map((n) => [nopKey(n.label), n])
  )

  const regionals = curTable.regionals.map((reg) => ({
    regional: reg.regional,
    metrics: diffAll(reg, prevRegionals.get(regionalKey(reg.regional))),
  }))

  let newNopCount = 0
  const nops = []
  for (const reg of curTable.regionals) {
    for (const nop of reg.nops) {
      const prevNop = prevNops.get(nopKey(nop.label))
      if (!prevNop) {
        newNopCount += 1 // NOP baru, belum ada pembanding
        continue
      }
      nops.push({ label: nop.label, regional: reg.regional, metrics: diffAll(nop, prevNop) })
    }
  }

  const gapDays = daysBetween(previous.dateISO, current.dateISO)

  return {
    previousDateISO: previous.dateISO,
    previousLabel: isoToShortLabel(previous.dateISO),
    gapDays,
    overall,
    regionals,
    nops,
    newNopCount,
  }
}

/**
 * Ranking NOP berdasarkan peningkatan satu metrik.
 *  - top    : peningkatan tertinggi
 *  - bottom : peningkatan terendah (termasuk yang turun), tidak tumpang tindih dengan top
 *  - all    : semua NOP, dari peningkatan tertinggi ke terendah
 * `regional` (opsional) membatasi ke satu regional.
 */
export function rankNops(nops, metricKey, regional = null, topN = 5) {
  const items = nops
    .filter((n) => !regional || regionalKey(n.regional) === regionalKey(regional))
    .map((n) => ({ label: n.label, regional: n.regional, ...(n.metrics[metricKey] || {}) }))
    .filter((i) => Number.isFinite(i.delta))

  const all = [...items].sort((a, b) => b.delta - a.delta || a.label.localeCompare(b.label))
  // Maksimal topN per sisi, tapi dibagi dua kalau NOP-nya sedikit (mis. 1 regional
  // dengan 4 NOP jadi 2 tertinggi + 2 terendah, bukan 4 tertinggi + 0 terendah).
  const n = Math.min(topN, Math.ceil(all.length / 2))
  const top = all.slice(0, n)
  const topLabels = new Set(top.map((i) => i.label))
  const bottom = [...all]
    .reverse()
    .filter((i) => !topLabels.has(i.label))
    .slice(0, n)

  return {
    all,
    top,
    bottom,
    total: all.length,
    improvedCount: all.filter((i) => i.delta > 0).length,
    declinedCount: all.filter((i) => i.delta < 0).length,
    unchangedCount: all.filter((i) => i.delta === 0).length,
  }
}
