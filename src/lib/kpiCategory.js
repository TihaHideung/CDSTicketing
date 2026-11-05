// Profiling KPI: kategori KPI per NOP per bulan -> rekap distribusi per Regional per bulan.
//
// Sumber data = file "KPI List Export" (satu baris per NOP per bulan). Kategori TIDAK dihitung lagi,
// langsung dibaca dari kolom:
//   SON L1   -> "SON L1 Score Kategori"   (di file ditulis "SONL 1 Score Category")
//   SOMSA L0 -> "SOMSA L0 Score Kategori" (di file ditulis "SOMSAL 0 Score Category")
// Bulan dibaca dari kolom "Period" (mis. "September/2026").
// Regional TIDAK ada di file, jadi NOP dicocokkan ke Master Site (kolom NOP -> Regional).
// Hanya R01, R02, R10 yang dipakai; NOP lain dilewati.

export const KPI_TYPES = [
  { key: 'SON_L1', label: 'KPI SON L1' },
  { key: 'SOMSA_L0', label: 'KPI SOMSA L0' },
];

// Urut dari terendah ke tertinggi.
export const KPI_CATEGORIES = ['Kurang', 'Cukup', 'Baik', 'Baik Sekali', 'Istimewa'];

export const KPI_CATEGORY_COLORS = {
  Kurang: 'C00000',
  Cukup: 'FFC000',
  Baik: '0070C0',
  'Baik Sekali': '00B050',
  Istimewa: '92D050',
};

// Regional yang dipakai di Profiling KPI (urutan tampil).
export const KPI_REGIONALS = ['R01', 'R02', 'R10'];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m) => MONTH_LABELS[m - 1] || String(m);

// Nama bulan Inggris & Indonesia (huruf kecil) -> 1..12.
const MONTH_NAMES = {
  january: 1, januari: 1, jan: 1,
  february: 2, februari: 2, feb: 2,
  march: 3, maret: 3, mar: 3,
  april: 4, apr: 4,
  may: 5, mei: 5,
  june: 6, juni: 6, jun: 6,
  july: 7, juli: 7, jul: 7,
  august: 8, agustus: 8, agu: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, desember: 12, des: 12, dec: 12,
};

/**
 * Kolom "Period" -> YYYYMM. Format yang dikenali: "September/2026", "Sep 2026", "2026-09",
 * "09/2026", "202609". Return null kalau tidak terbaca.
 */
export function parsePeriod(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getFullYear() * 100 + value.getMonth() + 1;
  }
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return Number(m[1]) * 100 + Number(m[2]);
  m = s.match(/^(\d{4})[-/. ](\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return Number(m[1]) * 100 + Number(m[2]);
  m = s.match(/^(\d{1,2})[-/. ](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return Number(m[2]) * 100 + Number(m[1]);
  m = s.match(/^([a-z]+)[\s/.-]*(\d{4})$/);
  if (m && MONTH_NAMES[m[1]]) return Number(m[2]) * 100 + MONTH_NAMES[m[1]];
  return null;
}

/** "NOP  Pangkal Pinang" -> "PANGKAL PINANG" (awalan NOP dibuang supaya cocok dengan Master Site). */
export function normalizeNop(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^NOP\s+/, '');
}

/** Nilai Regional dari Master Site -> 'R01' | 'R02' | 'R10' (selain itu ''). */
export function regionalCode(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const named = { sumbagut: 'R01', sumbagsel: 'R02', sumbagteng: 'R10' };
  if (named[raw.replace(/[^a-z]/g, '')]) return named[raw.replace(/[^a-z]/g, '')];
  const prefixed = raw.match(/^r\s*0*(\d{1,2})(?:$|[\s_-])/);
  if (prefixed) {
    const code = `R${String(Number(prefixed[1])).padStart(2, '0')}`;
    return KPI_REGIONALS.includes(code) ? code : '';
  }
  const m = raw.match(/(?:^|[^0-9])0*(\d{1,2})$/);
  if (!m) return '';
  const code = `R${String(Number(m[1])).padStart(2, '0')}`;
  return KPI_REGIONALS.includes(code) ? code : '';
}

/**
 * Peta NOP -> Regional dari Master Site.
 * @param masterNops [{ nop, regional }]  (baris unik dari tabel site_master)
 * @returns Map<normalizedNop, 'R01'|'R02'|'R10'>  hanya NOP di R01/R02/R10
 */
export function buildNopRegionalMap(masterNops) {
  const map = new Map();
  for (const r of masterNops || []) {
    const reg = regionalCode(r.regional);
    const nop = normalizeNop(r.nop);
    if (reg && nop && !map.has(nop)) map.set(nop, reg);
  }
  return map;
}

/** Teks kategori dari file -> salah satu KPI_CATEGORIES (cocok tanpa peduli huruf besar/kecil), atau null. */
export function normalizeCategory(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return KPI_CATEGORIES.find((c) => c.toLowerCase() === s) || null;
}

/**
 * Rekap distribusi: berapa NOP di tiap kategori, per Regional per bulan (tahun terbaru di data).
 * @param rows [{ kpiType, period (YYYYMM), regional, nop, category }]  (getKpi)
 * @returns { year, months: [1..n], regionals: [...], counts: { [regional]: { [month]: { Kurang, Cukup, ... } } } }
 *          atau null kalau tidak ada data jenis tsb.
 */
export function buildKpiDistribution(rows, typeKey) {
  const typed = rows.filter((r) => r.kpiType === typeKey && KPI_REGIONALS.includes(r.regional));
  if (!typed.length) return null;
  const year = Math.max(...typed.map((r) => Math.floor(r.period / 100)));
  const ofYear = typed.filter((r) => Math.floor(r.period / 100) === year);
  const months = [...new Set(ofYear.map((r) => r.period % 100))].sort((a, b) => a - b);
  const regionals = KPI_REGIONALS.filter((reg) => ofYear.some((r) => r.regional === reg));

  const counts = {};
  for (const reg of regionals) {
    counts[reg] = {};
    for (const m of months) counts[reg][m] = Object.fromEntries(KPI_CATEGORIES.map((c) => [c, 0]));
  }
  for (const r of ofYear) {
    if (counts[r.regional]?.[r.period % 100]?.[r.category] != null) counts[r.regional][r.period % 100][r.category] += 1;
  }
  return { year, months, regionals, counts };
}
