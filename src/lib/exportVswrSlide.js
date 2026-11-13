import { getPeriodBucket } from './aggregate.js';
import { addStandardHeaderFooter } from './pptxUtils.js';

/*
 * Slide "VSWR | Area 1" untuk Weekly Huddle (header, font, dan kartu disamakan dengan slide lain).
 *
 * Sumber data: riwayat halaman EAS & VSWR (record.raw.vswr, hasil parseVSWR). Yang dipakai adalah
 * record VSWR TERAKHIR di minggu yang dipilih (Jumat s/d Kamis, sama dengan Trend Weekly):
 *   - Tabel VSWR per Regional > NOP (Closed P1-P5 | Open P1-P5 | Total)
 *   - Tabel Priority Alarm AREA (A35:H42) dan Priority Alarm Regional (A50:E57) dari sheet VSWR
 *   - Overall Summary: Total Sites, Total Closed, Total Open (+ % dari total sites), rincian per regional
 *     (site, open, closed, % closed) dan pembanding closed vs record VSWR terakhir minggu sebelumnya.
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
  closed: '548235',
  open: 'C55A11',
  rowFill: 'DDEBF7',
  totalFill: 'A9D08E',
  white: 'FFFFFF',
  up: '1E7B34',
  down: 'BE133E',
};

const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const fmtPct = (n) =>
  n == null || !Number.isFinite(n)
    ? '-'
    : `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
const key = (v) => String(v ?? '').trim().toUpperCase();
// "R01_Sumbagut" -> "SUMBAGUT"
const regionalLabel = (v) => String(v ?? '').replace(/^R\d+_/i, '').trim().toUpperCase();
const fmtDelta = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `-${fmt(Math.abs(n))}` : '0');

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dayMonthYear(iso) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

const hasVswr = (r) => Array.isArray(r?.raw?.vswr?.nopRows) && r.raw.vswr.nopRows.length > 0;

/**
 * Susun data slide VSWR dari riwayat EAS & VSWR.
 * @param history  array record (getEasVswrHistory)
 * @param weekKey  tanggal awal minggu (Jumat) 'YYYY-MM-DD'
 * @returns null kalau minggu itu tidak punya data VSWR.
 */
export function buildVswrWeekData(history, weekKey) {
  const prevKey = addDaysISO(weekKey, -7);
  return buildVswrPeriodData(history, {
    from: weekKey,
    to: addDaysISO(weekKey, 6),
    prevFrom: prevKey,
    prevTo: addDaysISO(weekKey, -1),
    prevLabel: getPeriodBucket(prevKey, 'weekly').label,
  });
}

/**
 * Data slide VSWR untuk periode [from, to] dan periode pembanding [prevFrom, prevTo]
 * (minggu atau bulan). Yang dipakai = record VSWR TERAKHIR di masing-masing periode.
 */
