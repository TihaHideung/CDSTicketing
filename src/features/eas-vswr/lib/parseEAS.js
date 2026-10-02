import * as XLSX from 'xlsx'

function norm(v) {
  return (v ?? '').toString().trim().toUpperCase()
}

// Locates the validated "helper formula" pivot table (Regional/NOP_NAME +
// Quickwin Close/Open, Extended Close/Open side by side) — this is the
// table the user has confirmed is the authoritative source, since it's
// already computed by Excel helper formulas (no derived "not visited"
// logic needed on our side). The sheet can contain other pivot tables with
// the same REGIONAL/NOP_NAME header, so we require the Close/Open
// signature to uniquely identify it, keeping the LAST match in case
// several weekly snapshots are stacked in the sheet.
function findSheetAndHeader(workbook) {
  const candidateNames = workbook.SheetNames.filter((n) => norm(n) === 'A1').concat(
    workbook.SheetNames
  )

  for (const name of candidateNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

    let lastMatch = null
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const colStart = row.findIndex((c) => norm(c) === 'REGIONAL')
      if (colStart === -1) continue
      if (
        norm(row[colStart + 1]) === 'NOP_NAME' &&
        norm(row[colStart + 2]) === 'CLOSE' &&
        norm(row[colStart + 3]) === 'OPEN'
      ) {
        lastMatch = { rows, headerRowIndex: r, colStart }
      }
    }
    if (lastMatch) return lastMatch
  }
  return null
}

function num(v) {
  return typeof v === 'number' ? v : Number(v) || 0
}

// Columns relative to REGIONAL at colStart:
//  0 REGIONAL, 1 NOP_NAME, 2 Quickwin Close, 3 Quickwin Open, 4 Quickwin Total,
//  (5, 6 are the sheet's own %closed helper columns — not needed, we compute
//  our own from Close/Total), 7 blank spacer,
//  8 REGIONAL (mirror), 9 NOP_NAME (mirror),
//  10 Extended Close, 11 Extended Open, 12 Extended Total
function extractCounts(row, colStart) {
  return {
    qwClose: num(row[colStart + 2]),
    qwOpen: num(row[colStart + 3]),
    qwTotal: num(row[colStart + 4]),
    extClose: num(row[colStart + 10]),
    extOpen: num(row[colStart + 11]),
    extTotal: num(row[colStart + 12]),
  }
}

export function parseEAS(workbook) {
  const found = findSheetAndHeader(workbook)
  if (!found) {
    throw new Error(
      'Tidak menemukan tabel EAS (REGIONAL / NOP_NAME / Close / Open) di file yang diupload.'
    )
  }
  const { rows, headerRowIndex, colStart } = found

  const nopRows = []
  const regionalTotals = []
  let grandTotal = null
  let currentRegional = null

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const regionalCell = row[colStart]
    const nopCell = row[colStart + 1]

    if (regionalCell == null && nopCell == null) continue

    const isTotalRow = nopCell == null && regionalCell != null

    if (isTotalRow) {
      const label = norm(regionalCell)
      const record = extractCounts(row, colStart)
      if (label.startsWith('GRAND')) {
        grandTotal = record
        break
      } else {
        regionalTotals.push({
          regional: regionalCell.toString().replace(/total/i, '').trim(),
          ...record,
        })
      }
      continue
    }

    if (regionalCell != null) currentRegional = regionalCell.toString().trim()
    if (!currentRegional) continue

    nopRows.push({
      regional: currentRegional,
      nop: nopCell.toString().trim(),
      ...extractCounts(row, colStart),
    })
  }

  if (!grandTotal) {
    grandTotal = regionalTotals.reduce(
      (acc, r) => ({
        qwClose: acc.qwClose + r.qwClose,
        qwOpen: acc.qwOpen + r.qwOpen,
        qwTotal: acc.qwTotal + r.qwTotal,
        extClose: acc.extClose + r.extClose,
        extOpen: acc.extOpen + r.extOpen,
        extTotal: acc.extTotal + r.extTotal,
      }),
      { qwClose: 0, qwOpen: 0, qwTotal: 0, extClose: 0, extOpen: 0, extTotal: 0 }
    )
  }

  return { nopRows, regionalTotals, grandTotal }
}
