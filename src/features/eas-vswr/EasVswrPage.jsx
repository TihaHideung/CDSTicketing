import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { parseEasDetail } from './lib/parseEasDetail.js'
import { parseManualValidation } from './lib/parseManualValidation.js'
import { buildEasReport, computeAch, revisiDateOf } from './lib/easReport.js'
import { parseVSWR } from './lib/parseVSWR.js'
import { computeMetrics } from './lib/metrics.js'
import { buildSummaryText, hasVswrData } from './lib/buildSummary.js'
import {
  loadHistory,
  saveRecord,
  upsertInList,
  migrateLegacyLocalHistory,
  getRecord,
  getPreviousRecord,
  getPreviousEasRecord,
} from './lib/history.js'
import { compareRecords } from './lib/compare.js'
import { exportDailyReport } from './lib/exportExcel.js'
import { todayISO, isoToIdLabel, isoToShortLabel } from './lib/format.js'

import Header from './components/Header.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import SummaryPanel from './components/SummaryPanel.jsx'
import ProgressTable from './components/ProgressTable.jsx'
import AnalyticsPanel from './components/AnalyticsPanel.jsx'
import './eas-vswr.css'

const AREA_LABEL = 'Area 1'

export default function EasVswrPage() {
  const [easFile, setEasFile] = useState(null)
  const [vswrFile, setVswrFile] = useState(null)
  const [detailFile, setDetailFile] = useState(null)
  const [dateISO, setDateISO] = useState(todayISO())
  // Date Revisi untuk Ach Validasi EAS selalu otomatis = tanggal upload - 1 hari (H-1).
  const revisiDateISO = revisiDateOf(dateISO)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [history, setHistory] = useState([])
  const [selectedDateISO, setSelectedDateISO] = useState(null)

  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  // Riwayat dimuat dari database (bukan localStorage), jadi tanggal yang pernah
  // di-generate selalu muncul lagi saat dipilih di kalender, dari perangkat mana pun.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let list = await loadHistory()
        try {
          list = await migrateLegacyLocalHistory(list)
        } catch (err) {
          console.warn('Gagal memindahkan riwayat lama dari browser ke database:', err)
        }
        if (cancelled) return
        setHistory(list)
        if (list.length) setSelectedDateISO(list[list.length - 1].dateISO)
        setHistoryError('')
      } catch (err) {
        console.error(err)
        if (!cancelled) setHistoryError(err.message || 'Gagal memuat riwayat dari server.')
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // File EAS + Upload Data Streamlit (satu paket) dan File VSWR boleh diupload terpisah.
  // Upload di tanggal yang sama MENGGANTI bagiannya saja (EAS mengganti EAS, VSWR mengganti VSWR);
  // bagian yang tidak diupload dipertahankan dari record tanggal itu.
  //
  // Urutan kerja EAS (penting):
  //   1) ACH VALIDASI dulu: site ber-Date Revisi H-1 di File EAS (Manual Validation; terisi = Ach, status Done tidak dicek)
  //      dicocokkan dengan baseline TERAKHIR yang tersimpan, supaya prioritas sebelum berubah ke Done diketahui.
  //   2) Lalu BASELINE diperbarui dari Upload Data Streamlit hari ini (site yang masih terbuka per
  //      Final Priority) dan disimpan (easSites) untuk upload berikutnya.
  // Yang disimpan seperlunya: tabel EAS hasil hitung, catatan, dan daftar Site ID terbuka.
  const handleUpload = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const hasEasPair = Boolean(easFile && detailFile)
      if (Boolean(easFile) !== Boolean(detailFile)) {
        throw new Error('File EAS dan Upload Data Streamlit harus diupload bersamaan.')
      }
      if (!hasEasPair && !vswrFile) throw new Error('Pilih file yang akan diupload.')

      // Beri kesempatan React menampilkan status "Memproses…" sebelum parsing berat dimulai.
      await new Promise((resolve) => setTimeout(resolve, 30))

      const existing = getRecord(history, dateISO)
      let vswr = existing?.raw?.vswr ?? null
      let easReport = existing?.metrics?.easReport ?? null
      let easInfo = existing?.easInfo ?? null
      let easSites = existing?.easSites ?? null

      if (vswrFile) {
        vswr = parseVSWR(XLSX.read(await vswrFile.arrayBuffer(), { type: 'array' }))
      }

      if (hasEasPair) {
        const [easBuf, detailBuf] = await Promise.all([easFile.arrayBuffer(), detailFile.arrayBuffer()])

        // 1) Ach Validasi: File EAS / Manual Validation (Date Revisi H-1 + Done) x baseline upload sebelumnya.
        const prev = getPreviousEasRecord(history, dateISO)
        const manual = parseManualValidation(easBuf, { revisiDateISO, areaLabel: AREA_LABEL })
        const ach = computeAch({ revisedDone: manual.revisedDone, prevSites: prev?.easSites ?? null })

        // 2) Baseline baru: site terbuka (Final Priority P1..P7) dari Upload Data Streamlit hari ini.
        const baseline = parseEasDetail(detailBuf, { areaLabel: AREA_LABEL })

        easReport = buildEasReport({ baseline: baseline.nops, ach: ach.byNop })
        easSites = baseline.sites
        easInfo = {
          revisiDateISO,
          revisiDateLabel: isoToShortLabel(revisiDateISO),
          revisedTotal: manual.revisedTotal, // site ber-Date Revisi H-1 di File EAS
          revisedDone: manual.revisedDone.length, // sama dengan revisedTotal (terisi = Ach)
          matched: ach.matched, // ... yang prioritas awalnya ditemukan di baseline sebelumnya
          unmatched: ach.unmatched,
          baselineFromDateISO: prev?.dateISO ?? null, // tanggal baseline yang dipakai; null = belum ada
          availableDates: manual.availableDates,
          snapshotLabel: baseline.snapshotLabel,
          baselineStats: baseline.stats,
        }
      }

      const metrics = computeMetrics({ easReport, vswr })
      const dateLabel = isoToIdLabel(dateISO)
      const record = {
        dateISO,
        dateLabel,
        areaLabel: AREA_LABEL,
        metrics,
        // Ringkasan hanya untuk VSWR. Record EAS-saja diberi teks pengganti (tidak pernah kosong).
        summaryText:
          buildSummaryText(metrics, { dateLabel, areaLabel: AREA_LABEL }) ||
          'Ringkasan VSWR belum tersedia (baru data EAS yang diupload).',
        easInfo,
        easSites,
        raw: { vswr },
        generatedAt: new Date().toISOString(),
      }

      // Simpan ke database dulu. Kalau gagal, error ditangkap di bawah dan data
      // tidak ditampilkan seolah-olah sudah tersimpan.
      await saveRecord(record)
      setHistory((prev) => upsertInList(prev, record))
      setSelectedDateISO(dateISO)

      // kosongkan slot upload supaya panel siap untuk upload berikutnya
      setEasFile(null)
      setVswrFile(null)
      setDetailFile(null)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Terjadi kesalahan saat memproses file.')
    } finally {
      setLoading(false)
    }
  }, [easFile, vswrFile, detailFile, dateISO, revisiDateISO, history])

  const selectedRecord = useMemo(
    () => (selectedDateISO ? getRecord(history, selectedDateISO) : null),
    [history, selectedDateISO]
  )

  const previousRecord = useMemo(
    () => (selectedDateISO ? getPreviousRecord(history, selectedDateISO) : null),
    [history, selectedDateISO]
  )

  const comparison = useMemo(
    () => compareRecords(selectedRecord, previousRecord),
    [selectedRecord, previousRecord]
  )

  const handleExport = useCallback(() => {
    if (!selectedRecord) return
    exportDailyReport(selectedRecord)
  }, [selectedRecord])

  return (
    <div className="eas-vswr">
      <div className="page">
        {historyError && (
        <div className="error eas-load-error">
          Gagal memuat riwayat dari server: {historyError}. Pastikan backend berjalan.
        </div>
      )}

      <Header
          selectedDateISO={selectedDateISO}
          onSelectDate={setSelectedDateISO}
          onExport={handleExport}
          exportDisabled={!selectedRecord}
        />

        <div className="layout">
          <UploadPanel
            easFile={easFile}
            vswrFile={vswrFile}
            detailFile={detailFile}
            onEasFile={setEasFile}
            onVswrFile={setVswrFile}
            onDetailFile={setDetailFile}
            dateISO={dateISO}
            onDateChange={setDateISO}
            revisiDateLabel={isoToShortLabel(revisiDateISO)}
            onUpload={handleUpload}
            loading={loading}
            error={error}
          />

          <SummaryPanel record={selectedRecord} />
        </div>

        <ProgressTable
          table={selectedRecord?.metrics?.table}
          easReport={selectedRecord?.metrics?.easReport}
          easInfo={selectedRecord?.easInfo}
          hasVswr={hasVswrData(selectedRecord?.metrics)}
          dateLabel={selectedRecord?.dateLabel}
          generatedAt={selectedRecord?.generatedAt}
        />

        <AnalyticsPanel comparison={comparison} />
      </div>
    </div>
  )
}
                                        