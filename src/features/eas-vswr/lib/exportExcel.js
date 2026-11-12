import ExcelJS from 'exceljs'
import { relativeHeatColorHexARGB } from './colorScale.js'
import { timestampToWIB } from './format.js'
import { BUCKETS, BUCKET_LABELS, CATEGORIES } from './easReport.js'

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12203D' } }
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A6E' } }
const WHITE_BOLD = { color: { argb: 'FFFFFFFF' }, bold: true }
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFD5DCE6' } },
  bottom: { style: 'thin', color: { argb: 'FFD5DCE6' } },
  left: { style: 'thin', color: { argb: 'FFD5DCE6' } },
  right: { style: 'thin', color: { argb: 'FFD5DCE6' } },
}

// opts.range -> heat-color the cell relative to that column's min/max
// (used for leaf NOP rows). opts.fill/opts.font -> force a flat fill
// instead (used for the navy Total/Grand Total band rows). opts.bar ->
// leave the cell plain (white, bordered) so a native Excel Data Bar
// conditional-formatting rule can render on top of it instead of a flat fill.
function pctCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col)
  cell.alignment = { horizontal: 'center' }
  cell.border = THIN_BORDER

  if (value == null || !Number.isFinite(value)) {
    cell.value = '-'
    if (opts.fill) {
      cell.fill = opts.fill
      cell.font = opts.font || WHITE_BOLD
    }
    return
  }

  cell.value = value / 100
  cell.numFmt = '0.00%'

  if (opts.fill) {
    cell.fill = opts.fill
    cell.font = opts.font || WHITE_BOLD
  } else if (opts.bar) {
    cell.font = { color: { argb: 'FF173B33' }, bold: true }
  } else {
    const range = opts.range || { min: 0, max: 100 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: relativeHeatColorHexARGB(value, range.min, range.max) },
    }
    cell.font = { color: { argb: 'FF17202E' }, bold: true }
  }
}

function addDataBar(ws, ref) {
  // Layered with a color-scale rule below so the bar cells get both a
  // length AND a color that track the same absolute 0-100% value — same
  // visual language as the on-screen progress bars.
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'colorScale',
        cfvo: [
          { type: 'num', value: 0 },
          { type: 'num', value: 0.5 },
          { type: 'num', value: 1 },
        ],
        color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
      },
    ],
  })
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'dataBar',
        minLength: 0,
        maxLength: 100,
        gradient: false,
        border: true,
        showValue: true,
        // Absolute 0%-100% scale (cell values are stored as 0-1 fractions
        // via the 0.00% numFmt), so a bar's length always matches its own
        // percentage rather than being stretched relative to the other
        // values in the column.
        cfvo: [
          { type: 'num', value: 0 },
          { type: 'num', value: 1 },
        ],
        color: { argb: 'FF7FD1B9' },
      },
    ],
  })
}

