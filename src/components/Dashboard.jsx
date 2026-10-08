import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import KpiCards from './KpiCards.jsx';
import FilterBar, { UNSET_KEY } from './FilterBar.jsx';
import ExportModal, { EXPORT_CHARTS } from './ExportModal.jsx';
import TicketPreviewTable from './TicketPreviewTable.jsx';
import CellVsSiteDonut from './charts/CellVsSiteDonut.jsx';
import AreaContributorBar from './charts/AreaContributorBar.jsx';
import RcCategoryBar from './charts/RcCategoryBar.jsx';
import TrendChart from './charts/TrendChart.jsx';
import { REGIONS, SOURCE_INAP, SOURCE_NOIM, SOURCE_BOTH, SOURCE_NOT_BOTH } from '../lib/constants.js';
import { ALL_KEY } from './FilterBar.jsx';
import { aggregateTrendByPeriod, aggregateTrendByRegionByPeriod } from '../lib/aggregate.js';
import { exportElementsAsPdf } from '../lib/exportCharts.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function describeFilters(f = {}) {
  const all = (v) => v === ALL_KEY;
  const parts = [`Regional: ${all(f.regionalFilter) ? 'Semua' : f.regionalFilter}`];
  if (f.nopFilter && !all(f.nopFilter)) parts.push(`NOP: ${f.nopFilter}`);
  if (f.clusterFilter && !all(f.clusterFilter)) parts.push(`Cluster: ${f.clusterFilter}`);
  parts.push(`Tipe: ${all(f.categoryFilter) ? 'Semua' : f.categoryFilter === 'SiteDown' ? 'Site Down' : 'Cell Down'}`);
  if (f.sourceEnabled) parts.push(`Sumber Data: ${f.sourceFilter}`);
  parts.push(`Duration: ${f.durationFilter?.length ? f.durationFilter.join(', ') : 'Semua'}`);
  if (f.rcFilter && !all(f.rcFilter)) {
    parts.push(`RC: ${f.rcFilter === UNSET_KEY ? 'Belum diisi' : f.rcFilter}${f.rcSubFilter && !all(f.rcSubFilter) ? ` / ${f.rcSubFilter}` : ''}`);
  }
  return `Filter - ${parts.join(' | ')}`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function formatTrendValue(value) {
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

function getTopAndBottom(items, valueKey) {
  const valid = items.filter((item) => Number.isFinite(Number(item[valueKey])));
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
  return { top: sorted[0], bottom: sorted[sorted.length - 1] };
}

function buildTrendAnalytics(periods, trendSource, isAllRegional) {
  const insights = [];
  for (const period of periods) {
    const data = isAllRegional
      ? aggregateTrendByRegionByPeriod(trendSource, REGIONS, period)
      : aggregateTrendByPeriod(trendSource, period);
    const points = data.map((point) => ({
      date: point.date,
      total: isAllRegional
        ? REGIONS.reduce((sum, region) => sum + (Number(point[region]) || 0), 0)
        : Number(point.total) || 0,
    }));
    if (!points.length) continue;

    const periodLabel = { daily: 'harian', weekly: 'mingguan', monthly: 'bulanan', quarter: 'kuartalan', annual: 'tahunan' }[period] || period;
    const highest = points.reduce((best, point) => (point.total > best.total ? point : best));
    const lowest = points.reduce((best, point) => (point.total < best.total ? point : best));
    insights.push(`Trend ${periodLabel}: rata-rata tertinggi ${formatTrendValue(highest.total)} tiket/hari pada ${highest.date}; terendah ${formatTrendValue(lowest.total)} tiket/hari pada ${lowest.date}.`);

    if (points.length < 2) {
      insights.push(`Trend ${periodLabel}: baru ada satu periode, jadi perubahan antarperiode belum dapat dibandingkan.`);
      continue;
    }

    let largestRise = null;
    let largestDrop = null;
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      const change = current.total - previous.total;
      if (change > 0 && (!largestRise || change > largestRise.change)) largestRise = { previous, current, change };
      if (change < 0 && (!largestDrop || change < largestDrop.change)) largestDrop = { previous, current, change };
    }
    if (largestRise) insights.push(`Kenaikan rata-rata ${periodLabel} terbesar: +${formatTrendValue(largestRise.change)} tiket/hari dari ${largestRise.previous.date} ke ${largestRise.current.date}.`);
    if (largestDrop) insights.push(`Penurunan rata-rata ${periodLabel} terbesar: -${formatTrendValue(Math.abs(largestDrop.change))} tiket/hari dari ${largestDrop.previous.date} ke ${largestDrop.current.date}.`);
    const previous = points[points.length - 2];
    const latest = points[points.length - 1];
    const latestChange = latest.total - previous.total;
    insights.push(`Perbandingan periode terbaru: ${latest.date} ${formatTrendValue(latest.total)} tiket/hari dibanding ${previous.date} ${formatTrendValue(previous.total)} (${latestChange > 0 ? '+' : ''}${formatTrendValue(latestChange)} tiket/hari).`);
  }
  return insights;
}

