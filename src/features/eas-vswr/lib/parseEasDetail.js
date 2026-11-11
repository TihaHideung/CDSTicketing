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

function findHeader(rows) {
  const limit = Math.min(rows.length, 15)
  for (let r = 0; r < limit; r++) {
    const cells = (rows[r] || []).map(up)
    const idx = {
      site: cells.indexOf('SITE ID'),
      kat: cells.indexOf('KATEGORI SITE'),
      area: cells.indexOf('AREA'),
      regional: cells.indexOf('REGIONAL'),
      nop: cells.findIndex((c) => c === 'NOP' || c === 'NOP_NAME'),
      final: cells.findIndex((c) => c.startsWith('FINAL PRIORITY')),
    }
    if (idx.site >= 0 && idx.kat >= 0 && idx.nop >= 0 && idx.final >= 0) {
      return { headerRow: r, idx, finalHeader: (rows[r][idx.final] ?? '').toString() }
    }
  }
  return null
}

/**
 * "Upload Data Streamlit" = file EAS_Detail_Site_All (sheet "Detail Site") -> BASELINE.
 * Dasar melihat prioritas tiap site: Final Priority yang masih terbuka (P1..P7) = baseline,
 * dihitung per NOP, kategori (Extended/Quickwin), dan P1 / P2-P5 / P6 / P7.
 * Total site per NOP & kategori = semua site Area 1 di file (Done + terbuka).
 *
 * Daftar Site ID yang terbuka ikut dikembalikan (`sites`) dan disimpan, karena upload berikutnya
 * memakainya untuk tahu prioritas awal site yang berubah ke Done (Ach Validasi).
 *
 * Satu site (Site ID + kategori) dihitung sekali. Kalau ada baris ganda, yang masih terbuka
 * (rank terkecil) menang atas "Done".
 *
 * @param buffer ArrayBuffer isi file .xlsx
 */
export function parseEasDetail(buffer, { areaLabel = 'Area 1' } = {}) {
  const names = XLSX.read(buffer, { type: 'array', bookSheets: true }).SheetNames
  const sheetName =
    names.find((n) => up(n) === 'DETAIL SITE') || names.find((n) => up(n).includes('DETAIL')) || names[0]
  const wb = XLSX.read(buffer, { type: 'array', sheets: [sheetName], ...LEAN_READ })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })

  const found = findHeader(rows)
  if (!found) {
    throw new Error(
      'File Upload Data Streamlit tidak dikenali: kolom Site ID, Kategori Site, NOP, dan Final Priority tidak ditemukan di sheet "Detail Site".'
    )
  }
  const { headerRow, idx, finalHeader } = found
  const wantedArea = up(areaLabel)

  const sites = new Map() // `${siteId}|${cat}` -> { rank, nop, regional, cat }
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
    const rank = priorityRank(row[idx.final])
    if (rank == null) {
      unknown += 1 // Final Priority kosong / tidak dikenal: tidak dihitung
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
  if (!sites.size) throw new Error('Tidak ada site Area 1 yang valid di file Upload Data Streamlit.')

  const byNop = new Map()
  const openSites = {} // disimpan: { [nopKey]: { nop, regional, extended: { "1": [ids] }, quickwin } }
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
      const bucket = bucketOfRank(s.rank)
      if (!bucket) continue
      n[s.cat].notDone[bucket] += 1
      open += 1
      const o = (openSites[s.nop] ||= { nop: s.nop, regional: n.regional, extended: {}, quickwin: {} })
      ;(o[s.cat][s.rank] ||= []).push(s.siteId)
    }
  }

  const label = finalHeader.match(/per\s+(.+?)\)?\s*$/i)?.[1]?.replace(/\)$/, '') || ''
  return {
    nops: [...byNop.values()],
    sites: openSites,
    snapshotLabel: label, // mis. "06-11-2026 10:25"
    stats: { sites: sites.size, open, done: sites.size - open, unknown },
  }
}
