import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { REGIONS } from './constants.js';
import { getPeriodBucket } from './aggregate.js';
import { getSlideChartPaths, normalizeComboXml } from './pptxUtils.js';

/*
 * Export "Trend Weekly Cell Down | Area 1 & Regional"
 * Layout mengikuti PPT Area 4 (13.33" x 7.5"):
 *   - kartu atas   : total semua regional (angka besar + badge selisih + 2 grafik dengan sumbu Y:
 *                    trend weekly rentang terpilih | trend daily minggu terakhir, batang per regional
 *                    + angka total per hari di atasnya)
 *   - 3 kartu bawah: Sumbagut / Sumbagteng / Sumbagsel (angka + badge selisih ticket vs minggu
 *                    sebelumnya + trend daily minggu terakhir, batang per NOP + angka total per hari)
 * Label nilai pada titik tertentu (awal, puncak, tengah, akhir) dibuat sebagai data label
 * native PowerPoint lewat post-process XML chart, jadi tetap menempel ke titik datanya.
 */

const AREA_LABEL = 'Area 1';

const FONT = 'IBM Plex Sans';
const TITLE_FONT = 'Poppins';

const C = {
  topBar: 'BE133E',
  titleRed: 'BE1540',
  titleBlue: '012E98',
  card: 'FCFCFA',
  cardLine: 'E1E0D9',
  ink: '14202B',
  muted: '66707C',
  accent: '1C5CAB',
  totalLine: 'E8710A',
  upBg: 'FCE8E6',
  upText: 'C00000',
  downBg: 'E4F2E4',
  downText: '006300',
  flatBg: 'EEF1F4',
  flatText: '475569',
  axis: '66707C',
  axisLine: 'D5D8DC',
};

// Warna garis & tint label per regional. Ganti di sini kalau ingin warna lain.
const REGION_STYLE = {
  Sumbagut: { line: 'E0301E', tint: 'FBD9D5', bar: 'E0301E' },
  Sumbagteng: { line: '0070C0', tint: 'D6E9F7', bar: '0070C0' },
  Sumbagsel: { line: '00B050', tint: 'D5F0DE', bar: '00B050' },
};
const FALLBACK_STYLE = { line: '64748B', tint: 'E2E8F0' };

// Warna batang per NOP di kartu regional (urut sesuai legenda).
const NOP_PALETTE = ['E6194B', '3CB44B', '4363D8', 'F58231', '911EB4', '00A3A3', '9A6324', '808000'];
const nopLabel = (nop) => String(nop).replace(/^NOP\s+/i, '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Batas atas sumbu Y yang "bulat" (1, 2, 5 x 10^n).
function niceMax(value) {
  const v = Math.max(1, Number(value) || 1);
  const mag = 10 ** Math.floor(Math.log10(v / 4));
  const step = [1, 2, 5, 10].map((f) => f * mag).find((st) => v / st <= 6) || 10 * mag;
  return Math.ceil(v / step) * step;
}

const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n));
const EXTREME_MIN_WEEKLY_INCREASE = 200;
const EXTREME_MIN_WEEKLY_MULTIPLIER = 3;

// ---------------------------------------------------------------- data helpers

function buildSeries(rows) {
  const labels = rows.map((r) => r.label);
  const byRegion = Object.fromEntries(
    REGIONS.map((region) => [region, rows.map((r) => Number(r.values?.[region]) || 0)])
  );
  const total = rows.map((_, i) => REGIONS.reduce((sum, region) => sum + byRegion[region][i], 0));
  return { labels, byRegion, total };
}

function formatDayMonth(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date);
}

function formatAverage(value) {
  return fmt(Math.round(value));
}

