  import React, { useMemo, useState } from 'react';
  import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
  import { TREND_PERIODS, NOP_KEY_PREFIX, getPeriodBucket, aggregateTrendByPeriod, aggregateTrendByRegionByPeriod, aggregateTrendByNopByPeriod } from '../../lib/aggregate.js';
  import { SOURCE_INAP, SOURCE_NOIM, SOURCE_BOTH, SOURCE_NOT_BOTH } from '../../lib/constants.js';

  const REGION_COLORS = { Sumbagut: '#e0301e', Sumbagteng: '#0ea5e9', Sumbagsel: '#22c55e' };

  // Warna per NOP (mode 1 Regional + 1 Tipe alarm). Urutan mengikuti daftar NOP dari seluruh data,
  // jadi satu NOP selalu punya warna yang sama di semua periode & di PDF.
  const NOP_COLORS = [
    '#e0301e', '#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6',
    '#84cc16', '#f97316', '#6366f1', '#06b6d4', '#a16207', '#64748b', '#be123c',
  ];


  // Tooltip mengikuti urutan legenda, warna = warna NOP.
  function NopTooltip({ active, payload, items, colorOf }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const tooltipItems = [...items].reverse()
      .map((nop) => ({ nop, value: Number(row[NOP_KEY_PREFIX + nop]) || 0 }))
      .filter((e) => e.value > 0);
    return (
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(15,23,42,.12)' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.date}</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Total : {formatTrendValue(row.total)}</div>
        {tooltipItems.map((e) => (
          <div key={e.nop} style={{ color: colorOf(e.nop), display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, background: colorOf(e.nop), display: 'inline-block', flexShrink: 0 }} />
            {e.nop} : {formatTrendValue(e.value)}
          </div>
        ))}
      </div>
    );
  }

  function NopLegend({ items, colorOf }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', paddingTop: 8, fontSize: 12 }}>
        {items.map((nop) => (
          <span key={nop} style={{ color: colorOf(nop), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, background: colorOf(nop), display: 'inline-block' }} />
            {nop}
          </span>
        ))}
        <span style={{ color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 0, borderTop: '2.5px solid #0f172a', display: 'inline-block' }} />
          Total
        </span>
      </div>
    );
  }

  function totalLabel(props) {
    const { x, y, value } = props;
    if (!value) return null;
    return (
      <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f172a">
        {Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}
      </text>
    );
  }

  function barLabel(props) {
    const { x, y, width, value } = props;
    if (!value) return null;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#334155">
        {Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}
      </text>
    );
  }

  const SOURCE_LABELS = {
    [SOURCE_NOIM]: 'NOIM',
    [SOURCE_BOTH]: 'Irisan INAP & NOIM',
    [SOURCE_NOT_BOTH]: 'Tidak Irisan INAP & NOIM',
  };

  // Catatan di bawah chart untuk sumber NOIM/Irisan/Tidak Irisan: data per tanggal upload NOIM,
  // bukan snapshot harian INAP, dan tanggal tanpa data INAP tidak bisa dibandingkan.
  function SourceNote({ sourceMode, skippedDates }) {
    if (!sourceMode || sourceMode === SOURCE_INAP) return null;
    return (
      <>
        <p className="text-[11px] text-slate-400 mb-1">
          Jumlah Site Down unik ({SOURCE_LABELS[sourceMode]}) pada tanggal yang punya data NOIM.
          {sourceMode !== SOURCE_NOIM && ' Perbandingan INAP vs NOIM memakai Site ID pada tanggal upload yang sama.'}
        </p>
        {skippedDates?.length > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">
            Tanggal {skippedDates.join(', ')} tidak ditampilkan karena belum ada data INAP yang di-upload di tanggal yang sama.
          </p>
        )}
      </>
    );
  }

  function formatTrendValue(value) {
    return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 });
  }

  function PeriodSelector({ period, onChange }) {
    return (
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {TREND_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              period === p.key ? 'bg-white text-brand-red shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    );
  }

  function DailyWeekRangeSelector({ weeks, startWeek, endWeek, onStartChange, onEndChange }) {
    if (!weeks.length) return null;
    return (
      <div className="inline-flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-slate-500">
          Dari
          <select
            aria-label="Minggu awal trend harian"
            value={startWeek}
            onChange={(event) => onStartChange(event.target.value)}
            className="w-[76px] rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"
          >
            {weeks.map((week) => <option key={week.key} value={week.key}>{week.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-500">
          Sampai
          <select
            aria-label="Minggu akhir trend harian"
            value={endWeek}
            onChange={(event) => onEndChange(event.target.value)}
            className="w-[76px] rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"
          >
            {weeks.map((week) => <option key={week.key} value={week.key}>{week.label}</option>)}
          </select>
        </label>
      </div>
    );
  }

  /**
   * `dataByRegion` diisi (array of {date, Sumbagut, Sumbagteng, Sumbagsel}) kalau filter
   * yang aktif adalah "Semua Regional" — batang tiap regional dijejerkan per hari, TIDAK
   * dijumlahkan jadi satu. `dataSingle` (array of {date, cellDown, siteDown, total})
   * dipakai kalau filter-nya 1 regional tertentu.
   *
   * Kedua data itu SELALU dalam bentuk harian (dari App.jsx) — pemilihan periode
   * (Daily/Weekly/Monthly/Quarter/Annual) & agregasinya dilakukan di komponen ini sendiri,
   * dengan nilai Weekly/Monthly/dst = RATA-RATA harian dalam periode itu (bukan total),
   * karena data sumbernya adalah snapshot backlog harian, bukan jumlah ticket baru per hari.
   */
  export default function TrendChart({ dataByRegion, dataSingle, dataByNop, nops = [], nopTitle, regions, hasGranularFilter, logHasOlderData, fixedPeriod, sourceMode = SOURCE_INAP, skippedDates = [] }) {
    const sourceLabel = sourceMode !== SOURCE_INAP ? SOURCE_LABELS[sourceMode] : null;
    const siteDownOnly = sourceMode !== SOURCE_INAP;
    // `fixedPeriod` dipakai saat export PDF: periode dikunci, selector disembunyikan, dan
    // animasi dimatikan supaya hasil screenshot langsung utuh.
    const [periodState, setPeriod] = useState('daily');
    const period = fixedPeriod || periodState;
    const animate = !fixedPeriod;
    const fixedLabel = fixedPeriod ? TREND_PERIODS.find((p) => p.key === fixedPeriod)?.label : null;
    const isByNop = Array.isArray(dataByNop);
    const isByRegion = !isByNop && Array.isArray(dataByRegion);
    const rawData = isByNop ? dataByNop : isByRegion ? dataByRegion : dataSingle;
    const [dailyStartWeek, setDailyStartWeek] = useState('');
    const [dailyEndWeek, setDailyEndWeek] = useState('');

    const weeks = useMemo(() => {
      if (!rawData) return [];
      const weekMap = new Map();
      rawData.forEach((row) => {
        if (!row.date) return;
        const week = getPeriodBucket(row.date, 'weekly');
        weekMap.set(week.key, week);
      });
      return [...weekMap.values()].sort((a, b) => a.key.localeCompare(b.key));
    }, [rawData]);

    const selectedStartWeek = weeks.some((week) => week.key === dailyStartWeek) ? dailyStartWeek : weeks[0]?.key || '';
    const selectedEndWeek = weeks.some((week) => week.key === dailyEndWeek) ? dailyEndWeek : weeks[weeks.length - 1]?.key || '';

    const data = useMemo(() => {
      if (!rawData) return rawData;
      if (isByNop) return aggregateTrendByNopByPeriod(rawData, nops, period);
      return isByRegion
        ? aggregateTrendByRegionByPeriod(rawData, regions, period)
        : aggregateTrendByPeriod(rawData, period);
    }, [rawData, isByNop, isByRegion, nops, regions, period]);

    const displayData = useMemo(() => {
      if (period !== 'daily' || fixedPeriod || !weeks.length) return data;
      const fromWeek = selectedStartWeek < selectedEndWeek ? selectedStartWeek : selectedEndWeek;
      const toWeek = selectedStartWeek < selectedEndWeek ? selectedEndWeek : selectedStartWeek;
      return data.filter((row) => {
        const weekKey = getPeriodBucket(row.date, 'weekly').key;
        return weekKey >= fromWeek && weekKey <= toWeek;
      });
    }, [data, period, fixedPeriod, weeks, selectedStartWeek, selectedEndWeek]);

    const changeStartWeek = (weekKey) => {
      setDailyStartWeek(weekKey);
      if (weekKey > selectedEndWeek) setDailyEndWeek(weekKey);
    };

    const changeEndWeek = (weekKey) => {
      setDailyEndWeek(weekKey);
      if (weekKey < selectedStartWeek) setDailyStartWeek(weekKey);
    };

    if (!rawData || rawData.length < 1) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-1">Trend Harian{sourceLabel ? ` - ${sourceLabel}` : ''}</h3>
          <SourceNote sourceMode={sourceMode} skippedDates={skippedDates} />
          <p className="text-xs text-slate-500">
            {sourceLabel
              ? 'Belum ada tanggal yang punya data untuk kombinasi filter ini. Upload data NOIM (dan data INAP) di tanggal yang sama di halaman Upload.'
              : hasGranularFilter && logHasOlderData
              ? 'Belum ada hari yang cocok dengan kombinasi filter ini. Rincian per NOP/Cluster/Tipe/Duration/RC baru mulai tersimpan sejak update ini — hari-hari sebelumnya belum punya rinciannya, jadi tidak ikut tampil saat filter granular dipakai. Data baru ke depannya akan otomatis muncul di sini.'
              : 'Trend akan terbentuk setelah kamu memproses data harian. Saat ini belum ada hari yang tersimpan.'}
          </p>
        </div>
      );
    }

    if (isByNop) {
      // NOP yang tidak punya data sama sekali di jendela ini tidak digambar / tidak masuk legenda.
      const activeNops = nops.filter((nop) => displayData.some((e) => Number(e[NOP_KEY_PREFIX + nop]) > 0));
      const colorOf = (nop) => NOP_COLORS[nops.indexOf(nop) % NOP_COLORS.length];
      // Legenda: NOP dengan total terbesar di jendela ini duluan.
      const legendItems = [...activeNops].sort(
        (a, b) =>
          displayData.reduce((sum, e) => sum + (Number(e[NOP_KEY_PREFIX + b]) || 0), 0) -
          displayData.reduce((sum, e) => sum + (Number(e[NOP_KEY_PREFIX + a]) || 0), 0)
      );

      return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h3 className="font-semibold text-slate-800">
              Trend{nopTitle ? ` ${nopTitle}` : ' per NOP'}{fixedLabel ? ` (${fixedLabel})` : ''}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {!fixedPeriod && <PeriodSelector period={period} onChange={setPeriod} />}
              {!fixedPeriod && period === 'daily' && (
                <DailyWeekRangeSelector weeks={weeks} startWeek={selectedStartWeek} endWeek={selectedEndWeek} onStartChange={changeStartWeek} onEndChange={changeEndWeek} />
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-1">
            Tiap warna = 1 NOP, urutan potongan mengikuti legenda.
            {period !== 'daily' && ' Nilai = rata-rata ticket aktif per hari dalam periode ini.'}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={displayData} margin={{ top: 24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip content={<NopTooltip items={legendItems} colorOf={colorOf} />} />
              <Legend content={<NopLegend items={legendItems} colorOf={colorOf} />} />
              {legendItems.map((nop) => (
                <Bar key={nop} dataKey={NOP_KEY_PREFIX + nop} name={nop} stackId="nop" fill={colorOf(nop)} isAnimationActive={animate} />
              ))}
              <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={animate}>
                <LabelList dataKey="total" content={totalLabel} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (isByRegion) {
      const lineData = displayData.map((entry) => ({
        ...entry,
        total: regions.reduce((sum, reg) => sum + Number(entry[reg] || 0), 0),
      }));

      // Regional yang tidak punya data sama sekali tidak digambar batangnya, supaya batang yang
      // ada berada tepat di tengah kategori dan sejajar dengan titik garis Total (mis. NOIM
      // yang hanya berisi Regional 1).
      const activeRegions = regions.filter((reg) => lineData.some((e) => Number(e[reg]) > 0));
      const barRegions = activeRegions.length ? activeRegions : regions;

      return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h3 className="font-semibold text-slate-800">
              Trend{sourceLabel ? ` ${sourceLabel}` : ''} - Perbandingan Antar Regional{fixedLabel ? ` (${fixedLabel})` : ''}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {!fixedPeriod && <PeriodSelector period={period} onChange={setPeriod} />}
              {!fixedPeriod && period === 'daily' && (
                <DailyWeekRangeSelector weeks={weeks} startWeek={selectedStartWeek} endWeek={selectedEndWeek} onStartChange={changeStartWeek} onEndChange={changeEndWeek} />
              )}
            </div>
          </div>
          <SourceNote sourceMode={sourceMode} skippedDates={skippedDates} />
          {period !== 'daily' && (
            <p className="text-[11px] text-slate-400 mb-1">Nilai menunjukkan rata-rata ticket aktif per hari dari snapshot yang tersedia dalam periode ini.</p>
          )}
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={lineData} margin={{ top: 24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => formatTrendValue(value)} />
              <Legend />
              {barRegions.map((reg) => (
                <Bar key={reg} dataKey={reg} name={reg} fill={REGION_COLORS[reg] || '#94a3b8'} isAnimationActive={animate}>
                  <LabelList dataKey={reg} content={barLabel} />
                </Bar>
              ))}
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#0f172a"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                isAnimationActive={animate}
              >
                <LabelList dataKey="total" content={totalLabel} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    const last = displayData[displayData.length - 1];
    const prev = displayData[displayData.length - 2] || null;
    const delta = prev ? last.total - prev.total : 0;

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="font-semibold text-slate-800">Trend{sourceLabel ? ` ${sourceLabel}` : ''}{fixedLabel ? ` (${fixedLabel})` : ''}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {!fixedPeriod && <PeriodSelector period={period} onChange={setPeriod} />}
            {!fixedPeriod && period === 'daily' && (
              <DailyWeekRangeSelector weeks={weeks} startWeek={selectedStartWeek} endWeek={selectedEndWeek} onStartChange={changeStartWeek} onEndChange={changeEndWeek} />
            )}
          </div>
        </div>
        <SourceNote sourceMode={sourceMode} skippedDates={skippedDates} />
        {period !== 'daily' && (
          <p className="text-[11px] text-slate-400 mb-1">Nilai menunjukkan rata-rata ticket aktif per hari dari snapshot yang tersedia dalam periode ini.</p>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={displayData} margin={{ top: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value) => formatTrendValue(value)} />
            <Legend />
            {!siteDownOnly && <Bar dataKey="cellDown" name="CellDown" fill="#e0301e" stackId="a" isAnimationActive={animate} />}
            <Bar dataKey="siteDown" name="SiteDown" fill="#0ea5e9" stackId="a" isAnimationActive={animate} />
            <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={animate}>
              <LabelList dataKey="total" content={totalLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-600 mt-2">
          {last.date}: <strong>{formatTrendValue(last.total)}</strong> ticket rata-rata per hari
          {prev ? (
            <>
              , {delta >= 0 ? 'naik' : 'turun'} <strong>{formatTrendValue(Math.abs(delta))}</strong> dibanding {prev.date} ({formatTrendValue(prev.total)}).
            </>
          ) : (
            '.'
          )}
        </p>
      </div>
    );
  }
