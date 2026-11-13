import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { addWeeklyTrendSlide, injectDataLabels } from './exportWeeklyTrendPpt.js';
import { addAvailabilitySlide, fixAvailabilityCharts, buildAvailabilitySeries } from './exportAvailabilityPpt.js';
import { addKpiProfilingSlide, availableKpiMonths, filterKpiRowsToMonth, idDateLabel } from './exportKpiProfilingSlide.js';
import { addEasValidationSlide, buildEasPeriodData } from './exportEasValidationSlide.js';
import { addVswrSlide, buildVswrPeriodData } from './exportVswrSlide.js';
import { getPeriodBucket } from './aggregate.js';
import { getSlideChartPaths, loadLogoDataUrl, downloadPptx } from './pptxUtils.js';

/*
 * Export "Weekly Huddle" dan "Monthly Report" = 1 file PPTX berisi 5 slide (urutan sama dengan PPT Huddle):
 *   Slide 1 : Profiling KPI                          (Rekap Distribusi Kategori KPI SON L1 & SOMSA L0)
 *   Slide 2 : Trend Weekly Availability | Area 1     (data Availability yang diupload)
 *   Slide 3 : Trend Weekly/Monthly Cell Down | Area 1 & Regional (sumber: data Cell Down / trend log)
 *   Slide 4 : EAS Validation | Area 1                (sumber: riwayat halaman EAS & VSWR, minggu/bulan dipilih)
 *   Slide 5 : VSWR | Area 1                          (sumber: riwayat halaman EAS & VSWR, data VSWR terakhir di periode dipilih)
 * Mode 'weekly'  : Slide 3-5 per minggu (Jumat-Kamis).
 * Mode 'monthly' : Slide 3-5 per bulan kalender; Slide 1 dan 2 sama persis dengan mode weekly.
 * Layout tiap slide sama persis dengan exporter masing-masing; di sini hanya digabung dalam satu deck.
 */

const MODES = {
  weekly: { title: 'Weekly Huddle', periodWord: 'minggu', file: 'Weekly_Huddle' },
  monthly: { title: 'Monthly Report', periodWord: 'bulan', file: 'Monthly_Report' },
};

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Rentang tanggal periode + pembandingnya (periode sebelumnya).
 * weekly : key = tanggal Jumat awal minggu 'YYYY-MM-DD'; monthly : key = 'YYYY-MM'.
 */
export function periodSpec(mode, key) {
  if (mode === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    const from = `${key}-01`;
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const prevFrom = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    return {
      key, from, to, prevFrom, prevTo: addDaysISO(from, -1),
      label: getPeriodBucket(from, 'monthly').label,
      prevLabel: getPeriodBucket(prevFrom, 'monthly').label,
    };
  }
  const prevKey = addDaysISO(key, -7);
  return {
    key, from: key, to: addDaysISO(key, 6), prevFrom: prevKey, prevTo: addDaysISO(key, -1),
    label: getPeriodBucket(key, 'weekly').label,
    prevLabel: getPeriodBucket(prevKey, 'weekly').label,
  };
}

