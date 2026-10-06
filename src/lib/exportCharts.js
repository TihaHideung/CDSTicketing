import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Ambil screenshot dari sebuah elemen DOM (biasanya container semua chart Dashboard)
 * dan susun jadi file PDF (dipecah otomatis jadi beberapa halaman kalau gambarnya
 * lebih tinggi dari satu halaman A4).
 */
export async function exportChartsAsPdf(element, fileName) {
  if (!element) return;

  const canvas = await html2canvas(element, {
    backgroundColor: '#f8fafc',
    scale: 2,
    useCORS: true,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(fileName || `CDS_Monitoring_Charts_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Susun PDF dari beberapa elemen grafik (tiap grafik di-screenshot sendiri-sendiri, jadi
 * tidak ada grafik yang terpotong di pergantian halaman). Blok `full: true` memakai lebar
 * penuh halaman; sisanya dijejerkan 2 per baris.
 *
 * blocks: [{ element: HTMLElement, full?: boolean, analytics?: string[] }]
 */
export async function exportElementsAsPdf(blocks, { fileName, title, subtitle } = {}) {
  const items = [];
  for (const b of blocks) {
    if (!b?.element) continue;
    const canvas = await html2canvas(b.element, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
    items.push({ canvas, full: Boolean(b.full), analytics: b.analytics || [] });
  }
  if (!items.length) throw new Error('Tidak ada grafik yang bisa diekspor. Coba tutup pop up lalu ulangi.');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const M = 10;
  const GAP = 4;
  const CW = PW - 2 * M;
  const HALF = (CW - GAP) / 2;
  let y = M;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title || 'CDS Monitoring', M, y + 5);
  y += 9;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  const headerLines = [];
  if (subtitle) headerLines.push(...pdf.splitTextToSize(subtitle, CW));
  headerLines.push(`Dibuat: ${new Date().toLocaleString('id-ID')}`);
  pdf.text(headerLines, M, y + 3);
  y += headerLines.length * 3.6 + 3;

  const ensureSpace = (h) => {
    if (y + h > PH - M) {
      pdf.addPage();
      y = M;
    }
  };

  const analysisLines = (insights, width) => {
    if (!insights?.length) return [];
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    return insights.map((insight) => pdf.splitTextToSize(`- ${insight}`, width - 2));
  };
  const analysisHeight = (insights, width) => {
    const lines = analysisLines(insights, width);
    return lines.length ? 7 + lines.reduce((height, item) => height + item.length * 3.8 + 1.5, 0) : 0;
  };
  const drawAnalysis = (insights, x, top, width) => {
    if (!insights?.length) return;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Analisis', x, top + 3);
    let textY = top + 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(51, 65, 85);
    for (const lines of analysisLines(insights, width)) {
      pdf.text(lines, x + 1, textY);
      textY += lines.length * 3.8 + 1.5;
    }
  };

  let row = [];
  const flushRow = () => {
    if (!row.length) return;
    const heights = row.map((it) => (it.canvas.height * HALF) / it.canvas.width);
    const analysisHeights = row.map((it) => analysisHeight(it.analytics, HALF));
    const rowH = Math.max(...heights.map((height, index) => height + (analysisHeights[index] ? GAP + analysisHeights[index] : 0)));
    ensureSpace(rowH);
    row.forEach((it, i) => {
      const x = M + i * (HALF + GAP);
      pdf.addImage(it.canvas.toDataURL('image/png'), 'PNG', x, y, HALF, heights[i]);
      if (analysisHeights[i]) drawAnalysis(it.analytics, x, y + heights[i] + GAP, HALF);
    });
    y += rowH + GAP;
    row = [];
  };

  for (const it of items) {
    if (it.full) {
      flushRow();
      let w = CW;
      let h = (it.canvas.height * w) / it.canvas.width;
      const analysisH = analysisHeight(it.analytics, CW);
      const maxH = PH - 2 * M - (analysisH ? GAP + analysisH : 0);
      if (h > maxH) {
        h = maxH;
        w = (it.canvas.width * h) / it.canvas.height;
      }
      ensureSpace(h + (analysisH ? GAP + analysisH : 0));
      pdf.addImage(it.canvas.toDataURL('image/png'), 'PNG', M + (CW - w) / 2, y, w, h);
      y += h;
      if (analysisH) {
        y += GAP;
        drawAnalysis(it.analytics, M, y, CW);
        y += analysisH;
      }
      y += GAP;
    } else {
      row.push(it);
      if (row.length === 2) flushRow();
    }
  }
  flushRow();

  pdf.save(fileName || `CDS_Monitoring_Charts_${new Date().toISOString().slice(0, 10)}.pdf`);
}
