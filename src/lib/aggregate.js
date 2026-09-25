import { SITE_CLASS_ORDER, DURATION_BUCKETS, RC_UNDER_REVIEW, matchesRegionalTag } from './constants.js';

function isCellDown(row) {
  return row.catAlarm === 'CellDown';
}

export function computeSummary(rows) {
  const cellDownRows = rows.filter(isCellDown);
  const siteDownRows = rows.filter((r) => !isCellDown(r));

  const overview = {
    cellDown: cellDownRows.length,
    siteDown: siteDownRows.length,
    total: rows.length,
  };

  // --- Area Contributor (per Regional) ---
  const regionalMap = new Map();
  for (const r of rows) {
    const key = r.regional || 'UNKNOWN';
    if (!regionalMap.has(key)) regionalMap.set(key, { regional: key, cellDown: 0, siteDown: 0, nop: new Map() });
    const bucket = regionalMap.get(key);
    if (isCellDown(r)) bucket.cellDown++;
    else bucket.siteDown++;

    const nopKey = r.nop || 'UNKNOWN';
    if (!bucket.nop.has(nopKey)) bucket.nop.set(nopKey, { nop: nopKey, cellDown: 0, siteDown: 0 });
    const nopBucket = bucket.nop.get(nopKey);
    if (isCellDown(r)) nopBucket.cellDown++;
    else nopBucket.siteDown++;
  }

  const areaContributor = Array.from(regionalMap.values())
    .map((b) => ({
      regional: b.regional,
      cellDown: b.cellDown,
      siteDown: b.siteDown,
      total: b.cellDown + b.siteDown,
      pctCellDown: overview.cellDown ? b.cellDown / overview.cellDown : 0,
      pctSiteDown: overview.siteDown ? b.siteDown / overview.siteDown : 0,
      nop: Array.from(b.nop.values()).sort((a, c) => c.cellDown + c.siteDown - (a.cellDown + a.siteDown)),
    }))
    .sort((a, b) => b.total - a.total);

  // --- Site Class distribution ---
  const siteClassMap = new Map();
  for (const r of rows) {
    const key = SITE_CLASS_ORDER.includes(r.siteClass) ? r.siteClass : r.siteClass || 'Unclassified';
    if (!siteClassMap.has(key)) siteClassMap.set(key, { siteClass: key, cellDown: 0, siteDown: 0 });
    const bucket = siteClassMap.get(key);
    if (isCellDown(r)) bucket.cellDown++;
    else bucket.siteDown++;
  }
  const siteClass = Array.from(siteClassMap.values())
    .map((b) => ({ ...b, total: b.cellDown + b.siteDown }))
    .sort((a, b) => {
      const ia = SITE_CLASS_ORDER.indexOf(a.siteClass);
      const ib = SITE_CLASS_ORDER.indexOf(b.siteClass);
      if (ia === -1 && ib === -1) return b.total - a.total;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  // --- Duration (pengganti Aging Category lama) ---
  const durationMap = new Map(DURATION_BUCKETS.map((b) => [b, { duration: b, cellDown: 0, siteDown: 0 }]));
  for (const r of rows) {
    const bucket = durationMap.get(r.duration);
    if (!bucket) continue;
    if (isCellDown(r)) bucket.cellDown++;
    else bucket.siteDown++;
  }
  const durationOverall = Array.from(durationMap.values()).map((b) => ({ ...b, total: b.cellDown + b.siteDown }));

  // --- Duration per Regional ---
  function durationByRegional(sourceRows) {
    const map = new Map();
    for (const r of sourceRows) {
      const key = r.regional || 'UNKNOWN';
      if (!map.has(key)) map.set(key, Object.fromEntries([['regional', key], ...DURATION_BUCKETS.map((b) => [b, 0])]));
      map.get(key)[r.duration]++;
    }
    return Array.from(map.values());
  }
  const durationCellDownByRegional = durationByRegional(cellDownRows);
  const durationSiteDownByRegional = durationByRegional(siteDownRows);

  // --- RC Category & Subcategory (manual, diisi petugas) ---
  // Ticket yang RC-nya masih kosong ("Under Review") SENGAJA tidak dimasukkan ke
  // chart RC ini, tapi tetap terhitung penuh di overview/area/duration/site class.
  function rcCount(sourceRows, field) {
    const map = new Map();
    let underReview = 0;
    for (const r of sourceRows) {
      const key = r[field] || '';
      if (!key) {
        underReview++;
        continue;
      }
      map.set(key, (map.get(key) || 0) + 1);
    }
    const list = Array.from(map.entries())
      .map(([name, count]) => ({ [field === 'rc' ? 'rcCategory' : 'rcSubcategory']: name, count }))
      .sort((a, b) => b.count - a.count);
    if (underReview > 0) {
      list.push({ [field === 'rc' ? 'rcCategory' : 'rcSubcategory']: RC_UNDER_REVIEW, count: underReview });
    }
    return { list, underReview };
  }
  const rcCellDown = rcCount(cellDownRows, 'rc');
  const rcSiteDown = rcCount(siteDownRows, 'rc');
  const rcSubCellDown = rcCount(cellDownRows, 'rcSub');
  const rcSubSiteDown = rcCount(siteDownRows, 'rcSub');

  // --- RC Category/Subcategory dipecah per Duration (buat chart batang bertumpuk warna-warni) ---
  function rcByDuration(sourceRows, field = 'rc') {
    const labelKey = field === 'rc' ? 'rcCategory' : 'rcSubcategory';
    const map = new Map();
    for (const r of sourceRows) {
      const key = r[field] || RC_UNDER_REVIEW;
      if (!map.has(key)) {
        map.set(key, Object.fromEntries([[labelKey, key], ['total', 0], ...DURATION_BUCKETS.map((b) => [b, 0])]));
      }
      const bucket = map.get(key);
      if (bucket[r.duration] !== undefined) bucket[r.duration]++;
      bucket.total++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }
  const rcCellDownByDuration = rcByDuration(cellDownRows, 'rc');
  const rcSiteDownByDuration = rcByDuration(siteDownRows, 'rc');
  const rcSubCellDownByDuration = rcByDuration(cellDownRows, 'rcSub');
  const rcSubSiteDownByDuration = rcByDuration(siteDownRows, 'rcSub');

  // --- Sub type breakdown Site Down ---
  const subTypeMap = new Map();
  for (const r of siteDownRows) {
    const key = r.subType || 'SiteDown';
    subTypeMap.set(key, (subTypeMap.get(key) || 0) + 1);
  }
  const siteDownSubType = Array.from(subTypeMap.entries()).map(([subType, count]) => ({ subType, count }));

  return {
    overview,
    areaContributor,
    siteClass,
    durationOverall,
    durationCellDownByRegional,
    durationSiteDownByRegional,
    rcCategoryCellDown: rcCellDown.list,
    rcCategoryCellDownUnderReview: rcCellDown.underReview,
    rcCategorySiteDown: rcSiteDown.list,
    rcCategorySiteDownUnderReview: rcSiteDown.underReview,
    rcCategoryCellDownByDuration: rcCellDownByDuration,
    rcCategorySiteDownByDuration: rcSiteDownByDuration,
    rcSubcategoryCellDownUnderReview: rcSubCellDown.underReview,
    rcSubcategorySiteDownUnderReview: rcSubSiteDown.underReview,
    rcSubcategoryCellDownByDuration: rcSubCellDownByDuration,
    rcSubcategorySiteDownByDuration: rcSubSiteDownByDuration,
    rcSubcategoryCellDown: rcSubCellDown.list,
    rcSubcategorySiteDown: rcSubSiteDown.list,
    siteDownSubType,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Kelompokkan ticket aktif per Site ID — dipakai halaman Detail Ticket Active /
 * sheet export Per_Site_ID.
 */
export function groupBySiteId(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.siteId || r.ticketId;
    if (!map.has(key)) {
      map.set(key, { siteId: key, regional: r.regional, nop: r.nop, siteClass: r.siteClass, cellDownCount: 0, siteDownCount: 0, tickets: [] });
    }
    const bucket = map.get(key);
    if (isCellDown(r)) bucket.cellDownCount++;
    else bucket.siteDownCount++;
    bucket.tickets.push(r);
  }
  return Array.from(map.values()).sort((a, b) => (b.cellDownCount + b.siteDownCount) - (a.cellDownCount + a.siteDownCount));
}

/**
 * Trend harian TOTAL (dipakai saat filter Regional = 1 regional tertentu, bukan All).
 */
export function buildDailyTrend(dailyTrendLog, regionalFilter) {
  return dailyTrendLog
    .map((entry) => {
      const fallbackTotal = { cellDown: 0, siteDown: 0, total: 0 };
      const total = entry?.total || fallbackTotal;

      if (!regionalFilter || regionalFilter === 'ALL') {
        return {
          date: entry.date,
          cellDown: total.cellDown ?? 0,
          siteDown: total.siteDown ?? 0,
          total: total.total ?? 0,
        };
      }

      const r = entry?.byRegional?.[regionalFilter] || fallbackTotal;
      return {
        date: entry.date,
        cellDown: r.cellDown ?? 0,
        siteDown: r.siteDown ?? 0,
        total: r.total ?? 0,
      };
    })
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

/**
 * Trend harian PER REGIONAL (dipakai saat filter = Semua Regional), supaya batang
 * tiap regional dijejerkan per hari, bukan dijumlahkan jadi satu.
 */
export function buildDailyTrendByRegion(dailyTrendLog, regions) {
  return dailyTrendLog
    .map((entry) => {
      const point = { date: entry.date };
      const regionalTotals = entry?.byRegional || {};
      for (const reg of regions) {
        point[reg] = regionalTotals[reg]?.total ?? 0;
      }
      return point;
    })
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

/**
 * Cek apakah suatu item breakdown (1 baris di `entry.breakdown`) cocok dengan
 * kombinasi filter NOP/Cluster/Category/Duration/RC/RC Sub yang sedang aktif.
 * Filter Regional TIDAK dicek di sini karena ditangani terpisah (lihat pemanggil),
 * supaya fungsi ini bisa dipakai baik untuk mode "1 Regional" maupun "Semua Regional".
 */
function breakdownItemMatchesFilters(item, criteria) {
  const { nop, cluster, category, duration, rc, rcSub, rcUnset } = criteria;
  if (nop && item.nop !== nop) return false;
  if (cluster && item.cluster !== cluster) return false;
  if (category && item.catAlarm !== category) return false;
  if (duration && duration.length && !duration.includes(item.duration)) return false;
  if (rcUnset && item.rc) return false;
  if (rc && item.rc !== rc) return false;
  if (rcSub && item.rcSub !== rcSub) return false;
  return true;
}

function hasGranularFilter(criteria) {
  const { nop, cluster, category, duration, rc, rcSub, rcUnset } = criteria;
  return Boolean(nop || cluster || category || (duration && duration.length) || rc || rcSub || rcUnset);
}

/**
 * Trend harian TOTAL, mengikuti SEMUA filter Dashboard yang aktif (Regional, NOP,
 * Cluster, Category, Duration, RC, RC Sub) — bukan cuma filter Regional seperti
 * `buildDailyTrend` lama. Membaca `entry.breakdown` (rincian granular per hari) kalau
 * tersedia; kalau tidak (data lama sebelum fitur ini ada) dan tidak ada filter granular
 * yang aktif, fallback ke `entry.byRegional`/`entry.total` seperti sebelumnya supaya
 * histori lama tetap tampil. Kalau data lama tapi filter granular aktif, hari itu
 * dilewati (bukan ditampilkan 0 yang menyesatkan) karena datanya memang tidak tersimpan.
 */
export function buildFilteredDailyTrend(dailyTrendLog, criteria = {}) {
  const { regionalFilter } = criteria;
  const granular = hasGranularFilter(criteria);
  const result = [];

  for (const entry of dailyTrendLog) {
    if (Array.isArray(entry?.breakdown) && entry.breakdown.length) {
      let cellDown = 0;
      let siteDown = 0;
      for (const item of entry.breakdown) {
        if (regionalFilter && regionalFilter !== 'ALL' && !matchesRegionalTag(item.regional, regionalFilter)) continue;
        if (!breakdownItemMatchesFilters(item, criteria)) continue;
        if (item.catAlarm === 'CellDown') cellDown += item.count;
        else siteDown += item.count;
      }
      result.push({ date: entry.date, cellDown, siteDown, total: cellDown + siteDown });
    } else if (!granular) {
      const fallbackTotal = { cellDown: 0, siteDown: 0, total: 0 };
      if (!regionalFilter || regionalFilter === 'ALL') {
        const t = entry?.total || fallbackTotal;
        result.push({ date: entry.date, cellDown: t.cellDown ?? 0, siteDown: t.siteDown ?? 0, total: t.total ?? 0 });
      } else {
        const r = entry?.byRegional?.[regionalFilter] || fallbackTotal;
        result.push({ date: entry.date, cellDown: r.cellDown ?? 0, siteDown: r.siteDown ?? 0, total: r.total ?? 0 });
      }
    }
    // else: data lama + filter granular aktif -> hari ini dilewati (data tidak tersedia)
  }

  return result.sort((a, b) => (a.date > b.date ? 1 : -1));
}

/**
 * Trend harian PER REGIONAL, mengikuti filter NOP/Cluster/Category/Duration/RC/RC Sub
 * yang aktif (dipakai saat filter Regional = Semua Regional). Sama seperti
 * `buildFilteredDailyTrend`, fallback ke `entry.byRegional` untuk data lama kalau
 * belum ada filter granular yang dipilih.
 */
export function buildFilteredDailyTrendByRegion(dailyTrendLog, regions, criteria = {}) {
  const granular = hasGranularFilter(criteria);
  const result = [];

  for (const entry of dailyTrendLog) {
    if (Array.isArray(entry?.breakdown) && entry.breakdown.length) {
      const point = { date: entry.date };
      for (const reg of regions) point[reg] = 0;
      for (const item of entry.breakdown) {
        if (!breakdownItemMatchesFilters(item, criteria)) continue;
        const reg = regions.find((r) => matchesRegionalTag(item.regional, r));
        if (reg) point[reg] += item.count;
      }
      result.push(point);
    } else if (!granular) {
      const point = { date: entry.date };
      const regionalTotals = entry?.byRegional || {};
      for (const reg of regions) point[reg] = regionalTotals[reg]?.total ?? 0;
      result.push(point);
    }
  }

  return result.sort((a, b) => (a.date > b.date ? 1 : -1));
}

// ---------- Agregasi Trend Harian ke periode lebih besar (Weekly/Monthly/Quarter/Annual) ----------
//
// PENTING: Trend Harian itu snapshot jumlah ticket AKTIF pada hari itu (backlog), bukan
// "ticket baru per hari" — satu ticket yang aktif berhari-hari akan muncul di banyak
// snapshot harian. Untuk periode Weekly/Monthly/Quarter/Annual, angkanya dihitung
// sebagai TOTAL penjumlahan seluruh hari dalam periode itu (sesuai permintaan) —
// artinya ini akumulasi snapshot harian, BUKAN jumlah ticket unik dalam periode itu;
// ticket yang aktif berhari-hari akan ikut kehitung di tiap hari itu.

export const TREND_PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'annual', label: 'Annual' },
];

const MONTH_NAMES_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function formatShortDate(d) {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_NAMES_ID[d.getMonth()]}`;
}

/**
 * Info minggu ISO (Senin sebagai awal minggu, minggu pertama tahun = minggu yang
 * memuat hari Kamis pertama) — dipakai supaya penomoran minggu konsisten dengan
 * kalender pada umumnya, bukan sekadar "hari ke-N dibagi 7".
 */
function isoWeekInfo(date) {
  const day = (date.getDay() + 6) % 7; // Senin=0 ... Minggu=6
  const monday = new Date(date);
  monday.setDate(date.getDate() - day);
  monday.setHours(0, 0, 0, 0);

  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();

  const firstThursday = new Date(isoYear, 0, 1);
  const firstThursdayOffset = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayOffset + 3);

  const weekNumber = 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return { isoYear, weekNumber, monday };
}

/**
 * Tentukan "grup periode" (key unik untuk pengelompokan) + label yang ditampilkan
 * untuk 1 tanggal (format 'YYYY-MM-DD'), sesuai periode yang dipilih user.
 */
function getPeriodBucket(dateKey, period) {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { key: dateKey, label: dateKey };

  if (period === 'weekly') {
    const { isoYear, weekNumber, monday } = isoWeekInfo(d);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      key: `${isoYear}-W${String(weekNumber).padStart(2, '0')}`,
      label: `${formatShortDate(monday)} - ${formatShortDate(sunday)}`,
    };
  }
  if (period === 'monthly') {
    const y = d.getFullYear();
    const m = d.getMonth();
    return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTH_NAMES_ID[m]} ${y}` };
  }
  if (period === 'quarter') {
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
  }
  if (period === 'annual') {
    const y = d.getFullYear();
    return { key: `${y}`, label: `${y}` };
  }
  // 'daily' (default): tiap hari = grupnya sendiri
  return { key: dateKey, label: dateKey };
}

/**
 * Kelompokkan hasil `buildFilteredDailyTrend` (array {date, cellDown, siteDown, total})
 * ke periode Weekly/Monthly/Quarter/Annual, dengan nilai = TOTAL penjumlahan seluruh
 * hari dalam periode itu. Untuk period 'daily', data dikembalikan apa adanya.
 *
 * Catatan: karena data sumbernya snapshot ticket AKTIF per hari (bukan "ticket baru per
 * hari"), 1 ticket yang aktif berhari-hari ikut terhitung di tiap hari itu — jadi angka
 * Weekly/Monthly/dst ini akumulasi snapshot harian, bukan jumlah ticket unik.
 */
export function aggregateTrendByPeriod(dailyData, period) {
  if (!Array.isArray(dailyData) || !dailyData.length || period === 'daily') return dailyData || [];

  const buckets = new Map();
  for (const row of dailyData) {
    const { key, label } = getPeriodBucket(row.date, period);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, cellDown: 0, siteDown: 0, total: 0 };
      buckets.set(key, bucket);
    }
    bucket.cellDown += Number(row.cellDown) || 0;
    bucket.siteDown += Number(row.siteDown) || 0;
    bucket.total += Number(row.total) || 0;
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.key > b.key ? 1 : -1))
    .map((b) => ({ date: b.label, cellDown: b.cellDown, siteDown: b.siteDown, total: b.total }));
}

/**
 * Sama seperti `aggregateTrendByPeriod`, tapi untuk hasil `buildFilteredDailyTrendByRegion`
 * (array {date, [namaRegional]: jumlah, ...}) — nilai per regional juga TOTAL penjumlahan.
 */
export function aggregateTrendByRegionByPeriod(dailyData, regions, period) {
  if (!Array.isArray(dailyData) || !dailyData.length || period === 'daily') return dailyData || [];

  const buckets = new Map();
  for (const row of dailyData) {
    const { key, label } = getPeriodBucket(row.date, period);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, sums: {} };
      for (const reg of regions) bucket.sums[reg] = 0;
      buckets.set(key, bucket);
    }
    for (const reg of regions) bucket.sums[reg] += Number(row[reg]) || 0;
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.key > b.key ? 1 : -1))
    .map((b) => {
      const point = { date: b.label };
      for (const reg of regions) point[reg] = b.sums[reg];
      return point;
    });
}
