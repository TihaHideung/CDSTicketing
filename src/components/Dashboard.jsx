import React, { useRef, useState } from 'react';
import KpiCards from './KpiCards.jsx';
import FilterBar from './FilterBar.jsx';
import TicketPreviewTable from './TicketPreviewTable.jsx';
import CellVsSiteDonut from './charts/CellVsSiteDonut.jsx';
import AreaContributorBar from './charts/AreaContributorBar.jsx';
import RcCategoryBar from './charts/RcCategoryBar.jsx';
import TrendChart from './charts/TrendChart.jsx';
import { REGIONS } from '../lib/constants.js';
import { ALL_KEY } from './FilterBar.jsx';
import { exportChartsAsPdf } from '../lib/exportCharts.js';

export default function Dashboard({
  summary,
  removedStats,
  dailyTrend,
  dailyTrendByRegion,
  regionalFilter,
  viewRows,
  filters,
  onGoToUpload,
  onRowClick,
  onExportExcel,
}) {
  const captureRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
      onExportExcel();
      await exportChartsAsPdf(captureRef.current, `CDS_Monitoring_Charts_${label}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  if (!summary) {
    return (
      <div className="space-y-4">
        <FilterBar {...filters} showDateFilter={false} />
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-slate-500 mb-4">Belum ada data untuk filter ini.</p>
          <button onClick={onGoToUpload} className="px-4 py-2 rounded-md bg-brand-red text-white font-medium">
            Upload Data Sekarang
          </button>
        </div>
      </div>
    );
  }

  const isAllRegional = regionalFilter === ALL_KEY;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar {...filters} showDateFilter={false} />
        <button
          onClick={handleExportAll}
          disabled={exporting}
          className="px-4 py-2 rounded-md bg-brand-red text-white text-sm font-medium disabled:opacity-50 shrink-0"
        >
          {exporting ? 'Mengekspor...' : 'Export (Excel + Grafik PDF)'}
        </button>
      </div>

      <div ref={captureRef} className="space-y-6 bg-slate-50 p-1">
        <KpiCards summary={summary} removedStats={removedStats} />

        {isAllRegional ? (
          <TrendChart dataByRegion={dailyTrendByRegion} regions={REGIONS} />
        ) : (
          <TrendChart dataSingle={dailyTrend} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CellVsSiteDonut summary={summary} />
          <AreaContributorBar summary={summary} />
          <RcCategoryBar
            title="RC Category — Cell Down"
            data={summary.rcCategoryCellDownByDuration}
            underReviewCount={summary.rcCategoryCellDownUnderReview}
            categoryKey="rcCategory"
            label="RC Category"
            emptyText="RC Category"
          />
          <RcCategoryBar
            title="RC Category — Site Down"
            data={summary.rcCategorySiteDownByDuration}
            underReviewCount={summary.rcCategorySiteDownUnderReview}
            categoryKey="rcCategory"
            label="RC Category"
            emptyText="RC Category"
          />
          <RcCategoryBar
            title="RC Subcategory — Cell Down"
            data={summary.rcSubcategoryCellDownByDuration}
            underReviewCount={summary.rcSubcategoryCellDownUnderReview}
            categoryKey="rcSubcategory"
            label="RC Subcategory"
            emptyText="RC Subcategory"
          />
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

      <div>
        <h3 className="font-semibold text-slate-800 mb-2">Preview Ticket Active</h3>
        <TicketPreviewTable rows={viewRows} onRowClick={onRowClick} compact pageSize={10} />
      </div>
    </div>
  );
}
