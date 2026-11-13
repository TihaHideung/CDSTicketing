import { BUCKETS, BUCKET_LABELS } from '../features/eas-vswr/lib/easReport.js';
import { addStandardHeaderFooter } from './pptxUtils.js';

/*
 * Slide "EAS Validation | Area 1" untuk Weekly Huddle dan Monthly Report (header, font, dan kartu
 * disamakan dengan slide Profiling KPI / Availability).
 *
 * Sumber data: riwayat harian halaman EAS & VSWR (tiap record punya metrics.easReport, hasil
 * Report Daily EAS). Satu slide = satu periode (minggu Jumat-Kamis atau satu bulan kalender):
 *   - Atas : 3 kartu ringkasan % valid (Quick Win, Extended, Gabungan) per record terakhir di periode itu,
 *            lalu tabel Top 5 dan Bottom 5 NOP berdasarkan % valid gabungan.
 *   - Bawah: 2 tabel (Extended, Quickwin) per Regional, gaya tabel Report Daily (C11:S15):
 *            Baseline Awal | Ach Validasi (jumlah harian) | Baseline Akhir | Ach Total
 *
 * "Valid" = site yang sudah divalidasi (Done) = total site - baseline (site yang belum validasi).
 * Baseline Awal = baseline record pertama di periode itu DITAMBAH ach record itu, karena baseline
 * hari itu sudah tidak memuat site yang selesai H-1. Dengan begitu Awal - Ach = Akhir (kecuali ada site baru).
 */

const FONT = 'IBM Plex Sans';
const AREA_LABEL = 'Area 1';

