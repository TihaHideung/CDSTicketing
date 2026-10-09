import { periodLabel } from './format.js'

// Format teks mengikuti contoh dari pengguna: satu teks untuk Site dan satu untuk
// Genset (dipisah), masing-masing berisi Overview, per regional, total area, dan Catatan.

const DIV = '━━━━━━━━━━━━━━━'
const nf = new Intl.NumberFormat('id-ID')
const num = (n) => nf.format(n)

// Persen bulat, kecuali nilai di bawah 1% (tapi > 0) yang dibuat 1 desimal dengan koma
// supaya tidak tampil "0%" padahal sudah ada yang Closed. Dipakai di overview dan total.
function pctTotal(v) {
  if (!Number.isFinite(v)) return '0%'
  if (v > 0 && v < 1) return `${v.toFixed(1).replace('.', ',')}%`
  return `${Math.round(v)}%`
}
const pctInt = (v) => `${Number.isFinite(v) ? Math.round(v) : 0}%`

const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
const nopName = (nop) => titleCase(nop.replace(/^NOP\s+/i, ''))

function joinId(list) {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} dan ${list[list.length - 1]}`
}

// Penanda status per NOP / regional berdasarkan % Closed.
function dot(pctClosed) {
  if (Number.isFinite(pctClosed) && pctClosed >= 80) return '🟢'
  if (Number.isFinite(pctClosed) && pctClosed >= 50) return '🟡'
  return '🔴'
}

function overviewLines(kind, g) {
  const lines = [
    '🎯 Overview',
    `Scope: ${num(g.scope)} | Closed: ${num(g.closed)} (${pctTotal(g.pctClosed)})`,
    `Gap Scope → Closed: ${num(g.gapClosed)}`,
  ]
  if (kind === 'genset') {
    lines.push(
      `New: ${num(g.newCount)} | Assigned: ${num(g.assigned)} | In Progress: ${num(g.inProgress)} | Submit: ${num(g.submit)}`
    )
  } else {
    lines.push(`In Progress: ${num(g.inProgress)} | Submit: ${num(g.submit)}`)
  }
  lines.push(`Waiting Approval: ${num(g.waiting)} | Waiting Approval Amnesty: ${num(g.waitingAmesty)}`)
  return lines
}

// Urut: Closed terbanyak dulu, lalu % Visit tertinggi.
function sortedNops(reg) {
  return [...reg.nops]
    .filter((n) => n.scope > 0)
    .sort(
      (a, b) =>
        b.closed - a.closed ||
        (Number.isFinite(b.pctVisit) ? b.pctVisit : -1) - (Number.isFinite(a.pctVisit) ? a.pctVisit : -1) ||
        a.nop.localeCompare(b.nop)
    )
}

function regionalBlock(reg) {
  const t = reg.total
  return [
    DIV,
    `📍 ${reg.label} - ${pctInt(t.pctClosed)} Closed`,
    DIV,
    ...sortedNops(reg).map(
      (n) =>
        `${dot(n.pctClosed)} ${nopName(n.nop)} : Scope ${num(n.scope)} | Visit ${pctInt(n.pctVisit)} | Closed ${num(n.closed)} (${pctInt(n.pctClosed)})`
    ),
    `Subtotal : Scope ${num(t.scope)} | Closed ${num(t.closed)}`,
    '',
  ]
}

const allNops = (table) =>
  table.regionals.flatMap((r) => r.nops.filter((n) => n.scope > 0).map((n) => ({ ...n, regional: r.label })))

function siteNotes(table) {
  const g = table.grand
  const notes = []
  if (g.inProgress > 0 && g.scope > 0) {
    notes.push(
      `Pekerjaan lapangan sudah jalan: ${num(g.inProgress)} tiket In Progress (${pctInt((g.inProgress / g.scope) * 100)} dari scope), tinggal dikonversi ke Submit dan Closed`
    )
  }

  const byClosed = allNops(table)
    .filter((n) => n.closed > 0)
    .sort((a, b) => b.closed - a.closed)
  if (byClosed.length >= 2) {
    notes.push(
      `NOP ${nopName(byClosed[0].nop)} paling cepat (${num(byClosed[0].closed)} Closed), disusul ${nopName(byClosed[1].nop)} (${num(byClosed[1].closed)} Closed)`
    )
  } else if (byClosed.length === 1) {
    notes.push(`NOP ${nopName(byClosed[0].nop)} paling cepat (${num(byClosed[0].closed)} Closed)`)
  } else {
    notes.push('Belum ada tiket Closed di seluruh NOP')
  }

  if (g.closed > 0) {
    const noClosed = table.regionals.filter((r) => r.total.scope > 0 && r.total.closed === 0).map((r) => r.label)
    if (noClosed.length) notes.push(`${joinId(noClosed)} belum ada Closed sama sekali`)
  }

  const lowest = allNops(table)
    .filter((n) => Number.isFinite(n.pctVisit))
    .sort((a, b) => a.pctVisit - b.pctVisit)
    .slice(0, 2)
  if (lowest.length) {
    notes.push(
      `Visit terendah: ${joinId(lowest.map((n) => `${nopName(n.nop)} ${pctInt(n.pctVisit)}`))} - perlu didorong agar aktivitas lapangan segera dimulai`
    )
  }
  return notes
}

function gensetNotes(table, siteTable) {
  const g = table.grand
  const notes = []

  if (g.scope > 0) {
    const ip = (g.inProgress / g.scope) * 100
    const sg = siteTable.grand
    const siteIp = sg.scope > 0 ? (sg.inProgress / sg.scope) * 100 : null
    let line = `Genset masih di tahap awal: baru ${num(g.inProgress)} tiket In Progress (${pctInt(ip)} dari scope)`
    if (siteIp != null && siteIp > ip) {
      line += `, jauh di bawah Maintenance Site yang sudah ${pctInt(siteIp)}`
    } else if (siteIp != null) {
      line = `${num(g.inProgress)} tiket In Progress (${pctInt(ip)} dari scope), setara atau lebih tinggi dari Maintenance Site (${pctInt(siteIp)})`
    }
    notes.push(line)
  }

  if (g.newCount + g.assigned > 0) {
    notes.push(
      `${num(g.newCount + g.assigned)} tiket masih New/Assigned (${num(g.newCount)} New + ${num(g.assigned)} Assigned) belum mulai dikerjakan`
    )
  }

  // Regional yang hampir tidak bergerak (% Visit regional < 15%) disebut tersendiri;
  // NOP ber-Visit 0% di regional lain dikelompokkan per regional.
  const flagged = new Set()
  for (const r of table.regionals) {
    if (r.total.scope === 0 || !(r.total.pctVisit < 15)) continue
    flagged.add(r.label)
    const actives = r.nops.filter((n) => n.scope > 0 && n.activity > 0)
    const zeros = r.nops.filter((n) => n.scope > 0 && n.activity === 0)
    if (!actives.length) {
      notes.push(`${r.label} belum bergerak: semua ${zeros.length} NOP Visit 0%`)
    } else {
      const act = actives.reduce((s, n) => s + n.activity, 0)
      notes.push(
        `${r.label} nyaris belum bergerak: hanya ${joinId(actives.map((n) => nopName(n.nop)))} yang mulai (${num(act)} tiket aktivitas), ${zeros.length} NOP lain Visit 0%`
      )
    }
  }
  const zeroGroups = table.regionals
    .filter((r) => !flagged.has(r.label))
    .map((r) => ({ r, zeros: r.nops.filter((n) => n.scope > 0 && n.activity === 0) }))
    .filter((x) => x.zeros.length)
  if (zeroGroups.length) {
    notes.push(
      `${zeroGroups
        .map((x) => `${joinId(x.zeros.map((n) => nopName(n.nop)))} (${titleCase(x.r.label)})`)
        .join('; ')} juga Visit 0%`
    )
  }

  const waiting = allNops(table)
    .filter((n) => n.waiting > 0)
    .sort((a, b) => b.waiting - a.waiting)
  if (waiting.length) {
    const shown = waiting.slice(0, 5).map((n) => `${num(n.waiting)} di ${nopName(n.nop)}`)
    notes.push(
      `Peluang quick win: ada ${num(g.waiting)} tiket Waiting Approval (${shown.join(', ')}${waiting.length > 5 ? ', dst' : ''}) yang bisa segera dikonversi jadi Closed`
    )
  }
  return notes
}

function buildOne(kind, table, siteTable, { areaLabel, dateISO }) {
  const period = periodLabel(table.period, dateISO).replace(' - ', ' ')
  const g = table.grand
  const lines = [
    `📊 PROGRESS MAINTENANCE ${kind === 'site' ? 'SITE' : 'GENSET'}`,
    `${period} - ${areaLabel}`,
    '',
    ...overviewLines(kind, g),
    '',
  ]
  for (const reg of table.regionals) lines.push(...regionalBlock(reg))
  lines.push(
    DIV,
    `🎯 TOTAL ${areaLabel.toUpperCase()} : Scope ${num(g.scope)} | Closed ${num(g.closed)} (${pctTotal(g.pctClosed)})`,
    DIV,
    '',
    '📌 Catatan:'
  )
  const notes = kind === 'site' ? siteNotes(table) : gensetNotes(table, siteTable)
  for (const n of notes) lines.push(`• ${n}`)
  return lines.join('\n')
}

/** Mengembalikan { site, genset }: dua teks summary terpisah. */
export function buildSummaryTexts(metrics, { areaLabel, dateISO }) {
  return {
    site: buildOne('site', metrics.site, metrics.site, { areaLabel, dateISO }),
    genset: buildOne('genset', metrics.genset, metrics.site, { areaLabel, dateISO }),
  }
}
