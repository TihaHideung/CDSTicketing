import * as XLSX from 'xlsx';
import { DURATION_BUCKETS } from './constants.js';

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function buildRawSheet(rows) {
  const data = rows.map((r) => ({
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

function buildSiteSheet(groupedBySite) {
  const data = groupedBySite.map((g) => ({
    'Site ID': g.siteId,
    Regional: g.regional,
    NOP: g.nop,
    'Site Class': g.siteClass,
    'Cell Down (kali)': g.cellDownCount,
    'Site Down (kali)': g.siteDownCount,
  }));
  return XLSX.utils.json_to_sheet(data);
}

function buildTrendSheet(dailyTrend) {
  const data = dailyTrend.map((h) => ({
    Tanggal: h.date,
    CellDown: h.cellDown,
    SiteDown: h.siteDown,
    Total: h.total,
  }));
  return XLSX.utils.json_to_sheet(data);
}

export function exportWorkbook({ cleanRows, summary, groupedBySite, dailyTrend, fileName }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildRawSheet(cleanRows), 'RAW_Clean');
  XLSX.utils.book_append_sheet(wb, buildPivotSheet(summary), 'Pivot_Summary');
  if (groupedBySite && groupedBySite.length) {
    XLSX.utils.book_append_sheet(wb, buildSiteSheet(groupedBySite), 'Per_Site_ID');
  }
  if (dailyTrend && dailyTrend.length) {
    XLSX.utils.book_append_sheet(wb, buildTrendSheet(dailyTrend), 'Trend_Harian');
  }
  const name = fileName || `CDS_Monitoring_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
