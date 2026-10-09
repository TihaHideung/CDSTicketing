import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { parsePM } from './lib/parsePM.js'
import { computePmMetrics } from './lib/metrics.js'
import { buildSummaryTexts } from './lib/buildSummary.js'
import { loadHistory, saveRecord, upsertInList, getRecord, getPreviousRecord } from './lib/history.js'
import { comparePmRecords } from './lib/compare.js'
import { exportPmReport } from './lib/exportExcel.js'
import { todayISO, isoToIdLabel } from './lib/format.js'

import UploadPanel from './components/UploadPanel.jsx'
import PmTable from './components/PmTable.jsx'
import PmAnalyticsPanel from './components/PmAnalyticsPanel.jsx'
import PmSummaryPanel from './components/PmSummaryPanel.jsx'
import '../eas-vswr/eas-vswr.css'
import './pm-tracking.css'

const AREA_LABEL = 'Area 1'

export default function PmTrackingPage() {
  const [siteFile, setSiteFile] = useState(null)
  const [gensetFile, setGensetFile] = useState(null)
  const [dateISO, setDateISO] = useState(todayISO())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [history, setHistory] = useState([])
  const [selectedDateISO, setSelectedDateISO] = useState(null)
  const [historyError, setHistoryError] = useState('')

  // Riwayat dimuat dari database, jadi tanggal yang pernah di-generate selalu bisa
  // dibuka lagi lewat kalender, dari perangkat mana pun.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadHistory()
        if (cancelled) return
        setHistory(list)
        if (list.length) setSelectedDateISO(list[list.length - 1].dateISO)
        setHistoryError('')
      } catch (err) {
        console.error(err)
        if (!cancelled) setHistoryError(err.message || 'Gagal memuat riwayat dari server.')
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
      const [siteBuf, gensetBuf] = await Promise.all([siteFile.arrayBuffer(), gensetFile.arrayBuffer()])
      const site = parsePM(XLSX.read(siteBuf, { type: 'array' }), 'site')
      const genset = parsePM(XLSX.read(gensetBuf, { type: 'array' }), 'genset')

      const metrics = computePmMetrics({ site, genset })
      const dateLabel = isoToIdLabel(dateISO)
      const summaryTexts = buildSummaryTexts(metrics, { areaLabel: AREA_LABEL, dateISO })
      // summaryText (gabungan) tetap disimpan karena backend memvalidasi field ini
      const summaryText = `${summaryTexts.site}\n\n${summaryTexts.genset}`

      const record = {
        dateISO,
        dateLabel,
        areaLabel: AREA_LABEL,
        metrics,
        summaryText,
        summaryTexts,
        raw: { site, genset },
        generatedAt: new Date().toISOString(),
      }

      // Simpan dulu; kalau gagal, error ditangkap di bawah dan summary tidak
      // ditampilkan seolah-olah sudah tersimpan.
      await saveRecord(record)
      setHistory((prev) => upsertInList(prev, record))
      setSelectedDateISO(dateISO)

      setSiteFile(null)
      setGensetFile(null)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Terjadi kesalahan saat memproses file.')
    } finally {
      setLoading(false)
    }
  }, [siteFile, gensetFile, dateISO])

  const selectedRecord = useMemo(
    () => (selectedDateISO ? getRecord(history, selectedDateISO) : null),
    [history, selectedDateISO]
  )
  const previousRecord = useMemo(
    () => (selectedDateISO ? getPreviousRecord(history, selectedDateISO) : null),
    [history, selectedDateISO]
  )
  const comparison = useMemo(
    () => comparePmRecords(selectedRecord, previousRecord),
    [selectedRecord, previousRecord]
  )

  const handleExport = useCallback(async () => {
    if (!selectedRecord) return
    setExporting(true)
    try {
      await exportPmReport(selectedRecord)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Gagal membuat file Excel.')
    } finally {
      setExporting(false)
    }
  }, [selectedRecord])

  const metrics = selectedRecord?.metrics
  const unknown = [...(metrics?.site?.unknownStatuses || []), ...(metrics?.genset?.unknownStatuses || [])]

  return (
    <div className="eas-vswr pm-tracking">
      <div className="page">
        {historyError && (
          <div className="error eas-load-error">
            Gagal memuat riwayat dari server: {historyError}. Pastikan backend berjalan.
          </div>
        )}

        <div className="eas-toolbar">
          <p className="eas-toolbar__desc">Progress Preventive Maintenance Site &amp; Genset</p>
          <div className="app-header__actions">
            <label className="app-header__calendar" title="Lihat data tanggal lain">
              <span>🗓</span>
              <input
                type="date"
                value={selectedDateISO || ''}
                max={todayISO()}
                onChange={(e) => e.target.value && setSelectedDateISO(e.target.value)}
              />
            </label>
            <button className="btn btn--primary" onClick={handleExport} disabled={!selectedRecord || exporting}>
              {exporting ? 'Menyiapkan…' : '⭳ Export Excel'}
            </button>
          </div>
        </div>

        <div className="layout">
          <UploadPanel
            siteFile={siteFile}
            gensetFile={gensetFile}
            onSiteFile={setSiteFile}
            onGensetFile={setGensetFile}
            dateISO={dateISO}
            onDateChange={setDateISO}
            onGenerate={handleGenerate}
            loading={loading}
            error={error}
          />
          <PmSummaryPanel texts={selectedRecord?.summaryTexts} dateLabel={selectedRecord?.dateLabel} />
        </div>

        {unknown.length > 0 && (
          <div className="error pm-warning">
            Ada status yang tidak dikenali dan tidak masuk kolom status:{' '}
            {unknown.map((u) => `${u.status} (${u.count})`).join(', ')}. Tiketnya tetap terhitung di #Ticket.
          </div>
        )}

        <PmTable
          kind="site"
          table={metrics?.site}
          dateLabel={selectedRecord?.dateLabel}
          dateISO={selectedRecord?.dateISO}
          generatedAt={selectedRecord?.generatedAt}
        />
        <PmTable
          kind="genset"
          table={metrics?.genset}
          dateLabel={selectedRecord?.dateLabel}
          dateISO={selectedRecord?.dateISO}
          generatedAt={selectedRecord?.generatedAt}
        />

        <PmAnalyticsPanel comparison={comparison} />
      </div>
    </div>
  )
}
