import { SITE_CLASS_ORDER, DURATION_BUCKETS, RC_UNDER_REVIEW } from './constants.js';

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
