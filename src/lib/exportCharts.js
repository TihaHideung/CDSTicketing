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
