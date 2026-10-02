import { columnRange } from './colorScale.js'

export function pct(closed, total) {
  if (!total) return 0
  return (closed / total) * 100
}

function cleanNopLabel(nop) {
  const cleaned = /^NOP\b/i.test(nop) ? nop.replace(/^NOP\s*/i, '') : nop
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// VSWR regional labels look like "R02_Sumbagsel" — normalize to the same
// canonical form EAS uses ("SUMBAGSEL") so both datasets group together.
function normalizeRegional(name) {
  return (name || '').replace(/^R\d+_/i, '').trim().toUpperCase()
}

function vswrPriorityPct(closedP, openP) {
  return closedP.map((c, i) => {
    const t = c + openP[i]
    return t ? pct(c, t) : null
  })
}

/**
 * Computes every number the app needs from the two parsed pivot tables:
 * overall EAS/VSWR percentages, per-regional EAS percentage, a per-NOP
 * "overall score" used for day-over-day history comparisons, and a full
 * `table` structure (regional -> NOP breakdown incl. VSWR P1-P5) used to
 * render the colored progress table / Excel export.
 */
export function computeMetrics({ eas, vswr }) {
  const g = eas.grandTotal
  const pctExtended = pct(g.extClose, g.extTotal)
  const pctQuickwin = pct(g.qwClose, g.qwTotal)
  const pctEASOverall = pct(g.extClose + g.qwClose, g.extTotal + g.qwTotal)

  const vg = vswr.grandTotal
  const pctVSWR = pct(vg.closedTotal, vg.total)

  const regionalRows = eas.regionalTotals.map((r) => {
    const closed = r.extClose + r.qwClose
    const total = r.extTotal + r.qwTotal
    return { regional: r.regional, value: pct(closed, total) }
  })

  // ---- per-NOP "overall score" (avg of quickwin/extended/vswr), used by
  // the history/analytics day-over-day comparison ----
  const nopScores = {}

  for (const r of eas.nopRows) {
    const key = cleanNopLabel(r.nop)
    const quickwinPct = pct(r.qwClose, r.qwTotal)
    const extendedPct = pct(r.extClose, r.extTotal)
    nopScores[key] = { ...(nopScores[key] || {}), label: key, quickwinPct, extendedPct }
  }
  for (const r of vswr.nopRows) {
    const key = cleanNopLabel(r.nop)
    const vswrPct = pct(r.closedTotal, r.total)
    nopScores[key] = { ...(nopScores[key] || {}), label: key, vswrPct }
  }
  for (const key of Object.keys(nopScores)) {
    const s = nopScores[key]
    const parts = [s.quickwinPct, s.extendedPct, s.vswrPct].filter((v) =>
      Number.isFinite(v)
    )
    s.overallScore = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0
  }

  // ---- full colored-table structure (Regional > NOP, EAS + VSWR P1-P5) ----
  const vswrByNop = {}
  for (const r of vswr.nopRows) {
    vswrByNop[cleanNopLabel(r.nop)] = r
  }
  const vswrRegionalByKey = {}
  for (const r of vswr.regionalTotals) {
    vswrRegionalByKey[normalizeRegional(r.regional)] = r
  }

  const table = {
    regionals: eas.regionalTotals.map((reg) => {
      const quickwinPct = pct(reg.qwClose, reg.qwTotal)
      const extendedPct = pct(reg.extClose, reg.extTotal)
      const easTotalPct = pct(reg.extClose + reg.qwClose, reg.extTotal + reg.qwTotal)
      const vswrReg = vswrRegionalByKey[normalizeRegional(reg.regional)]
      const vswrP = vswrReg ? vswrPriorityPct(vswrReg.closedP, vswrReg.openP) : [0, 0, 0, 0, 0]
      const vswrTotalPct = vswrReg ? pct(vswrReg.closedTotal, vswrReg.total) : 0

      const nops = eas.nopRows
        .filter((r) => r.regional.toUpperCase() === reg.regional.toUpperCase())
        .map((r) => {
          const label = cleanNopLabel(r.nop)
          const nopQuickwinPct = pct(r.qwClose, r.qwTotal)
          const nopExtendedPct = pct(r.extClose, r.extTotal)
          const nopEasTotalPct = pct(r.extClose + r.qwClose, r.extTotal + r.qwTotal)
          const vswrRow = vswrByNop[label]
          const nopVswrP = vswrRow
            ? vswrPriorityPct(vswrRow.closedP, vswrRow.openP)
            : [null, null, null, null, null]
          const nopVswrTotalPct = vswrRow ? pct(vswrRow.closedTotal, vswrRow.total) : null

          return {
            label,
            quickwinPct: nopQuickwinPct,
            extendedPct: nopExtendedPct,
            easTotalPct: nopEasTotalPct,
            vswrP: nopVswrP,
            vswrTotalPct: nopVswrTotalPct,
          }
        })

      return {
        regional: reg.regional,
        quickwinPct,
        extendedPct,
        easTotalPct,
        vswrP,
        vswrTotalPct,
        nops,
      }
    }),
    grandTotal: {
      quickwinPct: pctQuickwin,
      extendedPct: pctExtended,
      easTotalPct: pctEASOverall,
      vswrP: vswrPriorityPct(vg.closedP, vg.openP),
      vswrTotalPct: pctVSWR,
    },
  }

  return {
    pctEASOverall,
    pctQuickwin,
    pctExtended,
    pctVSWR,
    regionalRows,
    nopScores,
    table: { ...table, columnRanges: computeColumnRanges(table) },
  }
}

// Excel's 3-color-scale conditional formatting scales each column by its
// own min/max across the leaf (NOP-level) rows — compute that here once so
// both the on-screen table and the Excel export use identical ranges.
function computeColumnRanges(table) {
  const allNops = table.regionals.flatMap((r) => r.nops)
  const col = (pick) => columnRange(allNops.map(pick))
  return {
    quickwinPct: col((n) => n.quickwinPct),
    extendedPct: col((n) => n.extendedPct),
    easTotalPct: col((n) => n.easTotalPct),
    vswrP: [0, 1, 2, 3, 4].map((i) => col((n) => n.vswrP[i])),
    vswrTotalPct: col((n) => n.vswrTotalPct),
  }
}
