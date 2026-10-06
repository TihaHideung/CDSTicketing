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
import { REGIONS } from '../lib/constants.js';
import { ALL_KEY } from './FilterBar.jsx';
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

export default function Dashboard({
  summary,
  removedStats,
  dailyTrend,
  dailyTrendByRegion,
  trendHasGranularFilter,
  trendLogHasOlderData,
  regionalFilter,
  viewRows,
  sourceMode = 'INAP',
  sourceStats = null,
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
        for (const chart of EXPORT_CHARTS) {
          if (!charts.includes(chart.id)) continue;
          if (chart.id === 'trend') {
            for (const p of periods) {
              blocks.push({ element: trendExportRef.current?.querySelector(`[data-export-trend="${p}"]`), full: true });
            }
          } else {
            blocks.push({ element: captureRef.current?.querySelector(`[data-export-id="${chart.id}"]`), full: Boolean(chart.full) });
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
            {sourceMode === 'NOIM'
              ? 'Belum ada data NOIM untuk filter ini. Upload Data NOIM di halaman Upload, atau ganti Sumber Data.'
              : sourceMode === 'ALL'
                ? 'Tidak ada Site ID yang beririsan antara INAP dan NOIM untuk filter ini.'
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
      />
    ) : (
      <TrendChart
        dataSingle={dailyTrend}
        hasGranularFilter={trendHasGranularFilter}
        logHasOlderData={trendLogHasOlderData}
        fixedPeriod={fixedPeriod}
      />
    );
  const trendSource = isAllRegional ? dailyTrendByRegion : dailyTrend;
  const trendAvailable = sourceMode === 'INAP' && Array.isArray(trendSource) && trendSource.length > 0;
  const trendUnavailableReason =
    sourceMode !== 'INAP' ? 'Trend hanya tersedia untuk Sumber Data INAP.' : 'Belum ada data trend untuk filter ini.';

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
        {sourceMode !== 'INAP' && sourceStats && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span className="font-semibold">
              {sourceMode === 'NOIM' ? 'Menampilkan data NOIM' : 'Menampilkan irisan INAP & NOIM (data INAP yang Site ID-nya ada di NOIM)'}
            </span>
            <span className="ml-2 text-sky-800">
              Site Down unik — INAP: {sourceStats.inap.toLocaleString('id-ID')} · NOIM: {sourceStats.noim.toLocaleString('id-ID')} · Irisan: {sourceStats.both.toLocaleString('id-ID')}
              {sourceStats.bcTime ? ` · NOIM per ${new Date(sourceStats.bcTime).toLocaleString('id-ID')}` : ''}
            </span>
          </div>
        )}

        <div data-export-id="kpi">
          <KpiCards summary={summary} removedStats={removedStats} />
        </div>

        {sourceMode !== 'INAP' ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            Trend harian hanya tersedia untuk Sumber Data INAP (histori harian tidak menyimpan Site ID, dan NOIM hanya snapshot terakhir).
          </div>
        ) : (
          renderTrend()
        )}

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
