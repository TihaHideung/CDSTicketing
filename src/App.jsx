import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import TicketPreviewTable from './components/TicketPreviewTable.jsx';
import TicketDetailModal from './components/TicketDetailModal.jsx';
import PasswordGateModal from './components/PasswordGateModal.jsx';
import EasVswrPage from './features/eas-vswr/EasVswrPage.jsx';
import FilterBar, { ALL_KEY, UNSET_KEY } from './components/FilterBar.jsx';
import { readMergeFile, readSwfmCheckFile, readMasterSiteFile, readNoimFile, readBulkRcUpload, exportBulkRcTemplate } from './lib/excelIO.js';
import { cleanMergedRows, matchAgainstSwfm, dedupeSiteDownBySiteId, validateRegionalRows } from './lib/cleaning.js';
import { buildSwfmMaps } from './lib/swfmCheck.js';
import { computeSummary, buildFilteredDailyTrend, buildFilteredDailyTrendByRegion } from './lib/aggregate.js';
import { exportWorkbook } from './lib/exportExcel.js';
import { REGIONS, MASTER_COLUMNS, matchesRegionalTag, RC_CATEGORIES, RC_STRUCTURE, PIC_OPTIONS, getSubcategoriesFor, SOURCE_INAP, SOURCE_NOIM, SOURCE_BOTH, SOURCE_NOT_BOTH, DEFAULT_DURATION_FILTER, DEFAULT_SOURCE_FILTER } from './lib/constants.js';
import { noimToViewRows, buildNoimSiteSet, normalizeSiteId, computeSourceStats } from './lib/noim.js';
import { buildSourceTrendLog } from './lib/SiteDownTrend.js';
import {
  getActiveTickets,
  getArchiveHistory,
  getLatestInapUpload,
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
  replaceNoim,
  getNoim,
  getNoimDates,
  getSiteDownDailySets,
} from './lib/dbApi.js';

// Halaman "Upload Data" dikunci password. Status "sudah buka password" disimpan di
// sessionStorage (BUKAN localStorage) supaya: (1) tidak perlu masukin ulang selama tab
// browser ini belum ditutup, tapi (2) begitu tab/browser ditutup atau dibuka dari
// device/browser lain, sessionStorage-nya kosong lagi -> wajib masukin password lagi.
const UPLOAD_SESSION_KEY = 'cds_upload_unlocked';

