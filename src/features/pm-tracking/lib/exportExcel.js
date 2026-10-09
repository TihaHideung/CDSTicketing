import ExcelJS from 'exceljs'
import { periodLabel, periodFileLabel } from './format.js'

// Layout sheet "Summary NOP" mengikuti file MSMG_Area1: tabel mulai di kolom C,
// Site di atas, Genset di bawahnya. Angka di tabel berupa rumus COUNTIFS ke sheet
// MS / MG (pengganti pivot Piv_MS), jadi ikut berubah kalau data di sheet MS / MG diedit.

const FONT = 'Calibri'
const MED = { style: 'medium', color: { argb: 'FF000000' } }
const THIN = { style: 'thin', color: { argb: 'FF000000' } }
const BORDER_MED = { top: MED, bottom: MED, left: MED, right: MED }
const BORDER_THIN = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } })

const FILL_DATA = fill('9DC3E6')
const FILL_GAP = fill('FFE699')
const FILL_SUMMARY = fill('E7E6E6')
const SECTION_TITLE_FILL = { site: fill('B4C6E7'), genset: fill('F8CBAD') }

const HEADERS = [
  'NOP',
  '#of \nTicket',
  'Takeout',
  'SCOPE',
  'NEW',
  'ASSIGNED',
  'IN PROGRESS',
  'SUBMIT',
  'Reject',
  'Closed',
  'WAITING APPROVAL',
  'WAITING APPROVAL AMESTY',
  'GAP \nProgress\n(Scope - Activity)',
  'GAP \nClosed\n(Scope - Closed)',
  '% VISIT\n(Activity / Scope)',
  '% SUBMIT\n(Submit / Scope)',
  '% Closed\n(Closed / Scope)',
]

// Kolom E..O: field hitungan + status yang dicari di sheet data (null = rumus lain).
const COUNT_COLS = [
  { col: 5, field: 'ticket', status: null },
  { col: 6, field: 'takeout', status: 'TAKE OUT' },
  { col: 7, field: 'scope', status: undefined }, // = E - F
  { col: 8, field: 'newCount', status: 'NEW' },
  { col: 9, field: 'assigned', status: 'ASSIGNED' },
  { col: 10, field: 'inProgress', status: 'IN PROGRESS' },
  { col: 11, field: 'submit', status: 'SUBMITTED' },
  { col: 12, field: 'reject', status: 'REJECTED' },
  { col: 13, field: 'closed', status: 'CLOSED' },
  { col: 14, field: 'waiting', status: 'WAITING APPROVAL' },
  { col: 15, field: 'waitingAmesty', status: 'WAITING APPROVAL AMESTY' },
]
const SUMMARY_LABELS = HEADERS.slice(1, 12) // #of Ticket .. WAITING APPROVAL AMESTY

const colLetter = (n) => {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
const A = colLetter
const q = (s) => `"${String(s).replace(/"/g, '""')}"`

function style(cell, { size = 16, bold = false, color, fillStyle, border = BORDER_MED, align = 'center', wrap = false, numFmt } = {}) {
  cell.font = { name: FONT, size, bold, ...(color ? { color: { argb: color } } : {}) }
  if (fillStyle) cell.fill = fillStyle
  cell.border = border
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap }
  if (numFmt) cell.numFmt = numFmt
}

const fraction = (pctValue) => (Number.isFinite(pctValue) ? pctValue / 100 : '-')

function writeHeaderRow(ws, row, color) {
  HEADERS.forEach((label, i) => {
    const cell = ws.getCell(row, 4 + i)
    cell.value = label
    style(cell, { size: 14, bold: true, fillStyle: fill(color), wrap: true })
  })
  ws.getRow(row).height = 54.6
}

function pctFormulas(row, grandRow = false) {
  // % Visit = activity / scope; activity = In Progress..Waiting Approval Amesty (J..O)
  const scope = `G${row}`
  return [
    `IFERROR((SUM(J${row}:O${row}))/${scope},"-")`,
    `IFERROR(K${row}/${scope},"-")`,
    `IFERROR(M${row}/${scope},"-")`,
  ]
}

