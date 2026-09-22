import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import TicketPreviewTable from './components/TicketPreviewTable.jsx';
import TicketDetailModal from './components/TicketDetailModal.jsx';
import FilterBar, { ALL_KEY, UNSET_KEY } from './components/FilterBar.jsx';
import { readMergeFile, readSwfmCheckFile, readMasterSiteFile, readBulkRcUpload, exportBulkRcTemplate } from './lib/excelIO.js';
import { cleanMergedRows, matchAgainstSwfm, dedupeSiteDownBySiteId, validateRegionalRows } from './lib/cleaning.js';
import { buildSwfmMaps } from './lib/swfmCheck.js';
import { computeSummary, buildDailyTrend, buildDailyTrendByRegion, groupBySiteId } from './lib/aggregate.js';
import { exportWorkbook } from './lib/exportExcel.js';
import { REGIONS, MASTER_COLUMNS, matchesRegionalTag, RC_CATEGORIES, RC_STRUCTURE, PIC_OPTIONS, getSubcategoriesFor } from './lib/constants.js';
import {
  getActiveTickets,
  upsertActiveTickets,
  updateTicketFields,
  mergeSwfm,
  getSwfmHandledMap,
  getSwfmInfoMap,
  getDailyTrendLog,
  upsertDailyTrendEntry,
  importSiteMaster,
  lookupSiteMaster,
  getSiteMasterCount,
} from './lib/dbApi.js';