export function buildVswrPeriodData(history, { from: weekKey, to: weekEnd, prevFrom, prevTo, prevLabel }) {
  const inRange = (r, from, to) => r?.dateISO >= from && r.dateISO <= to && hasVswr(r);
  const sorted = (history || []).slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const cur = sorted.filter((r) => inRange(r, weekKey, weekEnd)).pop();
  if (!cur) return null;
  const prev = sorted.filter((r) => inRange(r, prevFrom, prevTo)).pop() || null;

  const v = cur.raw.vswr;
  const regionalOrder = [];
  for (const n of v.nopRows) if (!regionalOrder.includes(n.regional)) regionalOrder.push(n.regional);
  const totalOf = (list, regional) => (list || []).find((t) => key(t.regional) === key(regional));

  const groups = regionalOrder.map((regional) => {
    const nops = v.nopRows.filter((n) => n.regional === regional);
    const total =
      totalOf(v.regionalTotals, regional) ||
      nops.reduce(
        (a, n) => ({
          closedP: a.closedP.map((x, i) => x + n.closedP[i]),
          openP: a.openP.map((x, i) => x + n.openP[i]),
          closedTotal: a.closedTotal + n.closedTotal,
          openTotal: a.openTotal + n.openTotal,
          total: a.total + n.total,
        }),
        { closedP: [0, 0, 0, 0, 0], openP: [0, 0, 0, 0, 0], closedTotal: 0, openTotal: 0, total: 0 }
      );
    return { regional, label: regionalLabel(regional), nops, total };
  });

  const grand = v.grandTotal;
  const prevV = prev?.raw?.vswr;
  const prevClosedOf = (regional) => totalOf(prevV?.regionalTotals, regional)?.closedTotal;

  const regionals = groups.map((g) => {
    const prevClosed = prevV ? prevClosedOf(g.regional) ?? null : null;
    return {
      regional: g.label,
      total: g.total.total,
      open: g.total.openTotal,
      closed: g.total.closedTotal,
      closedPct: pct(g.total.closedTotal, g.total.total),
      prevClosed,
      deltaClosed: prevClosed == null ? null : g.total.closedTotal - prevClosed,
    };
  });

  return {
    weekKey,
    dateISO: cur.dateISO,
    prevDateISO: prev?.dateISO || null,
    prevLabel,
    groups,
    grand,
    priorityArea: v.priorityArea || null,
    priorityRegional: v.priorityRegional || null,
    summary: {
      total: grand.total,
      closed: grand.closedTotal,
      open: grand.openTotal,
      closedPct: pct(grand.closedTotal, grand.total),
      openPct: pct(grand.openTotal, grand.total),
      prevClosed: prevV ? prevV.grandTotal?.closedTotal ?? null : null,
      deltaClosed: prevV && prevV.grandTotal ? grand.closedTotal - prevV.grandTotal.closedTotal : null,
      regionals,
    },
  };
}

// ---------------------------------------------------------------- slide

const cell = (text, o = {}) => ({ text: String(text), options: { align: 'center', valign: 'middle', ...o } });
const BORDER = { type: 'solid', pt: 0.5, color: 'FFFFFF' };

function addCaption(slide, text, x, y, w, name) {
  slide.addText(text, {
    x, y, w, h: 0.22, margin: 0,
    fontFace: FONT, fontSize: 11, bold: true, color: C.accent, charSpacing: 1,
    isTextBox: true, objectName: name,
  });
}

// Tabel VSWR per Regional > NOP
function addVswrTable(slide, { data, x, y, w, maxH }) {
  const base = { fontFace: FONT, fontSize: 8, color: C.ink, border: BORDER };
  const head = (text, fill, extra = {}) => cell(text, { ...base, bold: true, color: C.white, fill: { color: fill }, ...extra });
  const P = ['P1', 'P2', 'P3', 'P4', 'P5'];

  const row1 = [
    head('Regional', C.navy, { rowspan: 2, align: 'left' }),
    head('NOP', C.navy, { rowspan: 2, align: 'left' }),
    head('Closed', C.closed, { colspan: 6 }),
    head('Open', C.open, { colspan: 6 }),
    head('Total', C.navy, { rowspan: 2 }),
  ];
  const row2 = [
    ...P.map((p) => head(p, C.closed)),
    head('Total', C.closed),
    ...P.map((p) => head(p, C.open)),
    head('Total', C.open),
  ];

  const nums = (r) => [...r.closedP.map(fmt), fmt(r.closedTotal), ...r.openP.map(fmt), fmt(r.openTotal), fmt(r.total)];
  const body = [];
  for (const g of data.groups) {
    g.nops.forEach((n, i) => {
      const cells = [];
      if (i === 0) cells.push(cell(g.label, { ...base, bold: true, align: 'left', rowspan: g.nops.length + 1, fill: { color: C.rowFill } }));
      cells.push(cell(String(n.nop).replace(/^NOP\s+/i, ''), { ...base, align: 'left' }));
      nums(n).forEach((v, k) => cells.push(cell(v, { ...base, bold: k === 5 || k === 11 || k === 12 })));
      body.push(cells);
    });
    body.push([
      cell('Total', { ...base, bold: true, align: 'left', fill: { color: C.rowFill } }),
      ...nums(g.total).map((v) => cell(v, { ...base, bold: true, fill: { color: C.rowFill } })),
    ]);
  }
  body.push([
    cell('Total Keseluruhan', { ...base, bold: true, align: 'left', colspan: 2, fill: { color: C.totalFill } }),
    ...nums(data.grand).map((v) => cell(v, { ...base, bold: true, fill: { color: C.totalFill } })),
  ]);

  const rows = 2 + body.length;
  const rowH = Math.min(0.25, maxH / rows);
  const colW = [1.0, 1.2, ...Array(12).fill(0.385), 0.48];
  const scale = w / colW.reduce((s, n) => s + n, 0);
  slide.addTable([row1, row2, ...body], {
    x, y, w,
    colW: colW.map((n) => n * scale),
    rowH,
    margin: [0, 0.04, 0, 0.04],
    objectName: 'Tabel VSWR',
  });
  return y + rowH * rows;
}

