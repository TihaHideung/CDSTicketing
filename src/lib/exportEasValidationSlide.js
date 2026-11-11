import { BUCKETS, BUCKET_LABELS } from '../features/eas-vswr/lib/easReport.js';
import { getSlideChartPaths, normalizeComboXml } from './pptxUtils.js';

/*
 * Slide "EAS Validation | Area 1" untuk Weekly Huddle (header, font, dan kartu disamakan dengan
 * slide Trend Weekly Cell Down).
 *
 * Sumber data: riwayat harian halaman EAS & VSWR (tiap record punya metrics.easReport, hasil
 * Report Daily EAS). Satu slide = satu minggu (Jumat s/d Kamis, sama dengan Trend Weekly):
 *   - 2 tabel (Extended, Quickwin) per Regional, gaya tabel Report Daily (C11:S15):
 *       Baseline Awal Week | Ach Validasi Week (jumlah harian) | Baseline Akhir Week | Ach Total
 *   - 2 grafik batang + garis: Ach Validasi per hari di minggu tsb (Extended, Quickwin)
 *   - Overall Summary Area 1: Total Site, Open per P (baseline akhir week), Closed per P (ach week)
 *
 * Baseline Awal Week = baseline record pertama di minggu itu DITAMBAH ach record itu, karena baseline
 * hari itu sudah tidak memuat site yang selesai H-1. Dengan begitu Awal - Ach = Akhir (kecuali ada site baru).
 */

const FONT = 'IBM Plex Sans';
const TITLE_FONT = 'Poppins';
const AREA_LABEL = 'Area 1';

const C = {
  topBar: 'BE133E',
  titleRed: 'BE1540',
  titleBlue: '012E98',
  card: 'FCFCFA',
  cardLine: 'E1E0D9',
  ink: '14202B',
  muted: '66707C',
  accent: '1C5CAB',
  navy: '002060',
  ach: 'C55A11',
  achTotal: 'A9D08E',
  rowFill: 'DDEBF7',
  white: 'FFFFFF',
  axis: '66707C',
  axisLine: 'D5D8DC',
};

const CATS = [
  { key: 'extended', label: 'Extended', color: 'C55A11' },
  { key: 'quickwin', label: 'Quickwin', color: '1C5CAB' },
];

const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const fmtPct = (n) => (n == null || !Number.isFinite(n) ? '-' : `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`);

const emptyB = () => ({ P1: 0, 'P2-P5': 0, P6: 0, P7: 0 });
const sumB = (b) => BUCKETS.reduce((s, k) => s + (Number(b?.[k]) || 0), 0);
const addB = (a, b) => Object.fromEntries(BUCKETS.map((k) => [k, (a?.[k] || 0) + (b?.[k] || 0)]));

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayMonth(iso) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Hitung semua angka slide dari riwayat EAS & VSWR.
 * @param history   array record (getEasVswrHistory)
 * @param weekKey   tanggal awal minggu (Jumat) 'YYYY-MM-DD', dari getPeriodBucket(..,'weekly').key
 * @returns null kalau minggu itu tidak punya record EAS.
 */