function writeSection(ws, startRow, kind, table, sheetName, colRef) {
  const title = `Progress Maintenance ${kind === 'site' ? 'Site' : 'Genset'} Bulan ${periodLabel(table.period)}`
  const firstColor = table.regionals[0]?.color || 'FFC000'

  ws.mergeCells(startRow, 3, startRow + 1, 3)
  ws.mergeCells(startRow, 4, startRow, 20)
  ws.getCell(startRow, 3).value = 'REGIONAL'
  ws.getCell(startRow, 4).value = title
  for (let c = 3; c <= 20; c++) {
    style(ws.getCell(startRow, c), { size: c === 3 ? 15 : 16, bold: true, fillStyle: SECTION_TITLE_FILL[kind] })
  }
  style(ws.getCell(startRow + 1, 3), { size: 15, bold: true, fillStyle: SECTION_TITLE_FILL[kind] })
  ws.getRow(startRow).height = 30.75
  writeHeaderRow(ws, startRow + 1, firstColor)

  let r = startRow + 2
  const totalRows = []
  const crit = (reg, nop, status) => {
    const parts = [`${sheetName}!${colRef.regional},${q(reg)}`, `${sheetName}!${colRef.nop},${q(nop)}`]
    if (status) parts.push(`${sheetName}!${colRef.status},${q(status)}`)
    return `COUNTIFS(${parts.join(',')})`
  }

  table.regionals.forEach((reg, idx) => {
    let blockTop = r
    if (idx > 0) {
      // regional berikutnya mengulang baris header dengan warna regionalnya
      writeHeaderRow(ws, r, reg.color)
      r++
    }
    const nopStart = r

    for (const nop of reg.nops) {
      ws.getCell(r, 4).value = nop.nop
      style(ws.getCell(r, 4), { fillStyle: FILL_DATA, align: 'left' })

      for (const { col, field, status } of COUNT_COLS) {
        const cell = ws.getCell(r, col)
        let formula
        if (field === 'scope') formula = `E${r}-F${r}`
        else if (field === 'ticket') formula = crit(reg.regional, nop.nop, null)
        else formula = crit(reg.regional, nop.nop, status)
        cell.value = { formula, result: nop[field] }
        style(cell, { fillStyle: FILL_DATA })
      }
      ws.getCell(r, 16).value = { formula: `G${r}-(SUM(J${r}:O${r}))`, result: nop.gapProgress }
      ws.getCell(r, 17).value = { formula: `G${r}-M${r}`, result: nop.gapClosed }
      style(ws.getCell(r, 16), { fillStyle: FILL_GAP })
      style(ws.getCell(r, 17), { fillStyle: FILL_GAP })
      const [fv, fs, fc] = pctFormulas(r)
      ;[
        [18, fv, nop.pctVisit],
        [19, fs, nop.pctSubmit],
        [20, fc, nop.pctClosed],
      ].forEach(([c, f, v]) => {
        ws.getCell(r, c).value = { formula: f, result: fraction(v) }
        style(ws.getCell(r, c), { numFmt: '0.0%' })
      })
      ws.getRow(r).height = 21.9
      r++
    }
    const nopEnd = r - 1

    // baris Grand Total regional
    ws.getCell(r, 4).value = 'Grand Total'
    style(ws.getCell(r, 4), { bold: true, fillStyle: fill(reg.color) })
    for (const { col, field } of COUNT_COLS) {
      ws.getCell(r, col).value = { formula: `SUM(${A(col)}${nopStart}:${A(col)}${nopEnd})`, result: reg.total[field] }
      style(ws.getCell(r, col), { bold: true, fillStyle: fill(reg.color) })
    }
    ws.getCell(r, 16).value = { formula: `SUM(P${nopStart}:P${nopEnd})`, result: reg.total.gapProgress }
    ws.getCell(r, 17).value = { formula: `SUM(Q${nopStart}:Q${nopEnd})`, result: reg.total.gapClosed }
    style(ws.getCell(r, 16), { bold: true, fillStyle: fill(reg.color) })
    style(ws.getCell(r, 17), { bold: true, fillStyle: fill(reg.color) })
    const [tv, ts, tc] = pctFormulas(r)
    ;[
      [18, tv, reg.total.pctVisit],
      [19, ts, reg.total.pctSubmit],
      [20, tc, reg.total.pctClosed],
    ].forEach(([c, f, v]) => {
      ws.getCell(r, c).value = { formula: f, result: fraction(v) }
      style(ws.getCell(r, c), { bold: true, fillStyle: fill(reg.color), numFmt: '0.0%' })
    })
    ws.getRow(r).height = 21.9
    totalRows.push(r)

    // label regional digabung vertikal (blok pertama tanpa baris header ulang)
    ws.mergeCells(blockTop, 3, r, 3)
    ws.getCell(blockTop, 3).value = reg.label
    style(ws.getCell(blockTop, 3), { size: 15, bold: true, fillStyle: fill(reg.color) })

    // skala warna merah-kuning-hijau untuk kolom persen, per regional
    for (const c of ['R', 'S', 'T']) {
      ws.addConditionalFormatting({
        ref: `${c}${nopStart}:${c}${nopEnd}`,
        rules: [
          {
            type: 'colorScale',
            cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
            color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
          },
        ],
      })
    }
    r++
  })

  // ringkasan "All Area" (baris 27-28 / 55-56 di file MSMG), dengan sorotan warna yang sama
  r += 1
  const label = kind === 'site' ? 'Maintenance Site' : 'Maintenance Genset'
  const YELLOW = fill('FFFF00')
  const RED = 'FFFF0000'
  const BLUE = 'FF2F5597'
  ws.mergeCells(r, 3, r, 4)
  ws.getCell(r, 3).value = label
  style(ws.getCell(r, 3), { size: 14, bold: true, fillStyle: SECTION_TITLE_FILL.site })
  style(ws.getCell(r, 4), { size: 14, bold: true, fillStyle: SECTION_TITLE_FILL.site })
  SUMMARY_LABELS.forEach((lab, i) => {
    const cell = ws.getCell(r, 5 + i)
    const field = COUNT_COLS[i].field
    cell.value = lab
    style(cell, {
      size: 14,
      bold: true,
      wrap: true,
      fillStyle: field === 'takeout' || field === 'newCount' ? YELLOW : SECTION_TITLE_FILL.site,
      color: field === 'newCount' || field === 'assigned' ? RED : undefined,
    })
  })
  ws.mergeCells(r, 16, r, 20)
  ws.getCell(r, 16).value = 'GAP Scope to Closed'
  for (let c = 16; c <= 20; c++) style(ws.getCell(r, c), { size: 14, bold: true, fillStyle: SECTION_TITLE_FILL.site })
  ws.getRow(r).height = 54
  r++

  const areaName = (table.area || 'Area 1').replace(/\s+/g, '')
  ws.mergeCells(r, 3, r, 4)
  ws.getCell(r, 3).value = `All ${areaName.charAt(0).toUpperCase()}${areaName.slice(1).toLowerCase()}`
  style(ws.getCell(r, 3), { bold: true, color: BLUE, fillStyle: FILL_SUMMARY })
  style(ws.getCell(r, 4), { bold: true, color: BLUE, fillStyle: FILL_SUMMARY })
  for (const { col, field } of COUNT_COLS) {
    ws.getCell(r, col).value = {
      formula: `SUM(${totalRows.map((t) => `${A(col)}${t}`).join(',')})`,
      result: table.grand[field],
    }
    let opts = { bold: true, color: BLUE, fillStyle: FILL_SUMMARY, border: BORDER_THIN }
    if (field === 'takeout' || field === 'newCount') opts = { ...opts, fillStyle: YELLOW }
    if (field === 'waiting' || field === 'waitingAmesty') opts = { ...opts, fillStyle: YELLOW, color: RED }
    if (field === 'closed') opts = { ...opts, fillStyle: fill('00B050'), color: 'FFFFFFFF' }
    style(ws.getCell(r, col), opts)
  }
  ws.mergeCells(r, 16, r, 20)
  ws.getCell(r, 16).value = { formula: `G${r}-M${r}`, result: table.grand.gapClosed }
  for (let c = 16; c <= 20; c++) {
    style(ws.getCell(r, c), { bold: true, color: RED, fillStyle: YELLOW, border: BORDER_THIN })
  }
  ws.getRow(r).height = 21.9
  return r
}

