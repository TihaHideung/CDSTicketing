import {
  NOIM_DURATION_MAP,
  DURATION_BUCKETS,
  bucketDuration,
  getRegionalTagFromValue,
  getRegionalCodeForTag,
} from './constants.js';

// Site ID dibandingkan dalam bentuk dinormalisasi (trim + huruf besar) supaya
// "pms352" di satu sumber tetap nyambung dengan "PMS352" di sumber lain.
export function normalizeSiteId(value) {
  return String(value ?? '').trim().toUpperCase();
}

const RC_CANON = { power: 'Power', transmisi: 'Transmisi', radio: 'Radio' };

/**
 * RC NOIM (kolom "RC Category Validasi") penulisannya tidak seragam (POWER / Power /
 * power, dll) dan punya nilai di luar struktur RC dashboard (Dismantle, Lain - lain, UP,
 * USO). Dipetakan ke struktur RC dashboard: Power/Transmisi/Radio dinormalisasi
 * huruf besar-kecilnya, sisanya masuk "Others". Khusus "Dismantle" juga diisi sebagai
 * RC Subcategory karena memang ada di struktur Others.
 */
function mapNoimRc(validasi) {
  const key = String(validasi ?? '').trim().toLowerCase();
  if (!key) return { rc: '', rcSub: '' };
  if (RC_CANON[key]) return { rc: RC_CANON[key], rcSub: '' };
  if (key === 'dismantle') return { rc: 'Others', rcSub: 'Dismantle' };
  return { rc: 'Others', rcSub: '' };
}

function mapNoimDuration(rawDuration, ageHours) {
  const key = String(rawDuration ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const mapped = NOIM_DURATION_MAP[key];
  if (mapped && DURATION_BUCKETS.includes(mapped)) return mapped;
  return ageHours != null ? bucketDuration(ageHours) : '';
}

/**
 * Ubah baris NOIM dari database ke bentuk baris dashboard (sama seperti ticket INAP),
 * supaya KPI, chart, dan tabel dashboard bisa dipakai apa adanya. Hanya baris dengan
 * Regional yang dikenali dashboard (Regional 1 / 2 / 10) yang dimasukkan — sama seperti
 * data INAP yang memang hanya mencakup 3 regional itu. Baris ini read-only (bukan ticket
 * yang bisa diedit), ditandai `_source: 'NOIM'`.
 */
export function noimToViewRows(noimRows) {
  const out = [];
  for (const r of noimRows || []) {
    const regionalTag = getRegionalTagFromValue(r.regional);
    if (!regionalTag) continue;

    const start = r.startTime ? new Date(r.startTime) : null;
    const bc = r.bcTime ? new Date(r.bcTime) : null;
    const ageHours =
      start && bc && !Number.isNaN(start.getTime()) && !Number.isNaN(bc.getTime())
        ? Math.max(0, (bc.getTime() - start.getTime()) / 3600000)
        : null;
    const { rc, rcSub } = mapNoimRc(r.rcCategoryValidasi);

    out.push({
      _key: `NOIM::${r.siteId}`,
      _source: 'NOIM',
      ticketId: r.ticket || '',
      catAlarm: 'SiteDown',
      subType: 'SiteDown',
      siteId: r.siteId,
      siteName: r.siteName || '',
      nop: r.nop || '',
      cluster: r.cluster || '',
      regional: regionalTag,
      regionalCode: getRegionalCodeForTag(regionalTag),
      siteClass: r.siteClass || '',
      siteType: '',
      alarmName: r.validasiRc || '',
      alarmGroup: '',
      emsName: '',
      clearanceStatus: '',
      rc,
      rcSub,
      pic: r.responsibleParty && r.responsibleParty !== '-' ? r.responsibleParty : '',
      detail: r.remark || '',
      actionPlan: '',
      lastOccurredOn: r.startTime,
      ageHours,
      ageDays: ageHours != null ? ageHours / 24 : null,
      duration: mapNoimDuration(r.duration, ageHours),
    });
  }
  return out;
}

export function buildNoimSiteSet(noimRows) {
  return new Set((noimRows || []).map((r) => normalizeSiteId(r.siteId)).filter(Boolean));
}

/**
 * Hitungan perbandingan (tidak terpengaruh filter lain): jumlah site down unik di INAP,
 * di NOIM, dan yang beririsan.
 */
export function computeSourceStats(inapRows, noimRows) {
  const noimSet = buildNoimSiteSet(noimRows);
  const inapSet = new Set();
  for (const r of inapRows || []) {
    if (r.catAlarm !== 'SiteDown') continue;
    const id = normalizeSiteId(r.siteId);
    if (id) inapSet.add(id);
  }
  let both = 0;
  for (const id of inapSet) if (noimSet.has(id)) both++;
  const bcTime = (noimRows || []).find((r) => r.bcTime)?.bcTime || null;
  return { inap: inapSet.size, noim: noimSet.size, both, notBoth: inapSet.size + noimSet.size - 2 * both, bcTime, inapSet };
}