// Tabel mentah dari sheet VSWR (Priority Alarm AREA / Regional): baris pertama = header, baris "Total" ditebalkan.
function addGridTable(slide, { grid, fallbackTitle, x, y, w, rowH, name }) {
  let rows = grid.map((r) => r.slice());
  let title = fallbackTitle;
  // Baris judul (hanya satu sel terisi) dijadikan caption, bukan bagian tabel.
  if (rows.length > 1 && rows[0].filter((v) => v !== '').length === 1) {
    title = rows[0].find((v) => v !== '') || fallbackTitle;
    rows = rows.slice(1);
  }
  addCaption(slide, title.toUpperCase(), x, y, w, `Judul ${name}`);

  const base = { fontFace: FONT, fontSize: 8, color: C.ink, border: BORDER };
  const cols = Math.max(...rows.map((r) => r.length));
  const table = rows.map((r, ri) => {
    const padded = Array.from({ length: cols }, (_, ci) => r[ci] ?? '');
    const isHead = ri === 0;
    const isTotal = !isHead && /total/i.test(padded[0]);
    return padded.map((v, ci) =>
      cell(v, {
        ...base,
        align: ci === 0 ? 'left' : 'center',
        bold: isHead || isTotal || ci === 0,
        color: isHead ? C.white : C.ink,
        fill: { color: isHead ? C.navy : isTotal ? C.totalFill : C.rowFill },
      })
    );
  });
  const firstW = cols > 5 ? 1.0 : 1.25;
  const otherW = (w - firstW) / (cols - 1);
  const colW = [firstW, ...Array(cols - 1).fill(otherW)];
  // Header pivot bisa panjang (mis. "Material Ready - Waiting Team"): tinggi baris header ikut jumlah baris teks.
  const wrapLines = (text, width) => {
    const perLine = Math.max(4, Math.floor((width - 0.12) / 0.062));
    let lines = 1;
    let used = 0;
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      if (used && used + 1 + word.length > perLine) {
        lines += 1;
        used = word.length;
      } else {
        used += (used ? 1 : 0) + word.length;
      }
    }
    return lines;
  };
  const headLines = Math.max(...rows[0].map((t, ci) => wrapLines(t, ci === 0 ? firstW : otherW)));
  const heights = [Math.max(rowH, 0.13 * headLines + 0.07), ...Array(table.length - 1).fill(rowH)];
  slide.addTable(table, { x, y: y + 0.25, w, colW, rowH: heights, margin: [0, 0.05, 0, 0.05], objectName: name });
  return y + 0.25 + heights.reduce((a, b) => a + b, 0);
}

