import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';

/*
 * Report Cell Down (PPTX) — pengganti export PDF.
 * Tampilan mengikuti slide "Tracking & Performance | CELL DOWN & SITE DOWN AREA1" pada
 * template VSWR / Cell Down / EAS Weekly, tetapi hanya bagian Cell Down:
 *
 *   Baris atas : Site Class | Area Contributor | RC Cat - Cell Down | Cell Down - Aging Category
 *   Banner     : "Trend CELL DOWN - Area 1"
 *   Baris bawah: Day to Day Trend Area-1 | Reg-01 | Reg-10 | Reg-02  (bar + garis Total)
 *
 * File ini terbagi dua:
 *   - buildCellDownReportPptx(data)  : murni menyusun slide dari data siap pakai (bisa diuji di Node)
 *   - exportReportPpt(args)          : menyiapkan data dari summary + trendLog, lalu mengunduh file
 */

const FONT = 'Poppins';
const BANNER_FONT = 'Arial';

const C = {
  titleRed: 'FF0000',
  titleBlue: '002060',
  titleInk: '222222',
  panelLine: 'D9D9D9',
  ink: '404040',
  muted: '7F7F7F',
  banner: 'C00000',
  total: '1F3864',
  rcBar: 'F2546D',
  rcLine: 'C00000',
  grid: 'E7E7E7',
};

const SITE_CLASS_COLORS = {
  Platinum: '9AA5B1',
  Gold: 'D4AF37',
  Silver: 'C0C0C0',
  Bronze: 'A76C3F',
  Unclassified: '64748B',
};
const AGING_COLORS = ['FFC000', 'FFFF00', '7F0000']; // 1-3 Hari, 3-7 Hari, >7 Hari
const SERIES_COLORS = ['F4A582', '5BC0EB', '1F77B4', '111111', '2CA02C', '7F7F7F', 'FFC000', '7030A0', 'E15759', '76B7B2'];

// Kode regional pada judul trend (sama dengan template: Reg - 01 / 10 / 02).
export const REGION_CODE = { Sumbagut: '01', Sumbagteng: '10', Sumbagsel: '02' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));

export function dayLabel(dateKey) {
  const [, m, d] = String(dateKey).slice(0, 10).split('-');
  return `${Number(d)}-${MONTHS[Number(m) - 1] || m}`;
}

// ---------------------------------------------------------------- slide parts

function panel(slide, x, y, w, h, name) {
  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: 'FFFFFF' },
    line: { color: C.panelLine, width: 0.75 },
    objectName: name,
  });
}

function panelTitle(slide, text, x, y, w, size = 10) {
  slide.addText(text, {
    x, y, w, h: 0.26, margin: 0,
    fontFace: FONT, fontSize: size, bold: true, color: C.ink, align: 'center', valign: 'middle',
    isTextBox: true, objectName: `Judul ${text}`,
  });
}

function noData(slide, x, y, w, h) {
  slide.addText('Tidak ada data Cell Down', {
    x, y, w, h, margin: 0,
    fontFace: FONT, fontSize: 9, italic: true, color: C.muted, align: 'center', valign: 'middle',
    isTextBox: true, objectName: 'Tidak ada data',
  });
}

const axisText = (size = 8) => ({
  catAxisLabelFontFace: FONT,
  catAxisLabelFontSize: size,
  catAxisLabelColor: C.ink,
  valAxisLabelFontFace: FONT,
  valAxisLabelFontSize: size,
  valAxisLabelColor: C.muted,
});

// ---------------------------------------------------------------- snapshot charts

function addSiteClass(pptx, slide, summary, box) {
  const items = (summary.siteClass || []).filter((d) => d.cellDown > 0);
  panel(slide, box.x, box.y, box.w, box.h, 'Panel Site Class');
  panelTitle(slide, 'Site Class', box.x, box.y + 0.05, box.w);
  if (!items.length) return noData(slide, box.x, box.y + 0.3, box.w, box.h - 0.35);
  slide.addChart(
    pptx.ChartType.pie,
    [{ name: 'Site Class', labels: items.map((d) => d.siteClass), values: items.map((d) => d.cellDown) }],
    {
      x: box.x + 0.05, y: box.y + 0.3, w: box.w - 0.1, h: box.h - 0.35,
      chartColors: items.map((d) => SITE_CLASS_COLORS[d.siteClass] || '64748B'),
      showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 8, legendColor: C.ink,
      showValue: true, showPercent: false, showLabel: false,
      dataLabelPosition: 'inEnd', dataLabelFontFace: FONT, dataLabelFontSize: 8, dataLabelColor: '000000',
      dataBorder: { pt: 0.75, color: 'FFFFFF' },
      showTitle: false,
    }
  );
}

