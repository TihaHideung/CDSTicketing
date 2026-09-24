// Kolom pada file "Merge" (gabungan Cell Down + Site Down per regional).
export const MERGE_COLUMNS = {
  TICKET_ID: 'Ticket ID',
  LAST_OCCURRED_ON: 'Last Occurred On',
  ALARM_SOURCE: 'Alarm Source',
  SITE_CLASS_DETAIL: 'Site Class Detail',
  ALARM_NAME: 'Alarm Name',
  SITE_ID: 'Site ID',
  NOP: 'NOP',
  REGIONAL: 'Regional', // kode internal (REGIONAL1/REGIONAL2/dst), disimpan sbg referensi saja
  EMS_NAME: 'EMS Name',
  SITE_TYPE: 'Site Type',
  RC_CATEGORY: 'RC Category',
  RC_TIER1: 'RC Tier-1',
  SITE_CLASS: 'Site Class',
  SITE_DOWN_FLAG: 'Site Down Flag',
  ALARM_GROUP: 'Alarm Group',
  CLEARANCE_STATUS: 'Clearance Status',
  CAT_ALARM: 'Cat Alarm', // 'CellDown' atau 'SiteDown', sudah ada di file
  DETAIL_RC: 'Detail RC',
};

// Header wajib ada supaya sheet & baris header yang benar (bukan sheet pivot lain,
// atau baris ringkasan di atas header) yang dibaca.
// Untuk format baru, kolom `Cat Alarm` bisa tidak ada — di sini kita turunkan otomatis
// dari `Alarm Name` (kalau berisi kata "Cell" maka CellDown, selain itu SiteDown).
export const MERGE_REQUIRED_HEADERS = ['Ticket ID', 'Alarm Name'];

// Kolom pada file SWFM Check (file validasi, versi ringan).
export const SWFM_COLUMNS = {
  TICKET_ID: 'Ticket ID',
  TICKET_SWFM_STATUS: 'Ticket SWFM Status',
  RC_CATEGORY: 'RC Category',
};
export const SWFM_REQUIRED_HEADERS = ['Ticket ID', 'Ticket SWFM Status'];

// Kolom pada file Master Site Detail (dipakai untuk lookup Cluster & Site Name
// berdasarkan Site ID).
export const MASTER_COLUMNS = {
  SITE_ID: 'Site ID',
  SITE_NAME: 'Site Name',
  SITE_CLASS: 'Site Class',
  REGIONAL: 'Regional',
  NOP: 'NOP',
  CLUSTER: 'Cluster',
};
export const MASTER_REQUIRED_HEADERS = ['Site ID', 'Cluster'];

// Kata kunci status SWFM yang dianggap "sudah ditangani" — dicek dengan `includes`
// (bukan exact match) karena ejaan status di lapangan suka bervariasi, contoh nyata
// yang ditemukan: "CANCELED" (bukan CANCELLED), "ESCALATED TO INSERA" (bukan cuma
// "ESCALATED"), "Closed" (huruf kecil-besar campur).
export const SWFM_HANDLED_KEYWORDS = ['CLOS', 'CANCEL', 'ESCALAT', 'RESOLV'];

export function isHandledStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  if (!s) return false;
  return SWFM_HANDLED_KEYWORDS.some((k) => s.includes(k));
}

// Prefix EMS Name yang tiketnya harus dibuang (site USO).
export const EMS_EXCLUDED_PREFIX = 'USO_';

// 3 pembagian regional utama (dipilih user sendiri saat upload, BUKAN dibaca dari
// kolom "Regional" internal file — karena satu file upload mewakili satu regional).
export const REGIONS = ['Sumbagut', 'Sumbagteng', 'Sumbagsel'];

export const REGIONAL_CODE_MAP = {
  Sumbagut: 'Regional 1',
  Sumbagsel: 'Regional 2',
  Sumbagteng: 'Regional 10',
};

export const REGIONAL_TAG_BY_CODE = {
  REGIONAL1: 'Sumbagut',
  REGIONAL2: 'Sumbagsel',
  REGIONAL10: 'Sumbagteng',
};

export function getRegionalTagFromValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lookup = {
    regional1: 'Sumbagut',
    regional2: 'Sumbagsel',
    regional10: 'Sumbagteng',
    sumbagut: 'Sumbagut',
    sumbagsel: 'Sumbagsel',
    sumbagteng: 'Sumbagteng',
    1: 'Sumbagut',
    2: 'Sumbagsel',
    10: 'Sumbagteng',
  };

  return lookup[normalized] || '';
}

