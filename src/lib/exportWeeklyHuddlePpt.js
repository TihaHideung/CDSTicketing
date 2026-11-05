import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { addWeeklyTrendSlide, injectDataLabels } from './exportWeeklyTrendPpt.js';
import { addAvailabilitySlide, fixAvailabilityCharts, buildAvailabilitySeries } from './exportAvailabilityPpt.js';
import { addKpiProfilingSlide, availableKpiMonths, filterKpiRowsToMonth, idDateLabel } from './exportKpiProfilingSlide.js';
import { getSlideChartPaths, loadLogoDataUrl, downloadPptx } from './pptxUtils.js';

/*
 * Export "Weekly Huddle" = 1 file PPTX berisi 3 slide (urutan sama dengan PPT Huddle):
 *   Slide 1 : Profiling KPI                          (Rekap Distribusi Kategori KPI SON L1 & SOMSA L0)
 *   Slide 2 : Trend Weekly Availability | Area 1     (data Availability yang diupload)
 *   Slide 3 : Trend Weekly Cell Down | Area 1 & Regional (sumber: data Cell Down / trend log)
 * Layout tiap slide sama persis dengan exporter masing-masing; di sini hanya digabung dalam satu deck.
 */

export async function buildWeeklyHuddlePptx({ kpi, trend, availability, logoData }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.subject = 'Weekly Huddle';
  pptx.title = 'Weekly Huddle';
  pptx.theme = { headFontFace: 'Poppins', bodyFontFace: 'IBM Plex Sans', lang: 'id-ID' };

  // Urutan slide: 1 = Profiling KPI, 2 = Availability, 3 = Weekly Trend (Cell Down).
  addKpiProfilingSlide(pptx, { kpiRows: kpi.rows, monthTo: kpi.monthTo, dateLabel: kpi.dateLabel, logoData });
  const availabilitySpecs = addAvailabilitySlide(pptx, { ...availability, logoData });
  const trendResult = addWeeklyTrendSlide(pptx, { ...trend, logoData });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  const zip = await JSZip.loadAsync(buffer);
  // Slide 1 (KPI) tidak butuh perbaikan XML; chart-nya sudah lengkap dari pptxgenjs.
  await fixAvailabilityCharts(zip, await getSlideChartPaths(zip, 2), availabilitySpecs);
  await injectDataLabels(zip, await getSlideChartPaths(zip, 3), trendResult.chartSpecs, trendResult.table);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/**
 * @param kpi           { rows, monthTo }                         (rows = kategori KPI dari getKpi; monthTo = bulan terakhir 1-12)
 * @param trend         { rows, dailyNopRows, fromWeek, toWeek }  (input exportWeeklyTrendPpt)
 * @param availability  { rows, weekFrom, weekTo }                (input exportAvailabilityPpt)
 */
export async function exportWeeklyHuddlePpt({ kpi, trend, availability, fileName }) {
  const selected = trend.rows.filter((row) => row.key >= trend.fromWeek && row.key <= trend.toWeek);
  if (!selected.length) throw new Error('Tidak ada data Cell Down pada rentang minggu yang dipilih.');
  buildAvailabilitySeries(availability.rows, availability); // validasi lebih awal supaya pesan error jelas
  // Validasi KPI lebih awal: kedua jenis (SON L1 & SOMSA L0) harus ada sampai bulan yang dipilih.
  const kpiRows = filterKpiRowsToMonth(kpi.rows, kpi.monthTo);
  if (!availableKpiMonths(kpiRows).length) {
    throw new Error('Data KPI belum ada di database. Upload dulu file KPI List Export di menu Upload > KPI.');
  }

  const logoData = await loadLogoDataUrl();
  const buffer = await buildWeeklyHuddlePptx({ kpi: { ...kpi, dateLabel: kpi.dateLabel || idDateLabel() }, trend, availability, logoData });
  downloadPptx(buffer, fileName || `CDS_Monitoring_Weekly_Huddle_${selected[0].label}_${selected[selected.length - 1].label}.pptx`);
}
