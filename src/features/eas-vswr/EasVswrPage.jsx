import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { parseEAS } from './lib/parseEAS.js'
import { parseVSWR } from './lib/parseVSWR.js'
import { computeMetrics } from './lib/metrics.js'
import { buildSummaryText } from './lib/buildSummary.js'
import {
  loadHistory,
  saveRecord,
  upsertInList,
  migrateLegacyLocalHistory,
  getRecord,
  getPreviousRecord,
} from './lib/history.js'
import { compareRecords } from './lib/compare.js'
import { exportDailyReport } from './lib/exportExcel.js'
import { todayISO, isoToIdLabel } from './lib/format.js'

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
  const [dateISO, setDateISO] = useState(todayISO())
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

  const handleGenerate = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [easBuf, vswrBuf] = await Promise.all([
        easFile.arrayBuffer(),
        vswrFile.arrayBuffer(),
      ])
      const easWb = XLSX.read(easBuf, { type: 'array' })
      const vswrWb = XLSX.read(vswrBuf, { type: 'array' })

      const eas = parseEAS(easWb)
      const vswr = parseVSWR(vswrWb)
      const metrics = computeMetrics({ eas, vswr })
      const dateLabel = isoToIdLabel(dateISO)
      const summaryText = buildSummaryText(metrics, { dateLabel, areaLabel: AREA_LABEL })

      const record = {
        dateISO,
        dateLabel,
        areaLabel: AREA_LABEL,
        metrics,
        summaryText,
        raw: { eas, vswr },
        generatedAt: new Date().toISOString(),
      }

      // Simpan ke database dulu. Kalau gagal, error ditangkap di bawah dan summary
      // tidak ditampilkan seolah-olah sudah tersimpan.
      await saveRecord(record)
      setHistory((prev) => upsertInList(prev, record))
      setSelectedDateISO(dateISO)

      // auto refresh: clear the upload slots so the panel is ready for the
      // next file pair right away (no manual "New Cycle" step needed)
      setEasFile(null)
      setVswrFile(null)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Terjadi kesalahan saat memproses file.')
    } finally {
      setLoading(false)
    }
  }, [easFile, vswrFile, dateISO])

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
            onEasFile={setEasFile}
            onVswrFile={setVswrFile}
            dateISO={dateISO}
            onDateChange={setDateISO}
            onGenerate={handleGenerate}
            loading={loading}
            error={error}
          />

          <SummaryPanel
            summary={selectedRecord?.summaryText}
            dateLabel={selectedRecord?.dateLabel}
          />
        </div>

        <ProgressTable
          table={selectedRecord?.metrics?.table}
          dateLabel={selectedRecord?.dateLabel}
          generatedAt={selectedRecord?.generatedAt}
        />

        <AnalyticsPanel comparison={comparison} />
      </div>
    </div>
  )
}
