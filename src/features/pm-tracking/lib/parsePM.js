import * as XLSX from 'xlsx'

// Kolom wajib untuk menghitung summary. Nama kolom dicocokkan tanpa peduli huruf
// besar/kecil dan spasi di pinggir.
const REQUIRED = ['regional', 'nop', 'ticket no', 'status']

// Kolom yang hanya ada di salah satu jenis file. Dipakai untuk mendeteksi file yang
// salah slot (mis. file Genset diupload di slot Site).
const SITE_ONLY = 'type site'
const GENSET_ONLY = 'scope item name'

// Kolom yang disimpan apa adanya sebagai nilai teks yang sudah di-trim, supaya
// pencocokan Regional / NOP / Status konsisten (spasi nyasar tidak memecah grup).
const TRIM_COLS = ['regional', 'nop', 'status', 'area']

const norm = (v) => (v ?? '').toString().trim().toLowerCase()

function findSheet(workbook) {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
    if (!rows.length) continue
    const header = rows[0].map(norm)
    if (REQUIRED.every((c) => header.includes(c))) return { name, rows }
  }
  return null
}

/**
 * Membaca file PM (Site atau Genset). Mengembalikan data mentah dalam bentuk
 * { columns: [...], rows: [[...]] } supaya ringkas saat disimpan ke database dan
 * bisa ditulis ulang apa adanya ke sheet MS / MG saat export.
 *
 * Tanggal dibiarkan sebagai angka serial Excel (tidak diubah ke Date) supaya tidak
 * ada pergeseran zona waktu; saat export dikonversi balik.
 */
export function parsePM(workbook, kind) {
  const found = findSheet(workbook)
  if (!found) {
    throw new Error(
      `File PM ${kind === 'site' ? 'Site' : 'Genset'} tidak dikenali: tidak ada sheet dengan kolom Regional, NOP, Ticket No, dan Status.`
    )
  }

  const columns = found.rows[0].map((c) => (c ?? '').toString().trim())
  const lower = columns.map(norm)

  if (kind === 'site' && lower.includes(GENSET_ONLY) && !lower.includes(SITE_ONLY)) {
    throw new Error('File yang diupload di slot PM Site tampaknya file PM Genset. Silakan tukar slotnya.')
  }
  if (kind === 'genset' && lower.includes(SITE_ONLY) && !lower.includes(GENSET_ONLY)) {
    throw new Error('File yang diupload di slot PM Genset tampaknya file PM Site. Silakan tukar slotnya.')
  }

  const trimIdx = TRIM_COLS.map((c) => lower.indexOf(c)).filter((i) => i >= 0)
  const regionalIdx = lower.indexOf('regional')

  const rows = []
  for (let r = 1; r < found.rows.length; r++) {
    const src = found.rows[r] || []
    // baris kosong / hanya spasi dilewati; baris tanpa Regional juga tidak bisa dihitung
    if (!src.some((v) => v != null && v !== '')) continue
    if (src[regionalIdx] == null || src[regionalIdx] === '') continue
    const row = columns.map((_, i) => (src[i] === undefined ? null : src[i]))
    for (const i of trimIdx) {
      if (typeof row[i] === 'string') row[i] = row[i].trim()
    }
    rows.push(row)
  }

  if (!rows.length) throw new Error(`File PM ${kind === 'site' ? 'Site' : 'Genset'} tidak berisi baris data.`)

  return { sheetName: found.name, columns, rows, rowCount: rows.length }
}
