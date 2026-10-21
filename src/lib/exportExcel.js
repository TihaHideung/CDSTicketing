import * as XLSX from 'xlsx';
import { DURATION_BUCKETS, REGIONS, getRegionalCodeForTag, getRegionalTagFromValue } from './constants.js';

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function buildRawSheet(rows) {
  const data = rows.map((r) => ({
    'Upload Date': r.uploadDate || '',
    'Ticket ID': r.ticketId,
    'Cat Alarm': r.catAlarm,
    'Sub Type': r.subType,
    Regional: r.regional,
    NOP: r.nop,
    Cluster: r.cluster,
    'Site ID': r.siteId,
    'Site Name': r.siteName,
    'Site Class': r.siteClass,
    'Alarm Name': r.alarmName,
    'RC Category': r.rc,
    'RC Subcategory': r.rcSub,
    PIC: r.pic,
    Detail: r.detail,
    'Action Plan': r.actionPlan,
    'Last Occurred On': fmtDate(r.lastOccurredOn),
    'Aging (Jam)': Math.round(r.ageHours * 10) / 10,
    Duration: r.duration,
    'Clearance Status': r.clearanceStatus,
    'EMS Name': r.emsName,
  }));
  return XLSX.utils.json_to_sheet(data);
}

function getDateKeys(from, to, rows) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : '';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : '';
  if (start && end && start <= end) {
    const dates = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
  return [...new Set(rows.map((row) => String(row.uploadDate || '').slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
}

function formatDayHeader(dateKey) {
  const [, month, day] = dateKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)}-${months[Number(month) - 1]}`;
}

function buildDailyNopSheet(rows, dateFrom, dateTo) {
  const dates = getDateKeys(dateFrom, dateTo, rows);
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const regionalGroups = new Map();

  for (const row of rows) {
    const regionalTag = getRegionalTagFromValue(row.regional) || String(row.regional || 'UNKNOWN');
    const regional = getRegionalCodeForTag(regionalTag) || regionalTag;
    if (!regionalGroups.has(regional)) regionalGroups.set(regional, new Map());
    const nops = regionalGroups.get(regional);
    const nop = String(row.nop || 'UNKNOWN').trim();
    if (!nops.has(nop)) {
      nops.set(nop, {
        CellDown: Array(dates.length).fill(0),
        SiteDown: Array(dates.length).fill(0),
      });
    }

    const date = String(row.uploadDate || '').slice(0, 10);
    const index = dateIndex.get(date);
    if (index !== undefined && nops.get(nop)[row.catAlarm]) nops.get(nop)[row.catAlarm][index]++;
  }

  const regionalOrder = (regional) => {
    const tag = getRegionalTagFromValue(regional);
    const index = REGIONS.indexOf(tag);
    return index === -1 ? REGIONS.length : index;
  };
  const aoa = [];
  for (const [category, title] of [['CellDown', 'CELL DOWN - TIKET PER NOP PER HARI'], ['SiteDown', 'SITE DOWN - TIKET PER NOP PER HARI']]) {
    aoa.push([title]);
    aoa.push(['Regional', 'NOP', ...dates.map(formatDayHeader), 'Total']);
    const grandTotal = Array(dates.length).fill(0);

    const sortedRegions = [...regionalGroups.keys()].sort((a, b) => regionalOrder(a) - regionalOrder(b) || a.localeCompare(b));
    for (const regional of sortedRegions) {
      const nops = regionalGroups.get(regional);
      const regionalTotal = Array(dates.length).fill(0);
      const entries = [...nops.entries()].sort(([a], [b]) => a.localeCompare(b, 'id'));
      for (const [nop, countsByCategory] of entries) {
        const counts = countsByCategory[category];
        counts.forEach((count, index) => {
          regionalTotal[index] += count;
          grandTotal[index] += count;
        });
        aoa.push([regional, nop, ...counts, counts.reduce((sum, count) => sum + count, 0)]);
      }
      aoa.push([regional, 'Total', ...regionalTotal, regionalTotal.reduce((sum, count) => sum + count, 0)]);
    }

    aoa.push(['Grand Total', '', ...grandTotal, grandTotal.reduce((sum, count) => sum + count, 0)]);
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, ...dates.map(() => ({ wch: 12 })), { wch: 12 }];
  return ws;
}

function buildPivotSheet(summary) {
  const aoa = [];
  const push = (row) => aoa.push(row);

  push(['ALL TICKET CELL DOWN & SITE DOWN']);
  push(['Kategori', 'Jumlah']);
  push(['CellDown', summary.overview.cellDown]);
  push(['SiteDown', summary.overview.siteDown]);
  push(['Grand Total', summary.overview.total]);
  push([]);

  push(['SITE CLASS DISTRIBUTION']);
  push(['Regional', 'CellDown', 'SiteDown', 'Total', '% CellDown', '% SiteDown']);
  summary.areaContributor.forEach((a) => {
    push([a.regional, a.cellDown, a.siteDown, a.total, a.pctCellDown, a.pctSiteDown]);
  });
  push(['Grand Total', summary.overview.cellDown, summary.overview.siteDown, summary.overview.total]);
  push([]);

  push(['SITE CLASS']);
  push(['Site Class', 'CellDown', 'SiteDown', 'Total']);
  summary.siteClass.forEach((s) => push([s.siteClass, s.cellDown, s.siteDown, s.total]));
  push([]);

  push(['DURATION (OVERALL)']);
  push(['Duration', 'CellDown', 'SiteDown', 'Total']);
  summary.durationOverall.forEach((a) => push([a.duration, a.cellDown, a.siteDown, a.total]));
  push([]);

  push(['DURATION - CELL DOWN (per Regional)']);
  push(['Regional', ...DURATION_BUCKETS]);
  summary.durationCellDownByRegional.forEach((a) => push([a.regional, ...DURATION_BUCKETS.map((b) => a[b])]));
  push([]);

  push(['DURATION - SITE DOWN (per Regional)']);
  push(['Regional', ...DURATION_BUCKETS]);
  summary.durationSiteDownByRegional.forEach((a) => push([a.regional, ...DURATION_BUCKETS.map((b) => a[b])]));
  push([]);

  push(['RC CATEGORY - CELL DOWN (tidak termasuk yang belum diisi)']);
  push(['RC Category', 'Jumlah']);
  summary.rcCategoryCellDown.forEach((r) => push([r.rcCategory, r.count]));
  push(['Belum diisi', summary.rcCategoryCellDownUnderReview]);
  push([]);

  push(['RC CATEGORY - SITE DOWN (tidak termasuk yang belum diisi)']);
  push(['RC Category', 'Jumlah']);
  summary.rcCategorySiteDown.forEach((r) => push([r.rcCategory, r.count]));
  push(['Belum diisi', summary.rcCategorySiteDownUnderReview]);
  push([]);

  push(['SITE DOWN - SUB TYPE (Heartbeat Drop vs NE Is Disconnected)']);
  push(['Sub Type', 'Jumlah']);
  summary.siteDownSubType.forEach((s) => push([s.subType, s.count]));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  return ws;
}

export function exportWorkbook({ cleanRows, summary, fileName, uploadDateFrom, uploadDateTo }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildRawSheet(cleanRows), 'RAW_Clean');
  XLSX.utils.book_append_sheet(wb, buildPivotSheet(summary), 'Pivot_Summary');
  XLSX.utils.book_append_sheet(wb, buildDailyNopSheet(cleanRows, uploadDateFrom, uploadDateTo), 'Daily_By_NOP');
  const name = fileName || `CDS_Monitoring_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
