import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { REGIONS } from './constants.js';

/*
 * Export "Trend Weekly Availability | Area 1 - Regional Based" (mengikuti PPT Availability_Trend_A1).
 *   - kartu atas   : Area 1 (angka besar minggu terakhir + badge naik/turun vs minggu sebelumnya + chart)
 *   - 3 kartu bawah: Sumbagut / Sumbagteng / Sumbagsel (angka + badge + chart)
 * Chart = kolom (bar) biru + garis oranye. Titik yang diberi label & marker di tiap chart:
 *   tertinggi (hijau), terendah selain minggu terakhir (merah), dan minggu terakhir / minggu saat ini (oranye).
 * Label dibuat sebagai data label native PowerPoint lewat post-process XML chart, jadi tetap menempel ke titiknya.
 *
 * Input `rows` = isi tabel availability_weekly: [{ period: 202641, regional: 'Sumbagut', availability, outageSec, denumSec }].
 * Yang dipakai hanya periode di tahun terbaru (period/100 = tahun, period%100 = nomor minggu).
 */

const AREA_LABEL = 'Area 1';
const FONT = 'Poppins';

const C = {
  headerBg: 'FDEFE6',
  headerAccent: 'F26B1D',
  titleInk: '4A1408',
  subtitleInk: '3A2A20',
  footer: 'B8261A',
  card: 'FCFCFA',
  cardLine: 'E1E0D9',
  ink: '14202B',
  muted: '66707C',
  accent: '1C5CAB',
  bar: '0070C0',
  line: 'ED7D31',
  hiMax: '92D050',
  hiMin: 'FF0000',
  hiCur: 'ED7D31',
  upBg: 'E4F2E4', // availability naik = bagus -> hijau
  upText: '006300',
  downBg: 'FCE8E6', // turun = buruk -> merah
  downText: 'C00000',
  flatBg: 'EEF1F4',
  flatText: '475569',
  axis: '66707C',
  axisLine: 'D5D8DC',
};

const REGION_ROW_KEY = { Sumbagut: 'Sumbagut', Sumbagteng: 'Sumbagteng', Sumbagsel: 'Sumbagsel' };

const fmt2 = (n) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- data

/**
 * Susun deret mingguan dari baris database. Hanya minggu yang punya ketiga regional yang dipakai.
 * Area 1 = 100 * (1 - total outage / total denum) kalau outage & denum tersedia di ketiga regional,
 * kalau tidak, rata-rata sederhana ketiga regional.
 */
export function buildAvailabilitySeries(rows, { weekFrom, weekTo } = {}) {
  const valid = (rows || []).filter((r) => /^\d{6}$/.test(String(r.period)) && REGIONS.includes(r.regional) && Number.isFinite(Number(r.availability)));
  if (!valid.length) throw new Error('Belum ada data availability. Upload dulu di menu Upload > Availability.');

  const from = weekFrom == null ? null : Number(weekFrom);
  const to = weekTo == null ? null : Number(weekTo);
  if ((from != null && !Number.isInteger(from)) || (to != null && !Number.isInteger(to)) || (from != null && to != null && from > to)) {
    throw new Error('Rentang minggu Availability tidak valid.');
  }

  const latestYear = Math.max(...valid.map((r) => Math.floor(Number(r.period) / 100)));
  const byPeriod = new Map();
  for (const r of valid) {
    const period = Number(r.period);
    if (Math.floor(period / 100) !== latestYear) continue;
    if ((from != null && period < from) || (to != null && period > to)) continue;
    if (!byPeriod.has(period)) byPeriod.set(period, {});
    byPeriod.get(period)[REGION_ROW_KEY[r.regional]] = r;
  }
  const periods = [...byPeriod.keys()]
    .sort((a, b) => a - b)
    .filter((p) => REGIONS.every((region) => byPeriod.get(p)[region]));
  if (!periods.length) throw new Error('Tidak ada minggu yang punya data ketiga regional (Sumbagut, Sumbagteng, Sumbagsel).');

  const labels = periods.map((p) => `W${p % 100}`);
  const byRegion = Object.fromEntries(REGIONS.map((region) => [region, periods.map((p) => round2(Number(byPeriod.get(p)[region].availability)))]));
  const area = periods.map((p) => {
    const regs = REGIONS.map((region) => byPeriod.get(p)[region]);
    const weighted = regs.every((r) => Number(r.denumSec) > 0 && r.outageSec != null && Number.isFinite(Number(r.outageSec)));
    if (weighted) {
      const outage = regs.reduce((s, r) => s + Number(r.outageSec), 0);
      const denum = regs.reduce((s, r) => s + Number(r.denumSec), 0);
      return round2(100 * (1 - outage / denum));
    }
    return round2(regs.reduce((s, r) => s + Number(r.availability), 0) / regs.length);
  });
  return { year: latestYear, periods, labels, byRegion, area };
}

