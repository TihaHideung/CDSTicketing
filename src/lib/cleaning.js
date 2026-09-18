import {
  MERGE_COLUMNS as C,
  EMS_EXCLUDED_PREFIX,
  bucketDuration,
  isHandledStatus,
  matchesRegionalTag,
  getRegionalTagFromValue,
} from './constants.js';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Aturan pembersihan 1 baris raw dari file Merge (Cell Down + Site Down jadi satu):
 *  1. Buang ticket yang Ticket ID-nya kosong (termasuk baris kosong di ekor sheet)
 *  2. Buang ticket yang Clearance Status-nya "Cleared"
 *  3. Buang ticket yang EMS Name-nya diawali "USO_"
 *
 * CATATAN: aturan "buang ticket di bawah 24 jam" sudah TIDAK dipakai lagi — sekarang
 * semua umur ticket (termasuk yang baru < 24 jam) tetap ditampilkan dan dikategorikan
 * lewat field `duration` (lihat DURATION_BUCKETS di constants.js).
 *
 * `regionalTag` = Sumbagut/Sumbagteng/Sumbagsel yang dipilih user saat upload (bukan
 * dibaca dari kolom "Regional" internal file, karena satu file mewakili satu regional).
 * `siteMasterMap` = Map<siteId, {siteName, cluster, nop, regional, siteClass}> hasil
 * import file Master Site Detail — dipakai untuk lookup Cluster & Site Name yang akurat.
 */
function inferCatAlarm(alarmName, explicitCatAlarm) {
  const explicit = String(explicitCatAlarm ?? '').trim();
  if (explicit === 'CellDown' || explicit === 'SiteDown') return explicit;

  const normalized = String(alarmName ?? '').trim().toLowerCase();
  if (!normalized) return 'SiteDown';
  if (normalized.includes('cell')) return 'CellDown';
  return 'SiteDown';
}

export function validateRegionalRows(rows, regionalTag) {
  const expectedCode = String(regionalTag || '').trim();
  const compatible = [];
  const skipped = [];

  for (const row of rows) {
    const ticketId = String(row?.[C.TICKET_ID] ?? '').trim();
    if (!ticketId) {
      skipped.push(row);
      continue;
    }

    const resolvedRegional = getRegionalTagFromValue(row?.[C.REGIONAL]);
    const isCompatible = regionalTag ? matchesRegionalTag(row?.[C.REGIONAL], regionalTag) : Boolean(resolvedRegional);

    if (isCompatible) {
      compatible.push(row);
    } else {
      skipped.push(row);
    }
  }

  return {
    expectedRegional: expectedCode,
    totalRows: rows.length,
    matchingRows: compatible.length,
    skippedRows: skipped.length,
    compatible,
  };
}

export function cleanMergedRows(rows, regionalTag, now = new Date(), siteMasterMap = new Map()) {
  const cleaned = [];
  let removed = { emptyTicketId: 0, cleared: 0, usoEms: 0 };

  const validation = validateRegionalRows(rows, regionalTag);

  for (const row of validation.compatible) {

    const ticketId = String(row[C.TICKET_ID] ?? '').trim();
    if (!ticketId) {
      removed.emptyTicketId++;
      continue;
    }

    const clearanceStatus = String(row[C.CLEARANCE_STATUS] ?? '').trim().toLowerCase();
    if (clearanceStatus === 'cleared') {
      removed.cleared++;
      continue;
    }

    const emsName = String(row[C.EMS_NAME] ?? '').trim().toUpperCase();
    if (emsName.startsWith(EMS_EXCLUDED_PREFIX)) {
      removed.usoEms++;
      continue;
    }

    const occurredAt = toDate(row[C.LAST_OCCURRED_ON]);
    const ageHours = occurredAt ? (now.getTime() - occurredAt.getTime()) / 36e5 : 0;
    const ageDays = ageHours / 24;

    const alarmName = row[C.ALARM_NAME] ?? '';
    const catAlarm = inferCatAlarm(alarmName, row[C.CAT_ALARM]);

    const siteId = String(row[C.SITE_ID] ?? '').trim();
    const master = siteMasterMap.get(siteId);
    const resolvedRegional = getRegionalTagFromValue(row[C.REGIONAL]) || regionalTag || '';

    cleaned.push({
      ticketId,
      clearanceStatus: row[C.CLEARANCE_STATUS] ?? '',
      lastOccurredOn: occurredAt,
      alarmSource: row[C.ALARM_SOURCE] ?? '',
      siteId,
      siteName: master?.siteName || row[C.ALARM_SOURCE] || '',
      nop: master?.nop || row[C.NOP] || '',
      regional: resolvedRegional,
      regionalCode: row[C.REGIONAL] ?? '',
      cluster: master?.cluster || '',
      emsName: row[C.EMS_NAME] ?? '',
      siteType: row[C.SITE_TYPE] ?? '',
      rcCategory: '',
      siteClass: master?.siteClass || row[C.SITE_CLASS] || 'Unclassified',
      alarmName,
      alarmGroup: row[C.ALARM_GROUP] ?? '',
      remark: row[C.DETAIL_RC] ?? '',
      ageHours,
      ageDays,
      duration: bucketDuration(ageHours),
      catAlarm,
      subType: catAlarm === 'SiteDown' ? alarmName || 'SiteDown' : 'CellDown',
      rc: '',
      rcSub: '',
      pic: '',
      detail: '',
      actionPlan: '',
    });
  }

  return { cleaned, removed };
}

