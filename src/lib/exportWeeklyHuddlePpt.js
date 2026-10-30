import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { addWeeklyTrendSlide, injectDataLabels } from './exportWeeklyTrendPpt.js';
import { addAvailabilitySlide, fixAvailabilityCharts, buildAvailabilitySeries } from './exportAvailabilityPpt.js';
import { getSlideChartPaths, loadLogoDataUrl, downloadPptx } from './pptxUtils.js';

/*
 * Export "Weekly Huddle" = 1 file PPTX berisi 2 slide:
 *   Slide 1 : Trend Weekly Cell Down | Area 1 & Regional   (sumber: data Cell Down / trend log)
 *   Slide 2 : Trend Weekly Availability | Area 1 - Regional (sumber: data Availability yang diupload)
 * Layout tiap slide sama persis dengan exporter masing-masing; di sini hanya digabung dalam satu deck.
 * Slide KPI (SOMSA L0 / SON L1) nanti bisa ditambahkan sebagai slide berikutnya di fungsi yang sama.
 */

export async function buildWeeklyHuddlePptx({ trend, availability, logoData }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.subject = 'Weekly Huddle';
  pptx.title = 'Weekly Huddle';
  pptx.theme = { headFontFace: 'Poppins', bodyFontFace: 'IBM Plex Sans', lang: 'id-ID' };

  // Urutan slide: 1 = Weekly Trend, 2 = Availability.
  const trendResult = addWeeklyTrendSlide(pptx, { ...trend, logoData });
  const availabilitySpecs = addAvailabilitySlide(pptx, { ...availability, logoData });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  const zip = await JSZip.loadAsync(buffer);
  await injectDataLabels(zip, await getSlideChartPaths(zip, 1), trendResult.chartSpecs, trendResult.table);
  await fixAvailabilityCharts(zip, await getSlideChartPaths(zip, 2), availabilitySpecs);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/**
 * @param trend         { rows, dailyNopRows, fromWeek, toWeek }  (input exportWeeklyTrendPpt)
 * @param availability  { rows, weekFrom, weekTo }                (input exportAvailabilityPpt)
 */
export async function exportWeeklyHuddlePpt({ trend, availability, fileName }) {
  const selected = trend.rows.filter((row) => row.key >= trend.fromWeek && row.key <= trend.toWeek);
  if (!selected.length) throw new Error('Tidak ada data Cell Down pada rentang minggu yang dipilih.');
  buildAvailabilitySeries(availability.rows, availability); // validasi lebih awal supaya pesan error jelas

  const logoData = await loadLogoDataUrl();
  const buffer = await buildWeeklyHuddlePptx({ trend, availability, logoData });
  downloadPptx(buffer, fileName || `CDS_Monitoring_Weekly_Huddle_${selected[0].label}_${selected[selected.length - 1].label}.pptx`);
}
