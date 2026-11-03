import * as XLSX from 'xlsx'
import {
  BUCKETS,
  DONE_RANK,
  bucketOfRank,
  nopKey,
  normalizeCategory,
  normalizeRegional,
  priorityRank,
} from './easReport.js'

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
      regional: cells.indexOf('REGIONAL'),
      nop: cells.indexOf('NOP_NAME'),
      kat: cells.indexOf('KATEGORI SITE'),
      prio: cells.indexOf('PRIO ACTUAL (A1)'),
    }
    if (idx.site >= 0 && idx.nop >= 0 && idx.kat >= 0 && idx.prio >= 0) return { headerRow: r, idx }
  }
  return null
}

/**
 * "File EAS" = Manual Validation, sheet "Site_List" -> BASELINE hari ini.
 * Tiap pagi Prio Actual (A1) site yang sudah selesai berubah jadi "Done", jadi site yang MASIH
 * TERBUKA (P1..P7) = baseline: dihitung per NOP, kategori (Extended/Quickwin), dan P1 / P2-P5 / P6 / P7.
 * Total site per NOP & kategori = semua site Area 1 (Done + terbuka).
 *
 * Selain hitungan, daftar Site ID yang terbuka ikut dikembalikan (`sites`) dan disimpan, karena
 * besok daftar inilah yang dipakai untuk tahu prioritas awal site yang berubah ke Done (Ach Validasi).
 *
 * @param buffer ArrayBuffer isi file .xlsx
 */
export function parseManualValidation(buffer, { areaLabel = 'Area 1' } = {}) {
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
    throw new Error('Kolom Site ID, NOP_NAME, Kategori Site, dan Prio Actual (A1) tidak ditemukan di sheet Site_List.')
  }
  const { headerRow, idx } = found
  const wantedArea = up(areaLabel)

  // Satu site (Site ID + kategori) dihitung sekali. Kalau ada baris ganda, yang masih terbuka
  // (rank terkecil) menang atas "Done".
  const sites = new Map() // `${site}|${cat}` -> { rank, nop, regional, cat }
  let unknown = 0
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const siteId = up(row[idx.site])
    if (!siteId) continue
    if (idx.area >= 0 && up(row[idx.area]) !== wantedArea) continue
    const cat = normalizeCategory(row[idx.kat])
    const nop = nopKey(row[idx.nop])
    if (!cat || !nop) continue
    const rank = priorityRank(row[idx.prio])
    if (rank == null) {
      unknown += 1 // Prio Actual kosong / error (#N/A): tidak dihitung
      continue
    }
    const key = `${siteId}|${cat}`
    const prev = sites.get(key)
    if (!prev) {
      sites.set(key, { siteId, rank, nop, cat, regional: idx.regional >= 0 ? normalizeRegional(row[idx.regional]) : '' })
    } else if (rank < prev.rank) {
      prev.rank = rank
    }
  }
  if (!sites.size) throw new Error('Tidak ada site Area 1 yang valid di sheet Site_List.')

  const byNop = new Map()
  const openSites = {} // untuk disimpan: { [nopKey]: { nop, regional, extended: { "1": [ids] }, quickwin } }
  let open = 0
  for (const s of sites.values()) {
    if (!byNop.has(s.nop)) {
      byNop.set(s.nop, {
        nop: s.nop,
        regional: s.regional,
        extended: { total: 0, notDone: Object.fromEntries(BUCKETS.map((b) => [b, 0])) },
        quickwin: { total: 0, notDone: Object.fromEntries(BUCKETS.map((b) => [b, 0])) },
      })
    }
    const n = byNop.get(s.nop)
    if (!n.regional && s.regional) n.regional = s.regional
    n[s.cat].total += 1
    if (s.rank !== DONE_RANK) {
      n[s.cat].notDone[bucketOfRank(s.rank)] += 1
      open += 1
      const o = (openSites[s.nop] ||= { nop: s.nop, regional: n.regional, extended: {}, quickwin: {} })
      ;(o[s.cat][s.rank] ||= []).push(s.siteId)
    }
  }

  return {
    nops: [...byNop.values()],
    sites: openSites,
    stats: { sites: sites.size, open, done: sites.size - open, unknown },
  }
}
