// Client API ke backend CDS Monitoring (Express + MySQL). Menggantikan penyimpanan
// IndexedDB versi sebelumnya supaya data benar-benar tersimpan kumulatif di database
// (bisa diakses lintas browser/komputer, bukan cuma di browser tempat upload).
//
// Untuk production, frontend dan backend dipakai di domain yang sama; request API
// menggunakan path relative /api agar tidak hardcode localhost atau domain API lain.

const BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

async function apiFetch(path, options) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Gagal memanggil ${path} (status ${res.status}). Pastikan backend berjalan dan route /api tersedia.`);
  }
  return res.json();
}

export async function getActiveTickets() {
  return apiFetch('/api/active-tickets');
}

/**
 * Kirim baris ticket hasil cleaning+matching untuk diupsert. Server yang menentukan
 * apakah field rc/rcSub/detail/actionPlan perlu dipertahankan (kalau ticket-nya sudah
 * pernah ada & sudah diisi petugas sebelumnya).
 */
export async function upsertActiveTickets(rows, uploadDate = null) {
  return apiFetch('/api/active-tickets/upsert', {
    method: 'POST',
    body: JSON.stringify({ rows, uploadDate }),
  });
}

export async function updateTicketFields(ticketKey, fields) {
  return apiFetch(`/api/active-tickets/${encodeURIComponent(ticketKey)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

/**
 * Gabungkan hasil parsing SWFM Check ke database kumulatif. Server otomatis mem-purge
 * ticket aktif (di regional manapun) yang ticket_id-nya match dengan status yang sudah
 * ditangani.
 */
export async function mergeSwfm(handledMap, infoMap) {
  return apiFetch('/api/swfm/merge', { method: 'POST', body: JSON.stringify({ handledMap, infoMap }) });
}

export async function getSwfmHandledMap() {
  return apiFetch('/api/swfm/handled');
}

export async function getSwfmInfoMap() {
  return apiFetch('/api/swfm/info');
}

export async function getDailyTrendLog() {
  return apiFetch('/api/daily-trend');
}

export async function upsertDailyTrendEntry(entry) {
  return apiFetch('/api/daily-trend', { method: 'POST', body: JSON.stringify(entry) });
}

export async function importSiteMaster(rows) {
  return apiFetch('/api/site-master/import', { method: 'POST', body: JSON.stringify({ rows }) });
}

export async function lookupSiteMaster(siteIds) {
  return apiFetch('/api/site-master/lookup', { method: 'POST', body: JSON.stringify({ siteIds }) });
}

export async function getSiteMasterCount() {
  return apiFetch('/api/site-master/count');
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