function addSummary(pptx, slide, { data, weekLabel, x, y, w }) {
  const s = data.summary;
  const tableRows = s.regionals.length + 2; // header + tiap regional + baris Area
  const tableY = y + 1.2;
  const HEAD_H = 0.34; // header 2 baris (mis. "Closed" / "Sep 2026")
  const tableEnd = tableY + HEAD_H + 0.22 * (tableRows - 1);
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h: tableEnd + 0.32 - y, rectRadius: 0.08,
    fill: { color: C.card }, line: { color: C.cardLine, width: 0.75 }, objectName: 'Kartu Summary',
  });
  slide.addText('Overall Summary', {
    x: x + 0.15, y: y + 0.07, w: 2.4, h: 0.26, margin: 0,
    fontFace: FONT, fontSize: 13, bold: true, color: C.ink, isTextBox: true, objectName: 'Summary Judul',
  });
  slide.addText(`Data per ${dayMonthYear(data.dateISO)}`, {
    x: x + w - 2.3, y: y + 0.1, w: 2.15, h: 0.22, margin: 0, align: 'right',
    fontFace: FONT, fontSize: 9, color: C.muted, isTextBox: true, objectName: 'Summary Tanggal',
  });

  // 3 kartu angka: Total Sites | Total Closed | Total Open
  const kpis = [
    { label: 'Total Sites', value: fmt(s.total), sub: AREA_LABEL, color: C.ink },
    { label: 'Total Closed', value: fmt(s.closed), sub: `${fmtPct(s.closedPct)} dari total sites`, color: C.closed },
    { label: 'Total Open', value: fmt(s.open), sub: `${fmtPct(s.openPct)} dari total sites`, color: C.open },
  ];
  const gap = 0.1;
  const kw = (w - 0.3 - gap * 2) / 3;
  kpis.forEach((k, i) => {
    const kx = x + 0.15 + i * (kw + gap);
    const ky = y + 0.38;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: kx, y: ky, w: kw, h: 0.72, rectRadius: 0.06,
      fill: { color: C.white }, line: { color: C.cardLine, width: 0.75 }, objectName: `KPI ${k.label}`,
    });
    slide.addText(k.label, { x: kx + 0.08, y: ky + 0.04, w: kw - 0.16, h: 0.18, margin: 0, fontFace: FONT, fontSize: 9, color: C.muted, isTextBox: true, objectName: `KPI ${k.label} Label` });
    slide.addText(k.value, { x: kx + 0.08, y: ky + 0.19, w: kw - 0.16, h: 0.32, margin: 0, fontFace: FONT, fontSize: 19, bold: true, color: k.color, isTextBox: true, objectName: `KPI ${k.label} Nilai` });
    slide.addText(k.sub, { x: kx + 0.08, y: ky + 0.52, w: kw - 0.16, h: 0.18, margin: 0, fontFace: FONT, fontSize: 8, color: C.muted, isTextBox: true, objectName: `KPI ${k.label} Sub` });
  });

  // Rincian per regional + pembanding closed vs minggu sebelumnya
  const base = { fontFace: FONT, fontSize: 8, color: C.ink, border: BORDER };
  const head = (t) => cell(t, { ...base, fontSize: 7.5, bold: true, color: C.white, fill: { color: C.navy } });
  const prev = data.prevLabel;
  const deltaCell = (d, o = {}) =>
    d == null
      ? cell('-', { ...base, ...o })
      : cell(fmtDelta(d), { ...base, ...o, bold: true, color: d > 0 ? C.up : d < 0 ? C.down : C.ink });
  const rows = [
    [head('Regional'), head('Total Site'), head('Open'), head('Closed'), head('% Closed'), head(`Closed ${prev}`), head(`Δ vs ${prev}`)],
    ...s.regionals.map((r) => [
      cell(r.regional, { ...base, bold: true, align: 'left', fill: { color: C.rowFill } }),
      cell(fmt(r.total), { ...base, fill: { color: C.rowFill } }),
      cell(fmt(r.open), { ...base, fill: { color: C.rowFill } }),
      cell(fmt(r.closed), { ...base, fill: { color: C.rowFill } }),
      cell(fmtPct(r.closedPct), { ...base, bold: true, fill: { color: C.rowFill } }),
      cell(r.prevClosed == null ? '-' : fmt(r.prevClosed), { ...base, fill: { color: C.rowFill } }),
      deltaCell(r.deltaClosed, { fill: { color: C.rowFill } }),
    ]),
    [
      cell(AREA_LABEL, { ...base, bold: true, align: 'left', fill: { color: C.totalFill } }),
      cell(fmt(s.total), { ...base, bold: true, fill: { color: C.totalFill } }),
      cell(fmt(s.open), { ...base, bold: true, fill: { color: C.totalFill } }),
      cell(fmt(s.closed), { ...base, bold: true, fill: { color: C.totalFill } }),
      cell(fmtPct(s.closedPct), { ...base, bold: true, fill: { color: C.totalFill } }),
      cell(s.prevClosed == null ? '-' : fmt(s.prevClosed), { ...base, bold: true, fill: { color: C.totalFill } }),
      deltaCell(s.deltaClosed, { fill: { color: C.totalFill } }),
    ],
  ];
  const tw = w - 0.3;
  const colW = [0.97, 0.5, 0.48, 0.52, 0.58, 0.75, 0.75].map((n) => (n * tw) / 4.55);
  slide.addTable(rows, { x: x + 0.15, y: tableY, w: tw, colW, rowH: [HEAD_H, ...Array(rows.length - 1).fill(0.22)], margin: [0, 0.04, 0, 0.04], objectName: 'Tabel Summary Regional' });
  const note = data.prevDateISO
    ? `Δ = Closed per ${dayMonthYear(data.dateISO)} - Closed per ${dayMonthYear(data.prevDateISO)} (${prev}).`
    : `Belum ada data VSWR ${prev} sebagai pembanding.`;
  slide.addText(note, {
    x: x + 0.15, y: tableEnd + 0.07, w: w - 0.3, h: 0.18, margin: 0,
    fontFace: FONT, fontSize: 7.5, color: C.muted, isTextBox: true, objectName: 'Summary Catatan',
  });
}