// Tertinggi, terendah sebelum minggu terakhir, dan minggu saat ini (terakhir).
export function pickHighlights(values) {
  const last = values.length - 1;
  if (last < 1) return [{ idx: last, kind: 'cur' }];
  let max = 0;
  let min = 0;
  for (let i = 0; i < last; i++) if (values[i] > values[max]) max = i;
  for (let i = 1; i < last; i++) if (values[i] < values[min]) min = i;
  // Tertinggi dihitung dari seluruh deret; kalau minggu saat ini yang tertinggi, cukup satu label.
  const maxIsCurrent = values[last] > values[max];
  const out = [];
  if (!maxIsCurrent) out.push({ idx: max, kind: 'max' });
  if (min !== max) out.push({ idx: min, kind: 'min' });
  out.push({ idx: last, kind: 'cur' });
  return out.sort((a, b) => a.idx - b.idx);
}

function buildDelta(values, labels, withPrevValue) {
  const last = values.length - 1;
  if (last < 1) return { text: 'Belum ada data minggu sebelumnya', kind: 'flat' };
  const diff = round2(values[last] - values[last - 1]);
  const prevLabel = labels[last - 1];
  const suffix = withPrevValue ? ` (${fmt2(values[last - 1])}%)` : '';
  if (diff === 0) return { text: `Tetap vs ${prevLabel}${suffix}`, kind: 'flat' };
  return {
    text: `${diff > 0 ? 'Naik' : 'Turun'} ${fmt2(Math.abs(diff))}% vs ${prevLabel}${suffix}`,
    kind: diff > 0 ? 'up' : 'down',
  };
}

function axisRange(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 0.5);
  const min = Math.floor((lo - span * 0.7) * 2) / 2;
  const max = Math.ceil((hi + span * 0.5) * 2) / 2;
  return { min, max };
}

// ---------------------------------------------------------------- chart XML post-process

const MARKER_COLOR = { max: C.hiMax, min: C.hiMin, cur: C.hiCur };
const LABEL_BG = { max: 'E2F0D9', min: 'F4CCCC', cur: 'FCE4D6' };

function dPtXml(idx, kind) {
  return (
    `<c:dPt><c:idx val="${idx}"/><c:marker><c:symbol val="circle"/><c:size val="7"/>` +
    `<c:spPr><a:solidFill><a:srgbClr val="${MARKER_COLOR[kind]}"/></a:solidFill>` +
    `<a:ln w="9525"><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:ln></c:spPr></c:marker><c:bubble3D val="0"/></c:dPt>`
  );
}

