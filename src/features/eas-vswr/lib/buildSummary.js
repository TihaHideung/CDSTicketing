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

export function buildSummaryText(metrics, { dateLabel, areaLabel }) {
  const { pctEASOverall, pctQuickwin, pctExtended, pctVSWR, regionalRows, nopScores } =
    metrics

  const regionalSorted = [...regionalRows].sort((a, b) => b.value - a.value)
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

  const nopList = Object.values(nopScores)
  const qw = topBottom(nopList, 'quickwinPct')
  const vs = topBottom(nopList, 'vswrPct')

  const lines = []
  lines.push(`📊 Progress Validasi EAS & VSWR Tracking – ${areaLabel}`)
  lines.push(`Update: ${dateLabel}`)
  lines.push('')
  lines.push('Overall:')
  lines.push(`✅ Validasi EAS: ${fmt(pctEASOverall)}% closed`)
  lines.push(`* Quickwin: ${fmt(pctQuickwin)}%`)
  lines.push(`* Extended: ${fmt(pctExtended)}%`)
  lines.push(`✅ VSWR Tracking: ${fmt(pctVSWR)}% closed`)
  lines.push('')
  lines.push('Per Regional (Validasi EAS):')
  lines.push(...regionalLines)
  lines.push(DIVIDER)
  lines.push('1️⃣ QUICKWIN')
  lines.push('🟢 Top 3 Tertinggi:')
  lines.push(...qw.topLines)
  lines.push('🔴 Top 3 Terendah:')
  lines.push(...qw.bottomLines)
  lines.push(DIVIDER)
  lines.push('2️⃣ VSWR TRACKING (% Closed)')
  lines.push('🟢 Top 3 Tertinggi:')
  lines.push(...vs.topLines)
  lines.push('🔴 Top 3 Terendah:')
  lines.push(...vs.bottomLines)

  return lines.join('\n')
}