function buildSummarySheet(wb, record) {
  const ws = wb.addWorksheet('Summ_Percentage_New')
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }]

  const headers1 = ['Regional', 'NOP', 'Validasi EAS (% Closed)', '', '', 'VSWR Tracking', '', '', '', '', '% Closed']
  const headers2 = ['', '', '% Quickwin', '% Extended', 'Total', 'P1', 'P2', 'P3', 'P4', 'P5', '']

  ws.addRow(headers1)
  ws.addRow(headers2)
  ws.mergeCells(1, 1, 2, 1)
  ws.mergeCells(1, 2, 2, 2)
  ws.mergeCells(1, 3, 1, 5)
  ws.mergeCells(1, 6, 1, 10)
  ws.mergeCells(1, 11, 2, 11)

  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(r, c)
      cell.fill = HEADER_FILL
      cell.font = WHITE_BOLD
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = THIN_BORDER
    }
  }

  const { table } = record.metrics
  const ranges = table.columnRanges

  const writeDataRow = (rowIdx, cols) => {
    const row = ws.getRow(rowIdx)
    row.getCell(1).value = cols.regionalLabel ?? ''
    row.getCell(2).value = cols.nopLabel
    if (cols.regionalLabel != null) {
      row.getCell(1).font = { bold: true }
      row.getCell(1).alignment = { vertical: 'middle' }
      row.getCell(1).border = THIN_BORDER
    }
    row.getCell(2).alignment = { horizontal: 'left' }
    row.getCell(2).border = THIN_BORDER
    pctCell(ws, rowIdx, 3, cols.quickwinPct, { range: ranges.quickwinPct })
    pctCell(ws, rowIdx, 4, cols.extendedPct, { range: ranges.extendedPct })
    pctCell(ws, rowIdx, 5, cols.easTotalPct, { bar: true })
    cols.vswrP.forEach((v, i) => pctCell(ws, rowIdx, 6 + i, v, { range: ranges.vswrP[i] }))
    pctCell(ws, rowIdx, 11, cols.vswrTotalPct, { bar: true })
  }

  const writeBandRow = (rowIdx, label, cols) => {
    const row = ws.getRow(rowIdx)
    ws.mergeCells(rowIdx, 1, rowIdx, 2)
    row.getCell(1).value = label
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    for (let c = 1; c <= 2; c++) {
      row.getCell(c).fill = TOTAL_FILL
      row.getCell(c).font = WHITE_BOLD
      row.getCell(c).border = THIN_BORDER
    }
    pctCell(ws, rowIdx, 3, cols.quickwinPct, { fill: TOTAL_FILL })
    pctCell(ws, rowIdx, 4, cols.extendedPct, { fill: TOTAL_FILL })
    pctCell(ws, rowIdx, 5, cols.easTotalPct, { fill: TOTAL_FILL })
    cols.vswrP.forEach((v, i) => pctCell(ws, rowIdx, 6 + i, v, { fill: TOTAL_FILL }))
    pctCell(ws, rowIdx, 11, cols.vswrTotalPct, { fill: TOTAL_FILL })
  }

  let rowIdx = 3
  for (const reg of table.regionals) {
    writeBandRow(rowIdx, `Total ${reg.regional}`, reg)
    rowIdx++
    const startNopRow = rowIdx
    for (const nop of reg.nops) {
      writeDataRow(rowIdx, { nopLabel: `NOP ${nop.label.toUpperCase()}`, ...nop })
      rowIdx++
    }
    ws.mergeCells(startNopRow, 1, rowIdx - 1, 1)
    ws.getCell(startNopRow, 1).value = reg.regional
    ws.getCell(startNopRow, 1).font = { bold: true }
    ws.getCell(startNopRow, 1).alignment = { vertical: 'middle', horizontal: 'center' }
    addDataBar(ws, `E${startNopRow}:E${rowIdx - 1}`)
    addDataBar(ws, `K${startNopRow}:K${rowIdx - 1}`)
  }

  writeBandRow(rowIdx, 'Grand Total', table.grandTotal)
  rowIdx += 1

  ws.getCell(rowIdx + 1, 2).value = record.generatedAt
    ? `Summary ${record.dateLabel}/${timestampToWIB(record.generatedAt)}`
    : `Summary ${record.dateLabel}`
  ws.getCell(rowIdx + 1, 2).font = { italic: true, color: { argb: 'FF6B7686' } }

  ws.getColumn(1).width = 16
  ws.getColumn(2).width = 22
  for (let c = 3; c <= 11; c++) ws.getColumn(c).width = 12
}