function addAreaContributor(pptx, slide, summary, box) {
  const items = (summary.areaContributor || [])
    .filter((d) => d.cellDown > 0)
    .sort((a, b) => b.cellDown - a.cellDown);
  panel(slide, box.x, box.y, box.w, box.h, 'Panel Area Contributor');
  panelTitle(slide, 'Area Contributor - Cell Down', box.x, box.y + 0.05, box.w);
  if (!items.length) return noData(slide, box.x, box.y + 0.3, box.w, box.h - 0.35);
  slide.addChart(
    pptx.ChartType.bar,
    [{ name: 'Cell Down', labels: items.map((d) => d.regional), values: items.map((d) => d.cellDown) }],
    {
      x: box.x + 0.05, y: box.y + 0.3, w: box.w - 0.1, h: box.h - 0.35,
      barDir: 'bar', barGapWidthPct: 45,
      catAxisOrientation: 'maxMin',
      chartColors: [C.rcBar],
      showLegend: false, showTitle: false,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: FONT, dataLabelFontSize: 8, dataLabelColor: C.ink,
      valAxisHidden: true, valAxisMinVal: 0,
      valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      catAxisLineShow: true, catAxisLineColor: C.panelLine,
      ...axisText(8),
    }
  );
}

function addRcCategory(pptx, slide, summary, box) {
  const items = (summary.rcCategoryCellDownByDuration || []).slice(0, 10);
  panel(slide, box.x, box.y, box.w, box.h, 'Panel RC Cat');
  panelTitle(slide, 'RC Cat - Cell Down', box.x, box.y + 0.05, box.w);
  if (!items.length) return noData(slide, box.x, box.y + 0.3, box.w, box.h - 0.35);
  slide.addChart(
    pptx.ChartType.bar,
    [{ name: 'Cell Down', labels: items.map((d) => d.rcCategory), values: items.map((d) => d.total) }],
    {
      x: box.x + 0.05, y: box.y + 0.3, w: box.w - 0.1, h: box.h - 0.35,
      barDir: 'bar', barGapWidthPct: 35,
      catAxisOrientation: 'maxMin',
      chartColors: [C.rcBar],
      showLegend: false, showTitle: false,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: FONT, dataLabelFontSize: 8, dataLabelColor: C.ink,
      valAxisHidden: true, valAxisMinVal: 0,
      valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      catAxisLineShow: true, catAxisLineColor: C.panelLine,
      ...axisText(8),
    }
  );
}

function addAging(pptx, slide, summary, box) {
  const order = (summary.areaContributor || []).map((d) => d.regional);
  const rows = (summary.durationCellDownByRegional || [])
    .slice()
    .sort((a, b) => order.indexOf(a.regional) - order.indexOf(b.regional));
  const hasData = rows.some((r) => (r['1-3 Days'] || 0) + (r['3-7 Days'] || 0) + (r['>7 Days'] || 0) > 0);
  panel(slide, box.x, box.y, box.w, box.h, 'Panel Aging');
  panelTitle(slide, 'Cell Down - Aging Category', box.x, box.y + 0.05, box.w);
  if (!hasData) return noData(slide, box.x, box.y + 0.3, box.w, box.h - 0.35);
  const labels = rows.map((r) => r.regional);
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: '1-3 Hari', labels, values: rows.map((r) => r['1-3 Days'] || 0) },
      { name: '3-7 Hari', labels, values: rows.map((r) => r['3-7 Days'] || 0) },
      { name: '>7 Hari', labels, values: rows.map((r) => r['>7 Days'] || 0) },
    ],
    {
      x: box.x + 0.05, y: box.y + 0.3, w: box.w - 0.1, h: box.h - 0.35,
      barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 40,
      chartColors: AGING_COLORS,
      showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 8, legendColor: C.ink,
      showTitle: false,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: FONT, dataLabelFontSize: 8, dataLabelColor: C.ink,
      valAxisHidden: true, valAxisMinVal: 0,
      valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      catAxisLineShow: true, catAxisLineColor: C.panelLine,
      ...axisText(8),
    }
  );
}

// ---------------------------------------------------------------- trend charts

/**
 * trend = { title, labels: ['1-Aug', ...], series: [{ name, values }], total: [..] }
 * Bar clustered per series + garis Total (label nilai di atas titik).
 */