function analyzeExtremeWeeklyIncreases(allRows, dailyNopRows, selectedKeys) {
  const results = [];
  const selectedKeySet = new Set(selectedKeys);
  const sortedDaily = (dailyNopRows || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const dailyByWeek = new Map();
  for (const daily of sortedDaily) {
    const weekKey = getPeriodBucket(daily.date, 'weekly').key;
    if (!dailyByWeek.has(weekKey)) dailyByWeek.set(weekKey, []);
    dailyByWeek.get(weekKey).push(daily);
  }
  const allNops = [...new Set(sortedDaily.flatMap((row) => Object.keys(row.byNop || {})))];

  allRows.forEach((row, index) => {
    if (!selectedKeySet.has(row.key) || index === 0) return;
    const previous = allRows[index - 1];
    const currentDays = dailyByWeek.get(row.key) || [];
    const previousDays = dailyByWeek.get(previous.key) || [];
    if (!currentDays.length || !previousDays.length) return;

    const candidates = allNops.map((nop) => {
      const currentAverage = currentDays.reduce((sum, day) => sum + (Number(day.byNop?.[nop]) || 0), 0) / currentDays.length;
      const previousAverage = previousDays.reduce((sum, day) => sum + (Number(day.byNop?.[nop]) || 0), 0) / previousDays.length;
      const increase = currentAverage - previousAverage;
      if (increase < EXTREME_MIN_WEEKLY_INCREASE || currentAverage < previousAverage * EXTREME_MIN_WEEKLY_MULTIPLIER) return null;

      const peak = currentDays
        .map((day) => ({ date: day.date, value: Number(day.byNop?.[nop]) || 0 }))
        .sort((a, b) => b.value - a.value || a.date.localeCompare(b.date))[0];
      const largestDecline = currentDays
        .filter((day) => day.date > peak.date && (Number(day.byNop?.[nop]) || 0) < peak.value)
        .map((day) => ({ date: day.date, value: Number(day.byNop?.[nop]) || 0 }))
        .sort((a, b) => a.value - b.value || a.date.localeCompare(b.date))[0] || null;
      return { nop, currentAverage, previousAverage, increase, peak, largestDecline };
    }).filter(Boolean).sort((a, b) => b.increase - a.increase);

    if (candidates.length) results.push({ label: row.label, previousLabel: previous.label, contributor: candidates[0] });
  });

  return results;
}

function buildExtremeIncreaseSummary(increases) {
  return increases.map(({ label, previousLabel, contributor }) => {
    const declineText = contributor.largestDecline
      ? ` Pada ${formatDayMonth(contributor.largestDecline.date)} mengalami penurunan terbesar (${fmt(contributor.largestDecline.value)}).`
      : '';
    return `${label}: ${contributor.nop}, rata-rata ${previousLabel} = ${formatAverage(contributor.previousAverage)}, rata-rata ${label} = ${formatAverage(contributor.currentAverage)}; kenaikan tertinggi pada ${formatDayMonth(contributor.peak.date)} (${fmt(contributor.peak.value)}).${declineText}`;
  }).join(' ');
}

// Selisih minggu terakhir terhadap minggu sebelumnya (boleh di luar rentang terpilih).
function buildDelta(lastValue, prevValue, prevLabel, withPrevValue = false, unitOverride = null) {
  if (prevValue == null) return { text: 'Belum ada data minggu sebelumnya', kind: 'flat' };
  const diff = lastValue - prevValue;
  const suffix = withPrevValue ? ` (${fmt(prevValue)})` : '';
  if (diff === 0) return { text: `Tetap vs ${prevLabel}${suffix}`, kind: 'flat' };
  const word = diff > 0 ? 'Naik' : 'Turun';
  const unit = unitOverride || (withPrevValue ? 'Cells' : 'Cell');
  return { text: `${word} ${fmt(Math.abs(diff))} ${unit} vs ${prevLabel}${suffix}`, kind: diff > 0 ? 'up' : 'down' };
}

// Titik yang diberi label: minimum, puncak, akhir, plus awal/tengah bila diminta.
function pickLabelIndexes(values, { first = false, mid = false } = {}) {
  const last = values.length - 1;
  const set = new Set([last]);
  let peak = 0;
  let trough = 0;
  values.forEach((v, i) => {
    if (v > values[peak]) peak = i;
    if (v < values[trough]) trough = i;
  });
  set.add(peak);
  set.add(trough);
  if (first && peak > 2) set.add(0); // kalau puncak menempel di awal, cukup satu label
  if (mid && values.length >= 9) {
    const m = Math.round(last / 2);
    if ([...set].every((i) => Math.abs(i - m) > 3)) set.add(m);
  }
  return [...set].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- chart data labels

function dLblXml(idx, text, { size, bold, color, fill }) {
  const sp = fill
    ? `<c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`
    : '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>';
  const rPr = `sz="${size}" b="${bold ? 1 : 0}"`;
  const fillXml = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${FONT}"/>`;
  const tx = text
    ? `<c:tx><c:rich><a:bodyPr wrap="none"/><a:lstStyle/><a:p><a:r><a:rPr lang="id-ID" ${rPr}>${fillXml}</a:rPr>` +
      `<a:t>${text}</a:t></a:r></a:p></c:rich></c:tx>`
    : '';
  return (
    `<c:dLbl><c:idx val="${idx}"/>${tx}${sp}` +
    `<c:txPr><a:bodyPr wrap="none"/><a:lstStyle/><a:p><a:pPr><a:defRPr ${rPr}>${fillXml}</a:defRPr></a:pPr>` +
    '<a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
    '<c:dLblPos val="t"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>' +
    '<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>'
  );
}

// Hanya titik di `spec.indexes` yang tampil; sisanya showVal=0.
function dLblsXml(spec) {
  const items = spec.indexes
    .map((idx) => dLblXml(idx, spec.format ? spec.format(spec.labels[idx], spec.values[idx]) : null, spec.style))
    .join('');
  return (
    `<c:dLbls>${items}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>` +
    '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/>' +
    '<c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
  );
}


// ---------------------------------------------------------------- workbook data (Edit Data)

const colLetter = (i) => String.fromCharCode(65 + i); // 0 -> A (cukup untuk <= 26 kolom)
const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Workbook xlsx minimal: kolom A = Week, kolom berikutnya = tiap series.
async function buildWorkbook(labels, columns, header = 'Week') {
  const strCell = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(text)}</t></is></c>`;
  const head = strCell('A1', header) + columns.map((c, i) => strCell(`${colLetter(i + 1)}1`, c.name)).join('');
  const body = labels
    .map((label, r) => {
      const row = r + 2;
      const cells = columns.map((c, i) => `<c r="${colLetter(i + 1)}${row}"><v>${c.values[r]}</v></c>`).join('');
      return `<row r="${row}">${strCell(`A${row}`, label)}${cells}</row>`;
    })
    .join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>'
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      `<row r="1">${head}</row>${body}</sheetData></worksheet>`
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// pptxgenjs menamai file chart berurutan sesuai urutan addChart (chart1.xml, chart2.xml, ...).
// `chartPaths` = path file chart milik slide ini (urut addChart), dari getSlideChartPaths.
// Grafik batang berkelompok (per regional / per NOP) + angka total di atas tiap kelompok.
// Angka total = label native dari seri garis "Total" yang tak terlihat; posisinya sedikit di atas batang tertinggi hari itu.
function fixClusterChart(xml, spec) {
  const dLbls = dLblsXml({
    indexes: spec.labels.map((_, i) => i),
    labels: spec.labels,
    values: spec.totals,
    format: (label, value) => fmt(value),
    style: { size: 1000, bold: true, color: C.ink, fill: null },
  });
  const r = normalizeComboXml(xml, { hidden: true, width: 12700, dLbls });
  let out = r.xml;
  if (spec.rotateBarLabels) {
    out = out.replace(/<c:barChart>[\s\S]*?<\/c:barChart>/, (m) => m.replace(/<a:bodyPr\/>/g, '<a:bodyPr rot="-5400000" vert="horz"/>'));
  }
  // Warna per titik (per hari) untuk batang yang sudah dipadatkan: satu seri = satu "slot", warna ikut NOP-nya.
  if (spec.pointColors?.some(Boolean)) {
    out = out.replace(/<c:barChart>[\s\S]*?<\/c:barChart>/, (bar) => {
      let n = 0;
      return bar.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
        const colors = spec.pointColors[n++];
        const dPts = (colors || [])
          .map((hex, d) => (hex ? `<c:dPt><c:idx val="${d}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr></c:dPt>` : ''))
          .join('');
        if (!dPts) return ser;
        return ser.includes('<c:dLbls>') ? ser.replace('<c:dLbls>', `${dPts}<c:dLbls>`) : ser.replace('<c:cat>', `${dPts}<c:cat>`);
      });
    });
  }
  // Seri bantu "Total" tidak ikut tampil di legenda.
  out = out.replace(/(<c:legendPos val="\w+"\/>)/, `$1<c:legendEntry><c:idx val="${r.barCount}"/><c:delete val="1"/></c:legendEntry>`);
  return out;
}