export function buildEasWeekData(history, weekKey) {
  const end = addDaysISO(weekKey, 6);
  const recs = (history || [])
    .filter((r) => r?.dateISO >= weekKey && r.dateISO <= end && r.metrics?.easReport?.extended && r.metrics.easReport.quickwin)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (!recs.length) return null;

  const first = recs[0];
  const last = recs[recs.length - 1];
  const out = { weekKey, from: first.dateISO, to: last.dateISO, days: recs.length, cats: {} };

  for (const cat of CATS) {
    const regionalNames = [];
    for (const r of recs) {
      for (const reg of r.metrics.easReport[cat.key].regionals || []) {
        if (!regionalNames.includes(reg.regional)) regionalNames.push(reg.regional);
      }
    }
    regionalNames.sort((a, b) => a.localeCompare(b));

    const rowOf = (rec, regional) => (rec.metrics.easReport[cat.key].regionals || []).find((x) => x.regional === regional);
    const rows = regionalNames.map((regional) => {
      const f = rowOf(first, regional);
      const l = rowOf(last, regional);
      let ach = emptyB();
      for (const r of recs) ach = addB(ach, rowOf(r, regional)?.ach);
      const start = addB(f?.baseline, f?.ach);
      const endB = l?.baseline || emptyB();
      const total = l?.total || 0;
      const done = l?.done || 0;
      return {
        label: regional,
        start: { ...BUCKETS.reduce((o, k) => ({ ...o, [k]: start[k] }), {}), total: sumB(start) },
        ach: { ...ach, total: sumB(ach) },
        end: { ...BUCKETS.reduce((o, k) => ({ ...o, [k]: endB[k] || 0 }), {}), total: sumB(endB) },
        total,
        done,
        donePct: total > 0 ? (done / total) * 100 : null,
      };
    });

    const area = rows.reduce(
      (acc, r) => ({
        start: addB(acc.start, r.start),
        ach: addB(acc.ach, r.ach),
        end: addB(acc.end, r.end),
        total: acc.total + r.total,
        done: acc.done + r.done,
      }),
      { start: emptyB(), ach: emptyB(), end: emptyB(), total: 0, done: 0 }
    );

    out.cats[cat.key] = {
      rows,
      area: { ...area, ach: { ...area.ach, total: sumB(area.ach) } },
      daily: recs.map((r) => ({
        dateISO: r.dateISO,
        label: dayMonth(r.dateISO),
        ach: Number(r.metrics.easReport[cat.key].area?.ach?.total) || 0,
      })),
    };
  }

  // Overall Summary Area 1 (Extended + Quickwin)
  const ext = out.cats.extended.area;
  const qw = out.cats.quickwin.area;
  const open = addB(ext.end, qw.end);
  const closed = addB(ext.ach, qw.ach);
  const totalSites = ext.total + qw.total;
  const done = ext.done + qw.done;
  out.summary = {
    totalSites,
    done,
    donePct: totalSites > 0 ? (done / totalSites) * 100 : null,
    open,
    closed,
    openTotal: sumB(open),
    closedTotal: sumB(closed),
    byCat: {
      extended: { total: ext.total, open: ext.end, closed: ext.ach },
      quickwin: { total: qw.total, open: qw.end, closed: qw.ach },
    },
  };
  return out;
}

// ---------------------------------------------------------------- slide

const cell = (text, o = {}) => ({ text: String(text), options: { align: 'center', valign: 'middle', ...o } });

function addCatTable(pptx, slide, { cat, data, weekLabel, x, y, w }) {
  const base = { fontFace: FONT, fontSize: 9, color: C.ink, border: { type: 'solid', pt: 0.5, color: 'FFFFFF' } };
  const head = (text, fill, extra = {}) => cell(text, { ...base, bold: true, color: C.white, fill: { color: fill }, ...extra });

  const row1 = [
    head('Regional', C.navy, { rowspan: 2, align: 'left' }),
    head(`Site Belum Validasi - Baseline Awal ${weekLabel}`, C.navy, { colspan: 5 }),
    head(`Ach Validasi ${weekLabel}`, C.ach, { colspan: 5 }),
    head(`Site Belum Validasi - Baseline Akhir ${weekLabel}`, C.navy, { colspan: 5 }),
    head('Ach Total', C.achTotal, { colspan: 3, color: C.ink }),
  ];
  const sub = (fill, color = C.white) => [...BUCKETS.map((k) => head(BUCKET_LABELS[k], fill, { color })), head('Total', fill, { color })];
  const row2 = [
    ...sub(C.navy),
    ...sub(C.ach),
    ...sub(C.navy),
    head('Total Site', C.achTotal, { color: C.ink }),
    head('Done', C.achTotal, { color: C.ink }),
    head('Ach%', C.achTotal, { color: C.ink }),
  ];

  const block = (b) => [...BUCKETS.map((k) => fmt(b[k])), fmt(b.total)];
  const dataRows = data.rows.map((r) => {
    const vals = [...block(r.start), ...block(r.ach), ...block(r.end), fmt(r.total), fmt(r.done), fmtPct(r.donePct)];
    return [
      cell(r.label, { ...base, bold: true, align: 'left', fill: { color: C.rowFill } }),
      ...vals.map((v, i) => cell(v, { ...base, bold: i % 5 === 4 || i >= 15, fill: { color: C.rowFill } })),
    ];
  });

  const numW = 0.585;
  const colW = [1.2, ...Array(15).fill(numW), 0.8, 0.7, 0.7];
  const scale = w / colW.reduce((s, n) => s + n, 0);
  slide.addTable([row1, row2, ...dataRows], {
    x, y, w,
    colW: colW.map((n) => n * scale),
    rowH: [0.3, 0.22, ...data.rows.map(() => 0.25)],
    margin: [0, 0.04, 0, 0.04],
    objectName: `Tabel ${cat.label}`,
  });
}