const C = {
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

function dayMonthYear(iso) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
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
/** Minggu (Jumat-Kamis) yang diawali `weekKey`. */
export function buildEasWeekData(history, weekKey) {
  return buildEasPeriodData(history, { from: weekKey, to: addDaysISO(weekKey, 6) });
}

/**
 * Susun data slide EAS untuk periode [from, to] (tanggal upload ISO, inklusif).
 * @returns null kalau periode itu tidak punya record EAS.
 */
export function buildEasPeriodData(history, { from: weekKey, to: end }) {
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

  // ---- Ringkasan % valid (record terakhir di periode) + peringkat NOP
  const lastRep = last.metrics.easReport;
  const pctOf = (done, total) => (total > 0 ? (done / total) * 100 : null);
  const areaOf = (cat) => ({ total: lastRep[cat].area?.total || 0, done: lastRep[cat].area?.done || 0 });
  const qwA = areaOf('quickwin');
  const extA = areaOf('extended');
  const allA = { total: qwA.total + extA.total, done: qwA.done + extA.done };
  const withPct = (a) => ({ ...a, pct: pctOf(a.done, a.total), sisa: a.total - a.done });
  out.valid = { quickwin: withPct(qwA), extended: withPct(extA), all: withPct(allA), dateISO: last.dateISO };

  const nopMap = new Map();
  const regMap = new Map();
  for (const [cat, short] of [['quickwin', 'qw'], ['extended', 'ext']]) {
    for (const reg of lastRep[cat].regionals || []) {
      const rEntry = regMap.get(reg.regional) || { regional: reg.regional, total: 0, done: 0 };
      rEntry.total += reg.total || 0;
      rEntry.done += reg.done || 0;
      regMap.set(reg.regional, rEntry);
      for (const n of reg.nops || []) {
        const k = String(n.label).trim().toUpperCase();
        const e = nopMap.get(k) || { nop: n.label, qw: { total: 0, done: 0 }, ext: { total: 0, done: 0 } };
        e[short].total += n.total || 0;
        e[short].done += n.done || 0;
        nopMap.set(k, e);
      }
    }
  }
  const ranked = [...nopMap.values()]
    .map((e) => ({
      nop: e.nop,
      qwPct: pctOf(e.qw.done, e.qw.total),
      extPct: pctOf(e.ext.done, e.ext.total),
      totalPct: pctOf(e.qw.done + e.ext.done, e.qw.total + e.ext.total),
    }))
    .filter((e) => e.totalPct != null)
    .sort((a, b) => b.totalPct - a.totalPct || a.nop.localeCompare(b.nop));
  out.ranking = {
    count: ranked.length,
    top: ranked.slice(0, 5).map((e, i) => ({ rank: i + 1, ...e })),
    bottom: ranked.slice(-5).reverse().map((e, i) => ({ rank: ranked.length - i, ...e })),
  };
  const regRanked = [...regMap.values()]
    .map((r) => ({ regional: r.regional, pct: pctOf(r.done, r.total) }))
    .filter((r) => r.pct != null)
    .sort((a, b) => b.pct - a.pct);
  out.regionalRange = regRanked.length ? { best: regRanked[0], worst: regRanked[regRanked.length - 1] } : null;
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

const nopTitle = (nop) => String(nop).replace(/^NOP\s+/i, '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const TEAL = '0B7A75';
const ORANGE = 'C2410C';

// Kartu persen valid: judul kecil, angka besar, progress bar, dan "x / y site valid · sisa z".
function addValidCard(pptx, slide, { x, y, w, h, label, stat, dark = false, accent }) {
  const ink = dark ? C.white : C.ink;
  const sub = dark ? 'C9D3E6' : C.muted;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: dark ? C.navy : C.card }, line: { color: dark ? C.navy : C.cardLine, width: 0.75 },
    objectName: `Kartu ${label}`,
  });
  if (!dark) slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.06, w: 0.05, h: h - 0.12, fill: { color: accent }, line: { color: accent, width: 0 }, objectName: `Aksen ${label}` });
  slide.addText(label, { x: x + 0.2, y: y + 0.08, w: w - 0.4, h: 0.18, margin: 0, fontFace: FONT, fontSize: 9, bold: true, color: sub, charSpacing: 1, isTextBox: true, objectName: `${label} Label` });
  slide.addText(fmtPct(stat.pct), { x: x + 0.2, y: y + 0.26, w: w - 0.4, h: 0.38, margin: 0, fontFace: FONT, fontSize: 26, bold: true, color: ink, isTextBox: true, objectName: `${label} Persen` });
  const barX = x + 0.2;
  const barW = w - 0.4;
  slide.addShape(pptx.ShapeType.roundRect, { x: barX, y: y + 0.68, w: barW, h: 0.07, rectRadius: 0.03, fill: { color: dark ? '3D5A8F' : 'E5E7EB' }, line: { color: dark ? '3D5A8F' : 'E5E7EB', width: 0 }, objectName: `${label} Track` });
  const fillW = Math.max(0.02, barW * Math.min(1, (stat.pct || 0) / 100));
  slide.addShape(pptx.ShapeType.roundRect, { x: barX, y: y + 0.68, w: fillW, h: 0.07, rectRadius: 0.03, fill: { color: dark ? C.white : accent }, line: { color: dark ? C.white : accent, width: 0 }, objectName: `${label} Progress` });
  slide.addText(`${fmt(stat.done)} / ${fmt(stat.total)} site valid · sisa ${fmt(stat.sisa)}`, { x: x + 0.2, y: y + 0.78, w: w - 0.4, h: 0.17, margin: 0, fontFace: FONT, fontSize: 8, color: sub, isTextBox: true, objectName: `${label} Detail` });
}

// Tabel peringkat NOP (Top 5 / Bottom 5): # | NOP | QW | EXT | Total
function addRankTable(slide, { title, rows, headFill, totalColor, x, y, w, name }) {
  slide.addText(title, { x, y, w, h: 0.22, margin: 0, fontFace: FONT, fontSize: 11, bold: true, color: headFill, isTextBox: true, objectName: `Judul ${name}` });
  const base = { fontFace: FONT, fontSize: 8.5, color: C.ink, border: { type: 'solid', pt: 0.5, color: 'E5E7EB' } };
  const head = (t, align = 'center') => cell(t, { ...base, bold: true, color: C.white, fill: { color: headFill }, align });
  const body = rows.map((r) => [
    cell(r.rank, { ...base, color: C.muted }),
    cell(nopTitle(r.nop), { ...base, align: 'left' }),
    cell(fmtPct(r.qwPct), { ...base }),
    cell(fmtPct(r.extPct), { ...base }),
    cell(fmtPct(r.totalPct), { ...base, bold: true, color: totalColor }),
  ]);
  const table = [[head('#'), head('NOP', 'left'), head('QW'), head('EXT'), head('Total')], ...body];
  slide.addTable(table, {
    x, y: y + 0.25, w, colW: [0.45, w - 0.45 - 3 * 0.85, 0.85, 0.85, 0.85], rowH: 0.2, margin: [0, 0.06, 0, 0.06], objectName: name,
  });
}

