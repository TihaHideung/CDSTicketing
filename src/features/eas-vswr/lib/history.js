import { getEasVswrHistory, saveEasVswrRecord } from '../../../lib/dbApi.js'

// Riwayat summary EAS & VSWR disimpan di database (tabel eas_vswr_history lewat
// backend CDS), BUKAN di browser, jadi bisa dibuka dari perangkat/pengguna mana pun.

// Key localStorage versi lama. Sekarang hanya dibaca SEKALI untuk memindahkan data lama
// ke database, lalu dihapus (lihat migrateLegacyLocalHistory).
const LEGACY_KEY = 'eas-vswr-history-v1'

function sortByDate(list) {
  return [...list].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
}

export async function loadHistory() {
  const list = await getEasVswrHistory()
  return sortByDate(Array.isArray(list) ? list : [])
}

// Simpan (insert/timpa) record untuk record.dateISO. Melempar error kalau gagal,
// supaya UI tidak menampilkan data yang sebenarnya belum tersimpan.
export async function saveRecord(record) {
  await saveEasVswrRecord(record)
}

// Versi in-memory dari upsert: ganti/tambah record di list lalu urutkan lagi.
export function upsertInList(list, record) {
  return sortByDate([...list.filter((r) => r.dateISO !== record.dateISO), record])
}

// Pindahkan data yang mungkin masih ada di localStorage browser ini (dari versi lama
// yang belum pakai database) ke database. Hanya tanggal yang BELUM ada di database yang
// diimpor, jadi tidak pernah menimpa data server. localStorage dihapus hanya setelah
// semua berhasil tersimpan; kalau gagal di tengah jalan, dibiarkan dan dicoba lagi nanti.
export async function migrateLegacyLocalHistory(existingList) {
  let legacy
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw == null) return existingList
    legacy = JSON.parse(raw)
  } catch {
    return existingList
  }

  const have = new Set(existingList.map((r) => r.dateISO))
  const toImport = Array.isArray(legacy)
    ? legacy.filter((r) => r && r.dateISO && r.metrics && r.summaryText && !have.has(r.dateISO))
    : []

  for (const record of toImport) {
    await saveEasVswrRecord(record)
  }

  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // abaikan: tidak kritis
  }
  return toImport.length ? sortByDate([...existingList, ...toImport]) : existingList
}

export function getRecord(list, dateISO) {
  return list.find((r) => r.dateISO === dateISO) || null
}

// The record immediately before dateISO in chronological order (for
// day-over-day comparison), regardless of whether a record exists on
// dateISO itself.
export function getPreviousRecord(list, dateISO) {
  const before = list.filter((r) => r.dateISO < dateISO)
  return before.length ? before[before.length - 1] : null
}
