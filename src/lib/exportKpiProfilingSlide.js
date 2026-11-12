import pptxgen from 'pptxgenjs';
import {
  KPI_TYPES,
  KPI_CATEGORIES,
  KPI_CATEGORY_COLORS,
  buildKpiDistribution,
  monthLabel,
} from './kpiCategory.js';

/*
 * Slide "Profiling KPI" = Rekap Distribusi Kategori KPI SON L1 dan SOMSA L0 (dua grafik batang
 * bertumpuk di bagian bawah slide 1 PPT Huddle). Bagian atas (tabel skor) sengaja dikosongkan.
 * Posisi & ukuran dua grafik + kotak judulnya disamakan dengan PPT Huddle Week 42.
 *
 * Tiap batang = satu Regional (R01, R02, R10) pada satu bulan; isinya jumlah NOP per kategori (Kurang, Cukup,
 * Baik, Baik Sekali, Istimewa) yang dibaca langsung dari file KPI List Export. Sumbu bawah dua level: bulan, lalu Regional.
 */

const FONT = 'Poppins';
const C = {
  headerBg: 'FDEFE6',
  headerAccent: 'F26B1D',
  titleInk: '4A1408',
  subtitleInk: '3A2A20',
  footer: 'B8261A',
  labelFill: 'FFC000',
  labelLine: '030E14',
  axis: '404040',
};

const EMU = 914400;
// Posisi dari PPT Huddle Week 42 (EMU -> inci).
const POS = {
  SON_L1: { chart: { x: 0, y: 4424850 / EMU, w: 6358855 / EMU, h: 2363853 / EMU }, label: { x: 174603 / EMU, y: 4264844 / EMU } },
  SOMSA_L0: { chart: { x: 6429405 / EMU, y: 4424851 / EMU, w: 5587382 / EMU, h: 2318518 / EMU }, label: { x: 6429405 / EMU, y: 4264844 / EMU } },
};
const LABEL_SIZE = { w: 1160048 / EMU, h: 205023 / EMU };