// pptxgenjs menamai file chart berurutan sesuai urutan addChart (chart1.xml, chart2.xml, ...).
// Chart kombinasi (bar + line) dari pptxgenjs belum sesuai skema OOXML dan membuat PowerPoint minta
// "repair", jadi di sini dirapikan: seri garis disusun ulang, grouping ditambahkan, axId berlebih
// dibuang, dan urutan elemen sumbu kategori diperbaiki.
async function postProcessCharts(arrayBuffer, specs) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const relsFile = zip.file('ppt/slides/_rels/slide1.xml.rels');
  const relsXml = relsFile ? await relsFile.async('string') : '';
  const chartPaths = [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map(([relationship]) => {
      if (!/\bType="[^"]*\/chart"/.test(relationship)) return null;
      const target = relationship.match(/\bTarget="([^"]+)"/)?.[1];
      if (!target) return null;
      const parts = target.startsWith('/') ? [] : ['ppt', 'slides'];
      for (const part of target.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
      }
      return parts.join('/');
    })
    .filter(Boolean);
  if (chartPaths.length !== specs.length) {
    throw new Error(`Jumlah chart Availability tidak sesuai: ditemukan ${chartPaths.length}, diperlukan ${specs.length}.`);
  }

  for (let i = 0; i < specs.length; i++) {
    const path = chartPaths[i];
    const file = zip.file(path);
    if (!file) throw new Error(`Chart Availability tidak ditemukan: ${path}.`);
    let xml = await file.async('string');

    // Bar: biru semi-transparan seperti template (hanya spPr milik seri bar).
    xml = xml.replace(/(<c:barChart>[\s\S]*?<c:ser>[\s\S]*?<\/c:tx>\s*)<c:spPr>[\s\S]*?<\/c:spPr>/, `$1<c:spPr><a:solidFill><a:srgbClr val="${C.bar}"><a:alpha val="42000"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`);

    // Line: seri disusun ulang urut sesuai skema: idx, order, tx, spPr, marker, dPt*, dLbls, cat, val, smooth.
    xml = xml.replace(/(<c:lineChart>)([\s\S]*?)(<c:ser>)([\s\S]*?)(<\/c:ser>)/, (m, open, pre, serOpen, ser, serClose) => {
      const tx = ser.match(/<c:tx>[\s\S]*?<\/c:tx>/)[0];
      const cat = ser.match(/<c:cat>[\s\S]*?<\/c:cat>/)[0];
      const val = ser.match(/<c:val>[\s\S]*?<\/c:val>/)[0];
      const spPr =
        `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill><a:round/></a:ln></c:spPr>`;
      const points = specs[i].highlights.map((h) => dPtXml(h.idx, h.kind)).join('');
      const newSer =
        `<c:ser><c:idx val="2"/><c:order val="2"/>${tx}${spPr}<c:marker><c:symbol val="none"/></c:marker>` +
        `${points}${cat}${val}<c:smooth val="1"/></c:ser>`;
      return `${open}<c:grouping val="standard"/><c:varyColors val="0"/>${newSer}`;
    });
    // Sisa lineChart setelah </c:ser>: buang dLbls level chart bawaan, sisakan marker + axId.
    xml = xml.replace(/(<c:lineChart>[\s\S]*?<\/c:ser>)([\s\S]*?)(<\/c:lineChart>)/, (m, head, rest, close) => {
      const axIds = (rest.match(/<c:axId val="\d+"\/>/g) || []).slice(0, 2).join('');
      return `${head}<c:marker val="1"/>${axIds}${close}`;
    });
    // Bar: axId maksimal dua.
    xml = xml.replace(/(<c:barChart>[\s\S]*?)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)(<\/c:barChart>)/, '$1$2$3$5');
    // Sumbu kategori: tickLblSkip harus sebelum noMultiLvlLbl.
    xml = xml.replace(/(<c:noMultiLvlLbl val="\d"\/>)[\s\S]*?(<c:tickLblSkip val="\d+"\/>)/, '$2$1');
    xml = xml.replace('<c:roundedCorners val="1"/>', '<c:roundedCorners val="0"/>');
    zip.file(path, xml);
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------- slide building

function addBadge(slide, delta, x, y, w, h, fontSize, objectName) {
  const palette = { up: { fill: C.upBg, color: C.upText }, down: { fill: C.downBg, color: C.downText }, flat: { fill: C.flatBg, color: C.flatText } }[delta.kind];
  slide.addText(delta.text, {
    x, y, w, h,
    shape: 'roundRect',
    rectRadius: 0.1,
    fill: { color: palette.fill },
    line: { color: palette.fill, width: 0.5 },
    fontFace: FONT,
    fontSize,
    bold: true,
    color: palette.color,
    align: 'center',
    valign: 'middle',
    margin: 0,
    fit: 'shrink',
    objectName,
  });
}