export function normalizeRegionalCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `REGIONAL${raw}`;
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function getRegionalCodeForTag(regionalTag) {
  const raw = REGIONAL_CODE_MAP[regionalTag] || regionalTag || '';
  return normalizeRegionalCode(raw);
}

export function getRegionalAliases(regionalTag) {
  const tag = String(regionalTag || '').trim();
  const code = REGIONAL_CODE_MAP[tag] || tag || '';
  const aliases = new Set([tag, code, normalizeRegionalCode(tag), normalizeRegionalCode(code)]);
  return Array.from(aliases)
    .filter(Boolean)
    .map((alias) => String(alias).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export function matchesRegionalTag(value, regionalTag) {
  if (!regionalTag) return true;
  if (value == null) return false;
  const target = String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return getRegionalAliases(regionalTag).includes(target) || getRegionalAliases(value).includes(String(regionalTag).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export const SITE_CLASS_ORDER = ['Platinum', 'Gold', 'Silver', 'Bronze'];

// Kategori Duration ticket: Time Now (device) - Last Occurred On. Menggantikan
// kategori "Cat Day"/Aging yang lama (1-3/3-7/>7 hari) dengan rentang yang lebih rinci,
// termasuk ticket yang baru berumur di bawah 24 jam (sebelumnya dibuang, sekarang
// TETAP ditampilkan dan dikategorikan lewat Duration ini).
export const DURATION_BUCKETS = ['<12H', '12H-24H', '1-3 Days', '3-7 Days', '>7 Days'];

// Warna berbeda per kategori Duration, dipakai konsisten di semua chart yang
// menampilkan breakdown per Duration (mis. RC Category bertumpuk warna-warni).
export const DURATION_COLORS = {
  '<12H': '#22c55e',
  '12H-24H': '#84cc16',
  '1-3 Days': '#facc15',
  '3-7 Days': '#f97316',
  '>7 Days': '#dc2626',
};

export function bucketDuration(ageHours) {
  if (ageHours < 12) return DURATION_BUCKETS[0];
  if (ageHours < 24) return DURATION_BUCKETS[1];
  const ageDays = ageHours / 24;
  if (ageDays <= 3) return DURATION_BUCKETS[2];
  if (ageDays <= 7) return DURATION_BUCKETS[3];
  return DURATION_BUCKETS[4];
}

// Label RC Category untuk ticket yang belum sempat diisi root cause-nya (baik yang
// otomatis dari Excel/SWFM maupun yang manual dari petugas).
export const RC_UNDER_REVIEW = 'Under Investigation';

// Struktur RC bertingkat: pilih RC Category dulu, baru RC Subcategory yang sesuai
// muncul. Field ini SELALU kosong di awal (setiap upload), sengaja dikosongkan
// supaya diisi manual oleh petugas, tidak diisi otomatis dari Excel/SWFM.
export const RC_STRUCTURE = {
  Power: ['Pemadaman PLN', 'Hardware', 'Vandalism', 'Anomaly Data'],
  Radio: ['Hardware', 'Vandalism', 'Support Event', 'Anomaly Data'],
  Transmisi: ['FO Cut', 'VLAN Issue', 'Hardware', 'Anomaly Data'],
  Others: ['ComCase', 'Access', 'Reloc', 'NewSite', 'Dismantle', 'Anomaly Data'],
};
export const RC_CATEGORIES = Object.keys(RC_STRUCTURE);

// Pilihan dropdown PIC (Person In Charge) — diisi manual petugas, sama seperti RC.
export const PIC_OPTIONS = ['Telkomsel', 'TP', 'Telkom', 'TI'];

export function getSubcategoriesFor(category) {
  return RC_STRUCTURE[category] || [];
}

// Key untuk menyimpan ticket aktif di database: gabungan Regional + Ticket ID, BUKAN
// Ticket ID saja. Ini penting supaya upload region yang satu tidak pernah menimpa
// data region lain walau (secara kebetulan/data contoh) Ticket ID-nya sama.
export function buildTicketKey(regional, ticketId) {
  return `${regional}::${ticketId}`;
}
export function parseTicketKey(key) {
  const idx = key.indexOf('::');
  return { regional: key.slice(0, idx), ticketId: key.slice(idx + 2) };
}