function addAchChart(pptx, slide, { cat, daily, x, y, w, h }) {
  const labels = daily.map((d) => d.label);
  const values = daily.map((d) => d.ach);
  const series = [{ name: `Ach Validasi ${cat.label}`, labels, values }];
  const max = Math.max(...values, 1);
  slide.addChart(
    [
      { type: pptx.ChartType.bar, data: series, options: { chartColors: [cat.color], barGapWidthPct: 60, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 9, dataLabelFontFace: FONT, dataLabelColor: C.ink, dataLabelFontBold: true } },
      { type: pptx.ChartType.line, data: series, options: { chartColors: ['14202B'], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 6, lineSmooth: false } },
    ],
    {
      x, y, w, h,
      showTitle: false,
      showLegend: false,
      valAxisHidden: false,
      valAxisMinVal: 0,
      valAxisMaxVal: Math.ceil(max * 1.3) || 5,
      valAxisLabelFontFace: FONT,
      valAxisLabelFontSize: 8,
      valAxisLabelColor: C.axis,
      valGridLine: { style: 'none' },
      valAxisLineShow: true,
      valAxisLineColor: C.axisLine,
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 8,
      catAxisLabelColor: C.axis,
      catGridLine: { style: 'none' },
      catAxisLineShow: true,
      catAxisLineColor: C.axisLine,
      showBorder: false,
      objectName: `Chart Ach ${cat.label}`,
    }
  );
}

/**
 * Rapikan XML 2 grafik batang+garis di slide EAS agar valid di PowerPoint (axId, urutan elemen line series).
 * Dipanggil setelah deck ditulis ke zip; `slideNo` = nomor slide EAS di deck.
 */
export async function fixEasValidationCharts(zip, slideNo) {
  const paths = await getSlideChartPaths(zip, slideNo);
  for (const path of paths) {
    const file = zip.file(path);
    if (!file) continue;
    const { xml } = normalizeComboXml(await file.async('string'), { color: '14202B', width: 25400, marker: true, markerSize: 6 });
    zip.file(path, xml);
  }
}