export async function injectDataLabels(zip, chartPaths, chartSpecs, table) {
  // Satu tabel lengkap (Week | tiap regional | total Area) dipakai chart weekly, seperti PPT Area 4.
  // Chart daily memakai tabel sendiri (spec.table: Tanggal | tiap regional | total Area).
  const workbooks = new Map();
  for (let i = 0; i < chartSpecs.length; i++) {
    if (chartSpecs[i].kind === 'cluster') {
      const clusterPath = chartPaths[i];
      const clusterFile = clusterPath && zip.file(clusterPath);
      if (clusterFile) zip.file(clusterPath, fixClusterChart(await clusterFile.async('string'), chartSpecs[i]));
      continue;
    }
    const tbl = chartSpecs[i].table || table;
    if (!workbooks.has(tbl)) workbooks.set(tbl, await buildWorkbook(tbl.labels, tbl.columns, tbl.header));
    const workbook = workbooks.get(tbl);
    const rowCount = tbl.labels.length + 1;
    const path = chartPaths[i];
    const file = path && zip.file(path);
    if (!file) continue;
    let xml = await file.async('string');
    const spec = chartSpecs[i];

    xml = xml.replace(/(<c:barChart>[\s\S]*?<c:ser>[\s\S]*?<\/c:tx>\s*)<c:spPr>[\s\S]*?<\/c:spPr>/, `$1<c:spPr><a:solidFill><a:srgbClr val="${spec.barColor}"><a:alpha val="42000"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`);
    xml = xml.replace(/(<c:lineChart>)([\s\S]*?)(<c:ser>)([\s\S]*?)(<\/c:ser>)/, (match, open, before, serOpen, ser, serClose) => {
      const tx = ser.match(/<c:tx>[\s\S]*?<\/c:tx>/)[0];
      const cat = ser.match(/<c:cat>[\s\S]*?<\/c:cat>/)[0];
      const val = ser.match(/<c:val>[\s\S]*?<\/c:val>/)[0];
      const lineStyle = `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${spec.color}"/></a:solidFill><a:round/></a:ln></c:spPr>`;
      const lineSeries =
        `<c:ser><c:idx val="2"/><c:order val="2"/>${tx}${lineStyle}<c:marker><c:symbol val="none"/></c:marker>` +
        `${dLblsXml(spec)}${cat}${val}<c:smooth val="1"/></c:ser>`;
      return `${open}<c:grouping val="standard"/><c:varyColors val="0"/>${lineSeries}`;
    });
    xml = xml.replace(/(<c:lineChart>[\s\S]*?<\/c:ser>)([\s\S]*?)(<\/c:lineChart>)/, (match, head, rest, close) => {
      const axisIds = (rest.match(/<c:axId val="\d+"\/>/g) || []).slice(0, 2).join('');
      return `${head}<c:marker val="1"/>${axisIds}${close}`;
    });
    xml = xml.replace(/(<c:barChart>[\s\S]*?)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)(<\/c:barChart>)/, '$1$2$3$5');
    xml = xml.replace(/(<c:noMultiLvlLbl val="\d"\/>)[\s\S]*?(<c:tickLblSkip val="\d+"\/>)/, '$2$1');

    // Ganti dLbls milik series (di dalam <c:ser>), bukan dLbls level chart.
    xml = xml.replace('<a:bodyPr rot="16200000"/>', '<a:bodyPr rot="-5400000" vert="horz"/>');
    xml = xml.replace('<c:roundedCorners val="1"/>', '<c:roundedCorners val="0"/>');
    // Tiap chart menunjuk kolomnya sendiri di tabel lengkap tsb.
    const L = colLetter(chartSpecs[i].col + 1);
    xml = xml.replace(/Sheet1!\$B\$1/g, () => `Sheet1!$${L}$1`);
    xml = xml.replace(/Sheet1!\$B\$2:\$B\$\d+/g, () => `Sheet1!$${L}$2:$${L}$${rowCount}`);
    zip.file(path, xml);

    // Ganti workbook embedded chart ini dengan tabel lengkap.
    const relsFile = zip.file(path.replace(/([^/]+)$/, '_rels/$1.rels'));
    const target = relsFile && (await relsFile.async('string')).match(/Target="\.\.\/embeddings\/([^"]+\.xlsx)"/);
    if (target) zip.file(`ppt/embeddings/${target[1]}`, workbook);
  }
}

