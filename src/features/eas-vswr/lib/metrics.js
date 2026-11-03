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
 * Menghitung semua angka yang dibutuhkan app dari laporan EAS (Extended / Quickwin, lihat
 * easReport.js) dan pivot VSWR. KEDUANYA OPSIONAL: EAS (File EAS + Upload Data Streamlit)
 * dan VSWR boleh diupload terpisah, jadi bagian yang belum ada bernilai null.
 *
 * Persentase EAS = Done / Total site (Ach% pada tabel Report Daily EAS).
 */
export function computeMetrics({ easReport = null, vswr = null }) {
  const hasEas = Boolean(easReport)
  const hasVswr = Boolean(vswr)
  const ext = easReport?.extended
  const qw = easReport?.quickwin

  const pctExtended = hasEas ? ext.area.donePct ?? 0 : null
  const pctQuickwin = hasEas ? qw.area.donePct ?? 0 : null
  const pctEASOverall = hasEas
    ? pct(ext.area.done + qw.area.done, ext.area.total + qw.area.total)
    : null
  const vg = vswr?.grandTotal
  const pctVSWR = hasVswr ? pct(vg.closedTotal, vg.total) : null

  // Peta VSWR per NOP & per regional (kunci: nama NOP rapi / nama regional kapital).
  const vswrByNop = {}
  const vswrNopsByRegional = {}
  for (const r of vswr?.nopRows || []) {
    const label = cleanNopLabel(r.nop)
    vswrByNop[label] = r
    const reg = normalizeRegional(r.regional)
    ;(vswrNopsByRegional[reg] ||= []).push(label)
  }
  const vswrRegionalByKey = {}
  for (const r of vswr?.regionalTotals || []) {
    vswrRegionalByKey[normalizeRegional(r.regional)] = r
  }

  // Regional = gabungan yang ada di EAS dan/atau VSWR.
  const regionalKeys = [
    ...new Set([
      ...(ext?.regionals || []).map((r) => r.regional),
      ...(qw?.regionals || []).map((r) => r.regional),
      ...Object.keys(vswrNopsByRegional),
      ...Object.keys(vswrRegionalByKey),
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  const findReg = (rep, name) => rep?.regionals.find((r) => r.regional === name)
  const findNop = (reg, label) => reg?.nops.find((n) => cleanNopLabel(n.label) === label)
  const nopLabelsOf = (name) => {
    const e = findReg(ext, name)
    const q = findReg(qw, name)
    return [
      ...new Set([
        ...(e?.nops || []).map((n) => cleanNopLabel(n.label)),
        ...(q?.nops || []).map((n) => cleanNopLabel(n.label)),
        ...(vswrNopsByRegional[name] || []),
      ]),
    ].sort((a, b) => a.localeCompare(b))
  }

  const regionalRows = hasEas
    ? regionalKeys.map((name) => {
        const e = findReg(ext, name)
        const q = findReg(qw, name)
        const done = (e?.done || 0) + (q?.done || 0)
        const total = (e?.total || 0) + (q?.total || 0)
        return { regional: name, value: pct(done, total) }
      })
    : []

  // ---- skor per NOP (rata-rata quickwin/extended/vswr yang ada) ----
  const nopScores = {}
  for (const name of regionalKeys) {
    const e = findReg(ext, name)
    const q = findReg(qw, name)
    for (const label of nopLabelsOf(name)) {
      const s = { label }
      if (hasEas) {
        s.quickwinPct = findNop(q, label)?.donePct ?? 0
        s.extendedPct = findNop(e, label)?.donePct ?? 0
      }
      const vr = vswrByNop[label]
      if (vr) s.vswrPct = pct(vr.closedTotal, vr.total)
      const parts = [s.quickwinPct, s.extendedPct, s.vswrPct].filter((v) => Number.isFinite(v))
      s.overallScore = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0
      nopScores[label] = s
    }
  }

  // ---- struktur tabel penuh (Regional > NOP, EAS + VSWR P1-P5) ----
  const NO_VSWR = [null, null, null, null, null]
  const table = {
    regionals: regionalKeys.map((name) => {
      const e = findReg(ext, name)
      const q = findReg(qw, name)
      const vswrReg = vswrRegionalByKey[name]
      return {
        regional: name,
        quickwinPct: hasEas ? q?.donePct ?? 0 : null,
        extendedPct: hasEas ? e?.donePct ?? 0 : null,
        easTotalPct: hasEas
          ? pct((e?.done || 0) + (q?.done || 0), (e?.total || 0) + (q?.total || 0))
          : null,
        vswrP: vswrReg ? vswrPriorityPct(vswrReg.closedP, vswrReg.openP) : NO_VSWR,
        vswrTotalPct: vswrReg ? pct(vswrReg.closedTotal, vswrReg.total) : null,
        nops: nopLabelsOf(name).map((label) => {
          const en = findNop(e, label)
          const qn = findNop(q, label)
          const vr = vswrByNop[label]
          return {
            label,
            quickwinPct: hasEas ? qn?.donePct ?? 0 : null,
            extendedPct: hasEas ? en?.donePct ?? 0 : null,
            easTotalPct: hasEas
              ? pct((en?.done || 0) + (qn?.done || 0), (en?.total || 0) + (qn?.total || 0))
              : null,
            vswrP: vr ? vswrPriorityPct(vr.closedP, vr.openP) : NO_VSWR,
            vswrTotalPct: vr ? pct(vr.closedTotal, vr.total) : null,
          }
        }),
      }
    }),
    grandTotal: {
      quickwinPct: pctQuickwin,
      extendedPct: pctExtended,
      easTotalPct: pctEASOverall,
      vswrP: hasVswr ? vswrPriorityPct(vg.closedP, vg.openP) : NO_VSWR,
      vswrTotalPct: pctVSWR,
    },
  }

  return {
    hasEas,
    hasVswr,
    pctEASOverall,
    pctQuickwin,
    pctExtended,
    pctVSWR,
    regionalRows,
    nopScores,
    easReport,
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