function buildChartAnalytics({ charts, trendPeriods, summary, trendSource, isAllRegional }) {
  if (!summary) return {};
  const insights = {};
  const { overview } = summary;

  if (charts.includes('kpi')) {
    insights.kpi = [`Ringkasan KPI: ${formatCount(overview.total)} tiket aktif, terdiri dari ${formatCount(overview.cellDown)} Cell Down dan ${formatCount(overview.siteDown)} Site Down.`];
  }
  if (charts.includes('donut')) {
    const dominant = overview.cellDown >= overview.siteDown ? 'Cell Down' : 'Site Down';
    const dominantCount = Math.max(overview.cellDown, overview.siteDown);
    const share = overview.total ? ((dominantCount / overview.total) * 100).toFixed(1) : '0.0';
    insights.donut = [`Komposisi tiket: ${dominant} mendominasi dengan ${formatCount(dominantCount)} tiket (${share}%); selisih kedua kategori ${formatCount(Math.abs(overview.cellDown - overview.siteDown))} tiket.`];
  }
  if (charts.includes('siteclass')) {
    const distribution = getTopAndBottom(summary.siteClass, 'total');
    if (distribution) {
      insights.siteclass = [`Distribusi Site Class: tertinggi ${distribution.top.siteClass} (${formatCount(distribution.top.total)} tiket), terendah ${distribution.bottom.siteClass} (${formatCount(distribution.bottom.total)} tiket).`];
    }
  }

  const rcCharts = [
    ['rc-cell', summary.rcCategoryCellDownByDuration, 'rcCategory', 'RC Category Cell Down'],
    ['rc-site', summary.rcCategorySiteDownByDuration, 'rcCategory', 'RC Category Site Down'],
    ['rcsub-cell', summary.rcSubcategoryCellDownByDuration, 'rcSubcategory', 'RC Subcategory Cell Down'],
    ['rcsub-site', summary.rcSubcategorySiteDownByDuration, 'rcSubcategory', 'RC Subcategory Site Down'],
  ];
  for (const [chartId, data, labelKey, label] of rcCharts) {
    if (!charts.includes(chartId)) continue;
    const distribution = getTopAndBottom(data, 'total');
    if (distribution) {
      insights[chartId] = [`${label}: terbanyak ${distribution.top[labelKey]} (${formatCount(distribution.top.total)} tiket) dan paling sedikit ${distribution.bottom[labelKey]} (${formatCount(distribution.bottom.total)} tiket).`];
    } else {
      insights[chartId] = [`${label}: belum ada tiket dengan kategori terisi pada filter ini.`];
    }
  }

  if (charts.includes('trend')) {
    for (const period of trendPeriods) {
      insights[`trend-${period}`] = buildTrendAnalytics([period], trendSource, isAllRegional);
    }
  }
  return insights;
}