const DATE_COLS = new Set(['last maintenance', 'schedule date', 'submitted date', 'created date'])

function serialToDate(n) {
  return new Date(Math.round((n - 25569) * 86400 * 1000))
}

function writeRawSheet(wb, name, parsed) {
  const ws = wb.addWorksheet(name)
  ws.addRow(parsed.columns)
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true }
    cell.alignment = { vertical: 'middle' }
  })
  const lower = parsed.columns.map((c) => c.toLowerCase())
  const dateIdx = lower.map((c) => DATE_COLS.has(c))

  for (const src of parsed.rows) {
    const row = src.map((v, i) => (dateIdx[i] && typeof v === 'number' ? serialToDate(v) : v))
    const added = ws.addRow(row)
    row.forEach((v, i) => {
      if (v instanceof Date) added.getCell(i + 1).numFmt = lower[i] === 'created date' ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd'
    })
  }
  parsed.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(40, Math.max(12, c.length + 4))
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: parsed.columns.length } }
  return ws
}

// Huruf kolom Regional / NOP / Status di sheet data, untuk rumus COUNTIFS.
function colRefs(parsed) {
  const lower = parsed.columns.map((c) => c.toLowerCase())
  const ref = (name) => `$${A(lower.indexOf(name) + 1)}:$${A(lower.indexOf(name) + 1)}`
  return { regional: ref('regional'), nop: ref('nop'), status: ref('status') }
}

export function buildPmWorkbook(record) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PM Tracking Automation'
  wb.created = new Date()

  const ws = wb.addWorksheet('Summary NOP', { views: [{ showGridLines: false }] })
  const widths = { 1: 2.55, 3: 21, 4: 35.33, 5: 15.33, 6: 12.44, 7: 12, 8: 12, 9: 14.44, 10: 20.33, 11: 14.33, 12: 15.66, 13: 12, 14: 17, 15: 17.33, 16: 21.44, 17: 19.33, 18: 20, 19: 17.89, 20: 18.55 }
  for (const [c, w] of Object.entries(widths)) ws.getColumn(Number(c)).width = w

  const { site, genset } = record.metrics
  const lastSite = writeSection(ws, 3, 'site', site, 'MS', colRefs(record.raw.site))
  writeSection(ws, lastSite + 3, 'genset', genset, 'MG', colRefs(record.raw.genset))

  writeRawSheet(wb, 'MS', record.raw.site)
  writeRawSheet(wb, 'MG', record.raw.genset)

  const fileName = `MSMG_Area1_${periodFileLabel(site.period, record.dateISO)}.xlsx`
  return { wb, fileName }
}

export async function exportPmReport(record) {
  const { wb, fileName } = buildPmWorkbook(record)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