// ---------------------------------------------------------------- slide building

function addBadge(slide, delta, x, y, w, objectName) {
  const palette = {
    up: { fill: C.upBg, color: C.upText }, // cell down naik = buruk -> merah
    down: { fill: C.downBg, color: C.downText }, // turun = bagus -> hijau
    flat: { fill: C.flatBg, color: C.flatText },
  }[delta.kind];
  slide.addText(delta.text, {
    x, y, w, h: 0.3,
    shape: 'roundRect',
    rectRadius: 0.08,
    fill: { color: palette.fill },
    line: { color: palette.fill, width: 0.5 },
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: palette.color,
    align: 'center',
    valign: 'middle',
    margin: 0,
    fit: 'shrink',
    objectName,
  });
}

function chartOptions({ x, y, w, h, color, min = 0, max, skip, showYAxis = false, grid = false }) {
  return {
    x, y, w, h,
    showTitle: false,
    showLegend: false,
    chartColors: [color],
    lineSize: 2.25,
    lineDataSymbol: 'none',
    lineSmooth: true,
    showValue: false,
    valAxisHidden: !showYAxis,
    valAxisMinVal: min,
    valAxisMaxVal: max,
    valGridLine: grid ? { color: 'E5E7EB', size: 0.5, style: 'solid' } : { style: 'none' },
    valAxisLabelFormatCode: '#,##0',
    valAxisLabelFontFace: FONT,
    valAxisLabelFontSize: 8,
    valAxisLabelColor: C.axis,
    valAxisLineShow: showYAxis,
    valAxisLineColor: C.axisLine,
    catGridLine: { style: 'none' },
    catAxisLabelFontFace: FONT,
    catAxisLabelFontSize: 8,
    catAxisLabelColor: C.axis,
    catAxisLabelRotate: 270,
    catAxisLabelFrequency: skip,
    catAxisLineShow: true,
    catAxisLineColor: C.axisLine,
    showCatAxisTitle: false,
    showValAxisTitle: false,
    showBorder: false,
  };
}
function addComboChart(pptx, slide, { name, labels, values, color, barColor, ...options }) {
  const series = [{ name, labels, values }];
  slide.addChart(
    [
      { type: pptx.ChartType.bar, data: series, options: { chartColors: [barColor], barGapWidthPct: 60 } },
      { type: pptx.ChartType.line, data: series, options: { chartColors: [color], lineSize: 2.25, lineDataSymbol: 'none', lineSmooth: true } },
    ],
    chartOptions({ ...options, color })
  );
}

