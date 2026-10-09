import { getPmTrackingHistory, savePmTrackingRecord } from '../../../lib/dbApi.js'

// Riwayat PM Tracking disimpan di database (tabel pm_tracking_history lewat backend
// CDS), BUKAN di browser, jadi bisa dibuka dari perangkat/pengguna mana pun.

function sortByDate(list) {
  return [...list].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
}

export async function loadHistory() {
  const list = await getPmTrackingHistory()
  return sortByDate(Array.isArray(list) ? list : [])
}

// Melempar error kalau gagal, supaya UI tidak menampilkan data yang belum tersimpan.
export async function saveRecord(record) {
  await savePmTrackingRecord(record)
}

export function upsertInList(list, record) {
  return sortByDate([...list.filter((r) => r.dateISO !== record.dateISO), record])
}

export function getRecord(list, dateISO) {
  return list.find((r) => r.dateISO === dateISO) || null
}

// Record tepat sebelum dateISO (untuk perbandingan antar tanggal).
export function getPreviousRecord(list, dateISO) {
  const before = list.filter((r) => r.dateISO < dateISO)
  return before.length ? before[before.length - 1] : null
}
