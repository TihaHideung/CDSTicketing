import React, { useCallback, useMemo, useRef, useState } from 'react';
import KpiCards from './KpiCards.jsx';
import FilterBar, { UNSET_KEY } from './FilterBar.jsx';
import ExportModal from './ExportModal.jsx';
import TicketPreviewTable from './TicketPreviewTable.jsx';
import CellVsSiteDonut from './charts/CellVsSiteDonut.jsx';
import AreaContributorBar from './charts/AreaContributorBar.jsx';
import RcCategoryBar from './charts/RcCategoryBar.jsx';
import TrendChart from './charts/TrendChart.jsx';
import { REGIONS, SOURCE_INAP, SOURCE_NOIM, SOURCE_BOTH, SOURCE_NOT_BOTH } from '../lib/constants.js';
import { ALL_KEY } from './FilterBar.jsx';
import { buildFilteredDailyTrendByNop, buildFilteredDailyTrendByRegion, getPeriodBucket } from '../lib/aggregate.js';
import { listReportPeriods } from '../lib/reportAnalysis.js';

function describeFilters(f = {}, { withType = true } = {}) {
  const all = (v) => v === ALL_KEY;
  const parts = [`Regional: ${all(f.regionalFilter) ? 'Semua' : f.regionalFilter}`];
  if (f.nopFilter && !all(f.nopFilter)) parts.push(`NOP: ${f.nopFilter}`);
  if (f.clusterFilter && !all(f.clusterFilter)) parts.push(`Cluster: ${f.clusterFilter}`);
  if (withType) parts.push(`Tipe: ${all(f.categoryFilter) ? 'Semua' : f.categoryFilter === 'SiteDown' ? 'Site Down' : 'Cell Down'}`);
  if (f.sourceEnabled) parts.push(`Sumber Data: ${f.sourceFilter}`);
  parts.push(`Duration: ${f.durationFilter?.length ? f.durationFilter.join(', ') : 'Semua'}`);
  if (f.rcFilter && !all(f.rcFilter)) {
    parts.push(`RC: ${f.rcFilter === UNSET_KEY ? 'Belum diisi' : f.rcFilter}${f.rcSubFilter && !all(f.rcSubFilter) ? ` / ${f.rcSubFilter}` : ''}`);
  }
  return `Filter - ${parts.join(' | ')}`;
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
  trendLog = [],
  trendCriteria = {},
  filters,
  onGoToUpload,
  onRowClick,
  onExportExcel,
}) {
  const captureRef = useRef(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [availabilityWeeks, setAvailabilityWeeks] = useState([]);
  const [availabilityWeeksLoading, setAvailabilityWeeksLoading] = useState(false);
  const [availabilityWeeksError, setAvailabilityWeeksError] = useState('');

  // Report PPT selalu Weekly. Ini daftar minggu yang punya data (dipakai dropdown di ExportModal).
  const getReportWeeks = useCallback(() => listReportPeriods(trendLog, trendCriteria, 'weekly'), [trendLog, trendCriteria]);
  const weeklyTrendRows = useMemo(() => {
    if (sourceMode !== SOURCE_INAP) return [];
    const criteria = { ...trendCriteria, regionalFilter: ALL_KEY, category: 'CellDown' };
    const dailyRows = buildFilteredDailyTrendByRegion(trendLog, REGIONS, criteria);
    const buckets = new Map();
    for (const row of dailyRows) {
      const period = getPeriodBucket(row.date, 'weekly');
      if (!buckets.has(period.key)) {
        buckets.set(period.key, {
          key: period.key,
          label: period.label,
          sums: Object.fromEntries(REGIONS.map((region) => [region, 0])),
          days: 0,
        });
      }
      const bucket = buckets.get(period.key);
      for (const region of REGIONS) bucket.sums[region] += Number(row[region]) || 0;
      bucket.days++;
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((bucket) => {
        const endDate = new Date(`${bucket.key}T00:00:00`);
        endDate.setDate(endDate.getDate() + 6);
        const dateTo = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        return {
          key: bucket.key,
          label: bucket.label,
          rangeLabel: `${bucket.label} (${bucket.key} - ${dateTo})`,
          values: Object.fromEntries(REGIONS.map((region) => [region, Math.ceil(bucket.sums[region] / bucket.days)])),
        };
      });
  }, [sourceMode, trendLog, trendCriteria]);
  const getWeeklyTrendWeeks = useCallback(
    () => weeklyTrendRows.slice().reverse().map(({ key, rangeLabel }) => ({ key, label: rangeLabel })),
    [weeklyTrendRows]
  );
  const openExport = async () => {
    setExportError('');
    setShowExport(true);
    setAvailabilityWeeks([]);
    setAvailabilityWeeksError('');
    setAvailabilityWeeksLoading(true);
    try {
      const { getAvailability } = await import('../lib/dbApi.js');
      const rows = await getAvailability();
      const periodRegions = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        const period = Number(row.period);
        if (!/^\d{6}$/.test(String(row.period)) || !REGIONS.includes(row.regional) || !Number.isFinite(Number(row.availability))) continue;
        if (!periodRegions.has(period)) periodRegions.set(period, new Set());
        periodRegions.get(period).add(row.regional);
      }
      const completePeriods = [...periodRegions.entries()]
        .filter(([, regions]) => REGIONS.every((region) => regions.has(region)))
        .map(([period]) => period);
      const latestYear = Math.max(0, ...completePeriods.map((period) => Math.floor(period / 100)));
      setAvailabilityWeeks(completePeriods
        .filter((period) => Math.floor(period / 100) === latestYear)
        .sort((a, b) => a - b)
        .map((period) => ({ key: String(period), label: `W${period % 100} ${Math.floor(period / 100)}` })));
    } catch (err) {
      setAvailabilityWeeksError(err?.message || 'Gagal memuat minggu Availability.');
    } finally {
      setAvailabilityWeeksLoading(false);
    }
  };

  // Tampilan saja: 1 Regional -> batang trend dipecah per NOP.
  const nopSplit = useMemo(() => {
    const c = trendCriteria || {};
    const active =
      c.regionalFilter &&
      c.regionalFilter !== ALL_KEY;
    if (!active) return null;
    const result = buildFilteredDailyTrendByNop(trendLog, c);
    const categoryTitle = c.category === 'CellDown' ? 'Cell Down' : c.category === 'SiteDown' ? 'Site Down' : '';
    return {
      ...result,
      title: `${categoryTitle ? `${categoryTitle} ` : ''}${c.regionalFilter}`,
    };
  }, [trendLog, trendCriteria]);

  const handleConfirmExport = async ({ excel, reportPpt, weeklyHuddle, reportKey, weekFrom, weekTo, availabilityFrom, availabilityTo, uploadDateFrom, uploadDateTo }) => {
    setExporting(true);
    setExportError('');
    try {
      if (excel) await onExportExcel({ uploadDateFrom, uploadDateTo });

      if (reportPpt) {
        // Report Cell Down (template Tracking & Performance). Snapshot (Site Class, Area Contributor,
        // RC, Aging) memakai `summary` Dashboard; trend harian 4 minggu s.d. akhir minggu terpilih.
        const weekOption = getReportWeeks().find((o) => o.key === reportKey);
        const { exportReportPpt } = await import('../lib/exportReportPpt.js');
        await exportReportPpt({
          summary,
          trendLog,
          criteria: trendCriteria || {},
          weekKey: reportKey,
          weekLabel: weekOption?.title || '',
          filterText: describeFilters(filters, { withType: false }),
          fileName: `CDS_Monitoring_Report_Cell_Down_${reportKey}.pptx`,
        });
      }
      if (weeklyHuddle) {
        // Weekly Huddle = 1 file, 2 slide: Slide 1 Trend Weekly Cell Down, Slide 2 Availability.
        const selectedWeeks = weeklyTrendRows.filter((row) => row.key >= weekFrom && row.key <= weekTo);
        if (!selectedWeeks.length) throw new Error('Tidak ada data Cell Down pada rentang minggu yang dipilih.');
        const anomalyCriteria = { ...trendCriteria, regionalFilter: ALL_KEY, category: 'CellDown' };
        const { rows: dailyNopRows } = buildFilteredDailyTrendByNop(trendLog, anomalyCriteria);
        const { getAvailability } = await import('../lib/dbApi.js');
        const { exportWeeklyHuddlePpt } = await import('../lib/exportWeeklyHuddlePpt.js');
        await exportWeeklyHuddlePpt({
          trend: { rows: weeklyTrendRows, dailyNopRows, fromWeek: weekFrom, toWeek: weekTo },
          availability: { rows: await getAvailability(), weekFrom: Number(availabilityFrom), weekTo: Number(availabilityTo) },
          fileName: `CDS_Monitoring_Weekly_Huddle_${selectedWeeks[0].label}_${selectedWeeks[selectedWeeks.length - 1].label}.pptx`,
        });
      }
      setShowExport(false);
    } catch (err) {
      setExportError(err?.message || String(err));
    } finally {
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

  const renderTrend = () => {
    const common = {
      hasGranularFilter: trendHasGranularFilter,
      logHasOlderData: trendLogHasOlderData,
      sourceMode,
      skippedDates: trendSkippedDates,
    };
    if (nopSplit) {
      return <TrendChart dataByNop={nopSplit.rows} nops={nopSplit.nops} nopTitle={nopSplit.title} {...common} />;
    }
    if (isAllRegional) {
      return <TrendChart dataByRegion={dailyTrendByRegion} regions={REGIONS} {...common} />;
    }
    return <TrendChart dataSingle={dailyTrend} {...common} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar {...filters} showDateFilter={false} />
        <button
          onClick={openExport}
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
          getReportWeeks={getReportWeeks}
          getWeeklyTrendWeeks={getWeeklyTrendWeeks}
          availabilityWeeks={availabilityWeeks}
          availabilityWeeksLoading={availabilityWeeksLoading}
          availabilityWeeksError={availabilityWeeksError}
        />
      )}

    </div>
  );
}