// Legenda warna manual (kotak + nama), dibungkus ke beberapa baris dan diratakan tengah.
function layoutSwatchLegend(items, width) {
  const itemW = (it) => 0.09 + 0.05 + it.name.length * 0.064 + 0.14;
  const rows = [[]];
  let used = 0;
  for (const it of items) {
    if (used && used + itemW(it) > width) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(it);
    used += itemW(it);
  }
  return { rows, itemW, height: rows.length * 0.17 };
}

function addSwatchLegend(slide, layout, { x, y, w, name }) {
  layout.rows.forEach((row, r) => {
    const rowW = row.reduce((sum, it) => sum + layout.itemW(it), 0) - 0.14;
    let lx = x + (w - rowW) / 2;
    const ly = y + r * 0.17;
    for (const it of row) {
      slide.addShape('rect', { x: lx, y: ly + 0.04, w: 0.09, h: 0.09, fill: { color: it.color }, line: { color: it.color, width: 0 }, objectName: `${name} ${it.name} Warna` });
      slide.addText(it.name, { x: lx + 0.14, y: ly, w: it.name.length * 0.064 + 0.1, h: 0.17, margin: 0, fontFace: FONT, fontSize: 7.5, color: C.muted, valign: 'middle', wrap: false, isTextBox: true, objectName: `${name} ${it.name}` });
      lx += layout.itemW(it);
    }
  });
}

// Padatkan batang per NOP: NOP yang tiketnya 0 di suatu hari tidak menyisakan ruang kosong; NOP di sebelahnya
// maju mengisi, dan kelompok batang tiap hari diratakan di tengah (di atas label tanggal). Satu seri grafik =
// satu "slot" posisi; warna tiap titik mengikuti NOP yang menempati slot itu pada hari tsb.
function packNopSlots(series, dayCount) {
  const perDay = Array.from({ length: dayCount }, (_, d) =>
    series.map((srs, n) => ({ n, v: srs.values[d] })).filter((o) => o.v > 0)
  );
  const slotCount = Math.max(1, ...perDay.map((a) => a.length));
  const slots = Array.from({ length: slotCount }, (_, k) => ({ name: `Bar ${k + 1}`, values: [], pointColors: [], color: '94A3B8' }));
  perDay.forEach((items, d) => {
    const offset = Math.floor((slotCount - items.length) / 2);
    slots.forEach((slot, k) => {
      const it = items[k - offset];
      slot.values.push(it ? it.v : 0);
      slot.pointColors.push(it ? series[it.n].color : null);
    });
  });
  return slots;
}

/**
 * Batang berkelompok: tiap hari satu kelompok batang (satu batang per seri), angka total di atasnya.
 * series = [{ name, values, color }], totals = jumlah per hari (untuk label).
 */
