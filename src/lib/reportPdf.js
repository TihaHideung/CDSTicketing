import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { fmtDate, fmtNum, fmtSigned } from './reportAnalysis.js';

const RED = [224, 48, 30];
const GREEN = [22, 135, 70];
const BLUE = [3, 105, 161];
const INK = [15, 23, 42];
const BODY = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const SOFT = [241, 245, 249];
const SLATE = [71, 85, 105];

const TYPE_COLOR = { CellDown: RED, SiteDown: BLUE };
const pctText = (ratio) => `${fmtNum(ratio * 100, 0)}%`;

/**
 * PDF report Weekly, visual-first: 1 halaman per tipe (Cell Down / Site Down dipisah).
 * Tiap halaman: KPI, grafik trend mingguan, grafik trend harian, lalu kartu kenaikan & penurunan
 * tertinggi (bar NOP + kategori). Teks sengaja minim.
 *
 *   pages: [{ typeKey: 'CellDown'|'SiteDown', typeLabel, report, charts: [{ element, caption }] }]
 */
export async function exportReportPdf({ pages, fileName, filterText = '' }) {
  // screenshot semua grafik dulu (async), baru susun PDF
  const rendered = [];
  for (const pg of pages) {
    const shots = [];
    for (const c of pg.charts || []) {
      if (!c?.element) continue;
      // +14px di bawah: html2canvas menggambar teks legenda sedikit lebih turun dan bisa terpotong.
      const box = c.element.getBoundingClientRect();
      const canvas = await html2canvas(c.element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        width: Math.ceil(box.width),
        height: Math.ceil(box.height) + 14,
      });
      shots.push({ canvas, caption: c.caption });
    }
    rendered.push({ ...pg, shots });
  }
  if (!rendered.length) throw new Error('Tidak ada data untuk dibuat report.');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const M = 12;
  const CW = PW - 2 * M;
  let y = M;

  const setText = (color, size, style = 'normal') => {
    pdf.setTextColor(...color);
    pdf.setFontSize(size);
    pdf.setFont('helvetica', style);
  };
  const wrap = (text, width, size = 9) => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(String(text), width);
  };
  const fit = (text, width, size, style = 'normal') => {
    setText(BODY, size, style);
    return pdf.splitTextToSize(String(text), width)[0] || '';
  };

  // deretan "chip" pendek (teks singkat di bawah grafik)
  const chips = (items, color = SLATE) => {
    if (!items?.length) return;
    const ch = 5.4;
    let cx = M;
    setText(color, 7.6, 'bold');
    for (const text of items) {
      const tw = pdf.getTextWidth(text) + 6;
      if (cx + tw > M + CW) {
        cx = M;
        y += ch + 1.5;
      }
      pdf.setFillColor(...SOFT);
      pdf.roundedRect(cx, y, tw, ch, 2.6, 2.6, 'F');
      pdf.text(text, cx + 3, y + 3.7);
      cx += tw + 2;
    }
    y += ch + 3;
  };

  // grafik: judul kecil, gambar (dibatasi tinggi), chip di bawahnya
  const chartBlock = (shot, chipItems) => {
    if (!shot) return;
    const MAX_H = 54;
    let w = CW;
    let hh = (shot.canvas.height * w) / shot.canvas.width;
    if (hh > MAX_H) {
      hh = MAX_H;
      w = (shot.canvas.width * hh) / shot.canvas.height;
    }
    setText(INK, 9, 'bold');
    pdf.text(shot.caption, M, y + 3.2);
    y += 5;
    const ix = M + (CW - w) / 2;
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(ix - 0.6, y - 0.6, w + 1.2, hh + 1.2, 1.5, 1.5, 'S');
    pdf.addImage(shot.canvas.toDataURL('image/png'), 'PNG', ix, y, w, hh);
    y += hh + 3;
    chips(chipItems);
  };

  // baris bar horizontal: nama | bar | nilai
  const barRows = (rows, x, w, color) => {
    const RH = 4.7;
    const nameW = w * 0.44;
    const valW = 12;
    const barX = x + nameW + 1;
    const barMax = w - nameW - valW - 2;
    const peak = Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
    rows.forEach((r) => {
      setText(BODY, 7.6);
      pdf.text(fit(r.label, nameW - 1, 7.6), x, y + 3.3);
      const bw = Math.max((Math.abs(r.value) / peak) * barMax, 0.5);
      pdf.setFillColor(...(r.color || color));
      pdf.roundedRect(barX, y + 0.9, bw, RH - 2.2, 0.6, 0.6, 'F');
      setText(INK, 7.6, 'bold');
      pdf.text(r.text, x + w, y + 3.3, { align: 'right' });
      y += RH;
    });
  };

  // tinggi kartu mengikuti isi (jumlah baris NOP & kategori), kedua kartu disamakan
  const cardHeight = (kind, ev, report) => {
    if (!ev) return 22;
    const list = ev.explain.nop?.length ? ev.explain.nop : ev.explain.regional;
    const src = kind === 'rise' ? report.riseCategorySource : report.dropCategorySource;
    const cats = src === 'event' ? ev.categories : report.periodCategories;
    let h = 21 + 3.2 + Math.min(list.length, 3) * 4.7;
    if (cats?.rc?.length) h += 1.5 + 3.2 + Math.min(cats.rc.length, 2) * 4.7;
    if (report.points.events[kind]?.[0]) h += 7;
    return h + 3;
  };

  const eventCard = (x, w, kind, ev, report, H) => {
    const color = kind === 'rise' ? RED : GREEN;
    const y0 = y;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(x, y0, w, H, 2, 2, 'FD');
    pdf.setFillColor(...color);
    pdf.rect(x, y0 + 1.5, 1.4, H - 3, 'F');

    const ix = x + 5;
    const iw = w - 9;
    setText(MUTED, 7, 'bold');
    pdf.text(kind === 'rise' ? 'KENAIKAN TERTINGGI' : 'PENURUNAN TERENDAH', ix, y0 + 5);

    if (!ev) {
      setText(MUTED, 8.5);
      pdf.text(kind === 'rise' ? 'Tidak ada kenaikan' : 'Tidak ada penurunan', ix, y0 + 14);
      y = y0 + H;
      return;
    }

    setText(INK, 11, 'bold');
    pdf.text(ev.to.label, ix, y0 + 12);
    setText(color, 16, 'bold');
    pdf.text(fmtSigned(ev.change), x + w - 4, y0 + 12.5, { align: 'right' });
    setText(MUTED, 7.5);
    pdf.text(`${fmtNum(ev.from.total)} -> ${fmtNum(ev.to.total)}  (${fmtSigned(ev.pct * 100, 1)}%)`, ix, y0 + 17);

    // NOP (atau Regional kalau rincian NOP tidak tersimpan)
    const x_ = ev.explain;
    const list = x_.nop?.length ? x_.nop : x_.regional;
    y = y0 + 21;
    setText(MUTED, 6.8, 'bold');
    pdf.text(x_.nop?.length ? 'NOP' : 'REGIONAL', ix, y + 2.2);
    y += 3.2;
    barRows(
      list.slice(0, 3).map((r) => ({ label: r.label, value: r.delta, text: fmtSigned(r.delta) })),
      ix,
      iw,
      color
    );

    // Kategori RC
    const src = kind === 'rise' ? report.riseCategorySource : report.dropCategorySource;
    const cats = src === 'event' ? ev.categories : report.periodCategories;
    y += 1.5;
    if (cats?.rc?.length) {
      setText(MUTED, 6.8, 'bold');
      pdf.text(src === 'event' ? 'KATEGORI RC' : 'KATEGORI RC (RATA-RATA MINGGU)', ix, y + 2.2);
      y += 3.2;
      barRows(
        cats.rc.slice(0, 2).map((c) => ({ label: c.label, value: c.share, text: pctText(c.share), color: SLATE })),
        ix,
        iw,
        SLATE
      );
    }

    // satu kalimat pendek (mis. "NOP Medan mendominasi (84%)")
    const note = report.points.events[kind]?.[0];
    if (note) {
      setText(MUTED, 7);
      pdf.text(fit(note, iw, 7), ix, y0 + H - 3);
    }
    y = y0 + H;
  };

  const kpiCard = (i, label, value, sub, color) => {
    const GAP = 3;
    const KW = (CW - GAP * 3) / 4;
    const kx = M + i * (KW + GAP);
    pdf.setFillColor(...SOFT);
    pdf.roundedRect(kx, y, KW, 17, 1.5, 1.5, 'F');
    setText(MUTED, 7);
    pdf.text(fit(label, KW - 4, 7), kx + 2.5, y + 4.6);
    setText(color, 14, 'bold');
    pdf.text(value, kx + 2.5, y + 11);
    setText(MUTED, 7);
    pdf.text(fit(sub, KW - 4, 7), kx + 2.5, y + 15);
  };

  // ============================================================ HALAMAN PER TIPE
  rendered.forEach((pg, index) => {
    if (index > 0) pdf.addPage();
    const { report } = pg;
    const typeColor = TYPE_COLOR[pg.typeKey] || RED;
    const h = report.headline;
    const v = report.vsPrevious;

    // header berwarna sesuai tipe
    pdf.setFillColor(...typeColor);
    pdf.rect(0, 0, PW, 21, 'F');
    setText([255, 255, 255], 8, 'bold');
    pdf.text('CDS MONITORING  |  LAPORAN MINGGUAN', M, 7.5);
    setText([255, 255, 255], 15, 'bold');
    pdf.text(`${pg.typeLabel.toUpperCase()}  -  ${report.title}`, M, 16);
    y = 21 + 3.5;

    setText(MUTED, 7);
    const meta = [];
    if (filterText) meta.push(...wrap(filterText, CW, 7));
    meta.push(`Data: ${report.daysWithData}/${report.totalDays} hari${report.ongoing ? ' (minggu berjalan)' : ''}`);
    pdf.text(meta, M, y + 2.2);
    y += meta.length * 3.1 + 2.5;

    // KPI
    const changeColor = !v || v.change === 0 ? INK : v.change > 0 ? RED : GREEN;
    kpiCard(0, 'Rata-rata / hari', fmtNum(h.avg), 'tiket aktif', INK);
    kpiCard(1, v ? `Vs ${v.prevLabel}` : 'Vs minggu lalu', v ? fmtSigned(v.change) : '-', v ? `${fmtSigned(v.pct * 100, 1)}%` : 'belum ada pembanding', changeColor);
    kpiCard(2, 'Tertinggi', fmtNum(h.high.total), fmtDate(h.high.date, { year: false }), RED);
    kpiCard(3, 'Terendah', fmtNum(h.low.total), fmtDate(h.low.date, { year: false }), GREEN);
    y += 17 + 5;

    // grafik
    chartBlock(pg.shots[0], report.points.chips.trend);
    chartBlock(pg.shots[1], report.points.chips.daily);

    // kartu kenaikan & penurunan tertinggi
    const GAPC = 6;
    const CWH = (CW - GAPC) / 2;
    const yCards = y;
    const CH = Math.max(cardHeight('rise', report.rise, report), cardHeight('drop', report.drop, report), 30);
    eventCard(M, CWH, 'rise', report.rise, report, CH);
    y = yCards;
    eventCard(M + CWH + GAPC, CWH, 'drop', report.drop, report, CH);
    y = yCards + CH;

    // catatan satu baris
    setText(MUTED, 6.8);
    const notes = ['Nilai = rata-rata ticket aktif/hari (snapshot backlog). Minggu = Jumat-Kamis.', ...report.points.notes].join(' ');
    pdf.text(wrap(notes, CW, 6.8).slice(0, 2), M, y + 4);
  });

  // ============================================================ FOOTER
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    setText(MUTED, 7);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(M, PH - 9, PW - M, PH - 9);
    pdf.text('CDS Monitoring - Laporan Mingguan', M, PH - 5.5);
    pdf.text(`Halaman ${i} / ${total}`, PW - M, PH - 5.5, { align: 'right' });
  }

  pdf.save(fileName || 'CDS_Monitoring_Laporan_Weekly.pdf');
}