/** Tambahkan slide EAS Validation ke deck `pptx`. `data` dari buildEasWeekData; `weekLabel` mis. 'W41'. */
export function addEasValidationSlide(pptx, { data, weekLabel, logoData }) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header sama dengan slide Trend Weekly Cell Down
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.14, fill: { color: C.topBar }, line: { color: C.topBar, width: 0 }, objectName: 'Header Bar' });
  slide.addText(
    [
      { text: 'EAS Validation  ', options: { color: C.titleRed } },
      { text: `| ${AREA_LABEL}  ${weekLabel}`, options: { color: C.titleBlue } },
    ],
    { x: 0.1, y: 0.2, w: 9.2, h: 0.4, margin: [0, 0, 0, 0.1], fontFace: TITLE_FONT, fontSize: 18, bold: true, valign: 'middle', isTextBox: true, objectName: 'Judul' }
  );
  if (logoData) slide.addImage({ data: logoData, x: 10.64, y: 0.14, w: 2.53, h: 0.575, objectName: 'Logo' });

  const range = `${dayMonth(data.from)} - ${dayMonth(data.to)}`;
  slide.addText(`${weekLabel} (${range}, ${data.days} hari data)`, {
    x: 6.0, y: 0.62, w: 6.65, h: 0.2, margin: 0, align: 'right',
    fontFace: FONT, fontSize: 9, color: C.muted, isTextBox: true, objectName: 'Periode',
  });

  // ---- Dua tabel: Extended, Quickwin
  const tableX = 0.6;
  const tableW = 12.13;
  const tableYs = [0.9, 2.55];
  CATS.forEach((cat, i) => {
    slide.addText(`${cat.label.toUpperCase()} · ${AREA_LABEL.toUpperCase()}`, {
      x: tableX, y: tableYs[i], w: 4, h: 0.22, margin: 0,
      fontFace: FONT, fontSize: 11, bold: true, color: C.accent, charSpacing: 1, isTextBox: true, objectName: `Judul Tabel ${cat.label}`,
    });
    addCatTable(pptx, slide, { cat, data: data.cats[cat.key], weekLabel, x: tableX, y: tableYs[i] + 0.25, w: tableW });
  });

  // ---- Bawah: 2 grafik + summary
  const cardY = 4.25;
  const cardH = 3.0;
  const cardW = 4.0;
  const cardXs = [0.6, 4.72];
  CATS.forEach((cat, i) => {
    const x = cardXs[i];
    slide.addShape(pptx.ShapeType.roundRect, { x, y: cardY, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 }, objectName: `Kartu ${cat.label}` });
    slide.addText(`Ach Validasi Harian ${cat.label}`, { x: x + 0.2, y: cardY + 0.12, w: 3.0, h: 0.26, margin: 0, fontFace: FONT, fontSize: 13, bold: true, color: C.ink, isTextBox: true, objectName: `${cat.label} Nama` });
    slide.addText(`${weekLabel}: ${fmt(data.cats[cat.key].area.ach.total)} site`, { x: x + 0.2, y: cardY + 0.4, w: 3.4, h: 0.22, margin: 0, fontFace: FONT, fontSize: 10, color: C.muted, isTextBox: true, objectName: `${cat.label} Periode` });
    addAchChart(pptx, slide, { cat, daily: data.cats[cat.key].daily, x: x + 0.05, y: cardY + 0.65, w: cardW - 0.1, h: cardH - 0.75 });
  });

  // Overall summary
  const sx = 8.84;
  const sw = 3.89;
  const s = data.summary;
  slide.addShape(pptx.ShapeType.roundRect, { x: sx, y: cardY, w: sw, h: cardH, rectRadius: 0.08, fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 }, objectName: 'Kartu Summary' });
  slide.addText('Overall Summary', { x: sx + 0.2, y: cardY + 0.12, w: 2.2, h: 0.26, margin: 0, fontFace: FONT, fontSize: 13, bold: true, color: C.ink, isTextBox: true, objectName: 'Summary Judul' });
  slide.addText(
    [
      { text: 'Total Site ', options: { color: C.muted } },
      { text: fmt(s.totalSites), options: { bold: true, color: C.ink } },
      { text: `   Done ${fmt(s.done)} (${fmtPct(s.donePct)})`, options: { color: C.muted } },
    ],
    { x: sx + 0.2, y: cardY + 0.4, w: sw - 0.4, h: 0.22, margin: 0, fontFace: FONT, fontSize: 10, isTextBox: true, objectName: 'Summary Total' }
  );
  slide.addText(`Extended ${fmt(s.byCat.extended.total)} · Quickwin ${fmt(s.byCat.quickwin.total)}`, {
    x: sx + 0.2, y: cardY + 0.62, w: sw - 0.4, h: 0.2, margin: 0, fontFace: FONT, fontSize: 9, color: C.muted, isTextBox: true, objectName: 'Summary Total Detail',
  });

  const base = { fontFace: FONT, fontSize: 10, color: C.ink, border: { type: 'solid', pt: 0.5, color: 'FFFFFF' } };
  const head = (t, fill, color = C.white) => cell(t, { ...base, bold: true, color, fill: { color: fill } });
  const body = [
    [head('Prioritas', C.navy), head('Open', C.navy), head('Closed', C.ach)],
    ...BUCKETS.map((k) => [
      cell(BUCKET_LABELS[k], { ...base, bold: true, align: 'left', fill: { color: C.rowFill } }),
      cell(fmt(s.open[k]), { ...base, fill: { color: C.rowFill } }),
      cell(fmt(s.closed[k]), { ...base, fill: { color: C.rowFill } }),
    ]),
    [
      cell('Total', { ...base, bold: true, align: 'left', fill: { color: C.achTotal } }),
      cell(fmt(s.openTotal), { ...base, bold: true, fill: { color: C.achTotal } }),
      cell(fmt(s.closedTotal), { ...base, bold: true, fill: { color: C.achTotal } }),
    ],
  ];
  slide.addTable(body, {
    x: sx + 0.2, y: cardY + 0.92, w: sw - 0.4,
    colW: [1.3, 1.1, 1.09],
    rowH: 0.28,
    margin: [0, 0.06, 0, 0.06],
    objectName: 'Tabel Summary',
  });
  slide.addText(`Open = sisa baseline akhir ${weekLabel}. Closed = Ach Validasi selama ${weekLabel}.`, {
    x: sx + 0.2, y: cardY + cardH - 0.3, w: sw - 0.4, h: 0.2, margin: 0, fontFace: FONT, fontSize: 8, color: C.muted, isTextBox: true, objectName: 'Summary Catatan',
  });
}