// Hanya untuk record lama (sebelum format Report Daily EAS) yang masih punya raw.eas.nopRows.
function buildLegacyEasRawSheet(wb, record) {
  const ws = wb.addWorksheet('EAS - Link NOIM')
  const headers = [
    'Regional',
    'NOP',
    'Quickwin: Close',
    'Quickwin: Open',
    'Quickwin Total',
    'Extended: Close',
    'Extended: Open',
    'Extended Total',
  ]
  ws.addRow(headers)
  ws.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = WHITE_BOLD
    cell.alignment = { horizontal: 'center', wrapText: true }
  })

  const eas = record.raw.eas
  for (const r of eas.nopRows) {
    ws.addRow([r.regional, r.nop, r.qwClose, r.qwOpen, r.qwTotal, r.extClose, r.extOpen, r.extTotal])
  }
  for (const r of eas.regionalTotals) {
    ws.addRow([
      `Total ${r.regional}`,
      '',
      r.qwClose,
      r.qwOpen,
      r.qwTotal,
      r.extClose,
      r.extOpen,
      r.extTotal,
    ]).font = { bold: true }
  }
  ws.addRow([
    'Grand Total',
    '',
    eas.grandTotal.qwClose,
    eas.grandTotal.qwOpen,
    eas.grandTotal.qwTotal,
    eas.grandTotal.extClose,
    eas.grandTotal.extOpen,
    eas.grandTotal.extTotal,
  ]).font = { bold: true }

  ws.columns.forEach((col) => (col.width = 20))
}

const ACH_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAE5524' } }
const BASE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } }

// Sheet "Report Extended" / "Report Quickwin": susunan kolom sama dengan template Report Daily EAS.
function buildEasReportSheet(wb, record, cat) {
  const report = record.metrics.easReport?.[cat.key]
  if (!report) return
  const ws = wb.addWorksheet(`Report ${cat.label}`)
  const info = record.easInfo

  ws.getCell(1, 1).value = `Daily Report Pencapaian Validasi EAS ${cat.label} ${record.dateISO.split('-').reverse().join('-')}`
  ws.getCell(1, 1).font = { bold: true, size: 13 }
  const dmy = (iso) => (iso ? iso.split('-').reverse().join('-') : '')
  ws.getCell(2, 1).value =
    info && 'matched' in info
      ? info.baselineFromDateISO
        ? `Ach Validasi: ${info.matched} site Date Revisi ${dmy(info.revisiDateISO)} (terisi di File EAS), prioritas awal dari baseline Streamlit ${dmy(info.baselineFromDateISO)} | Baseline: Final Priority Streamlit`
        : 'Belum ada baseline sebelumnya, Ach Validasi masih kosong | Baseline: Final Priority Streamlit'
      : ''
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF6B7686' } }

  const H = 4 // baris header
  const bucketHeads = BUCKETS.map((k) => BUCKET_LABELS[k])
  ws.getRow(H).values = [
    'Regional', 'NOP', 'Site Belum Validasi (Baseline)', '', '', '', '', 'Target D-1',
    'Ach Validasi Daily', '', '', '', '', '% Daily Ach', 'Ach Total', '', '', '',
  ]
  ws.getRow(H + 1).values = [
    '', '', ...bucketHeads, 'Total', '', ...bucketHeads, 'Total', '', 'Baseline', 'Done', 'Ach%', 'Sisa Target',
  ]
  ws.mergeCells(H, 1, H + 1, 1)
  ws.mergeCells(H, 2, H + 1, 2)
  ws.mergeCells(H, 3, H, 7)
  ws.mergeCells(H, 8, H + 1, 8)
  ws.mergeCells(H, 9, H, 13)
  ws.mergeCells(H, 14, H + 1, 14)
  ws.mergeCells(H, 15, H, 18)
  const achCols = new Set([8, 9, 10, 11, 12, 13, 14])
  for (let r = H; r <= H + 1; r++) {
    for (let c = 1; c <= 18; c++) {
      const cell = ws.getCell(r, c)
      cell.fill = achCols.has(c) ? ACH_FILL : BASE_FILL
      cell.font = WHITE_BOLD
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = THIN_BORDER
    }
  }

  const writeRow = (rowIdx, regionalLabel, nopLabel, row, band) => {
    const r = ws.getRow(rowIdx)
    r.getCell(1).value = regionalLabel
    r.getCell(2).value = nopLabel
    const nums = [
      ...BUCKETS.map((k) => row.baseline[k]), row.baseline.total, row.target,
      ...BUCKETS.map((k) => row.ach[k]), row.ach.total,
    ]
    nums.forEach((v, i) => {
      r.getCell(3 + i).value = v
      r.getCell(3 + i).numFmt = '#,##0'
    })
    r.getCell(14).value = row.dailyAchPct == null ? '-' : row.dailyAchPct / 100
    if (row.dailyAchPct != null) r.getCell(14).numFmt = '0.00%'
    r.getCell(15).value = row.total
    r.getCell(16).value = row.done
    r.getCell(17).value = row.donePct == null ? '-' : row.donePct / 100
    if (row.donePct != null) r.getCell(17).numFmt = '0.00%'
    r.getCell(18).value = row.sisa
    for (const c of [15, 16, 18]) r.getCell(c).numFmt = '#,##0'
    for (let c = 1; c <= 18; c++) {
      const cell = r.getCell(c)
      cell.border = THIN_BORDER
      if (c > 2) cell.alignment = { horizontal: 'center' }
      if (band) {
        cell.fill = band
        cell.font = WHITE_BOLD
      }
    }
  }

  let rowIdx = H + 2
  for (const reg of report.regionals) {
    writeRow(rowIdx, `Total ${reg.regional}`, '', reg, TOTAL_FILL)
    rowIdx++
    for (const nop of reg.nops) {
      writeRow(rowIdx, reg.regional, nop.label, nop, null)
      ws.getCell(rowIdx, 2).alignment = { horizontal: 'left' }
      rowIdx++
    }
  }
  writeRow(rowIdx, 'Area 1', '', report.area, HEADER_FILL)

  ws.views = [{ state: 'frozen', ySplit: H + 1, xSplit: 2 }]
  ws.getColumn(1).width = 20
  ws.getColumn(2).width = 24
  for (let c = 3; c <= 18; c++) ws.getColumn(c).width = 11
}