const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export function idDateLabel(date = new Date()) {
  return `${date.getDate()} ${ID_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Baris skor KPI yang dipakai: tahun terbaru di data, sampai bulan `monthTo` (default semua bulan yang ada). */
export function filterKpiRowsToMonth(kpiRows, monthTo) {
  if (!monthTo) return kpiRows;
  return kpiRows.filter((r) => r.period % 100 <= monthTo);
}

/** Bulan-bulan (1-12) yang tersedia di tahun terbaru data KPI, minimal ada di kedua jenis. */
export function availableKpiMonths(kpiRows) {
  const dists = KPI_TYPES.map((t) => buildKpiDistribution(kpiRows, t.key));
  if (dists.some((d) => !d)) return [];
  const sets = dists.map((d) => new Set(d.months));
  return [...sets[0]].filter((m) => sets.every((s) => s.has(m))).sort((a, b) => a - b);
}

function addDistributionChart(pptx, slide, dist, type) {
  // Urutan seri menentukan kategori dari bawah ke atas pada grafik bertumpuk.
  const order = KPI_CATEGORIES;
  const present = order.filter((c) => dist.regionals.some((r) => dist.months.some((m) => dist.counts[r][m][c] > 0)));

  const leaf = [];
  const group = [];
  const regionalLabels = { R01: 'R01_Sumbagut', R02: 'R02_Sumbagsel', R10: 'R10_Sumbagteng' };
  for (const reg of dist.regionals) {
    dist.months.forEach((m, i) => {
      leaf.push(monthLabel(m));
      group.push(i === 0 ? (regionalLabels[reg] || reg) : '');
    });
  }
  const data = present.map((cat) => ({
    name: cat,
    labels: [leaf, group],
    values: dist.regionals.flatMap((r) => dist.months.map((m) => dist.counts[r][m][cat])),
  }));

  const pos = POS[type.key];
  // Legenda digambar manual: urutan dari terbaik ke terburuk (Istimewa, Baik Sekali, Baik, Cukup, Kurang),
  // sedangkan urutan tumpukan batang tetap. Kategori yang tidak ada di data (mis. Istimewa di SON) tidak ditampilkan.
  const legendItems = [...KPI_CATEGORIES].reverse().filter((c) => present.includes(c));
  const LEGEND_H = 0.27;
  slide.addChart(pptx.charts.BAR, data, {
    ...pos.chart,
    h: pos.chart.h - LEGEND_H,
    barDir: 'col',
    barGrouping: 'percentStacked',
    barGapWidthPct: type.key === 'SON_L1' ? 50 : 70,
    chartColors: present.map((c) => KPI_CATEGORY_COLORS[c]),
    catAxisMultiLevelLabels: true,
    catAxisLabelFontFace: FONT,
    catAxisLabelFontSize: 8,
    catAxisLabelColor: C.axis,
    catAxisLabelRotate: type.key === 'SON_L1' ? 0 : 270,
    catGridLine: { style: 'none' },
    valAxisHidden: true,
    valAxisMaxVal: 1,
    valGridLine: { style: 'none' },
    showValue: true,
    dataLabelColor: 'FFFFFF',
    dataLabelFontBold: true,
    dataLabelFontSize: 9,
    dataLabelFontFace: FONT,
    dataLabelFormatCode: '#;;;', // angka 0 tidak ditampilkan
    showLegend: false,
    showTitle: false,
    objectName: `Chart ${type.label}`,
  });

  const itemW = (name) => 0.1 + 0.06 + name.length * 0.075 + 0.2;
  const totalW = legendItems.reduce((sum, name) => sum + itemW(name), 0) - 0.2;
  let lx = pos.chart.x + (pos.chart.w - totalW) / 2;
  const ly = Math.min(pos.chart.y + pos.chart.h - LEGEND_H + 0.04, 7.36 - 0.24); // tetap di atas footer
  for (const name of legendItems) {
    slide.addShape(pptx.ShapeType.rect, {
      x: lx, y: ly + 0.055, w: 0.1, h: 0.1,
      fill: { color: KPI_CATEGORY_COLORS[name] }, line: { color: KPI_CATEGORY_COLORS[name], width: 0 },
      objectName: `Legenda ${type.label} ${name} Warna`,
    });
    slide.addText(name, {
      x: lx + 0.16, y: ly, w: name.length * 0.075 + 0.1, h: 0.21, margin: 0,
      fontFace: FONT, fontSize: 9, color: C.axis, valign: 'middle', isTextBox: true,
      objectName: `Legenda ${type.label} ${name}`,
    });
    lx += itemW(name);
  }

  slide.addText(type.label, {
    ...pos.label,
    ...LABEL_SIZE,
    margin: 0,
    align: 'center',
    valign: 'middle',
    fontFace: FONT,
    fontSize: 10.5,
    bold: true,
    color: 'FFFFFF',
    fill: { color: C.labelFill },
    line: { color: C.labelLine, width: 1.5 },
    objectName: `Label ${type.label}`,
  });
}

/**
 * Tambahkan slide Profiling KPI ke deck `pptx`.
 * @param kpiRows  semua baris kategori KPI [{ kpiType, period, regional, nop, category }] (getKpi)
 * @param monthTo  bulan terakhir yang ditampilkan (1-12), default semua bulan yang ada
 */
export function addKpiProfilingSlide(pptx, { kpiRows, logoData, dateLabel, monthTo }) {
  const rows = filterKpiRowsToMonth(kpiRows, monthTo);
  const dists = KPI_TYPES.map((t) => {
    const d = buildKpiDistribution(rows, t.key);
    if (!d) throw new Error(`Belum ada data ${t.label} di database. Upload dulu di menu Upload > KPI.`);
    return { type: t, dist: d };
  });

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header (sama dengan slide Weekly Trend / Availability)
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.75, fill: { color: C.headerBg }, line: { color: C.headerBg, width: 0 }, objectName: 'Header' });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.11, h: 0.75, fill: { color: C.headerAccent }, line: { color: C.headerAccent, width: 0 }, objectName: 'Header Accent' });
  slide.addText('Profiling KPI', {
    x: 0.3, y: 0.06, w: 8.5, h: 0.37, margin: 0,
    fontFace: FONT, fontSize: 20, bold: true, color: C.titleInk, valign: 'middle', isTextBox: true, objectName: 'Judul',
  });
  slide.addText(`AREA 1 – ${dateLabel || idDateLabel()}`, {
    x: 0.32, y: 0.41, w: 8.5, h: 0.24, margin: 0,
    fontFace: FONT, fontSize: 15, color: C.subtitleInk, valign: 'middle', isTextBox: true, objectName: 'Subjudul',
  });
  if (logoData) slide.addImage({ data: logoData, x: 10.64, y: 0.14, w: 2.53, h: 0.575, objectName: 'Logo' });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.36, w: 13.333, h: 0.14, fill: { color: C.footer }, line: { color: C.footer, width: 0 }, objectName: 'Footer' });

  // Bagian atas slide sengaja kosong (di PPT Huddle berisi tabel skor KPI).
  for (const { type, dist } of dists) addDistributionChart(pptx, slide, dist, type);
}

/** Satu file PPTX berisi slide Profiling KPI saja (dipakai untuk uji / export terpisah). */
export async function buildKpiProfilingPptx({ kpiRows, logoData, dateLabel, monthTo }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.title = 'Profiling KPI';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: 'id-ID' };
  addKpiProfilingSlide(pptx, { kpiRows, logoData, dateLabel, monthTo });
  return pptx.write({ outputType: 'arraybuffer' });
}