export async function buildHuddlePptx({ mode = 'weekly', kpi, trend, availability, eas, logoData }) {
  const info = MODES[mode] || MODES.weekly;
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.author = 'CDS Monitoring';
  pptx.subject = info.title;
  pptx.title = info.title;
  pptx.theme = { headFontFace: 'Poppins', bodyFontFace: 'IBM Plex Sans', lang: 'id-ID' };

  // Urutan slide: 1 = Profiling KPI, 2 = Availability, 3 = Trend Cell Down, 4 = EAS Validation, 5 = VSWR.
  addKpiProfilingSlide(pptx, { kpiRows: kpi.rows, monthTo: kpi.monthTo, dateLabel: kpi.dateLabel, logoData });
  const availabilitySpecs = addAvailabilitySlide(pptx, { ...availability, logoData });
  const trendResult = addWeeklyTrendSlide(pptx, { ...trend, period: mode === 'monthly' ? 'monthly' : 'weekly', logoData });
  addEasValidationSlide(pptx, { data: eas.data, weekLabel: eas.label, logoData });
  addVswrSlide(pptx, { data: eas.vswrData, weekLabel: eas.label, logoData });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  const zip = await JSZip.loadAsync(buffer);
  // Slide 1 (KPI) tidak butuh perbaikan XML; chart-nya sudah lengkap dari pptxgenjs.
  await fixAvailabilityCharts(zip, await getSlideChartPaths(zip, 2), availabilitySpecs);
  await injectDataLabels(zip, await getSlideChartPaths(zip, 3), trendResult.chartSpecs, trendResult.table);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

export const buildWeeklyHuddlePptx = (args) => buildHuddlePptx({ ...args, mode: 'weekly' });

/**
 * @param mode          'weekly' | 'monthly'
 * @param kpi           { rows, monthTo }                         (rows = kategori KPI dari getKpi; monthTo = bulan terakhir 1-12)
 * @param trend         { rows, dailyNopRows, dailyRows, dailyNopByRegion, fromWeek, toWeek }
 *                      (rows = rata-rata per minggu / per bulan; fromWeek/toWeek = key awal/akhir rentang)
 * @param availability  { rows, weekFrom, weekTo }                (input exportAvailabilityPpt)
 * @param eas           { history, weekKey }                      (riwayat EAS & VSWR; weekKey = key periode utk Slide 4 & 5:
 *                                                                 Jumat awal minggu atau 'YYYY-MM')
 */
export async function exportHuddlePpt({ mode = 'weekly', kpi, trend, availability, eas, fileName }) {
  const info = MODES[mode] || MODES.weekly;
  const selected = trend.rows.filter((row) => row.key >= trend.fromWeek && row.key <= trend.toWeek);
  if (!selected.length) throw new Error(`Tidak ada data Cell Down pada rentang ${info.periodWord} yang dipilih.`);
  buildAvailabilitySeries(availability.rows, availability); // validasi lebih awal supaya pesan error jelas
  // Validasi KPI lebih awal: kedua jenis (SON L1 & SOMSA L0) harus ada sampai bulan yang dipilih.
  const kpiRows = filterKpiRowsToMonth(kpi.rows, kpi.monthTo);
  if (!availableKpiMonths(kpiRows).length) {
    throw new Error('Data KPI belum ada di database. Upload dulu file KPI List Export di menu Upload > KPI.');
  }

  // Slide EAS Validation & VSWR memakai satu periode pilihan sendiri (default: periode terakhir Trend Cell Down).
  const period = periodSpec(mode, eas?.weekKey || selected[selected.length - 1].key);
  const easData = buildEasPeriodData(eas?.history, { from: period.from, to: period.to });
  if (!easData) {
    throw new Error(`Belum ada data EAS Validation untuk ${period.label}. Upload dulu di menu EAS & VSWR (tanggal di ${info.periodWord} tersebut).`);
  }
  const vswrData = buildVswrPeriodData(eas?.history, period);
  if (!vswrData) {
    throw new Error(`Belum ada data VSWR untuk ${period.label}. Upload file VSWR dulu di menu EAS & VSWR (tanggal di ${info.periodWord} tersebut).`);
  }

  const logoData = await loadLogoDataUrl();
  const buffer = await buildHuddlePptx({
    mode,
    kpi: { ...kpi, dateLabel: kpi.dateLabel || idDateLabel() },
    trend,
    availability,
    eas: { data: easData, vswrData, label: period.label },
    logoData,
  });
  downloadPptx(buffer, fileName || `CDS_Monitoring_${info.file}_${selected[0].label.replace(/\s+/g, '')}_${selected[selected.length - 1].label.replace(/\s+/g, '')}.pptx`);
}

export const exportWeeklyHuddlePpt = (args) => exportHuddlePpt({ ...args, mode: 'weekly' });
export const exportMonthlyReportPpt = (args) => exportHuddlePpt({ ...args, mode: 'monthly' });