function addTrend(pptx, slide, trend, box) {
  panel(slide, box.x, box.y, box.w, box.h, `Panel ${trend.title}`);
  panelTitle(slide, trend.title, box.x, box.y + 0.03, box.w, 9);
  const hasData = trend.labels.length > 0 && trend.total.some((v) => v > 0);
  if (!hasData) return noData(slide, box.x, box.y + 0.3, box.w, box.h - 0.35);

  const { labels } = trend;
  const barSeries = trend.series.map((s) => ({ name: s.name, labels, values: s.values }));
  const colors = barSeries.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]);
  const max = Math.max(...trend.total, 1);

  slide.addChart(
    [
      {
        type: pptx.ChartType.bar,
        data: barSeries,
        options: { barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 30, chartColors: colors },
      },
      {
        type: pptx.ChartType.line,
        data: [{ name: 'Total', labels, values: trend.total }],
        options: {
          chartColors: [C.total],
          lineSize: 1.5,
          lineDataSymbol: 'circle',
          lineDataSymbolSize: 4,
          showValue: true,
          dataLabelPosition: 't',
          dataLabelFontFace: FONT,
          dataLabelFontSize: 7,
          dataLabelColor: C.total,
          dataLabelFormatCode: '#,##0',
        },
      },
    ],
    {
      x: box.x + 0.03, y: box.y + 0.27, w: box.w - 0.06, h: box.h - 0.3,
      showTitle: false,
      showLegend: true, legendPos: 'r', legendFontFace: FONT, legendFontSize: 7, legendColor: C.ink,
      valAxisMinVal: 0,
      valAxisMaxVal: Math.ceil((max * 1.18) / 10) * 10,
      valGridLine: { color: C.grid, size: 0.5 },
      catGridLine: { style: 'none' },
      catAxisLabelRotate: 270,
      catAxisLabelFrequency: 1,
      catAxisLineColor: C.panelLine,
      ...axisText(7),
    }
  );
}

// ---------------------------------------------------------------- main builder

/**
 * data = {
 *   summary,                       // computeSummary() — dipakai field Cell Down saja
 *   trendArea:   { labels, series: [{name, values}], total },
 *   trendRegions:[{ name, labels, series, total }],   // urut: Sumbagut, Sumbagteng, Sumbagsel
 *   subtitle,                      // teks kecil di bawah judul (minggu, filter)
 *   logoData,                      // data URL logo (opsional)
 * }
 */
export async function buildCellDownReportPptx({ summary, trendArea, trendRegions, subtitle = '', logoData }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.subject = 'Report Cell Down Area 1';
  pptx.title = 'Report Cell Down Area 1';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: 'id-ID' };

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Judul + logo
  slide.addText(
    [
      { text: 'Tracking & Performance ', options: { color: C.titleRed } },
      { text: '| ', options: { color: C.titleBlue } },
      { text: 'CELL DOWN AREA1', options: { color: C.titleInk } },
    ],
    {
      x: 0.26, y: 0.1, w: 9.5, h: 0.4, margin: 0,
      fontFace: FONT, fontSize: 20, bold: true, valign: 'middle',
      isTextBox: true, objectName: 'Judul',
    }
  );
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.26, y: 0.47, w: 10.6, h: 0.18, margin: 0,
      fontFace: FONT, fontSize: 7.5, color: C.muted, valign: 'middle', fit: 'shrink',
      isTextBox: true, objectName: 'Subjudul',
    });
  }
  if (logoData) slide.addImage({ data: logoData, x: 11.09, y: 0.05, w: 2.12, h: 0.45, objectName: 'Logo' });

  // Baris atas: 4 panel snapshot
  const top = { y: 0.7, h: 2.62 };
  const gap = 0.1;
  const widths = [2.8, 2.9, 3.9, 3.0];
  let x = 0.25;
  const boxes = widths.map((w) => {
    const box = { x, y: top.y, w, h: top.h };
    x += w + gap;
    return box;
  });
  addSiteClass(pptx, slide, summary, boxes[0]);
  addAreaContributor(pptx, slide, summary, boxes[1]);
  addRcCategory(pptx, slide, summary, boxes[2]);
  addAging(pptx, slide, summary, boxes[3]);

  // Banner
  slide.addText('Trend CELL DOWN - Area 1', {
    x: 0.25, y: 3.4, w: 12.97, h: 0.3, margin: 0,
    shape: 'rect', fill: { color: 'FFFFFF' }, line: { color: '000000', width: 1 },
    fontFace: BANNER_FONT, fontSize: 12, bold: true, color: C.banner, align: 'center', valign: 'middle',
    isTextBox: true, objectName: 'Banner Trend',
  });

  // Baris bawah: 2 x 2 trend
  const tw = 6.43;
  const th = 1.78;
  const xs = [0.25, 0.25 + tw + 0.11];
  const ys = [3.78, 3.78 + th + 0.06];
  const trends = [trendArea, ...(trendRegions || [])];
  trends.slice(0, 4).forEach((trend, i) => {
    addTrend(pptx, slide, trend, { x: xs[i % 2], y: ys[Math.floor(i / 2)], w: tw, h: th });
  });

  return verticalAxisLabels(await pptx.write({ outputType: 'arraybuffer' }));
}