function isUploadUnlockedInSession() {
  try {
    return sessionStorage.getItem(UPLOAD_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Kasih browser kesempatan MENGGAMBAR ULANG layar (mis. update teks progress) sebelum
 * lanjut ke pekerjaan berat yang sifatnya sinkron/blocking (parsing file besar). Tanpa
 * ini, `setProgressMessage(...)` yang dipanggil sesaat sebelum kerjaan berat bisa saja
 * tidak sempat kelihatan di layar sama sekali — browser jadi terkesan macet/hang padahal
 * sebenarnya lagi memproses.
 */
function yieldToPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

export default function App() {
  const [uploadUnlocked, setUploadUnlocked] = useState(isUploadUnlockedInSession);
  const [showUploadPasswordModal, setShowUploadPasswordModal] = useState(false);
  const [active, setActive] = useState(() => (isUploadUnlockedInSession() ? 'upload' : 'dashboard'));

  // Semua navigasi ANTAR HALAMAN (sidebar, tombol "Upload Data Sekarang" di Dashboard,
  // dll) harus lewat fungsi ini, bukan setActive langsung, supaya halaman Upload selalu
  // tercegat kalau belum unlock di sesi browser ini.
  const goToPage = useCallback(
    (page) => {
      if (page === 'upload' && !uploadUnlocked) {
        setShowUploadPasswordModal(true);
        return;
      }
      setActive(page);
    },
    [uploadUnlocked]
  );

  const handleUploadUnlockSuccess = useCallback(() => {
    try {
      sessionStorage.setItem(UPLOAD_SESSION_KEY, 'true');
    } catch {
      // sessionStorage tidak tersedia (mis. mode private ekstrem) -> tetap izinkan buka
      // untuk sesi render ini saja, cuma tidak akan "diingat" kalau di-refresh.
    }
    setUploadUnlocked(true);
    setShowUploadPasswordModal(false);
    setActive('upload');
  }, []);

  const [mergeFile, setMergeFile] = useState(null);
  const [swfmFile, setSwfmFile] = useState(null);
  const [masterFile, setMasterFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [lastInapUploadAt, setLastInapUploadAt] = useState(null);
  const [masterImporting, setMasterImporting] = useState(false);
  const [masterCount, setMasterCount] = useState(null);
  const [noimFile, setNoimFile] = useState(null);
  const [noimUploading, setNoimUploading] = useState(false);
  const [noimMessage, setNoimMessage] = useState('');
  const [noimError, setNoimError] = useState('');
  const [noimRows, setNoimRows] = useState([]);
  const [noimDate, setNoimDate] = useState(() => getUploadDateKey()); // tanggal data NOIM yang akan diupload
  const [noimDates, setNoimDates] = useState([]); // tanggal NOIM yang tersimpan: [{date,count}]
  const [siteDownDailySets, setSiteDownDailySets] = useState([]); // bahan trend NOIM/IRISAN/TIDAK IRISAN per tanggal

  const [allRows, setAllRows] = useState([]);
  const [regionalFilter, setRegionalFilter] = useState(ALL_KEY);
  const [nopFilter, setNopFilter] = useState(ALL_KEY);
  const [clusterFilter, setClusterFilter] = useState(ALL_KEY);
  const [categoryFilter, setCategoryFilter] = useState(ALL_KEY);
  const [sourceFilter, setSourceFilter] = useState(DEFAULT_SOURCE_FILTER); // INAP | NOIM | IRISAN | NON_IRISAN (hanya berlaku kalau Tipe = Site Down)
  const [durationFilter, setDurationFilter] = useState(() => [...DEFAULT_DURATION_FILTER]); // array: bisa pilih beberapa Duration sekaligus
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

  const refreshAll = useCallback(async ({ refreshUploadTimestamp = true } = {}) => {
    try {
      // Data NOIM dimuat terpisah & tidak boleh bikin seluruh refresh gagal kalau
      // endpoint-nya belum tersedia (mis. backend lama belum di-deploy ulang).
      const [tickets, log, count, dates, latestUpload] = await Promise.all([
        getActiveTickets(),
        getDailyTrendLog(),
        getSiteMasterCount(),
        getNoimDates().catch(() => []),
        refreshUploadTimestamp ? getLatestInapUpload().catch(() => null) : Promise.resolve(null),
      ]);
      const dateList = Array.isArray(dates) ? dates : [];
      // Dashboard selalu memakai data NOIM aktif terbaru (tanggal upload paling baru).
      const useDate = dateList[0]?.date || null;
      const noim = useDate ? await getNoim(useDate).catch(() => []) : [];
      setAllRows(tickets);
      setDailyTrendLog(log);
      setMasterCount(count.count);
      setNoimDates(dateList);
      setNoimRows(Array.isArray(noim) ? noim : []);
      if (refreshUploadTimestamp) setLastInapUploadAt(latestUpload?.lastUploadedAt || null);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || String(err));
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const sourceEnabled = categoryFilter === 'SiteDown';
  const effectiveSource = sourceEnabled ? sourceFilter : SOURCE_INAP;

  // Bahan trend untuk Sumber Data NOIM / IRISAN / TIDAK IRISAN. Hanya diambil kalau sumber
  // tersebut dipilih, dan diambil ulang setelah upload (daftar tanggal NOIM / data INAP berubah).
  useEffect(() => {
    if (!sourceEnabled || sourceFilter === SOURCE_INAP) return undefined;
    let cancelled = false;
    getSiteDownDailySets()
      .then((rows) => !cancelled && setSiteDownDailySets(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setSiteDownDailySets([]));
    return () => {
      cancelled = true;
    };
  }, [sourceEnabled, sourceFilter, noimDates, allRows]);

  // Filter "Sumber Data" cuma berlaku kalau Tipe = Site Down. Di luar itu selalu INAP.

  const noimSiteSet = useMemo(() => buildNoimSiteSet(noimRows), [noimRows]);
  const noimViewRows = useMemo(() => noimToViewRows(noimRows), [noimRows]);
  const sourceStats = useMemo(() => computeSourceStats(allRows, noimRows), [allRows, noimRows]);

  const regionRows = useMemo(() => {
    const inRegion = (rows) =>
      regionalFilter === ALL_KEY
        ? rows
        : rows.filter((r) => matchesRegionalTag(r.regional, regionalFilter) || matchesRegionalTag(r.regionalCode, regionalFilter));

    // NOIM: 1 baris = 1 Site ID, tidak perlu dedupe.
    if (effectiveSource === SOURCE_NOIM) return inRegion(noimViewRows);

    const deduped = dedupeSiteDownBySiteId(inRegion(allRows));
    // IRISAN: hanya Site Down yang Site ID-nya ada di INAP DAN NOIM (data yang tampil tetap data INAP).
    if (effectiveSource === SOURCE_BOTH) {
      return deduped.filter((r) => r.catAlarm === 'SiteDown' && noimSiteSet.has(normalizeSiteId(r.siteId)));
    }
    // TIDAK IRISAN: Site Down INAP yang tidak ada di NOIM + site NOIM yang tidak ada di INAP.
    if (effectiveSource === SOURCE_NOT_BOTH) {
      const inapOnly = deduped.filter((r) => r.catAlarm === 'SiteDown' && !noimSiteSet.has(normalizeSiteId(r.siteId)));
      const noimOnly = inRegion(noimViewRows).filter((r) => !sourceStats.inapSet.has(normalizeSiteId(r.siteId)));
      return [...inapOnly, ...noimOnly];
    }
    return deduped;
  }, [allRows, noimViewRows, noimSiteSet, sourceStats, effectiveSource, regionalFilter]);

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

  // Kriteria filter Dashboard, dinormalisasi (sentinel ALL_KEY/UNSET_KEY -> null/flag)
  // supaya Trend Harian ikut filter NOP/Cluster/Category/Duration/RC/RC Sub yang aktif,
  // bukan cuma filter Regional seperti sebelumnya.
  const trendCriteria = useMemo(
    () => ({
      regionalFilter: regionalFilter === ALL_KEY ? 'ALL' : regionalFilter,
      nop: nopFilter === ALL_KEY ? null : nopFilter,
      cluster: clusterFilter === ALL_KEY ? null : clusterFilter,
      category: categoryFilter === ALL_KEY ? null : categoryFilter,
      duration: durationFilter,
      rc: rcFilter !== ALL_KEY && rcFilter !== UNSET_KEY ? rcFilter : null,
      rcSub: rcFilter !== ALL_KEY && rcFilter !== UNSET_KEY && rcSubFilter !== ALL_KEY ? rcSubFilter : null,
      rcUnset: rcFilter === UNSET_KEY,
    }),
    [regionalFilter, nopFilter, clusterFilter, categoryFilter, durationFilter, rcFilter, rcSubFilter]
  );

  // Trend memakai komponen yang sama untuk semua Sumber Data; yang beda hanya log sumbernya:
  // INAP = daily_trend (snapshot harian), selain itu disusun dari NOIM/archive per tanggal.
  const sourceTrend = useMemo(
    () => (effectiveSource === SOURCE_INAP ? null : buildSourceTrendLog(siteDownDailySets, effectiveSource)),
    [siteDownDailySets, effectiveSource]
  );
  const activeTrendLog = sourceTrend ? sourceTrend.log : dailyTrendLog;
  const trendSkippedDates = sourceTrend ? sourceTrend.skippedDates : [];
  const dailyTrend = useMemo(
    () => buildFilteredDailyTrend(activeTrendLog, trendCriteria),
    [activeTrendLog, trendCriteria]
  );
  const dailyTrendByRegion = useMemo(
    () => buildFilteredDailyTrendByRegion(activeTrendLog, REGIONS, trendCriteria),
    [activeTrendLog, trendCriteria]
  );
  const trendHasGranularFilter =
    Boolean(trendCriteria.nop || trendCriteria.cluster || trendCriteria.category) ||
    trendCriteria.duration.length > 0 ||
    Boolean(trendCriteria.rc || trendCriteria.rcSub || trendCriteria.rcUnset);
  const trendLogHasOlderData = activeTrendLog.length > 0;

  const handleRegionalChange = useCallback((val) => {
    setRegionalFilter(val);
    setNopFilter(ALL_KEY);
    setClusterFilter(ALL_KEY);
  }, []);

  const handleCategoryChange = useCallback((val) => {
    setCategoryFilter(val);
    // Filter Sumber Data tertutup lagi kalau Tipe bukan Site Down -> kembalikan ke INAP.
    if (val !== 'SiteDown') setSourceFilter(DEFAULT_SOURCE_FILTER);
  }, []);

  // Kembalikan SEMUA filter (Dashboard & Detail Ticket) ke nilai default.
  const handleResetFilters = useCallback(() => {
    setRegionalFilter(ALL_KEY);
    setNopFilter(ALL_KEY);
    setClusterFilter(ALL_KEY);
    setCategoryFilter(ALL_KEY);
    setSourceFilter(DEFAULT_SOURCE_FILTER);
    setDurationFilter([...DEFAULT_DURATION_FILTER]);
    setRcFilter(ALL_KEY);
    setRcSubFilter(ALL_KEY);
    setDateFrom('');
    setDateTo('');
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

  const handleUploadNoim = useCallback(async () => {
    if (!noimFile) return;
    if (!noimDate) {
      setNoimError('Pilih dulu tanggal data NOIM ini.');
      return;
    }
    setNoimUploading(true);
    setNoimError('');
    setNoimMessage('');
    try {
      const { rows, skippedNoSiteId, duplicates, skippedOtherRegional } = await readNoimFile(noimFile);
      if (!rows.length) {
        throw new Error('Tidak ada baris Regional 1 dengan Site ID di file NOIM ini, tidak ada yang disimpan.');
      }
      const result = await replaceNoim(rows, noimDate);
      // Setelah upload, dashboard menampilkan tanggal yang baru diupload.
      await refreshAll({ refreshUploadTimestamp: false });
      setNoimFile(null);
      const notes = [];
      if (skippedNoSiteId) notes.push(`${skippedNoSiteId} baris tanpa Site ID dilewati`);
      if (skippedOtherRegional) notes.push(`${skippedOtherRegional.toLocaleString('id-ID')} baris regional selain Regional 1 dibuang`);
      if (duplicates) notes.push(`${duplicates} Site ID dobel digabung`);
      if (result.replaced) notes.push(`menggantikan ${result.replaced.toLocaleString('id-ID')} site yang sebelumnya tersimpan di tanggal ini`);
      setNoimMessage(
        `Data NOIM tanggal ${noimDate} tersimpan: ${result.imported.toLocaleString('id-ID')} site.${notes.length ? ` (${notes.join(', ')})` : ''}`
      );
    } catch (err) {
      setNoimError(err.message || String(err));
    } finally {
      setNoimUploading(false);
    }
  }, [noimFile, noimDate, refreshAll]);

  const handleProcess = useCallback(async () => {
    setError('');
    setProcessing(true);
    setProgressMessage('Membaca file Merge...');
    await yieldToPaint();
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
      await yieldToPaint();
      const { cleaned, removed } = cleanMergedRows(mergeRaw, null, now, siteMasterMap);
      if (!cleaned.length) {
        throw new Error('Setelah validasi regional, tidak ada ticket yang bisa diproses dari file ini.');
      }

      let swfmResult = { handledMap: {}, infoMap: {}, totalRows: 0 };
      if (swfmFile) {
        setProgressMessage('Membaca & memproses file SWFM Check... (file besar bisa makan waktu 30-60 detik, tunggu ya, jangan ditutup tab-nya)');
        await yieldToPaint();
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

      setLastInapUploadAt(new Date());
      await refreshAll({ refreshUploadTimestamp: false });
      setRegionalFilter(ALL_KEY);
      setNopFilter(ALL_KEY);
      setClusterFilter(ALL_KEY);
      setCategoryFilter(ALL_KEY);
      setSourceFilter(DEFAULT_SOURCE_FILTER);
      setDurationFilter([...DEFAULT_DURATION_FILTER]);
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
      setActive('dashboard');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setProcessing(false);
      setProgressMessage('');
    }
  }, [mergeFile, swfmFile, refreshAll]);

  const handleExport = useCallback(async ({ uploadDateFrom, uploadDateTo }) => {
    if (effectiveSource === SOURCE_NOIM) {
      throw new Error('Riwayat tanggal upload hanya tersedia untuk data INAP di archive.');
    }
    const archiveRows = await getArchiveHistory(uploadDateFrom, uploadDateTo);
    let rows = archiveRows.map((r) => ({
      _key: r.ticket_key,
      ticketId: r.ticket_id,
      catAlarm: r.cat_alarm,
      subType: r.sub_type,
      siteId: r.site_id,
      siteName: r.site_name,
      nop: r.nop,
      cluster: r.cluster,
      regional: r.regional,
      regionalCode: r.regional_code,
      siteClass: r.site_class,
      siteType: r.site_type,
      alarmName: r.alarm_name,
      alarmGroup: r.alarm_group,
      emsName: r.ems_name,
      clearanceStatus: r.clearance_status,
      rc: r.rc || '',
      rcSub: r.rc_sub || '',
      pic: r.pic || '',
      detail: r.detail || '',
      actionPlan: r.action_plan || '',
      lastOccurredOn: r.last_occurred_on,
      ageHours: r.age_hours ?? 0,
      duration: r.duration_bucket,
      uploadDate: String(r.upload_date).slice(0, 10),
    }));

    if (regionalFilter !== ALL_KEY) {
      rows = rows.filter((r) => matchesRegionalTag(r.regional, regionalFilter) || matchesRegionalTag(r.regionalCode, regionalFilter));
    }
    if (effectiveSource === SOURCE_BOTH) {
      rows = rows.filter((r) => r.catAlarm === 'SiteDown' && noimSiteSet.has(normalizeSiteId(r.siteId)));
    }
    // TIDAK IRISAN: riwayat archive hanya berisi data INAP, jadi yang diexport sisi INAP-nya
    // saja (Site Down yang Site ID-nya tidak ada di NOIM).
    if (effectiveSource === SOURCE_NOT_BOTH) {
      rows = rows.filter((r) => r.catAlarm === 'SiteDown' && !noimSiteSet.has(normalizeSiteId(r.siteId)));
    }
    if (nopFilter !== ALL_KEY) rows = rows.filter((r) => r.nop === nopFilter);
    if (clusterFilter !== ALL_KEY) rows = rows.filter((r) => r.cluster === clusterFilter);
    if (categoryFilter !== ALL_KEY) rows = rows.filter((r) => r.catAlarm === categoryFilter);
    if (durationFilter.length > 0) rows = rows.filter((r) => durationFilter.includes(r.duration));
    if (rcFilter === UNSET_KEY) rows = rows.filter((r) => !r.rc);
    else if (rcFilter !== ALL_KEY) {
      rows = rows.filter((r) => r.rc === rcFilter);
      if (rcSubFilter !== ALL_KEY) rows = rows.filter((r) => r.rcSub === rcSubFilter);
    }
    if (dateFrom) rows = rows.filter((r) => {
      const occurredDate = toDateKey(r.lastOccurredOn);
      return occurredDate && occurredDate >= dateFrom;
    });
    if (dateTo) rows = rows.filter((r) => {
      const occurredDate = toDateKey(r.lastOccurredOn);
      return occurredDate && occurredDate <= dateTo;
    });
    if (!rows.length) throw new Error('Tidak ada data archive yang sesuai dengan rentang tanggal dan filter aktif.');

    const summary = computeSummary(rows);
    const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
    exportWorkbook({
      cleanRows: rows,
      summary,
      fileName: `CDS_Monitoring_${label}_${uploadDateFrom}_sd_${uploadDateTo}.xlsx`,
    });
  }, [effectiveSource, regionalFilter, getArchiveHistory, noimSiteSet, nopFilter, clusterFilter, categoryFilter, durationFilter, rcFilter, rcSubFilter, dateFrom, dateTo]);

  const handleDownloadBulkRcTemplate = useCallback(() => {
    // Baris NOIM read-only (bukan ticket INAP), jadi tidak ikut template bulk RC.
    const editableRows = viewRows.filter((r) => r._source !== 'NOIM');
    if (!editableRows.length) {
      setBulkError('Tidak ada ticket INAP di filter aktif untuk dibuatkan template Excel.');
      return;
    }
    const label = regionalFilter === ALL_KEY ? 'SemuaRegional' : regionalFilter;
    exportBulkRcTemplate(editableRows, `RC_Bulk_Template_${label}.xlsx`);
    setBulkError('');
    setBulkMessage(`Template bulk RC berhasil dibuat untuk ${editableRows.length} ticket.`);
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
          if (row._source === 'NOIM') continue;
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
    onCategoryChange: handleCategoryChange,
    sourceFilter,
    onSourceChange: setSourceFilter,
    sourceEnabled,
    onReset: handleResetFilters,
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
          noimFile={noimFile}
          onNoimFileChange={setNoimFile}
          onUploadNoim={handleUploadNoim}
          noimUploading={noimUploading}
          noimCount={noimSiteSet.size}
          noimDate={noimDate}
          onNoimDateChange={setNoimDate}
          noimDates={noimDates}
          noimBcTime={sourceStats.bcTime}
          noimMessage={noimMessage}
          noimError={noimError}
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
          trendHasGranularFilter={trendHasGranularFilter}
          trendLogHasOlderData={trendLogHasOlderData}
          regionalFilter={regionalFilter}
          viewRows={viewRows}
          sourceMode={effectiveSource}
          trendSkippedDates={trendSkippedDates}
          filters={filterProps}
          onGoToUpload={() => goToPage('upload')}
          onRowClick={(r) => r._source !== 'NOIM' && setSelectedTicketKey(r._key)}
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
    if (active === 'eas-vswr') {
      return <EasVswrPage />;
    }
    return null;
  }, [
    active, mergeFile, swfmFile, masterFile, processing, progressMessage, error,
    masterImporting, masterCount, noimFile, noimUploading, noimMessage, noimError, noimSiteSet, noimDate, noimDates, trendSkippedDates, sourceStats, sourceFilter, effectiveSource, summary, removedStats, dailyTrend, dailyTrendByRegion,
    trendHasGranularFilter, trendLogHasOlderData, regionalFilter,
    nopFilter, clusterFilter, categoryFilter, durationFilter, rcFilter, rcSubFilter, dateFrom, dateTo, nopOptions, clusterOptions, viewRows,
    handleProcess, handleExport, handleImportMaster, handleUploadNoim, handleCategoryChange, handleDownloadBulkRcTemplate, handleBulkRcUpload,
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar active={active} onNavigate={goToPage} />
      <div className="flex-1 flex flex-col">
        <Topbar active={active} lastInapUploadAt={lastInapUploadAt} />
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
      {showUploadPasswordModal && (
        <PasswordGateModal
          onSuccess={handleUploadUnlockSuccess}
          onClose={() => setShowUploadPasswordModal(false)}
        />
      )}
    </div>
  );
}
