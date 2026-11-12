import * as XLSX from 'xlsx'

function norm(v) {
  return (v ?? '').toString().trim().toUpperCase()
}

// File VSWR cukup berisi SATU sheet bernama "VSWR" yang isinya sama dengan sheet PIV_PPT
// (hanya sampai row 58). Sheet PIV_PPT versi lama tetap bisa dibaca.
const MAX_ROW = 58
// Tabel Priority Alarm (pivot "Count of Regional") di bawah tabel VSWR pada sheet yang sama.
// Posisinya dicari otomatis karena pivot bisa bertambah/berkurang barisnya; kalau tidak ketemu,
// dipakai range tetap sebagai cadangan.
const PRIORITY_AREA_FALLBACK = 'A35:H42'
const PRIORITY_REGIONAL_FALLBACK = 'A50:E57'

function findSheetAndHeader(workbook) {
  const candidateNames = workbook.SheetNames.filter((n) => norm(n) === 'VSWR')
    .concat(workbook.SheetNames.filter((n) => norm(n) === 'PIV_PPT'))
    .concat(workbook.SheetNames)

  for (const name of candidateNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    // Hanya baris 1..MAX_ROW yang dibaca (sheet PIV_PPT versi lama bisa ribuan baris).
    const ref = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : { e: { r: 0, c: 0 } }
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      range: { s: { r: 0, c: 0 }, e: { r: Math.min(ref.e.r, MAX_ROW - 1), c: ref.e.c } },
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
    if (lastMatch) return { ...lastMatch, sheet }
  }
  return null
}

// Isi sel (teks seperti tampil di Excel, mis. "85.2%") untuk satu range -> array 2 dimensi.
// Baris/kolom kosong di tepi dibuang. Kembali null kalau range kosong semua.
function readGrid(sheet, rangeRef) {
  const range = XLSX.utils.decode_range(rangeRef)
  const grid = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      const text = cell == null ? '' : cell.w ?? (cell.v == null ? '' : String(cell.v))
      row.push(String(text).trim())
    }
    grid.push(row)
  }
  const nonEmptyRows = grid.filter((row) => row.some((v) => v !== ''))
  if (!nonEmptyRows.length) return null
  const lastCol = Math.max(...nonEmptyRows.map((row) => row.reduce((m, v, i) => (v !== '' ? i : m), -1)))
  return nonEmptyRows.map((row) => row.slice(0, lastCol + 1))
}

function cellText(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })]
  if (cell == null) return ''
  return String(cell.w ?? (cell.v == null ? '' : cell.v)).trim()
}

// Rapikan label: buang awalan "R01_" pada nama regional, dan beri nama jelas untuk header pivot.
function cleanGrid(grid) {
  if (!grid) return grid
  return grid.map((row, ri) =>
    row.map((v, ci) => {
      let t = v.replace(/^R\d+_/i, '')
      if (ri === 0 && ci === 0 && /^(row labels|label baris)$/i.test(t)) t = 'Priority Alarm'
      return t
    })
  )
}

// Cari pivot "Count of Regional" di kolom kiri setelah baris `afterRow`. Tiap blok: judul pivot,
// lalu baris header (Row Labels | ...), baris data, dan berakhir di baris Grand Total / Total Keseluruhan.
function findPivotGrids(sheet, afterRow, colStart) {
  const blocks = []
  for (let r = afterRow + 1; r < MAX_ROW; r++) {
    let c0 = -1
    for (let c = 0; c <= colStart + 1; c++) {
      if (norm(cellText(sheet, r, c)) === 'COUNT OF REGIONAL') {
        c0 = c
        break
      }
    }
    if (c0 < 0) continue

    const headerRow = r + 1
    let c1 = c0
    while (cellText(sheet, headerRow, c1 + 1) !== '') c1++
    if (cellText(sheet, headerRow, c0) === '') continue

    let r1 = headerRow
    for (let rr = headerRow + 1; rr < MAX_ROW; rr++) {
      const label = norm(cellText(sheet, rr, c0))
      if (label === '') break
      r1 = rr
      if (label.includes('GRAND TOTAL') || label.includes('TOTAL KESELURUHAN')) break
    }
    const grid = []
    for (let rr = headerRow; rr <= r1; rr++) {
      const row = []
      for (let c = c0; c <= c1; c++) row.push(cellText(sheet, rr, c))
      grid.push(row)
    }
    if (grid.length > 1) blocks.push(grid)
    r = r1
  }
  return blocks
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
  const { rows, headerRowIndex, colStart, sheet } = found
  let grandTotalRow = headerRowIndex

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
        grandTotalRow = r
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

  // Pivot pertama di bawah tabel VSWR = Priority Alarm AREA, pivot kedua = Priority Alarm Regional.
  const pivots = findPivotGrids(sheet, grandTotalRow, colStart)
  const priority = {
    area: cleanGrid(pivots[0] || readGrid(sheet, PRIORITY_AREA_FALLBACK)),
    regional: cleanGrid(pivots[1] || readGrid(sheet, PRIORITY_REGIONAL_FALLBACK)),
  }

  return {
    nopRows,
    regionalTotals,
    grandTotal,
    // Tabel Priority Alarm (sheet VSWR): [[sel, ...], ...] baris pertama = header, atau null kalau kosong.
    priorityArea: priority.area,
    priorityRegional: priority.regional,
  }
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