function addClusterChart(pptx, slide, { labels, series, totals, x, y, w, h, barLabels, headroom, pad, gap = 70, legend = true }) {
  const maxBar = labels.map((_, i) => Math.max(0, ...series.map((s) => s.values[i])));
  const axisMax = niceMax(Math.max(...maxBar, 1) * headroom);
  const labelPos = maxBar.map((v) => v + axisMax * pad); // posisi label total (di atas batang tertinggi)
  slide.addChart(
    [
      {
        type: pptx.ChartType.bar,
        data: series.map((s) => ({ name: s.name, labels, values: s.values })),
        options: {
          chartColors: series.map((s) => s.color),
          barGapWidthPct: gap, // jarak antar hari (persen dari lebar satu batang)
          showValue: barLabels,
          dataLabelPosition: 'outEnd',
          dataLabelFontSize: 7,
          dataLabelFontFace: FONT,
          dataLabelColor: C.ink,
          dataLabelFormatCode: '#,##0;;;',
        },
      },
      {
        type: pptx.ChartType.line,
        data: [{ name: 'Total', labels, values: labelPos }],
        options: { chartColors: ['14202B'], lineSize: 1, lineDataSymbol: 'none' },
      },
    ],
    {
      x, y, w, h,
      showTitle: false,
      showLegend: legend,
      legendPos: 'b',
      legendFontFace: FONT,
      legendFontSize: 7.5,
      legendColor: C.muted,
      valAxisMinVal: 0,
      valAxisMaxVal: axisMax,
      valAxisHidden: false,
      valAxisLabelFormatCode: '#,##0',
      valAxisLabelFontFace: FONT,
      valAxisLabelFontSize: 8,
      valAxisLabelColor: C.axis,
      valAxisLineShow: true,
      valAxisLineColor: C.axisLine,
      valGridLine: { color: 'E5E7EB', size: 0.5, style: 'solid' },
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 8,
      catAxisLabelColor: C.axis,
      // Garis pemisah vertikal antar hari, supaya jelas batang mana milik tanggal berapa.
      catGridLine: { color: 'B8BFC8', size: 0.75, style: 'solid' },
      catAxisLineShow: true,
      catAxisLineColor: C.axisLine,
      showBorder: false,
    }
  );
  return { kind: 'cluster', labels, totals, rotateBarLabels: barLabels, pointColors: series.map((s) => s.pointColors || null) };
}