export default function App() {
  const [active, setActive] = useState('upload');

  const [mergeFile, setMergeFile] = useState(null);
  const [swfmFile, setSwfmFile] = useState(null);
  const [masterFile, setMasterFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [lastProcessedAt, setLastProcessedAt] = useState('');
  const [masterImporting, setMasterImporting] = useState(false);
  const [masterCount, setMasterCount] = useState(null);

  const [allRows, setAllRows] = useState([]);
  const [regionalFilter, setRegionalFilter] = useState(ALL_KEY);
  const [nopFilter, setNopFilter] = useState(ALL_KEY);
  const [clusterFilter, setClusterFilter] = useState(ALL_KEY);
  const [categoryFilter, setCategoryFilter] = useState(ALL_KEY);
  const [durationFilter, setDurationFilter] = useState([]); // array: bisa pilih beberapa Duration sekaligus
  const [rcFilter, setRcFilter] = useState(ALL_KEY);
  const [rcSubFilter, setRcSubFilter] = useState(ALL_KEY);
  const [dailyTrendLog, setDailyTrendLog] = useState([]);
  const [removedStats, setRemovedStats] = useState(null);
  const [selectedTicketKey, setSelectedTicketKey] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');
  const bulkInputRef = useRef(null);

  const refreshAll = useCallback(async () => {
    try {
      const [tickets, log, count] = await Promise.all([getActiveTickets(), getDailyTrendLog(), getSiteMasterCount()]);
      setAllRows(tickets);
      setDailyTrendLog(log);
      setMasterCount(count.count);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || String(err));
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const regionRows = useMemo(() => {
    const rows =
      regionalFilter === ALL_KEY
        ? allRows
        : allRows.filter((r) => matchesRegionalTag(r.regional, regionalFilter) || matchesRegionalTag(r.regionalCode, regionalFilter));
    return dedupeSiteDownBySiteId(rows);
  }, [allRows, regionalFilter]);

  const nopOptions = useMemo(() => Array.from(new Set(regionRows.map((r) => r.nop).filter(Boolean))).sort(), [regionRows]);
  const clusterOptions = useMemo(() => {
    const rows = nopFilter === ALL_KEY ? regionRows : regionRows.filter((r) => r.nop === nopFilter);
    return Array.from(new Set(rows.map((r) => r.cluster).filter(Boolean))).sort();
  }, [regionRows, nopFilter]);

  const viewRows = useMemo(() => {
    let rows = regionRows;
    if (nopFilter !== ALL_KEY) rows = rows.filter((r) => r.nop === nopFilter);
    if (clusterFilter !== ALL_KEY) rows = rows.filter((r) => r.cluster === clusterFilter);
    if (categoryFilter !== ALL_KEY) rows = rows.filter((r) => r.catAlarm === categoryFilter);
    if (durationFilter.length > 0) rows = rows.filter((r) => durationFilter.includes(r.duration));
    if (rcFilter === UNSET_KEY) rows = rows.filter((r) => !r.rc);
    else if (rcFilter !== ALL_KEY) {
      rows = rows.filter((r) => r.rc === rcFilter);
      if (rcSubFilter !== ALL_KEY) rows = rows.filter((r) => r.rcSub === rcSubFilter);
    }
    if (dateFrom) {
      rows = rows.filter((r) => {
        const v = toDateKey(r.lastOccurredOn);
        return v && v >= dateFrom;
      });
    }
    if (dateTo) {
      rows = rows.filter((r) => {
        const v = toDateKey(r.lastOccurredOn);
        return v && v <= dateTo;
      });
    }
    return rows;
  }, [regionRows, nopFilter, clusterFilter, categoryFilter, durationFilter, rcFilter, rcSubFilter, dateFrom, dateTo]);

  const summary = useMemo(() => (viewRows.length ? computeSummary(viewRows) : null), [viewRows]);
  const groupedBySite = useMemo(() => groupBySiteId(viewRows), [viewRows]);
  const dailyTrend = useMemo(
    () => buildDailyTrend(dailyTrendLog, regionalFilter === ALL_KEY ? 'ALL' : regionalFilter),
    [dailyTrendLog, regionalFilter]
  );
  const dailyTrendByRegion = useMemo(() => buildDailyTrendByRegion(dailyTrendLog, REGIONS), [dailyTrendLog]);

  const handleRegionalChange = useCallback((val) => {
    setRegionalFilter(val);
    setNopFilter(ALL_KEY);
    setClusterFilter(ALL_KEY);
  }, []);

  const handleNopChange = useCallback((val) => {
    setNopFilter(val);
    setClusterFilter(ALL_KEY);
  }, []);

  const handleRcChange = useCallback((val) => {
    setRcFilter(val);
    setRcSubFilter(ALL_KEY);
  }, []);

  const selectedTicket = useMemo(() => (selectedTicketKey ? allRows.find((r) => r._key === selectedTicketKey) : null), [selectedTicketKey, allRows]);

  const handleSaveTicket = useCallback(
    async (fields) => {
      if (!selectedTicketKey) return;
      await updateTicketFields(selectedTicketKey, fields);
      await refreshAll();
    },
    [selectedTicketKey, refreshAll]
  );

  const handleImportMaster = useCallback(async () => {
    if (!masterFile) return;
    setMasterImporting(true);
    setError('');
    try {
      const raw = await readMasterSiteFile(masterFile);
      const rows = raw
        .map((r) => ({
          siteId: String(r[MASTER_COLUMNS.SITE_ID] || '').trim(),
          siteName: r[MASTER_COLUMNS.SITE_NAME] || '',
          nop: r[MASTER_COLUMNS.NOP] || '',
          regional: r[MASTER_COLUMNS.REGIONAL] || '',
          cluster: r[MASTER_COLUMNS.CLUSTER] || '',
          siteClass: r[MASTER_COLUMNS.SITE_CLASS] || '',
        }))
        .filter((r) => r.siteId);
      const result = await importSiteMaster(rows);
      setMasterCount((prev) => (prev == null ? result.imported : prev));
      await refreshAll();
      setMasterFile(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setMasterImporting(false);
    }
  }, [masterFile, refreshAll]);

  function toDateKey(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getUploadDateKey() {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(now);
      const map = {};
      for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
      }
      return `${map.year}-${map.month}-${map.day}`;
    } catch {
      return toDateKey(new Date());
    }
  }

  const handleProcess = useCallback(async () => {
    setError('');
    setProcessing(true);
    setProgressMessage('Membaca file Merge...');
    try {
      const now = new Date();

      const mergeRaw = await readMergeFile(mergeFile);

      setProgressMessage('Mencari data Cluster & Site Name dari Master Site...');
      const uniqueSiteIds = Array.from(new Set(mergeRaw.map((r) => String(r['Site ID'] || '').trim()).filter(Boolean)));
      let siteMasterMap = new Map();
      if (uniqueSiteIds.length) {
        const lookup = await lookupSiteMaster(uniqueSiteIds);
        siteMasterMap = new Map(Object.entries(lookup));
      }

      const validation = validateRegionalRows(mergeRaw);
      if (validation.matchingRows === 0) {
        throw new Error(
          'File Merge ini tidak berisi data regional yang valid. Kolom Regional harus berisi salah satu dari: Regional 1 / 2 / 10 (atau nama regional yang sesuai).'
        );
      }

      setProgressMessage('Membersihkan data (Ticket ID, cleared, EMS USO_)...');
      const { cleaned, removed } = cleanMergedRows(mergeRaw, null, now, siteMasterMap);
      if (!cleaned.length) {
        throw new Error('Setelah validasi regional, tidak ada ticket yang bisa diproses dari file ini.');
      }

      let swfmResult = { handledMap: {}, infoMap: {}, totalRows: 0 };
      if (swfmFile) {
        setProgressMessage('Membaca & memproses file SWFM Check...');
        const swfmRaw = await readSwfmCheckFile(swfmFile);
        swfmResult = buildSwfmMaps(swfmRaw);

        setProgressMessage('Menggabungkan hasil SWFM ke database (+ auto-purge ticket selesai)...');
        await mergeSwfm(swfmResult.handledMap, swfmResult.infoMap);
      } else {
        setProgressMessage('Tidak ada SWFM baru; memakai data validasi yang sudah tersimpan di database.');
      }

      const cumulativeHandled = await getSwfmHandledMap();
      const cumulativeInfo = await getSwfmInfoMap();

      setProgressMessage('Mencocokkan Ticket ID dengan SWFM (kumulatif)...');
      const { stillActive, removedHandled } = matchAgainstSwfm(cleaned, cumulativeHandled, cumulativeInfo);

      setProgressMessage('Menyimpan snapshot upload terbaru ke archive dan trend harian...');
      const uploadDateKey = getUploadDateKey();
      await upsertActiveTickets(
        stillActive.map((r) => ({
          ...r,
          uploadDate: uploadDateKey,
        })),
        uploadDateKey
      );

      await refreshAll();
      setRegionalFilter(ALL_KEY);
      setNopFilter(ALL_KEY);
      setClusterFilter(ALL_KEY);
      setCategoryFilter(ALL_KEY);
      setDurationFilter([]);
      setRcFilter(ALL_KEY);
      setRcSubFilter(ALL_KEY);
      setMergeFile(null);
      setSwfmFile(null);
      setRemovedStats({
        emptyTicketId: removed.emptyTicketId,
        cleared: removed.cleared,
        usoEms: removed.usoEms,
        matchedHandled: removedHandled,
        swfmRowsScanned: swfmResult?.totalRows || 0,
      });
      setLastProcessedAt(now.toLocaleString('id-ID'));
      setActive('dashboard');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setProcessing(false);
      setProgressMessage('');
    }
  }, [mergeFile, swfmFile, refreshAll]);

  const handleExport = useCallback(() => {
    if (!summary || !viewRows.length) return;
    const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
    exportWorkbook({ cleanRows: viewRows, summary, groupedBySite, dailyTrend, fileName: `CDS_Monitoring_${label}.xlsx` });
  }, [summary, viewRows, groupedBySite, dailyTrend, regionalFilter]);

  const handleDownloadBulkRcTemplate = useCallback(() => {
    if (!viewRows.length) {
      setBulkError('Tidak ada ticket di filter aktif untuk dibuatkan template Excel.');
      return;
    }
    const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
    exportBulkRcTemplate(viewRows, `RC_Bulk_Template_${label}.xlsx`);
    setBulkError('');
    setBulkMessage(`Template bulk RC berhasil dibuat untuk ${viewRows.length} ticket.`);
  }, [regionalFilter, viewRows]);

  const handleBulkRcUpload = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setBulkError('');
      setBulkMessage('');

      try {
        const rows = await readBulkRcUpload(file);
        const validRc = new Set(RC_CATEGORIES);
        const validSub = new Set(Object.values(RC_STRUCTURE).flat());
        const validPic = new Set(PIC_OPTIONS);
        const ticketMap = new Map();
        for (const row of viewRows) {
          const key = String(row.ticketId ?? '').trim();
          if (!key) continue;
          if (!ticketMap.has(key)) ticketMap.set(key, []);
          ticketMap.get(key).push(row);
        }

        let updated = 0;
        const errors = [];

        for (const row of rows) {
          const ticketId = String(row.ticketId ?? '').trim();
          if (!ticketId) {
            errors.push('Baris Excel tidak punya Ticket ID, dilewati.');
            continue;
          }

          const matches = ticketMap.get(ticketId) || [];
          if (!matches.length) {
            errors.push(`Ticket ID ${ticketId} tidak ditemukan di filter aktif, dilewati.`);
            continue;
          }

          const payload = {};
          if (row.rc !== undefined && String(row.rc).trim() !== '') {
            const val = String(row.rc).trim();
            if (!validRc.has(val)) {
              errors.push(`Ticket ID ${ticketId}: RC Category "${val}" tidak valid.`);
              continue;
            }
            payload.rc = val;
          }

          if (row.rcSub !== undefined && String(row.rcSub).trim() !== '') {
            const val = String(row.rcSub).trim();
            if (!validSub.has(val)) {
              errors.push(`Ticket ID ${ticketId}: RC Subcategory "${val}" tidak valid.`);
              continue;
            }
            const chosenRc = payload.rc || matches[0].rc;
            if (chosenRc && !getSubcategoriesFor(chosenRc).includes(val)) {
              errors.push(`Ticket ID ${ticketId}: RC Subcategory "${val}" tidak sesuai untuk RC Category "${chosenRc}".`);
              continue;
            }
            payload.rcSub = val;
          }

          if (row.pic !== undefined && String(row.pic).trim() !== '') {
            const val = String(row.pic).trim();
            if (!validPic.has(val)) {
              errors.push(`Ticket ID ${ticketId}: PIC "${val}" tidak valid.`);
              continue;
            }
            payload.pic = val;
          }

          if (row.detail !== undefined && String(row.detail).trim() !== '') {
            payload.detail = String(row.detail).trim();
          }
          if (row.actionPlan !== undefined && String(row.actionPlan).trim() !== '') {
            payload.actionPlan = String(row.actionPlan).trim();
          }

          if (Object.keys(payload).length === 0) {
            continue;
          }

          for (const match of matches) {
            await updateTicketFields(match._key, payload);
            updated += 1;
          }
        }

        await refreshAll();
        if (errors.length) {
          setBulkError(errors.slice(0, 10).join(' | '));
        }
        setBulkMessage(
          updated
            ? `Upload selesai: ${updated} data RC berhasil diproses. ${errors.length ? `Beberapa row ditolak: ${errors.length}.` : ''}`
            : 'Tidak ada data valid untuk diupdate.'
        );
      } catch (err) {
        setBulkError(err.message || String(err));
      } finally {
        event.target.value = '';
      }
    },
    [refreshAll, viewRows]
  );

  const filterProps = {
    regionalFilter,
    onRegionalChange: handleRegionalChange,
    nopFilter,
    onNopChange: handleNopChange,
    nopOptions,
    clusterFilter,
    onClusterChange: setClusterFilter,
    clusterOptions,
    categoryFilter,
    onCategoryChange: setCategoryFilter,
    durationFilter,
    onDurationChange: setDurationFilter,
    rcFilter,
    onRcChange: handleRcChange,
    rcSubFilter,
    onRcSubChange: setRcSubFilter,
    dateFrom,
    onDateFromChange: setDateFrom,
    dateTo,
    onDateToChange: setDateTo,
  };

  const pageContent = useMemo(() => {
    if (active === 'upload') {
      return (
        <UploadPanel
          mergeFile={mergeFile}
          swfmFile={swfmFile}
          onMergeFileChange={setMergeFile}
          onSwfmFileChange={setSwfmFile}
          onProcess={handleProcess}
          processing={processing}
          progressMessage={progressMessage}
          error={error}
          masterFile={masterFile}
          onMasterFileChange={setMasterFile}
          onImportMaster={handleImportMaster}
          masterImporting={masterImporting}
          masterCount={masterCount}
        />
      );
    }
    if (active === 'dashboard') {
      return (
        <Dashboard
          summary={summary}
          removedStats={removedStats}
          dailyTrend={dailyTrend}
          dailyTrendByRegion={dailyTrendByRegion}
          regionalFilter={regionalFilter}
          viewRows={viewRows}
          filters={filterProps}
          onGoToUpload={() => setActive('upload')}
          onRowClick={(r) => setSelectedTicketKey(r._key)}
          onExportExcel={handleExport}
        />
      );
    }
    if (active === 'tickets') {
      return (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
              <FilterBar {...filterProps} />
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <button
                onClick={handleDownloadBulkRcTemplate}
                disabled={!viewRows.length}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download Excel Template
              </button>
              <button
                onClick={() => bulkInputRef.current?.click()}
                disabled={!viewRows.length}
                className="rounded-lg bg-brand-red px-3 py-2 text-[11px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload Bulk RC
              </button>
              <input
                ref={bulkInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleBulkRcUpload}
                className="hidden"
              />
            </div>
          </div>
          {bulkError && <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{bulkError}</div>}
          {bulkMessage && <div className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{bulkMessage}</div>}
          {viewRows.length ? (
            <TicketPreviewTable rows={viewRows} onRowClick={(r) => setSelectedTicketKey(r._key)} />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
              Belum ada data untuk filter ini. Silakan upload &amp; proses data terlebih dahulu.
            </div>
          )}
        </div>
      );
    }
    return null;
  }, [
    active, mergeFile, swfmFile, masterFile, processing, progressMessage, error,
    masterImporting, masterCount, summary, removedStats, dailyTrend, dailyTrendByRegion, regionalFilter,
    nopFilter, clusterFilter, categoryFilter, durationFilter, rcFilter, rcSubFilter, nopOptions, clusterOptions, viewRows,
    handleProcess, handleExport, handleImportMaster, handleDownloadBulkRcTemplate, handleBulkRcUpload,
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="flex-1 flex flex-col">
        <Topbar active={active} lastProcessedAt={lastProcessedAt} />
        {loadError && (
          <div className="mx-8 mt-4 text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-4 py-3">
            Gagal terhubung ke server backend: {loadError}. Pastikan backend jalan (lihat server/README.md).
          </div>
        )}
        <main className="flex-1 p-8 bg-slate-50">{pageContent}</main>
      </div>
      {selectedTicket && (
        <TicketDetailModal ticket={selectedTicket} onClose={() => setSelectedTicketKey(null)} onSave={handleSaveTicket} />
      )}
    </div>
  );
}
