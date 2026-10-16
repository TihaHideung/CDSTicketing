import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { buildFilteredDailyTrendByNop, buildFilteredDailyTrendByRegion } from '../lib/aggregate.js';
import { buildReport, listReportPeriods } from '../lib/reportAnalysis.js';
import { exportReportPdf } from '../lib/reportPdf.js';

const TYPE_LABEL = { CellDown: 'Cell Down', SiteDown: 'Site Down' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

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
  const trendExportRef = useRef(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [reportCharts, setReportCharts] = useState([]); // grafik yang di-render tersembunyi saat export report

  // Report PDF selalu Weekly. Ini daftar minggu yang punya data (dipakai dropdown di ExportModal).
  const getReportWeeks = useCallback(() => listReportPeriods(trendLog, trendCriteria, 'weekly'), [trendLog, trendCriteria]);

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

  const handleConfirmExport = async ({ excel, pdf, reportKey, uploadDateFrom, uploadDateTo }) => {
    setExporting(true);
    setExportError('');
    try {
      if (excel) await onExportExcel({ uploadDateFrom, uploadDateTo });

      if (pdf) {
        // Report dipisah per tipe: Cell Down & Site Down masing-masing 1 halaman.
        // Kalau filter Tipe sudah dipilih, hanya tipe itu; sumber selain INAP hanya Site Down.
        const base = trendCriteria || {};
        const types = base.category ? [base.category] : sourceMode === SOURCE_INAP ? ['CellDown', 'SiteDown'] : ['SiteDown'];
        const inRange = (from, to) => (d) => {
          const k = String(d.date).slice(0, 10);
          return k >= from && k <= to;
        };

        const pages = [];
        const specs = [];
        for (const type of types) {
          const criteria = { ...base, category: type };
          let report;
          try {
            report = buildReport({ log: trendLog, criteria, period: 'weekly', periodKey: reportKey });
          } catch {
            continue; // minggu ini tidak punya data untuk tipe ini
          }
          const typeLabel = TYPE_LABEL[type];
          // Data grafik untuk tipe ini (aturan sama dengan grafik Dashboard).
          const view =
            criteria.regionalFilter && criteria.regionalFilter !== ALL_KEY
              ? { mode: 'nop', nopSplit: { ...buildFilteredDailyTrendByNop(trendLog, criteria), title: `${typeLabel} ${criteria.regionalFilter}` } }
              : { mode: 'region', byRegion: buildFilteredDailyTrendByRegion(trendLog, REGIONS, criteria) };

          // Grafik 1: trend mingguan; Grafik 2: trend harian HANYA pada tanggal di minggu report.
          const chartIds = [`${type}-main`];
          specs.push({
            id: chartIds[0],
            view,
            fixedPeriod: report.trendWindow.granularity,
            filterFn: inRange(report.trendWindow.from, report.trendWindow.to),
          });
          if (report.subWindow) {
            const dates = new Set(report.subWindow.dates);
            chartIds.push(`${type}-sub`);
            specs.push({
              id: chartIds[1],
              view,
              fixedPeriod: report.subWindow.granularity,
              filterFn: (d) => dates.has(String(d.date).slice(0, 10)),
            });
          }
          pages.push({
            typeKey: type,
            typeLabel,
            report,
            chartIds,
            captions: [report.trendWindow.title.replace(/^Trend /, `Trend ${typeLabel} `), report.subWindow?.title.replace(/^Trend /, `Trend ${typeLabel} `)],
          });
        }
        if (!pages.length) throw new Error('Tidak ada data untuk minggu ini pada filter yang dipilih.');

        setReportCharts(specs);
        // Beri waktu React me-render trend tersembunyi & Recharts mengukur ukurannya.
        await nextFrames();
        await sleep(900);

        // Yang di-screenshot hanya area grafik + legenda (tanpa judul/keterangan bawaan komponen).
        const grab = (id) => {
          const holder = trendExportRef.current?.querySelector(`[data-export-chart="${id}"]`);
          return holder?.querySelector('.recharts-wrapper') || holder;
        };
        const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
        await exportReportPdf({
          pages: pages.map((pg) => ({
            typeKey: pg.typeKey,
            typeLabel: pg.typeLabel,
            report: pg.report,
            charts: pg.chartIds.map((id, i) => ({ element: grab(id), caption: pg.captions[i] })),
          })),
          fileName: `CDS_Monitoring_Laporan_Weekly_${pages[0].report.periodKey}_${label}.pdf`,
          filterText: describeFilters(filters, { withType: false }),
        });
      }
      setShowExport(false);
    } catch (err) {
      setExportError(err?.message || String(err));
    } finally {
      setReportCharts([]);
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

  // `view` (opsional) = data trend untuk 1 tipe saat export report; tanpa `view` memakai data Dashboard saat ini.
  const renderTrend = (fixedPeriod, filterFn, view) => {
    const split = view ? (view.mode === 'nop' ? view.nopSplit : null) : nopSplit;
    const byRegion = view ? view.byRegion : dailyTrendByRegion;
    const granular = view ? true : trendHasGranularFilter;
    const common = {
      hasGranularFilter: granular,
      logHasOlderData: trendLogHasOlderData,
      fixedPeriod,
      sourceMode,
      skippedDates: trendSkippedDates,
    };
    if (split) {
      return (
        <TrendChart
          dataByNop={filterFn ? split.rows.filter(filterFn) : split.rows}
          nops={split.nops}
          nopTitle={split.title}
          {...common}
        />
      );
    }
    if (view ? view.mode === 'region' : isAllRegional) {
      return (
        <TrendChart
          dataByRegion={filterFn ? byRegion.filter(filterFn) : byRegion}
          regions={REGIONS}
          {...common}
        />
      );
    }
    return <TrendChart dataSingle={filterFn ? dailyTrend.filter(filterFn) : dailyTrend} {...common} />;
  };

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
          getReportWeeks={getReportWeeks}
        />
      )}

      {reportCharts.length > 0 &&
        createPortal(
          <div
            ref={trendExportRef}
            style={{ position: 'fixed', left: 0, top: 0, width: 1100, zIndex: -1, pointerEvents: 'none', background: '#ffffff' }}
          >
            {reportCharts.map((c) => (
              <div key={c.id} data-export-chart={c.id} style={{ background: '#ffffff', padding: 4, marginBottom: 8 }}>
                {renderTrend(c.fixedPeriod, c.filterFn, c.view)}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