// pptxgenjs menulis rotasi 270 sebagai rot="16200000"; LibreOffice menampilkannya miring.
// Format -5400000 (vertikal) tampil sama di PowerPoint maupun LibreOffice.
async function verticalAxisLabels(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const charts = zip.file(/^ppt\/charts\/chart\d+\.xml$/);
  for (const file of charts) {
    const xml = await file.async('string');
    zip.file(file.name, xml.replaceAll('<a:bodyPr rot="16200000"/>', '<a:bodyPr rot="-5400000" vert="horz"/>'));
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------- data preparation (browser)

const addDays = (dateKey, n) => {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Susun data trend 28 hari (4 minggu) yang berakhir di Kamis pada minggu yang dipilih.
 * `fns` = { buildByRegion, buildByNop } dari aggregate.js (diinjeksi supaya modul ini mudah diuji).
 */
export function prepareTrendData({ trendLog, criteria, weekKey, regions, windowDays = 28, fns }) {
  const endKey = addDays(weekKey, 6);
  const startKey = addDays(endKey, -(windowDays - 1));
  const inWindow = (d) => {
    const k = String(d.date).slice(0, 10);
    return k >= startKey && k <= endKey;
  };
  const base = { ...criteria, category: 'CellDown' };

  const byRegion = fns.buildByRegion(trendLog, regions, base).filter(inWindow);
  const trendArea = {
    title: 'Day to Day Trend Area - 1',
    labels: byRegion.map((r) => dayLabel(r.date)),
    series: regions.map((name) => ({ name, values: byRegion.map((r) => Number(r[name]) || 0) })),
    total: byRegion.map((r) => regions.reduce((s, name) => s + (Number(r[name]) || 0), 0)),
  };

  const trendRegions = regions.map((region) => {
    const res = fns.buildByNop(trendLog, { ...base, regionalFilter: region });
    const rows = res.rows.filter(inWindow);
    const nops = res.nops.filter((nop) => rows.some((r) => (r.byNop?.[nop] || 0) > 0));
    return {
      name: region,
      title: `Day to Day Trend Reg - ${REGION_CODE[region] || region}`,
      labels: rows.map((r) => dayLabel(r.date)),
      series: nops.map((nop) => ({ name: nop, values: rows.map((r) => Number(r.byNop?.[nop]) || 0) })),
      total: rows.map((r) => Number(r.total) || 0),
    };
  });

  return { trendArea, trendRegions, startKey, endKey };
}

async function loadLogoDataUrl() {
  try {
    const { default: url } = await import('../assets/header-logos.png');
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // logo opsional
  }
}

/**
 * Dipanggil dari Dashboard.
 *   summary    : computeSummary() Dashboard (snapshot tiket aktif saat ini)
 *   trendLog   : log trend harian
 *   criteria   : trendCriteria Dashboard (filter aktif)
 *   weekKey    : key minggu (hari Jumat) dari dropdown "Minggu"
 *   weekLabel  : teks minggu untuk subjudul
 */
export async function exportReportPpt({ summary, trendLog, criteria = {}, weekKey, weekLabel = '', filterText = '', fileName }) {
  const { REGIONS } = await import('./constants.js');
  const { buildFilteredDailyTrendByRegion, buildFilteredDailyTrendByNop } = await import('./aggregate.js');

  const { trendArea, trendRegions, startKey, endKey } = prepareTrendData({
    trendLog,
    criteria,
    weekKey,
    regions: REGIONS,
    fns: { buildByRegion: buildFilteredDailyTrendByRegion, buildByNop: buildFilteredDailyTrendByNop },
  });
  if (!trendArea.labels.length) throw new Error('Tidak ada data Cell Down pada minggu yang dipilih.');

  const subtitle = [weekLabel, `Trend harian ${dayLabel(startKey)} s.d. ${dayLabel(endKey)}`, filterText].filter(Boolean).join('  |  ');
  const logoData = await loadLogoDataUrl();
  const buffer = await buildCellDownReportPptx({ summary, trendArea, trendRegions, subtitle, logoData });

  const outputName = fileName || `CDS_Monitoring_Report_Cell_Down_${weekKey}.pptx`;
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
