import pptxgen from 'pptxgenjs';
import { REGIONS } from './constants.js';

const REGION_COLORS = {
  Sumbagut: 'E0301E',
  Sumbagteng: '0EA5E9',
  Sumbagsel: '22C55E',
};

function makeSeries(rows, regions) {
  const labels = rows.map((row) => row.label);
  return regions.map((region) => ({
    name: region,
    labels,
    values: rows.map((row) => Number(row.values[region]) || 0),
  }));
}

export async function exportWeeklyTrendPpt({ rows, fromWeek, toWeek, fileName }) {
  const selectedRows = rows.filter((row) => row.key >= fromWeek && row.key <= toWeek);
  if (!selectedRows.length) throw new Error('Tidak ada data Cell Down pada rentang minggu yang dipilih.');

  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'CDS Monitoring';
  pptx.subject = 'Trend Weekly Cell Down Area 1';
  pptx.title = 'Trend Weekly Cell Down Area 1';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'id-ID',
  };
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText('Trend Weekly Cell Down - Area 1', {
    x: 0.45,
    y: 0.2,
    w: 12.4,
    h: 0.36,
    margin: 0,
    fontFace: 'Aptos Display',
    fontSize: 21,
    bold: true,
    color: '17365D',
  });
  slide.addText(`${selectedRows[0].label} - ${selectedRows[selectedRows.length - 1].label} | Rata-rata harian`, {
    x: 0.47,
    y: 0.59,
    w: 12.2,
    h: 0.22,
    margin: 0,
    fontFace: 'Aptos',
    fontSize: 9,
    color: '64748B',
  });

  const addLineChart = (title, regions, x, y, w, h, showLegend) => {
    slide.addText(title, {
      x,
      y,
      w,
      h: 0.25,
      margin: 0,
      fontFace: 'Aptos',
      fontSize: 11,
      bold: true,
      color: '334155',
    });
    slide.addChart(pptx.ChartType.line, makeSeries(selectedRows, regions), {
      x,
      y: y + 0.26,
      w,
      h: h - 0.26,
      showTitle: false,
      showLegend,
      legendPos: 'b',
      legendFontFace: 'Aptos',
      legendFontSize: 8,
      chartColors: regions.map((region) => REGION_COLORS[region]),
      showValue: false,
      showCatName: false,
      showSerName: false,
      catAxisLabelFontFace: 'Aptos',
      catAxisLabelFontSize: 8,
      catAxisLabelColor: '475569',
      valAxisLabelFontFace: 'Aptos',
      valAxisLabelFontSize: 8,
      valAxisLabelColor: '64748B',
      valAxisMinVal: 0,
      valGridLine: { color: 'D9E2F0', width: 1 },
      catAxisLineColor: 'CBD5E1',
      valAxisLineColor: 'CBD5E1',
      lineSize: 2,
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 4,
      showCatAxisTitle: false,
      showValAxisTitle: false,
      showBorder: false,
    });
  };

  addLineChart('Semua Regional', REGIONS, 0.45, 0.92, 12.4, 3.05, true);
  const cardWidth = 4.02;
  const gap = 0.18;
  REGIONS.forEach((region, index) => {
    addLineChart(region, [region], 0.45 + index * (cardWidth + gap), 4.18, cardWidth, 2.78, false);
  });

  const firstLabel = selectedRows[0].label;
  const lastLabel = selectedRows[selectedRows.length - 1].label;
  const outputName = fileName || `Trend_Weekly_Cell_Down_Area_1_${firstLabel}_${lastLabel}.pptx`;
  await pptx.writeFile({ fileName: outputName });
}
