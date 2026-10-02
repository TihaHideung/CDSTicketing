import ExcelJS from 'exceljs'
import { relativeHeatColorHexARGB } from './colorScale.js'
import { timestampToWIB } from './format.js'

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

function buildEasRawSheet(wb, record) {
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
  buildEasRawSheet(wb, record)
  buildVswrRawSheet(wb, record)

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
