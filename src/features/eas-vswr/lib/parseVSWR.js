import * as XLSX from 'xlsx'

function norm(v) {
  return (v ?? '').toString().trim().toUpperCase()
}

function findSheetAndHeader(workbook) {
  const candidateNames = workbook.SheetNames.filter(
    (n) => norm(n) === 'PIV_PPT'
  ).concat(workbook.SheetNames)

  for (const name of candidateNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    })
    // The workbook has other pivot tables (e.g. per-week trackers) that also
    // start with Regional / NOP, so require the P1-P5 x2 (Closed/Open)
    // column signature to uniquely identify the intended table, keeping the
    // LAST match in case several weekly snapshots share the same shape.
    const P = ['P1', 'P2', 'P3', 'P4', 'P5']
    let lastMatch = null
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const colStart = row.findIndex((c) => norm(c) === 'REGIONAL')
      if (colStart === -1 || norm(row[colStart + 1]) !== 'NOP') continue
      const block1ok = P.every((v, i) => norm(row[colStart + 2 + i]) === v)
      const block2ok = P.every((v, i) => norm(row[colStart + 8 + i]) === v)
      if (block1ok && block2ok) lastMatch = { rows, headerRowIndex: r, colStart }
    }
    if (lastMatch) return lastMatch
  }
  return null
}

/**
 * Parses the VSWR Tracking pivot table.
 * Columns relative to REGIONAL at colStart:
 *  0 Regional, 1 NOP,
 *  2-6 Closed P1-P5, 7 Closed Total,
 *  8-12 Open P1-P5, 13 Open Total, 14 Total Keseluruhan
 */
export function parseVSWR(workbook) {
  const found = findSheetAndHeader(workbook)
  if (!found) {
    throw new Error(
      'Tidak menemukan tabel VSWR (header Regional / NOP) di file yang diupload.'
    )
  }
  const { rows, headerRowIndex, colStart } = found

  const nopRows = []
  const regionalTotals = []
  let currentRegional = null
  let grandTotal = null

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const regionalCell = row[colStart]
    const nopCell = row[colStart + 1]

    if (regionalCell == null && nopCell == null) continue

    const isTotalRow = nopCell == null && regionalCell != null

    if (isTotalRow) {
      const label = norm(regionalCell)
      if (label.includes('TOTAL KESELURUHAN')) {
        grandTotal = extractCounts(row, colStart)
        break
      }
      regionalTotals.push({
        regional: regionalCell.toString().replace(/total/i, '').trim(),
        ...extractCounts(row, colStart),
      })
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
    grandTotal = nopRows.reduce(
      (acc, r) => ({
        closedTotal: acc.closedTotal + r.closedTotal,
        openTotal: acc.openTotal + r.openTotal,
        total: acc.total + r.total,
        closedP: acc.closedP.map((v, i) => v + r.closedP[i]),
        openP: acc.openP.map((v, i) => v + r.openP[i]),
      }),
      { closedTotal: 0, openTotal: 0, total: 0, closedP: [0, 0, 0, 0, 0], openP: [0, 0, 0, 0, 0] }
    )
  }

  return { nopRows, regionalTotals, grandTotal }
}

function num(v) {
  return typeof v === 'number' ? v : Number(v) || 0
}

function extractCounts(row, colStart) {
  const closedP = [0, 1, 2, 3, 4].map((i) => num(row[colStart + 2 + i]))
  const openP = [0, 1, 2, 3, 4].map((i) => num(row[colStart + 8 + i]))
  return {
    closedP,
    openP,
    closedTotal: num(row[colStart + 7]),
    openTotal: num(row[colStart + 13]),
    total: num(row[colStart + 14]),
  }
}