function addTrendChart(pptx, slide, { x, y, w, h, labels, values, skip, labelSize, range }) {
  const { min, max } = range || axisRange(values);
  const highlights = pickHighlights(values);
  const labelWidth = 0.52;
  const labelHeight = 0.3;
  const labelGap = 0.06;
  const series = [{ name: 'Availability (%)', labels, values }];
  slide.addChart(
    [
      { type: pptx.ChartType.bar, data: series, options: { chartColors: [C.bar], barGapWidthPct: 60 } },
      { type: pptx.ChartType.line, data: series, options: { chartColors: [C.line], lineSize: 2.25, lineDataSymbol: 'none', lineSmooth: true } },
    ],
    {
      x, y, w, h,
      showTitle: false,
      showLegend: false,
      valAxisHidden: true,
      valAxisMinVal: min,
      valAxisMaxVal: max,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 8,
      catAxisLabelColor: C.axis,
      catAxisLabelRotate: 270,
      catAxisLabelFrequency: skip,
      catAxisLineShow: true,
      catAxisLineColor: C.axisLine,
      showBorder: false,
    }
  );
  highlights.forEach(({ idx, kind }) => {
    const plotX = x + 0.1 + ((w - 0.2) * idx) / Math.max(labels.length - 1, 1);
    const labelX = Math.max(x, Math.min(x + w - labelWidth, plotX - labelWidth / 2));
    const plotTop = y + 0.12;
    const plotBottom = y + h - 0.42;
    const pointY = plotTop + ((max - values[idx]) / (max - min)) * (plotBottom - plotTop);
    const labelY = Math.max(y + 0.01, pointY - labelHeight - labelGap);
    slide.addText(`${labels[idx]}\n${fmt2(values[idx])}`, {
      x: labelX, y: labelY, w: labelWidth, h: labelHeight,
      margin: 0.02, fontFace: FONT, fontSize: labelSize / 100, bold: true,
      color: C.ink, align: 'center', valign: 'middle',
      fill: { color: LABEL_BG[kind] }, line: { color: LABEL_BG[kind], transparency: 100 },
      fit: 'shrink', isTextBox: true, objectName: `Label ${labels[idx]}`,
    });
  });
  return { highlights };
}

