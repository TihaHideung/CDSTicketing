import * as XLSX from 'xlsx'
import { DONE_RANK, nopKey, normalizeCategory, priorityRank } from './easReport.js'
import { toISODate } from './parseManualValidation.js'

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
      drev: cells.indexOf('DATE REVISI'),
      final: cells.findIndex((c) => c.startsWith('FINAL PRIORITY')),
      nop: cells.findIndex((c) => c === 'NOP' || c === 'NOP_NAME'),
    }
    if (idx.site >= 0 && idx.kat >= 0 && idx.drev >= 0 && idx.final >= 0) {
      return { headerRow: r, idx, finalHeader: (rows[r][idx.final] ?? '').toString() }
    }
  }
  return null
}

/**
 * "Upload Data Streamlit" = file EAS_Detail_Site_All (sheet "Detail Site") -> bahan ACH VALIDASI.
 * Yang diambil: site dengan Date Revisi = H-1 yang Final Priority-nya sudah "Done".
 * Prioritas awal site-site itu (sebelum berubah ke Done) dicari di baseline tersimpan lewat computeAch().
 *
 * Site ID dicocokkan bersama kategorinya. Site yang punya beberapa baris di kategori yang sama
 * (mis. prioritas P3+P7 dipecah jadi 2 baris) dianggap Done hanya kalau semua barisnya Done.
 *
 * @param buffer ArrayBuffer isi file .xlsx
 * @param revisiDateISO  tanggal Date Revisi yang dicari (H-1), format YYYY-MM-DD
 */
export function parseEasDetail(buffer, { revisiDateISO }) {
  const names = XLSX.read(buffer, { type: 'array', bookSheets: true }).SheetNames
  const sheetName =
    names.find((n) => up(n) === 'DETAIL SITE') || names.find((n) => up(n).includes('DETAIL')) || names[0]
  const wb = XLSX.read(buffer, { type: 'array', sheets: [sheetName], ...LEAN_READ })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })

  const found = findHeader(rows)
  if (!found) {
    throw new Error(
      'File Upload Data Streamlit tidak dikenali: kolom Site ID, Kategori Site, Date Revisi, dan Final Priority tidak ditemukan di sheet "Detail Site".'
    )
  }
  const { headerRow, idx, finalHeader } = found

  const sites = new Map() // `${siteId}|${cat}` -> { rank, date }
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const siteId = up(row[idx.site])
    if (!siteId) continue
    const cat = normalizeCategory(row[idx.kat])
    const rank = priorityRank(row[idx.final])
    if (!cat || rank == null) continue
    const date = toISODate(row[idx.drev])
    const key = `${siteId}|${cat}`
    const prev = sites.get(key)
    if (!prev) sites.set(key, { siteId, cat, rank, date })
    else {
      if (rank < prev.rank) prev.rank = rank
      if (!prev.date && date) prev.date = date
    }
  }
  if (!sites.size) throw new Error('Tidak ada baris site yang valid di file Upload Data Streamlit.')

  const revisedDone = []
  let revisedTotal = 0
  const doneDates = {}
  for (const s of sites.values()) {
    if (s.date === revisiDateISO) {
      revisedTotal += 1
      if (s.rank === DONE_RANK) revisedDone.push({ site: s.siteId, cat: s.cat })
    }
    if (s.rank === DONE_RANK && s.date) doneDates[s.date] = (doneDates[s.date] || 0) + 1
  }

  const label = finalHeader.match(/per\s+(.+?)\)?\s*$/i)?.[1]?.replace(/\)$/, '') || ''
  return {
    revisedDone, // [{ site, cat }] -> masuk computeAch()
    revisedTotal, // semua site ber-Date Revisi H-1 (Done maupun belum)
    // beberapa tanggal Date Revisi terakhir (yang sudah Done) di file, untuk petunjuk kalau H-1 kosong
    availableDates: Object.keys(doneDates)
      .sort()
      .slice(-4)
      .map((dateISO) => ({ dateISO, count: doneDates[dateISO] })),
    snapshotLabel: label, // mis. "03-11-2026 09:37"
    stats: { uniqueSites: sites.size },
  }
}
