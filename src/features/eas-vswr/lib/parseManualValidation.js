import * as XLSX from 'xlsx'
import { normalizeCategory } from './easReport.js'

// Opsi hemat memori/waktu: hanya nilai sel yang dibutuhkan (tanpa rumus, style, teks format).
const LEAN_READ = { dense: true, cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false, cellText: false }

const up = (v) => (v ?? '').toString().trim().toUpperCase()

// Serial Excel / teks (dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd) -> "YYYY-MM-DD"
export function toISODate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
  }
  const s = v.toString().trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function findHeader(rows) {
  const limit = Math.min(rows.length, 15)
  for (let r = 0; r < limit; r++) {
    const cells = (rows[r] || []).map(up)
    const idx = {
      site: cells.indexOf('SITE ID'),
      area: cells.indexOf('AREA'),
      kat: cells.indexOf('KATEGORI SITE'),
      drev: cells.indexOf('DATE REVISI'),
    }
    if (idx.site >= 0 && idx.kat >= 0 && idx.drev >= 0) return { headerRow: r, idx }
  }
  return null
}

/**
 * "File EAS" = Manual Validation, sheet "Site_List" -> bahan ACH VALIDASI.
 * Aturannya sederhana: site Area 1 yang kolom Date Revisi-nya berisi tanggal H-1 dianggap SUDAH
 * DIKERJAKAN dan dihitung sebagai Ach. Status Final Priority / Done TIDAK dicek.
 * Prioritas awal site-site itu dicari di baseline tersimpan (dari Upload Data Streamlit
 * sebelumnya) lewat computeAch().
 *
 * Site ID dicocokkan bersama kategorinya (satu site per kategori dihitung sekali).
 *
 * @param buffer ArrayBuffer isi file .xlsx
 * @param revisiDateISO  tanggal Date Revisi yang dicari (H-1), format YYYY-MM-DD
 */
export function parseManualValidation(buffer, { revisiDateISO, areaLabel = 'Area 1' }) {
  const names = XLSX.read(buffer, { type: 'array', bookSheets: true }).SheetNames
  const sheetName = names.find((n) => /^site[\s_]?list$/i.test(n.trim()))
  if (!sheetName) {
    throw new Error('Sheet "Site_List" tidak ditemukan di File EAS (Manual Validation).')
  }
  // Hanya sheet Site_List yang diparse (file bisa puluhan MB dengan banyak sheet lain).
  const wb = XLSX.read(buffer, { type: 'array', sheets: [sheetName], ...LEAN_READ })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })

  const found = findHeader(rows)
  if (!found) {
    throw new Error('Kolom Site ID, Kategori Site, dan Date Revisi tidak ditemukan di sheet Site_List.')
  }
  const { headerRow, idx } = found
  const wantedArea = up(areaLabel)

  const sites = new Map() // `${siteId}|${cat}` -> { siteId, cat, date }
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const siteId = up(row[idx.site])
    if (!siteId) continue
    if (idx.area >= 0 && up(row[idx.area]) !== wantedArea) continue
    const cat = normalizeCategory(row[idx.kat])
    if (!cat) continue
    const date = toISODate(row[idx.drev])
    const key = `${siteId}|${cat}`
    const prev = sites.get(key)
    if (!prev) sites.set(key, { siteId, cat, date })
    else if (!prev.date && date) prev.date = date
  }
  if (!sites.size) throw new Error('Tidak ada site Area 1 yang valid di sheet Site_List.')

  const revisedDone = [] // site ber-Date Revisi H-1 = sudah dikerjakan = Ach
  const dateCounts = {}
  for (const s of sites.values()) {
    if (!s.date) continue
    dateCounts[s.date] = (dateCounts[s.date] || 0) + 1
    if (s.date === revisiDateISO) revisedDone.push({ site: s.siteId, cat: s.cat })
  }

  return {
    revisedDone, // [{ site, cat }] -> masuk computeAch()
    revisedTotal: revisedDone.length,
    // beberapa tanggal Date Revisi terakhir di file, untuk petunjuk kalau H-1 kosong
    availableDates: Object.keys(dateCounts)
      .sort()
      .slice(-4)
      .map((dateISO) => ({ dateISO, count: dateCounts[dateISO] })),
    stats: { uniqueSites: sites.size },
  }
}