export async function buildAvailabilityPptx({ rows, logoData, weekFrom, weekTo }) {
  const { labels, byRegion, area } = buildAvailabilitySeries(rows, { weekFrom, weekTo });
  const last = labels.length - 1;
  const lastLabel = labels[last];
  const rangeText = `${labels[0]}-${lastLabel}`;

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.subject = 'Trend Weekly Availability Area 1';
  pptx.title = 'Trend Weekly Availability Area 1';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: 'id-ID' };

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.75, fill: { color: C.headerBg }, line: { color: C.headerBg, width: 0 }, objectName: 'Header' });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.11, h: 0.75, fill: { color: C.headerAccent }, line: { color: C.headerAccent, width: 0 }, objectName: 'Header Accent' });
  slide.addText('Trend Weekly Availability', {
    x: 0.3, y: 0.06, w: 8.5, h: 0.37, margin: 0,
    fontFace: FONT, fontSize: 20, bold: true, color: C.titleInk, valign: 'middle', isTextBox: true, objectName: 'Judul',
  });
  slide.addText('AREA 1 – REGIONAL BASED', {
    x: 0.32, y: 0.41, w: 8.5, h: 0.24, margin: 0,
    fontFace: FONT, fontSize: 15, color: C.subtitleInk, valign: 'middle', isTextBox: true, objectName: 'Subjudul',
  });
  if (logoData) slide.addImage({ data: logoData, x: 10.64, y: 0.14, w: 2.53, h: 0.575, objectName: 'Logo' });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.36, w: 13.333, h: 0.14, fill: { color: C.footer }, line: { color: C.footer, width: 0 }, objectName: 'Footer' });

  const specs = [];

  // ---- Kartu atas: Area 1
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.36, y: 0.89, w: 12.52, h: 3.15, rectRadius: 0.1, fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 }, objectName: 'Kartu Area 1' });
  slide.addText(`${AREA_LABEL.toUpperCase()} · AVAILABILITY ${lastLabel}`, {
    x: 0.57, y: 1.93, w: 3.0, h: 0.22, margin: 0,
    fontFace: FONT, fontSize: 12, bold: true, color: C.accent, charSpacing: 1, wrap: false, isTextBox: true, objectName: 'Area KPI Label',
  });
  slide.addText(`${fmt2(area[last])}%`, {
    x: 0.57, y: 2.15, w: 2.9, h: 0.85, margin: 0,
    fontFace: FONT, fontSize: 48, bold: true, color: C.ink, isTextBox: true, objectName: 'Area KPI Value',
  });
  addBadge(slide, buildDelta(area, labels, true), 0.40, 3.12, 2.75, 0.34, 12, 'Area Badge');
  specs.push(addTrendChart(pptx, slide, { x: 3.0, y: 0.96, w: 9.8, h: 3.04, labels, values: area, skip: 1, labelSize: 800 }));

  // ---- Tiga kartu bawah: per regional
  const cardW = 4.12;
  const cardXs = [0.36, 4.53, 8.75];
  const cardY = 4.17;
  const cardH = 2.95;
  const regionalValues = REGIONS.flatMap((region) => byRegion[region]);
  const regionalAxisRange = axisRange(regionalValues);
  const regionalRange = {
    min: Math.floor(Math.min(...regionalValues)),
    max: Math.min(regionalAxisRange.max, 100
    ),
  };
  REGIONS.forEach((region, i) => {
    const x = cardXs[i];
    const values = byRegion[region];
    slide.addShape(pptx.ShapeType.roundRect, { x, y: cardY, w: cardW, h: cardH, rectRadius: 0.1, fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 }, objectName: `Kartu ${region}` });
    slide.addText(region, { x: x + 0.15, y: cardY + 0.1, w: 2.2, h: 0.3, margin: 0, fontFace: FONT, fontSize: 16, bold: true, color: C.ink, isTextBox: true, objectName: `${region} Nama` });
    slide.addText(`Availability ${rangeText}`, { x: x + 0.15, y: cardY + 0.42, w: 2.3, h: 0.2, margin: 0, fontFace: FONT, fontSize: 10.5, color: C.muted, isTextBox: true, objectName: `${region} Periode` });
    slide.addText(`${fmt2(values[last])}%`, { x: x + 2.2, y: cardY + 0.04, w: 1.78, h: 0.42, margin: 0, fontFace: FONT, fontSize: 20, bold: true, color: C.ink, align: 'right', isTextBox: true, objectName: `${region} Angka` });
    addBadge(slide, buildDelta(values, labels, false), x + 2.2, cardY + 0.5, 1.78, 0.29, 9, `${region} Badge`);
    specs.push(addTrendChart(pptx, slide, { x: x + 0.02, y: cardY + 0.8, w: cardW - 0.04, h: 2.1, labels, values, skip: 3, labelSize: 700, range: regionalRange }));
  });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  return postProcessCharts(buffer, specs);
}

// ---------------------------------------------------------------- browser entry

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
    return null; // logo opsional, export tetap jalan tanpa logo
  }
}

export async function exportAvailabilityPpt({ rows, fileName, weekFrom, weekTo }) {
  const { labels, year } = buildAvailabilitySeries(rows, { weekFrom, weekTo }); // validasi data lebih awal (error jelas kalau kosong)
  const logoData = await loadLogoDataUrl();
  const buffer = await buildAvailabilityPptx({ rows, logoData, weekFrom, weekTo });
  const outputName = fileName || `CDS_Monitoring_Availability_Trend_Area_1_${year}_${labels[0]}_${labels[labels.length - 1]}.pptx`;
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