function buildVswrRawSheet(wb, record) {
  const ws = wb.addWorksheet('VSWR - Link Triple-E')
  const headers = [
    'Regional',
    'NOP',
    'Closed P1',
    'Closed P2',
    'Closed P3',
    'Closed P4',
    'Closed P5',
    'Closed Total',
    'Open P1',
    'Open P2',
    'Open P3',
    'Open P4',
    'Open P5',
    'Open Total',
    'Total Keseluruhan',
  ]
  ws.addRow(headers)
  ws.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = WHITE_BOLD
    cell.alignment = { horizontal: 'center', wrapText: true }
  })

  const vswr = record.raw.vswr
  for (const r of vswr.nopRows) {
    ws.addRow([
      r.regional,
      r.nop,
      ...r.closedP,
      r.closedTotal,
      ...r.openP,
      r.openTotal,
      r.total,
    ])
  }
  for (const r of vswr.regionalTotals) {
    ws.addRow([
      r.regional,
      '',
      ...r.closedP,
      r.closedTotal,
      ...r.openP,
      r.openTotal,
      r.total,
    ]).font = { bold: true }
  }
  ws.addRow([
    'Total Keseluruhan',
    '',
    ...vswr.grandTotal.closedP,
    vswr.grandTotal.closedTotal,
    ...vswr.grandTotal.openP,
    vswr.grandTotal.openTotal,
    vswr.grandTotal.total,
  ]).font = { bold: true }

  ws.columns.forEach((col) => (col.width = 16))
}

export async function exportDailyReport(record) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EAS & VSWR Tracking Automation'
  wb.created = new Date()

  buildSummarySheet(wb, record)
  if (record.metrics?.easReport) {
    for (const cat of CATEGORIES) buildEasReportSheet(wb, record, cat)
  } else if (record.raw?.eas?.nopRows) {
    buildLegacyEasRawSheet(wb, record)
  }
  if (record.raw?.vswr) buildVswrRawSheet(wb, record)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Improvement_A1_${record.dateISO}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
