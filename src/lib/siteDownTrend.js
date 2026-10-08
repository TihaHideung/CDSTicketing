import { SOURCE_NOIM, SOURCE_BOTH, SOURCE_NOT_BOTH } from './constants.js';
import { noimToViewRows, normalizeSiteId } from './noim.js';

/**
 * Susun log trend Site Down per tanggal untuk Sumber Data NOIM / IRISAN / TIDAK IRISAN,
 * dengan bentuk yang SAMA dengan `daily_trend` INAP: [{ date, breakdown: [{ regional, nop,
 * cluster, catAlarm, duration, rc, rcSub, count }] }]. Dengan begitu `buildFilteredDailyTrend`
 * dan `TrendChart` yang sudah ada dipakai apa adanya, dan filter NOP/Cluster/Duration/RC
 * ikut jalan seperti trend INAP.
 *
 * `dailySets` = hasil /api/site-down/daily-sets: [{ date, noim: [...], inap: [...] }].
 * Definisi (per tanggal, dibandingkan lewat Site ID):
 *  - NOIM        : semua site NOIM
 *  - IRISAN      : site INAP yang Site ID-nya juga ada di NOIM (data yang dihitung = data INAP)
 *  - TIDAK IRISAN: site INAP yang tidak ada di NOIM + site NOIM yang tidak ada di INAP
 * Untuk IRISAN & TIDAK IRISAN, tanggal yang belum punya data INAP dilewati (kalau tidak,
 * irisannya 0 dan "tidak irisan" = semua NOIM, padahal itu bukan angka sebenarnya).
 * Return: { log, skippedDates }.
 */
export function buildSourceTrendLog(dailySets, source) {
  const log = [];
  const skippedDates = [];

  for (const day of dailySets || []) {
    const noimView = noimToViewRows(day.noim);
    const noimViewById = new Map(noimView.map((r) => [normalizeSiteId(r.siteId), r]));
    const noimIds = new Set((day.noim || []).map((r) => normalizeSiteId(r.siteId)).filter(Boolean));

    // INAP: 1 baris per Site ID (Site Down unik).
    const inapById = new Map();
    for (const r of day.inap || []) {
      const id = normalizeSiteId(r.siteId);
      if (id && !inapById.has(id)) inapById.set(id, r);
    }

    let rows;
    if (source === SOURCE_NOIM) {
      rows = noimView;
    } else {
      if (inapById.size === 0) {
        skippedDates.push(day.date);
        continue;
      }
      const inapRows = Array.from(inapById.entries());
      if (source === SOURCE_BOTH) {
        rows = inapRows.filter(([id]) => noimIds.has(id)).map(([, r]) => r);
      } else if (source === SOURCE_NOT_BOTH) {
        rows = [
          ...inapRows.filter(([id]) => !noimIds.has(id)).map(([, r]) => r),
          ...Array.from(noimViewById.entries()).filter(([id]) => !inapById.has(id)).map(([, r]) => r),
        ];
      } else {
        rows = [];
      }
    }

    const map = new Map();
    for (const r of rows) {
      const item = {
        regional: r.regional || 'UNKNOWN',
        nop: r.nop || '',
        cluster: r.cluster || '',
        catAlarm: 'SiteDown',
        duration: r.duration || '',
        rc: r.rc || '',
        rcSub: r.rcSub || '',
      };
      const k = Object.values(item).join('|');
      const existing = map.get(k);
      if (existing) existing.count += 1;
      else map.set(k, { ...item, count: 1 });
    }
    log.push({ date: day.date, complete: true, breakdown: Array.from(map.values()) });
  }

  return { log, skippedDates };
}