/** Tambahkan slide Trend Weekly ke deck `pptx` yang sudah ada. Mengembalikan { chartSpecs, table } untuk injectDataLabels. */
export function addWeeklyTrendSlide(pptx, { rows, dailyNopRows = [], dailyRows = [], dailyNopByRegion = {}, fromWeek, toWeek, logoData }) {
  const allRows = rows.slice().sort((a, b) => a.key.localeCompare(b.key));
  const selected = allRows.filter((row) => row.key >= fromWeek && row.key <= toWeek);
  if (!selected.length) throw new Error('Tidak ada data Cell Down pada rentang minggu yang dipilih.');

  const lastIdxAll = allRows.findIndex((r) => r.key === selected[selected.length - 1].key);
  const prevRow = lastIdxAll > 0 ? allRows[lastIdxAll - 1] : null;
  const prevValues = prevRow
    ? Object.fromEntries(REGIONS.map((region) => [region, Number(prevRow.values?.[region]) || 0]))
    : null;
  const prevTotal = prevValues ? REGIONS.reduce((s, region) => s + prevValues[region], 0) : null;

  const { labels, byRegion, total } = buildSeries(selected);
  const lastLabel = labels[labels.length - 1];
  const rangeText = `${labels[0]}-${lastLabel}`;
  const lastTotal = total[total.length - 1];
  const extremeIncreases = analyzeExtremeWeeklyIncreases(allRows, dailyNopRows, [selected[selected.length - 1].key]);
  const increaseSummary = buildExtremeIncreaseSummary(extremeIncreases);

  // Trend daily di minggu terakhir yang dipilih (grafik kanan kartu Area + 3 kartu regional).
  const lastKey = selected[selected.length - 1].key;
  const dailyLast = (dailyRows || [])
    .filter((r) => r.date && getPeriodBucket(r.date, 'weekly').key === lastKey)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!dailyLast.length) throw new Error(`Data harian ${lastLabel} tidak tersedia untuk grafik trend daily.`);
  const dailyLabels = dailyLast.map((r) => formatDayMonth(r.date));
  const dailyByRegion = Object.fromEntries(
    REGIONS.map((region) => [region, dailyLast.map((r) => Number(r[region]) || 0)])
  );
  const dailyTotal = dailyLast.map((_, i) => REGIONS.reduce((sum, region) => sum + dailyByRegion[region][i], 0));

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header: bar merah + judul + logo
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.14,
    fill: { color: C.topBar }, line: { color: C.topBar, width: 0 },
    objectName: 'Header Bar',
  });
  slide.addText(
    [
      { text: 'Trend Weekly Cell Down  ', options: { color: C.titleRed } },
      { text: `| ${AREA_LABEL}  & Regional`, options: { color: C.titleBlue } },
    ],
    {
      x: 0.1, y: 0.2, w: 9.2, h: 0.4, margin: [0, 0, 0, 0.1],
      fontFace: TITLE_FONT, fontSize: 18, bold: true, valign: 'middle',
      isTextBox: true, objectName: 'Judul',
    }
  );
  if (logoData) {
    slide.addImage({ data: logoData, x: 10.64, y: 0.14, w: 2.53, h: 0.575, objectName: 'Logo' });
  }

  // ---- Kartu atas: total semua regional
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.67, y: 0.92, w: 11.99, h: 2.65, rectRadius: 0.08,
    fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 },
    objectName: 'Kartu Total',
  });
  slide.addText(`${AREA_LABEL.toUpperCase()} · CELL DOWN ${lastLabel}`, {
    x: 0.89, y: 1.46, w: 3.1, h: 0.24, margin: 0,
    fontFace: FONT, fontSize: 12, bold: true, color: C.accent, charSpacing: 1, wrap: false,
    isTextBox: true, objectName: 'Total Label',
  });
  slide.addText(fmt(lastTotal), {
    x: 0.89, y: 1.76, w: 2.7, h: 0.69, margin: 0,
    fontFace: FONT, fontSize: 48, bold: true, color: C.ink,
    isTextBox: true, objectName: 'Total Angka',
  });
  addBadge(slide, buildDelta(lastTotal, prevTotal, prevRow?.label, true), 0.89, 2.51, 2.75, 'Total Badge');

  // Judul kecil di atas masing-masing grafik kartu Area
  slide.addText(`Trend Weekly ${rangeText}`, {
    x: 3.78, y: 1.02, w: 3.7, h: 0.22, margin: 0,
    fontFace: FONT, fontSize: 10, bold: true, color: C.muted,
    isTextBox: true, objectName: 'Judul Chart Weekly',
  });
  slide.addText(`Trend Daily ${lastLabel}`, {
    x: 7.78, y: 1.02, w: 4.7, h: 0.22, margin: 0,
    fontFace: FONT, fontSize: 10, bold: true, color: C.muted,
    isTextBox: true, objectName: 'Judul Chart Daily',
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 7.64, y: 1.08, w: 0, h: 2.38,
    line: { color: C.cardLine, width: 0.75 },
    objectName: 'Pemisah Chart',
  });

  // chart1.xml = total weekly (rentang terpilih)
  const chartSpecs = [];
  addComboChart(pptx, slide, {
    name: AREA_LABEL, labels, values: total, color: C.totalLine, barColor: C.totalLine,
    x: 3.71, y: 1.26, w: 3.9, h: 2.33, max: Math.max(...total) * 1.22 || 10, skip: 1, showYAxis: true, grid: true,
  });
  chartSpecs.push({
    col: REGIONS.length,
    labels,
    values: total,
    color: C.totalLine,
    barColor: C.totalLine,
    indexes: pickLabelIndexes(total, { mid: true }),
    format: (label, value) => `${label}: ${fmt(value)}`,
    style: { size: 900, bold: true, color: C.ink, fill: null },
  });

  // chart2.xml = trend daily Area 1 (minggu terakhir): batang per regional + angka total per hari di atasnya
  const areaCluster = addClusterChart(pptx, slide, {
    labels: dailyLabels,
    series: REGIONS.map((region) => ({ name: region, values: dailyByRegion[region], color: (REGION_STYLE[region] || FALLBACK_STYLE).bar || FALLBACK_STYLE.line })),
    totals: dailyTotal,
    x: 7.66, y: 1.26, w: 5.0, h: 2.33,
    barLabels: true, headroom: 1.55, pad: 0.2, gap: 100,
  });
  chartSpecs.push(areaCluster);

  // ---- Tiga kartu bawah: per regional (chart3..5), batang per NOP + angka total per hari
  const cardW = 3.88;
  const cardXs = [0.67, 4.73, 8.78];
  const cardY = 3.74;
  const cardH = 3.02;
  REGIONS.forEach((region, i) => {
    const x = cardXs[i];
    const weeklyValues = byRegion[region];
    const style = REGION_STYLE[region] || FALLBACK_STYLE;
    const lastValue = weeklyValues[weeklyValues.length - 1]; // rata-rata minggu terakhir (utk angka & selisih)

    // Batang per NOP (hari = tanggal yang sama dengan trend daily). Tanpa rincian NOP -> 1 batang per regional.
    const nopSrc = dailyNopByRegion?.[region];
    const nopByDate = new Map((nopSrc?.rows || []).map((r) => [r.date, r.byNop || {}]));
    const activeNops = (nopSrc?.nops || []).filter((nop) => dailyLast.some((r) => Number(nopByDate.get(r.date)?.[nop]) > 0));
    const series = activeNops.length
      ? activeNops.map((nop, n) => ({
          name: nopLabel(nop),
          values: dailyLast.map((r) => Number(nopByDate.get(r.date)?.[nop]) || 0),
          color: NOP_PALETTE[n % NOP_PALETTE.length],
        }))
      : [{ name: region, values: dailyByRegion[region], color: style.bar || style.line }];
    const totals = dailyLast.map((_, d) => series.reduce((sum, srs) => sum + srs.values[d], 0));

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: cardY, w: cardW, h: cardH, rectRadius: 0.08,
      fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 },
      objectName: `Kartu ${region}`,
    });
    slide.addText(region, {
      x: x + 0.2, y: cardY + 0.17, w: 2.2, h: 0.29, margin: 0,
      fontFace: FONT, fontSize: 16, bold: true, color: C.ink,
      isTextBox: true, objectName: `${region} Nama`,
    });
    slide.addText(fmt(lastValue), {
      x: x + cardW - 1.2, y: cardY + 0.17, w: 1.0, h: 0.29, margin: 0,
      fontFace: FONT, fontSize: 16, bold: true, color: C.ink, align: 'right',
      isTextBox: true, objectName: `${region} Angka`,
    });
    slide.addText(`Trend daily ${lastLabel}`, {
      x: x + 0.2, y: cardY + 0.47, w: 1.6, h: 0.24, margin: 0,
      fontFace: FONT, fontSize: 10, color: C.muted,
      isTextBox: true, objectName: `${region} Periode`,
    });
    addBadge(
      slide,
      buildDelta(lastValue, prevValues?.[region], prevRow?.label, false, 'Ticket'),
      x + 1.78, cardY + 0.5, cardW - 1.98, `${region} Badge`
    );

    // Legenda NOP digambar manual (warna mengikuti NOP, bukan seri grafik yang sudah dipadatkan).
    const legendLayout = layoutSwatchLegend(series.map((srs) => ({ name: srs.name, color: srs.color })), cardW - 0.4);
    const chartH = 2.16 - legendLayout.height - 0.04;
    chartSpecs.push(
      addClusterChart(pptx, slide, {
        labels: dailyLabels,
        series: packNopSlots(series, dailyLast.length),
        totals,
        x: x + 0.02, y: cardY + 0.82, w: cardW - 0.04, h: chartH,
        barLabels: false, headroom: 1.22, pad: 0.07, gap: 150, legend: false,
      })
    );
    addSwatchLegend(slide, legendLayout, { x: x + 0.2, y: cardY + 0.82 + chartH + 0.04, w: cardW - 0.4, name: `${region} Legenda` });
  });

  if (increaseSummary) {
    slide.addText('Penyebab Kenaikan', {
      x: 0.72, y: 6.82, w: 11.9, h: 0.2, margin: 0,
      fontFace: FONT, fontSize: 12, bold: true, color: C.ink,
      fill: { color: 'FFFF00' },
      isTextBox: true, objectName: 'Judul Penyebab Kenaikan',
    });
    slide.addText(increaseSummary, {
      x: 0.72, y: 7.02, w: 11.9, h: 0.4, margin: 0,
      fontFace: FONT, fontSize: 12, color: C.ink, valign: 'top',
      fill: { color: 'FFFF00' },
      breakLine: false, fit: 'shrink', isTextBox: true, objectName: 'Ringkasan Penyebab Kenaikan',
    });
  }

  const table = {
    labels,
    columns: [...REGIONS.map((region) => ({ name: region, values: byRegion[region] })), { name: AREA_LABEL, values: total }],
  };
  return { chartSpecs, table };
}