/**
 * Cocokkan (mirip VLOOKUP) ticketId terhadap map tiket SWFM yang sudah ditangani.
 * Tiket yang MATCH dibuang; sisanya (statusnya "#N/A") yang dipertahankan.
 * `swfmInfoMap` dipakai untuk enrichment RC Category OTOMATIS (referensi saja, field
 * `rcCategory` — bukan field manual `rc`/`rcSub` yang memang sengaja dikosongkan).
 */
export function matchAgainstSwfm(cleanedRows, swfmHandledMap, swfmInfoMap = {}) {
  const stillActive = [];
  let removedHandled = 0;

  for (const row of cleanedRows) {
    const status = swfmHandledMap[row.ticketId];
    if (status) {
      removedHandled++;
      continue;
    }

    stillActive.push({
      ...row,
      rcCategory: '',
      rc: '',
      rcSub: '',
      swfmMatchStatus: '#N/A',
    });
  }

  return { stillActive, removedHandled };
}

export { isHandledStatus };

/**
 * Site Down tidak boleh punya Site ID duplikat (mis. Heartbeat Failure & NE Is
 * Disconnected sama-sama nyala untuk site yang sama, atau site yang sama masih
 * aktif di beberapa hari upload berturut-turut). Kalau ada duplikat, gabung jadi
 * satu baris: pertahankan yang paling lama aktif (Aging Hour terbesar — paling
 * kritis/prioritas), gabungkan label sub type-nya, dan simpan daftar Ticket ID yang
 * ter-merge (untuk transparansi kalau perlu ditelusuri).
 * Cell Down TIDAK di-dedup dengan cara ini karena satu site bisa punya beberapa sel
 * yang down bersamaan secara sah (masing-masing Ticket ID berbeda = trouble berbeda).
 */
export function dedupeSiteDownBySiteId(rows) {
  const cellDownRows = rows.filter((r) => r.catAlarm === 'CellDown');
  const siteDownRows = rows.filter((r) => r.catAlarm === 'SiteDown');

  const bySite = new Map();
  for (const r of siteDownRows) {
    const key = r.siteId || r.ticketId;
    if (!bySite.has(key)) {
      bySite.set(key, { ...r, mergedTicketIds: [r.ticketId], subTypes: new Set([r.subType]) });
      continue;
    }
    const existing = bySite.get(key);
    existing.mergedTicketIds.push(r.ticketId);
    existing.subTypes.add(r.subType);
    if (r.ageHours > existing.ageHours) {
      // baris baru lebih lama aktif -> jadikan representative, tapi bawa histori merge-nya
      const merged = { ...r, mergedTicketIds: existing.mergedTicketIds, subTypes: existing.subTypes };
      bySite.set(key, merged);
    }
  }

  const dedupedSiteDown = Array.from(bySite.values()).map((r) => ({
    ...r,
    subType: Array.from(r.subTypes).join(' + '),
  }));

  return [...cellDownRows, ...dedupedSiteDown];
}