export default function Dashboard({
  summary,
  removedStats,
  dailyTrend,
  dailyTrendByRegion,
  trendHasGranularFilter,
  trendLogHasOlderData,
  regionalFilter,
  viewRows,
  sourceMode = SOURCE_INAP,
  trendSkippedDates = [],
  filters,
  onGoToUpload,
  onRowClick,
  onExportExcel,
}) {
  const captureRef = useRef(null);
  const trendExportRef = useRef(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [trendExportPeriods, setTrendExportPeriods] = useState([]); // periode trend yang di-render tersembunyi saat export

  const handleConfirmExport = async ({ excel, pdf, charts, trendPeriods: selectedPeriods = [], uploadDateFrom, uploadDateTo }) => {
    setExporting(true);
    setExportError('');
    try {
      if (excel) await onExportExcel({ uploadDateFrom, uploadDateTo });

      if (pdf && charts.length > 0) {
        const periods = charts.includes('trend') ? selectedPeriods : [];
        if (periods.length) {
          setTrendExportPeriods(periods);
          // Beri waktu React me-render trend tersembunyi & Recharts mengukur ukurannya.
          await nextFrames();
          await sleep(700);
        }

        const blocks = [];
        const analyticsByChart = buildChartAnalytics({ charts, trendPeriods: periods, summary, trendSource, isAllRegional });
        for (const chart of EXPORT_CHARTS) {
          if (!charts.includes(chart.id)) continue;
          if (chart.id === 'trend') {
            for (const p of periods) {
              blocks.push({
                element: trendExportRef.current?.querySelector(`[data-export-trend="${p}"]`),
                full: true,
                analytics: analyticsByChart[`trend-${p}`],
              });
            }
          } else {
            blocks.push({
              element: captureRef.current?.querySelector(`[data-export-id="${chart.id}"]`),
              full: Boolean(chart.full),
              analytics: analyticsByChart[chart.id],
            });
          }
        }

        const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
        await exportElementsAsPdf(blocks, {
          fileName: `CDS_Monitoring_Charts_${label}.pdf`,
          title: 'CDS Monitoring - Dashboard',
          subtitle: describeFilters(filters),
        });
      }
      setShowExport(false);
    } catch (err) {
      setExportError(err?.message || String(err));
    } finally {
      setTrendExportPeriods([]);
      setExporting(false);
    }
  };

  if (!summary) {
    return (
      <div className="space-y-4">
        <FilterBar {...filters} showDateFilter={false} />
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-slate-500 mb-4">
            {sourceMode === SOURCE_NOIM
              ? 'Belum ada data NOIM untuk filter ini. Upload Data NOIM di halaman Upload, atau ganti Sumber Data.'
              : sourceMode === SOURCE_BOTH
                ? 'Tidak ada Site ID yang beririsan antara INAP dan NOIM untuk filter ini.'
                : sourceMode === SOURCE_NOT_BOTH
                  ? 'Tidak ada Site ID yang tidak beririsan antara INAP dan NOIM untuk filter ini.'
                  : 'Belum ada data untuk filter ini.'}
          </p>
          <button onClick={onGoToUpload} className="px-4 py-2 rounded-md bg-brand-red text-white font-medium">
            Upload Data Sekarang
          </button>
        </div>
      </div>
    );
  }

  const isAllRegional = regionalFilter === ALL_KEY;

  const renderTrend = (fixedPeriod) =>
    isAllRegional ? (
      <TrendChart
        dataByRegion={dailyTrendByRegion}
        regions={REGIONS}
        hasGranularFilter={trendHasGranularFilter}
        logHasOlderData={trendLogHasOlderData}
        fixedPeriod={fixedPeriod}
        sourceMode={sourceMode}
        skippedDates={trendSkippedDates}
      />
    ) : (
      <TrendChart
        dataSingle={dailyTrend}
        hasGranularFilter={trendHasGranularFilter}
        logHasOlderData={trendLogHasOlderData}
        fixedPeriod={fixedPeriod}
        sourceMode={sourceMode}
        skippedDates={trendSkippedDates}
      />
    );
  const trendSource = isAllRegional ? dailyTrendByRegion : dailyTrend;
  const trendAvailable = Array.isArray(trendSource) && trendSource.length > 0;
  const trendUnavailableReason = 'Belum ada data trend untuk filter ini.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar {...filters} showDateFilter={false} />
        <button
          onClick={() => {
            setExportError('');
            setShowExport(true);
          }}
          className="px-4 py-2 rounded-md bg-brand-red text-white text-sm font-medium shrink-0"
        >
          Export
        </button>
      </div>

      <div ref={captureRef} className="space-y-6 bg-slate-50 p-1">
        <div data-export-id="kpi">
          <KpiCards summary={summary} removedStats={removedStats} />
        </div>

        {renderTrend()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div data-export-id="donut" className="[&>*]:h-full">
            <CellVsSiteDonut summary={summary} />
          </div>
          <div data-export-id="siteclass" className="[&>*]:h-full">
            <AreaContributorBar summary={summary} />
          </div>
          <div data-export-id="rc-cell" className="[&>*]:h-full">
            <RcCategoryBar
              title="RC Category — Cell Down"
              data={summary.rcCategoryCellDownByDuration}
              underReviewCount={summary.rcCategoryCellDownUnderReview}
              categoryKey="rcCategory"
              label="RC Category"
              emptyText="RC Category"
            />
          </div>
          <div data-export-id="rc-site" className="[&>*]:h-full">
            <RcCategoryBar
              title="RC Category — Site Down"
              data={summary.rcCategorySiteDownByDuration}
              underReviewCount={summary.rcCategorySiteDownUnderReview}
              categoryKey="rcCategory"
              label="RC Category"
              emptyText="RC Category"
            />
          </div>
          <div data-export-id="rcsub-cell" className="[&>*]:h-full">
            <RcCategoryBar
              title="RC Subcategory — Cell Down"
              data={summary.rcSubcategoryCellDownByDuration}
              underReviewCount={summary.rcSubcategoryCellDownUnderReview}
              categoryKey="rcSubcategory"
              label="RC Subcategory"
              emptyText="RC Subcategory"
            />
          </div>
          <div data-export-id="rcsub-site" className="[&>*]:h-full">
            <RcCategoryBar
              title="RC Subcategory — Site Down"
              data={summary.rcSubcategorySiteDownByDuration}
              underReviewCount={summary.rcSubcategorySiteDownUnderReview}
              categoryKey="rcSubcategory"
              label="RC Subcategory"
              emptyText="RC Subcategory"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-2">Preview Ticket Active</h3>
        <TicketPreviewTable rows={viewRows} onRowClick={onRowClick} compact pageSize={10} />
      </div>

      {showExport && (
        <ExportModal
          onClose={() => !exporting && setShowExport(false)}
          onConfirm={handleConfirmExport}
          exporting={exporting}
          error={exportError}
          trendAvailable={trendAvailable}
          trendUnavailableReason={trendUnavailableReason}
        />
      )}

      {trendExportPeriods.length > 0 &&
        createPortal(
          <div
            ref={trendExportRef}
            style={{ position: 'fixed', left: 0, top: 0, width: 1100, zIndex: -1, pointerEvents: 'none', background: '#ffffff' }}
          >
            {trendExportPeriods.map((p) => (
              <div key={p} data-export-trend={p} style={{ background: '#ffffff', padding: 4, marginBottom: 8 }}>
                {renderTrend(p)}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