export async function buildWeeklyTrendPptx({ rows, dailyNopRows = [], dailyRows = [], dailyNopByRegion = {}, fromWeek, toWeek, logoData }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.subject = `Trend Weekly Cell Down ${AREA_LABEL}`;
  pptx.title = `Trend Weekly Cell Down ${AREA_LABEL}`;
  pptx.theme = { headFontFace: TITLE_FONT, bodyFontFace: FONT, lang: 'id-ID' };
  const { chartSpecs, table } = addWeeklyTrendSlide(pptx, { rows, dailyNopRows, dailyRows, dailyNopByRegion, fromWeek, toWeek, logoData });
  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  const zip = await JSZip.loadAsync(buffer);
  await injectDataLabels(zip, await getSlideChartPaths(zip, 1), chartSpecs, table);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
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

export async function exportWeeklyTrendPpt({ rows, dailyNopRows, dailyRows, dailyNopByRegion, fromWeek, toWeek, fileName }) {
  const selected = rows.filter((row) => row.key >= fromWeek && row.key <= toWeek);
  if (!selected.length) throw new Error('Tidak ada data Cell Down pada rentang minggu yang dipilih.');

  const logoData = await loadLogoDataUrl();
  const buffer = await buildWeeklyTrendPptx({ rows, dailyNopRows, dailyRows, dailyNopByRegion, fromWeek, toWeek, logoData });

  const first = selected[0].label;
  const last = selected[selected.length - 1].label;
  const outputName = fileName || `Trend_Weekly_Cell_Down_${AREA_LABEL.replace(' ', '_')}_${first}_${last}.pptx`;

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