/** Tambahkan slide VSWR ke deck `pptx`. `data` dari buildVswrWeekData; `weekLabel` mis. 'W41'. */
export function addVswrSlide(pptx, { data, weekLabel, logoData }) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header + footer sama dengan slide Profiling KPI dan Trend Weekly Availability
  addStandardHeaderFooter(pptx, slide, {
    title: 'VSWR',
    subtitle: `${AREA_LABEL.toUpperCase()} – ${weekLabel} (data per ${dayMonthYear(data.dateISO)})`,
    logoData,
  });

  // Kiri: tabel VSWR
  const leftX = 0.45;
  const leftW = 7.3;
  addCaption(slide, `VSWR TRACKING · ${AREA_LABEL.toUpperCase()}`, leftX, 0.9, 5, 'Judul Tabel VSWR');
  addVswrTable(slide, { data, x: leftX, y: 1.15, w: leftW, maxH: 6.1 });

  // Kanan: Priority Alarm AREA, Priority Alarm Regional, lalu Overall Summary
  const rightX = 7.95;
  const rightW = 4.85;
  let cursor = 0.9;
  const grids = [
    { grid: data.priorityArea, fallbackTitle: 'Priority Alarm Area', name: 'Tabel Priority Alarm Area' },
    { grid: data.priorityRegional, fallbackTitle: 'Priority Alarm Regional', name: 'Tabel Priority Alarm Regional' },
  ];
  for (const g of grids) {
    if (g.grid) {
      cursor = addGridTable(slide, { ...g, x: rightX, y: cursor, w: rightW, rowH: 0.17 }) + 0.08;
    } else {
      addCaption(slide, g.fallbackTitle.toUpperCase(), rightX, cursor, rightW, `Judul ${g.name}`);
      slide.addText('Data tidak ditemukan di file VSWR (sheet VSWR).', {
        x: rightX, y: cursor + 0.27, w: rightW, h: 0.25, margin: 0, fontFace: FONT, fontSize: 9, italic: true, color: C.muted, isTextBox: true, objectName: `${g.name} Kosong`,
      });
      cursor += 0.65;
    }
  }
  addSummary(pptx, slide, { data, weekLabel, x: rightX, y: cursor, w: rightW });
}