/** Tambahkan slide EAS Validation ke deck `pptx`. `data` dari buildEasPeriodData; `weekLabel` = label periode (mis. 'W41' / 'Okt 2026'). */
export function addEasValidationSlide(pptx, { data, weekLabel, logoData }) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header + footer sama dengan slide Profiling KPI dan Trend Weekly Availability
  const range = `${dayMonth(data.from)} - ${dayMonth(data.to)}`;
  addStandardHeaderFooter(pptx, slide, {
    title: 'EAS Validation',
    subtitle: `${AREA_LABEL.toUpperCase()} – ${weekLabel} (${range}, ${data.days} hari data)`,
    logoData,
  });

  const X0 = 0.45;
  const W = 12.43;

  // ---- Ringkasan % valid
  slide.addText(`VALIDASI EAS · UPDATE ${dayMonthYear(data.valid.dateISO).toUpperCase()}`, {
    x: X0, y: 0.86, w: 8, h: 0.2, margin: 0, fontFace: FONT, fontSize: 9, bold: true, color: C.accent, charSpacing: 1, isTextBox: true, objectName: 'Caption Update',
  });
  const gap = 0.15;
  const cw = (W - gap * 2) / 3;
  const cy = 1.1;
  const ch = 0.98;
  addValidCard(pptx, slide, { x: X0, y: cy, w: cw, h: ch, label: 'QUICK WIN', stat: data.valid.quickwin, accent: TEAL });
  addValidCard(pptx, slide, { x: X0 + cw + gap, y: cy, w: cw, h: ch, label: 'EXTENDED', stat: data.valid.extended, accent: C.accent });
  addValidCard(pptx, slide, { x: X0 + (cw + gap) * 2, y: cy, w: cw, h: ch, label: 'GABUNGAN', stat: data.valid.all, dark: true });

  // ---- Top 5 / Bottom 5 NOP
  const ty = 2.22;
  const tw = (W - 0.3) / 2;
  if (data.ranking.count) {
    addRankTable(slide, { title: 'Top 5 NOP · % valid gabungan', rows: data.ranking.top, headFill: TEAL, totalColor: TEAL, x: X0, y: ty, w: tw, name: 'Tabel Top 5 NOP' });
    addRankTable(slide, { title: 'Bottom 5 NOP · % valid gabungan', rows: data.ranking.bottom, headFill: ORANGE, totalColor: ORANGE, x: X0 + tw + 0.3, y: ty, w: tw, name: 'Tabel Bottom 5 NOP' });
  } else {
    slide.addText('Rincian per NOP belum tersimpan di data EAS periode ini.', { x: X0, y: ty + 0.1, w: W, h: 0.25, margin: 0, fontFace: FONT, fontSize: 10, italic: true, color: C.muted, isTextBox: true, objectName: 'Ranking Kosong' });
  }

  // ---- Dua tabel progress: Extended, Quickwin
  const tableYs = [3.9, 5.45];
  CATS.forEach((cat, i) => {
    slide.addText(`${cat.label.toUpperCase()} · ${AREA_LABEL.toUpperCase()}`, {
      x: X0, y: tableYs[i], w: 4, h: 0.22, margin: 0,
      fontFace: FONT, fontSize: 11, bold: true, color: C.accent, charSpacing: 1, isTextBox: true, objectName: `Judul Tabel ${cat.label}`,
    });
    addCatTable(pptx, slide, { cat, data: data.cats[cat.key], weekLabel, x: X0, y: tableYs[i] + 0.25, w: W });
  });

  // ---- Catatan kaki
  const rr = data.regionalRange;
  const note =
    `Rank ${data.ranking.count} NOP dari % valid gabungan.` +
    (rr ? ` Regional tertinggi ${rr.best.regional} ${fmtPct(rr.best.pct)}, terendah ${rr.worst.regional} ${fmtPct(rr.worst.pct)}.` : '') +
    ` Sumber: data upload EAS & VSWR, ${dayMonthYear(data.valid.dateISO)}.`;
  slide.addText(note, {
    x: X0, y: 7.08, w: W, h: 0.2, margin: 0, fontFace: FONT, fontSize: 8, color: C.muted, isTextBox: true, objectName: 'Catatan Kaki',
  });
}
