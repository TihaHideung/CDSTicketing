import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { fmtDate, fmtNum, fmtSigned } from './reportAnalysis.js';

const RED = [224, 48, 30];
const GREEN = [22, 135, 70];
const INK = [15, 23, 42];
const BODY = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const SOFT = [241, 245, 249];
const SLATE = [71, 85, 105];

const pctText = (ratio) => `${fmtNum(ratio * 100, 0)}%`;

/**
 * PDF report ringkas (Weekly): KPI, 2 grafik + poin analisis singkat, lalu kenaikan & penurunan
 * tertinggi (tabel kecil Regional/NOP/Kategori + poin). Teks sengaja pendek.
 *   charts: [{ element: HTMLElement, caption: string }]  (di-screenshot per grafik)
 */
export async function exportReportPdf({ report, charts = [], fileName, filterText = '' }) {
  const shots = [];
  for (const c of charts) {
    if (!c?.element) continue;
    const canvas = await html2canvas(c.element, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
    shots.push({ canvas, caption: c.caption });
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const M = 12;
  const CW = PW - 2 * M;
  const FOOT = 10;
  let y = M;

  const setText = (color, size, style = 'normal') => {
    pdf.setTextColor(...color);
    pdf.setFontSize(size);
    pdf.setFont('helvetica', style);
  };
  const ensure = (h) => {
    if (y + h > PH - M - FOOT) {
      pdf.addPage();
      y = M;
    }
  };
  const wrap = (text, width, size = 9) => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(String(text), width);
  };

  // poin pendek bertanda "-" (bisa diletakkan di kolom kiri/kanan lewat x & w)
  const bullets = (items, { x = M, w = CW, size = 8.8, color = BODY, gap = 1.4 } = {}) => {
    const lh = size * 0.44;
    for (const item of items) {
      const lines = wrap(item, w - 4, size);
      ensure(lines.length * lh + gap);
      setText(color, size);
      pdf.text('-', x + 0.5, y + lh);
      pdf.text(lines, x + 3.5, y + lh);
      y += lines.length * lh + gap;
    }
  };

  const sectionBar = (text, color = INK) => {
    ensure(14);
    pdf.setFillColor(...color);
    pdf.rect(M, y, 1.6, 6, 'F');
    setText(INK, 11, 'bold');
    pdf.text(text, M + 4, y + 4.6);
    y += 9;
  };

  /**
   * Tabel kecil. columns: [{ header, w (bobot), align?, bar?, strong? }]
   * rows: [{ cells: string[], bar?: 0..1 }]. Posisi lewat { x, w } supaya bisa berdampingan.
   */
  const table = (title, columns, rows, { x = M, w = CW, barColor = RED } = {}) => {
    if (!rows.length) return;
    const RH = 5.4;
    if (title) {
      setText(INK, 8.5, 'bold');
      pdf.text(title, x, y + 3);
      y += 4.6;
    }
    const totalW = columns.reduce((sum, c) => sum + c.w, 0);
    const widths = columns.map((c) => (c.w / totalW) * w);

    pdf.setFillColor(...SOFT);
    pdf.rect(x, y, w, RH, 'F');
    setText(MUTED, 7.2, 'bold');
    let cx = x;
    columns.forEach((c, i) => {
      if (c.align === 'right') pdf.text(c.header, cx + widths[i] - 1.5, y + 3.8, { align: 'right' });
      else pdf.text(c.header, cx + 1.5, y + 3.8);
      cx += widths[i];
    });
    y += RH;

    rows.forEach((row) => {
      cx = x;
      columns.forEach((c, i) => {
        const raw = String(row.cells[i] ?? '');
        if (c.bar && row.bar != null) {
          const bw = Math.max(0, Math.min(1, row.bar)) * Math.max(widths[i] - 13, 2);
          pdf.setFillColor(...barColor);
          pdf.rect(cx + 1.5, y + 1.4, Math.max(bw, 0.4), RH - 2.8, 'F');
          setText(BODY, 7, 'normal');
          pdf.text(raw, cx + widths[i] - 1.5, y + 3.8, { align: 'right' });
        } else {
          setText(c.strong ? INK : BODY, 7.8, c.strong ? 'bold' : 'normal');
          const fit = pdf.splitTextToSize(raw, widths[i] - 3)[0] || '';
          if (c.align === 'right') pdf.text(fit, cx + widths[i] - 1.5, y + 3.8, { align: 'right' });
          else pdf.text(fit, cx + 1.5, y + 3.8);
        }
        cx += widths[i];
      });
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.2);
      pdf.line(x, y + RH, x + w, y + RH);
      y += RH;
    });
    y += 3;
  };

  // ============================================================ HEADER
  const h = report.headline;
  const v = report.vsPrevious;
  const pts = report.points;

  pdf.setFillColor(...RED);
  pdf.rect(0, 0, PW, 22, 'F');
  setText([255, 255, 255], 8.5, 'bold');
  pdf.text(`CDS MONITORING  |  LAPORAN ${report.periodLabel.toUpperCase()}`, M, 8);
  setText([255, 255, 255], 14, 'bold');
  pdf.text(wrap(report.title, CW, 14)[0], M, 16);
  y = 22 + 4;

  setText(MUTED, 7.3);
  const metaLines = [];
  if (filterText) metaLines.push(...wrap(filterText, CW, 7.3));
  metaLines.push(`Data: ${report.daysWithData}/${report.totalDays} hari${report.ongoing ? ' (berjalan)' : ''}  |  Dibuat: ${new Date().toLocaleString('id-ID')}`);
  pdf.text(metaLines, M, y + 2.5);
  y += metaLines.length * 3.3 + 3;

  // ============================================================ KPI
  const changeColor = !v || v.change === 0 ? INK : v.change > 0 ? RED : GREEN;
  const kpis = [
    { label: 'Rata-rata backlog / hari', value: fmtNum(h.avg), sub: `${fmtNum(h.cellDown)} Cell | ${fmtNum(h.siteDown)} Site`, color: INK },
    {
      label: v ? `Vs ${v.prevLabel}` : 'Vs periode sebelumnya',
      value: v ? fmtSigned(v.change) : '-',
      sub: v ? `${fmtSigned(v.pct * 100, 1)}%` : 'belum ada pembanding',
      color: changeColor,
    },
    { label: 'Tertinggi', value: fmtNum(h.high.total), sub: fmtDate(h.high.date, { year: false }), color: RED },
    { label: 'Terendah', value: fmtNum(h.low.total), sub: fmtDate(h.low.date, { year: false }), color: GREEN },
  ];
  const GAP = 3;
  const KW = (CW - GAP * 3) / 4;
  kpis.forEach((k, i) => {
    const kx = M + i * (KW + GAP);
    pdf.setFillColor(...SOFT);
    pdf.roundedRect(kx, y, KW, 17, 1.5, 1.5, 'F');
    setText(MUTED, 7);
    pdf.text(wrap(k.label, KW - 4, 7)[0], kx + 2.5, y + 4.6);
    setText(k.color, 14, 'bold');
    pdf.text(k.value, kx + 2.5, y + 11);
    setText(MUTED, 7);
    pdf.text(wrap(k.sub, KW - 4, 7)[0], kx + 2.5, y + 15);
  });
  y += 17 + 5;

  // ============================================================ GRAFIK + POIN
  const IMG_W = 168; // sedikit lebih kecil dari lebar halaman supaya 2 grafik muat di halaman 1
  const chartBlock = (shot, points) => {
    if (!shot) return;
    const maxH = 66;
    let w = Math.min(CW, IMG_W);
    let hh = (shot.canvas.height * w) / shot.canvas.width;
    if (hh > maxH) {
      hh = maxH;
      w = (shot.canvas.width * hh) / shot.canvas.height;
    }
    ensure(hh + 10 + points.length * 4.6);
    setText(INK, 9.5, 'bold');
    pdf.text(shot.caption, M, y + 3.5);
    y += 6;
    const ix = M + (CW - w) / 2;
    pdf.setDrawColor(...LINE);
    pdf.roundedRect(ix - 0.5, y - 0.5, w + 1, hh + 1, 1.5, 1.5, 'S');
    pdf.addImage(shot.canvas.toDataURL('image/png'), 'PNG', ix, y, w, hh);
    y += hh + 3;
    bullets(points);
    y += 2;
  };

  chartBlock(shots[0], pts.trend);
  chartBlock(shots[1], pts.daily);

  // ============================================================ KENAIKAN / PENURUNAN TERTINGGI
  const HALF = (CW - 6) / 2;
  const XR = M + HALF + 6;

  const renderEvent = (name, ev, label, color) => {
    if (!ev) return;
    const x = ev.explain;
    ensure(80); // judul + tabel + poin dijaga tetap satu halaman
    sectionBar(`${label} - ${report.period === 'daily' ? report.title : ev.to.label}`, color);

    setText(color, 10, 'bold');
    pdf.text(`${fmtSigned(ev.change)} tiket  (${fmtNum(ev.from.total)} -> ${fmtNum(ev.to.total)}, ${fmtSigned(ev.pct * 100, 1)}%)`, M, y + 3);
    y += 7;

    const shareRows = (list) =>
      list.slice(0, 3).map((r) => ({ cells: [r.label, fmtSigned(r.delta), pctText(r.share)], bar: r.share }));
    const nameCols = (first) => [
      { header: first, w: 3.1, strong: true },
      { header: 'Perubahan', w: 1.5, align: 'right' },
      { header: 'Porsi', w: 2.4, align: 'right', bar: true },
    ];

    // baris 1: Regional | NOP
    const y0 = y;
    table('Regional', nameCols('Regional'), shareRows(x.regional), { x: M, w: HALF, barColor: color });
    const yLeft = y;
    y = y0;
    if (x.nop?.length) table('NOP', nameCols('NOP'), shareRows(x.nop), { x: XR, w: HALF, barColor: color });
    y = Math.max(yLeft, y);

    // baris 2: Kategori | poin analisis
    const src = ev.kind === 'rise' ? report.riseCategorySource : report.dropCategorySource;
    const cats = src === 'event' ? ev.categories : report.periodCategories;
    const y1 = y;
    if (cats?.rc?.length) {
      table(
        src === 'event' ? 'Kategori RC' : 'Kategori RC (rata-rata periode)',
        [
          { header: 'Kategori', w: 3.1, strong: true },
          { header: 'Tiket', w: 1.2, align: 'right' },
          { header: 'Porsi', w: 2.4, align: 'right', bar: true },
        ],
        cats.rc.slice(0, 3).map((c) => ({ cells: [c.label, fmtNum(c.count), pctText(c.share)], bar: c.share })),
        { x: M, w: HALF, barColor: SLATE }
      );
    }
    const yLeft2 = y;
    y = y1;
    const eventPts = pts.events[name] || [];
    if (eventPts.length) {
      setText(INK, 8.5, 'bold');
      pdf.text('Analisis', XR, y + 3);
      y += 5;
      bullets(eventPts, { x: XR, w: HALF, size: 8.2, gap: 1.1 });
    }
    y = Math.max(yLeft2, y) + 3;
  };

  renderEvent('rise', report.rise, 'Kenaikan Tertinggi', RED);
  renderEvent('drop', report.drop, 'Penurunan Terendah', GREEN);

  // ============================================================ CATATAN (singkat)
  ensure(16);
  setText(MUTED, 7.3);
  const note = ['Nilai = rata-rata ticket aktif per hari (snapshot backlog), bukan ticket baru. Minggu = Jumat-Kamis. Porsi = bagian dari total pergerakan searah.', ...pts.notes].join(' ');
  const noteLines = wrap(note, CW, 7.3);
  pdf.text(noteLines, M, y + 2.5);
  y += noteLines.length * 3.2;

  // ============================================================ FOOTER
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    setText(MUTED, 7);
    pdf.setDrawColor(...LINE);
    pdf.line(M, PH - 9, PW - M, PH - 9);
    pdf.text(`CDS Monitoring - Laporan ${report.periodLabel} - ${report.title}`, M, PH - 5.5);
    pdf.text(`Halaman ${i} / ${pages}`, PW - M, PH - 5.5, { align: 'right' });
  }

  pdf.save(fileName || `CDS_Monitoring_Laporan_${report.periodLabel}_${report.periodKey}.pdf`);
}
