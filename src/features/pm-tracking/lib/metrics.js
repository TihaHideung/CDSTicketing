// Menghitung tabel progress PM (Site / Genset) per Regional dan NOP, mengikuti
// sheet "Summary NOP" di file MSMG:
//   #Ticket   = jumlah tiket
//   Takeout   = tiket berstatus TAKE OUT
//   Scope     = #Ticket - Takeout
//   Activity  = In Progress + Submit + Reject + Closed + Waiting Approval + Waiting Approval Amesty
//   Gap Progress = Scope - Activity      Gap Closed = Scope - Closed
//   % Visit = Activity / Scope           % Submit = Submit / Scope      % Closed = Closed / Scope

const STATUS_MAP = {
  'TAKE OUT': 'takeout',
  TAKEOUT: 'takeout',
  NEW: 'newCount',
  ASSIGNED: 'assigned',
  'IN PROGRESS': 'inProgress',
  SUBMITTED: 'submit',
  SUBMIT: 'submit',
  REJECTED: 'reject',
  REJECT: 'reject',
  CLOSED: 'closed',
  'WAITING APPROVAL': 'waiting',
  'WAITING APPROVAL AMESTY': 'waitingAmesty',
}

const RAW_FIELDS = [
  'ticket',
  'takeout',
  'newCount',
  'assigned',
  'inProgress',
  'submit',
  'reject',
  'closed',
  'waiting',
  'waitingAmesty',
]

// Warna label regional di sheet Summary NOP (kuning, biru, hijau).
export const REGIONAL_COLORS = ['FFC000', '00B0F0', '92D050', 'ED7D31', 'A5A5A5']

const regionalRank = (name) => {
  const n = name.toLowerCase()
  if (n.includes('sumbagut')) return 0
  if (n.includes('sumbagteng')) return 1
  if (n.includes('sumbagsel')) return 2
  return 9
}

export const regionalLabel = (raw) => raw.replace(/^R\d+_/i, '').toUpperCase()

const pct = (a, b) => (b > 0 ? (a / b) * 100 : null)

function emptyCounts() {
  return Object.fromEntries(RAW_FIELDS.map((f) => [f, 0]))
}

// Melengkapi hitungan mentah dengan angka turunan (scope, gap, persen).
function finalize(c) {
  const scope = c.ticket - c.takeout
  const activity = c.inProgress + c.submit + c.reject + c.closed + c.waiting + c.waitingAmesty
  return {
    ...c,
    scope,
    activity,
    gapProgress: scope - activity,
    gapClosed: scope - c.closed,
    pctVisit: pct(activity, scope),
    pctSubmit: pct(c.submit, scope),
    pctClosed: pct(c.closed, scope),
  }
}

function sumCounts(list) {
  const out = emptyCounts()
  for (const c of list) for (const f of RAW_FIELDS) out[f] += c[f]
  return out
}

// regionalKey -> { raw, nops: nopKey -> { nop, counts } }
function tally(parsed) {
  const lower = parsed.columns.map((c) => c.toLowerCase())
  const iReg = lower.indexOf('regional')
  const iNop = lower.indexOf('nop')
  const iStatus = lower.indexOf('status')
  const iTicket = lower.indexOf('ticket no')
  const iArea = lower.indexOf('area')

  const regionals = new Map()
  const unknown = new Map()
  const periods = new Map()
  let area = ''

  for (const row of parsed.rows) {
    const regRaw = (row[iReg] ?? '').toString().trim()
    const nopRaw = (row[iNop] ?? '').toString().trim()
    if (!regRaw || !nopRaw) continue
    const regKey = regRaw.toUpperCase()
    const nopKey = nopRaw.toUpperCase()

    if (!regionals.has(regKey)) regionals.set(regKey, { raw: regRaw, nops: new Map() })
    const reg = regionals.get(regKey)
    if (!reg.nops.has(nopKey)) reg.nops.set(nopKey, { nop: nopKey, counts: emptyCounts() })
    const counts = reg.nops.get(nopKey).counts

    counts.ticket += 1
    const status = (row[iStatus] ?? '').toString().trim().toUpperCase()
    const field = STATUS_MAP[status]
    if (field) counts[field] += 1
    else unknown.set(status || '(kosong)', (unknown.get(status || '(kosong)') || 0) + 1)

    if (!area && iArea >= 0 && row[iArea]) area = row[iArea].toString().trim()
    const m = /-(\d{4})(\d{2})-/.exec((row[iTicket] ?? '').toString())
    if (m) periods.set(`${m[1]}-${m[2]}`, (periods.get(`${m[1]}-${m[2]}`) || 0) + 1)
  }

  // periode (YYYY-MM) = yang paling banyak muncul di nomor tiket (PMS-202610-...)
  let period = null
  let best = 0
  for (const [p, n] of periods) if (n > best) ((period = p), (best = n))

  return { regionals, unknown, period, area }
}

function buildTable(tallied, layout) {
  const regionals = layout.map((lay, idx) => {
    const src = tallied.regionals.get(lay.key)
    const nops = lay.nops.map((nopKey) => {
      const counts = src?.nops.get(nopKey)?.counts || emptyCounts()
      return { nop: nopKey, ...finalize(counts) }
    })
    const total = finalize(sumCounts(nops))
    return {
      regional: lay.raw,
      label: regionalLabel(lay.raw),
      color: REGIONAL_COLORS[idx % REGIONAL_COLORS.length],
      nops,
      total,
    }
  })
  const grand = finalize(sumCounts(regionals.map((r) => r.total)))
  return {
    period: tallied.period,
    area: tallied.area,
    regionals,
    grand,
    unknownStatuses: [...tallied.unknown].map(([status, count]) => ({ status, count })),
  }
}

// Susunan Regional dan NOP mengikuti gabungan kedua file, jadi tabel Site dan Genset
// selalu punya baris yang sama (NOP yang tidak punya tiket tampil dengan angka 0).
function buildLayout(talliedList) {
  const regs = new Map()
  for (const t of talliedList) {
    for (const [key, reg] of t.regionals) {
      if (!regs.has(key)) regs.set(key, { key, raw: reg.raw, nops: new Set() })
      for (const nopKey of reg.nops.keys()) regs.get(key).nops.add(nopKey)
    }
  }
  return [...regs.values()]
    .sort((a, b) => regionalRank(a.raw) - regionalRank(b.raw) || a.raw.localeCompare(b.raw))
    .map((r) => ({ ...r, nops: [...r.nops].sort((a, b) => a.localeCompare(b)) }))
}

export function computePmMetrics({ site, genset }) {
  const siteT = tally(site)
  const gensetT = tally(genset)
  const layout = buildLayout([siteT, gensetT])
  return {
    site: buildTable(siteT, layout),
    genset: buildTable(gensetT, layout),
  }
}
