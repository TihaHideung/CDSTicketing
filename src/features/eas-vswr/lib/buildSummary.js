const DIVIDER = '━━━━━━━━━━━━━━━━━━━━'

function fmt(p) {
  return p.toFixed(2)
}

// Assigns 🥇🥈🥉 to a sorted-descending top-3, giving 🥇 to every entry
// tied with the top value (matches how ties are reported in practice).
function medalFor(index, list) {
  if (index === 0) return '🥇'
  if (list[index].value === list[0].value) return '🥇'
  if (index === 1) return '🥈'
  return '🥉'
}

function topBottom(entries, key) {
  const withValue = entries.filter((e) => Number.isFinite(e[key]))
  const sortedDesc = [...withValue].sort((a, b) => b[key] - a[key])
  const sortedAsc = [...withValue].sort((a, b) => a[key] - b[key])

  const top3 = sortedDesc.slice(0, 3).map((e) => ({ label: e.label, value: e[key] }))
  const bottom3 = sortedAsc.slice(0, 3).map((e) => ({ label: e.label, value: e[key] }))

  const topLines = top3.map(
    (item, i) => `${medalFor(i, top3)} NOP ${item.label} – ${fmt(item.value)}%`
  )
  const bottomLines = bottom3.map(
    (item) => `🔴 NOP ${item.label} – ${fmt(item.value)}%`
  )

  return { topLines, bottomLines }
}

/** Record lama (sebelum EAS & VSWR bisa diupload terpisah) tidak punya metrics.hasVswr. */
export function hasVswrData(metrics) {
  if (!metrics) return false
  return metrics.hasVswr ?? Number.isFinite(metrics.pctVSWR)
}

/**
 * Teks ringkasan khusus VSWR Tracking (EAS tidak ikut diringkas, datanya ada di tabel).
 * Mengembalikan '' kalau data VSWR untuk tanggal tersebut belum ada.
 */
export function buildSummaryText(metrics, { dateLabel, areaLabel }) {
  if (!hasVswrData(metrics)) return ''

  const regionalSorted = (metrics.table?.regionals || [])
    .filter((r) => Number.isFinite(r.vswrTotalPct))
    .map((r) => ({ regional: r.regional, value: r.vswrTotalPct }))
    .sort((a, b) => b.value - a.value)

  const regionalLines = regionalSorted.map((r, i) => {
    let dot = '🔵'
    let suffix = ''
    if (i === 0) {
      dot = '🟢'
      suffix = ' (terbaik)'
    } else if (i === regionalSorted.length - 1 && regionalSorted.length > 1) {
      dot = '🔴'
      suffix = ' (terlemah)'
    }
    return `${dot} ${r.regional}: ${fmt(r.value)}%${suffix}`
  })

  const vs = topBottom(Object.values(metrics.nopScores || {}), 'vswrPct')

  const lines = []
  lines.push(`📊 Progress VSWR Tracking – ${areaLabel}`)
  lines.push(`Update: ${dateLabel}`)
  lines.push('')
  lines.push('Overall:')
  lines.push(`✅ VSWR Tracking: ${fmt(metrics.pctVSWR)}% closed`)
  lines.push('')
  lines.push('Per Regional (VSWR Tracking):')
  lines.push(...regionalLines)
  lines.push(DIVIDER)
  lines.push('🟢 Top 3 Tertinggi:')
  lines.push(...vs.topLines)
  lines.push('🔴 Top 3 Terendah:')
  lines.push(...vs.bottomLines)

  return lines.join('\n')
}
