import { matchesRegionalTag, RC_UNDER_REVIEW } from './constants.js';
import { breakdownItemMatchesFilters, hasGranularFilter, getPeriodBucket } from './aggregate.js';

/**
 * Analisis untuk Report PDF Dashboard.
 *
 * Sumber data = log Trend Harian (snapshot BACKLOG ticket aktif per hari, bukan ticket baru).
 * Jadi "kenaikan" = pertambahan backlog dibanding snapshot sebelumnya, dan "kontributor" =
 * selisih jumlah ticket aktif per Regional/NOP/Kategori antara dua snapshot itu.
 * Seluruh fungsi di sini murni (tanpa DOM) supaya mudah diuji.
 */

export const REPORT_PERIODS = [
  { key: 'daily', label: 'Harian', adj: 'Harian' },
  { key: 'weekly', label: 'Weekly', adj: 'Mingguan' },
  { key: 'monthly', label: 'Monthly', adj: 'Bulanan' },
  { key: 'quarter', label: 'Quarter', adj: 'Kuartalan' },
  { key: 'annual', label: 'Annual', adj: 'Tahunan' },
];

// Granularitas "trend rinci" yang ditampilkan di dalam periode report.
//   weekly/monthly -> harian, quarter -> mingguan, annual -> bulanan.
const SUB_GRANULARITY = { weekly: 'daily', monthly: 'daily', quarter: 'weekly', annual: 'monthly' };
const SUB_LABEL = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };

// Berapa periode terakhir yang ditampilkan di grafik trend periode (biar tetap terbaca).
const TREND_WINDOW = { weekly: 12, monthly: 12, quarter: 8, annual: 10 };
const DAILY_WINDOW = 7;

// ---------------------------------------------------------------- tanggal

const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const pad2 = (n) => String(n).padStart(2, '0');
const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (key, n) => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

/** 'Jum, 9 Okt 2026' (year=false -> 'Jum, 9 Okt') */
export function fmtDate(key, { year = true, weekday = true } = {}) {
  const d = parseKey(key);
  const core = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`;
  return weekday ? `${DAY_SHORT[d.getDay()]}, ${core}` : core;
}

function fmtRange(start, end) {
  const s = parseKey(start);
  const e = parseKey(end);
  if (start === end) return fmtDate(start);
  if (s.getFullYear() === e.getFullYear()) return `${fmtDate(start, { year: false, weekday: false })} - ${fmtDate(end, { weekday: false })}`;
  return `${fmtDate(start, { weekday: false })} - ${fmtDate(end, { weekday: false })}`;
}

/** Rentang kalender penuh sebuah periode (bukan cuma hari yang punya data). */
function periodRange(period, key) {
  if (period === 'daily') return { start: key, end: key };
  if (period === 'weekly') return { start: key, end: addDays(key, 6) };
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return { start: `${y}-${pad2(m)}-01`, end: toKey(new Date(y, m, 0)) };
  }
  if (period === 'quarter') {
    const [y, q] = key.split('-Q');
    const startMonth = (Number(q) - 1) * 3;
    return { start: toKey(new Date(Number(y), startMonth, 1)), end: toKey(new Date(Number(y), startMonth + 3, 0)) };
  }
  return { start: `${key}-01-01`, end: `${key}-12-31` };
}

function periodTitle(period, key, shortLabel) {
  const { start, end } = periodRange(period, key);
  if (period === 'daily') return fmtDate(key);
  if (period === 'weekly') return `${shortLabel} (${fmtRange(start, end)})`;
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return `${MONTH_FULL[m - 1]} ${y}`;
  }
  if (period === 'quarter') return `${shortLabel} (${fmtRange(start, end)})`;
  return `Tahun ${key}`;
}

// ---------------------------------------------------------------- format angka

export function fmtNum(value, digits = 1) {
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: digits });
}
export function fmtSigned(value, digits = 1) {
  const n = Number(value || 0);
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '-'}${fmtNum(Math.abs(rounded), digits)}`;
}
const fmtPct = (ratio) => `${fmtNum(ratio * 100, 0)}%`;

// ---------------------------------------------------------------- snapshot

/**
 * Satu hari -> snapshot terstruktur yang sudah mengikuti filter Dashboard.
 * `detailed` = rincian NOP/Kategori tersedia. Data lama (sebelum rincian disimpan) hanya punya
 * total per Regional, jadi atribusinya berhenti di level Regional.
 */
function buildDaySnapshot(entry, criteria) {
  const date = String(entry?.date || '').slice(0, 10);
  if (!date) return null;
  const regionalFilter = criteria.regionalFilter && criteria.regionalFilter !== 'ALL' ? criteria.regionalFilter : null;
  const items = [];
  let detailed = false;

  if (Array.isArray(entry.breakdown) && (entry.breakdown.length || entry.complete)) {
    detailed = true;
    for (const item of entry.breakdown) {
      if (regionalFilter && !matchesRegionalTag(item.regional, regionalFilter)) continue;
      if (!breakdownItemMatchesFilters(item, criteria)) continue;
      items.push({
        regional: item.regional || 'UNKNOWN',
        nop: item.nop || '',
        catAlarm: item.catAlarm === 'CellDown' ? 'CellDown' : 'SiteDown',
        rc: item.rc || '',
        count: Number(item.count) || 0,
      });
    }
  } else if (!hasGranularFilter(criteria)) {
    const byRegional = entry.byRegional || {};
    const names = Object.keys(byRegional);
    if (names.length) {
      for (const reg of names) {
        if (regionalFilter && !matchesRegionalTag(reg, regionalFilter)) continue;
        const r = byRegional[reg] || {};
        if (r.cellDown) items.push({ regional: reg, nop: '', catAlarm: 'CellDown', rc: '', count: Number(r.cellDown) });
        if (r.siteDown) items.push({ regional: reg, nop: '', catAlarm: 'SiteDown', rc: '', count: Number(r.siteDown) });
      }
    } else if (!regionalFilter && entry.total) {
      if (entry.total.cellDown) items.push({ regional: 'Total', nop: '', catAlarm: 'CellDown', rc: '', count: Number(entry.total.cellDown) });
      if (entry.total.siteDown) items.push({ regional: 'Total', nop: '', catAlarm: 'SiteDown', rc: '', count: Number(entry.total.siteDown) });
    }
  } else {
    return null; // data lama + filter granular aktif: tidak bisa dihitung (sama seperti grafik trend)
  }

  let cellDown = 0;
  let siteDown = 0;
  for (const it of items) {
    if (it.catAlarm === 'CellDown') cellDown += it.count;
    else siteDown += it.count;
  }
  return { date, detailed, items, cellDown, siteDown, total: cellDown + siteDown };
}

export function buildSnapshots(log, criteria = {}) {
  const byDate = new Map();
  for (const entry of log || []) {
    const snap = buildDaySnapshot(entry, criteria);
    if (snap) byDate.set(snap.date, snap);
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date > b.date ? 1 : -1));
}

/**
 * Gabungkan beberapa snapshot harian jadi satu "snapshot rata-rata" (sama seperti cara grafik
 * Weekly/Monthly menghitung: rata-rata backlog per hari). Untuk 1 hari hasilnya = hari itu.
 * `avg*` dibulatkan ke atas (Math.ceil) supaya identik dengan angka di grafik trend.
 */
function mergeSnapshots(snaps) {
  const n = snaps.length;
  const map = new Map();
  let sumCell = 0;
  let sumSite = 0;
  for (const s of snaps) {
    sumCell += s.cellDown;
    sumSite += s.siteDown;
    for (const it of s.items) {
      const k = `${it.regional}|${it.nop}|${it.catAlarm}|${it.rc}`;
      const e = map.get(k);
      if (e) e.count += it.count;
      else map.set(k, { ...it });
    }
  }
  const items = Array.from(map.values()).map((it) => ({ ...it, count: it.count / n }));
  return {
    days: n,
    dates: snaps.map((s) => s.date),
    detailed: snaps.every((s) => s.detailed),
    items,
    rawTotal: (sumCell + sumSite) / n,
    total: Math.ceil((sumCell + sumSite) / n),
    cellDown: Math.ceil(sumCell / n),
    siteDown: Math.ceil(sumSite / n),
  };
}

// ---------------------------------------------------------------- atribusi

function deltaBy(prevItems, currItems, keyFn, labelFn) {
  const map = new Map();
  const touch = (it) => {
    const k = keyFn(it);
    if (!map.has(k)) map.set(k, { key: k, label: labelFn(it), prev: 0, curr: 0 });
    return map.get(k);
  };
  for (const it of prevItems) touch(it).prev += it.count;
  for (const it of currItems) touch(it).curr += it.count;
  return Array.from(map.values()).map((e) => ({ ...e, delta: e.curr - e.prev }));
}

/** Ambil kontributor searah perubahan (dir=+1 naik, -1 turun), urut terbesar dulu. */
function pickMovers(list, dir, limit) {
  const movers = list.filter((e) => dir * e.delta > 0.0001).sort((a, b) => dir * (b.delta - a.delta));
  const gross = movers.reduce((sum, e) => sum + Math.abs(e.delta), 0);
  return movers.slice(0, limit).map((e) => ({
    label: e.label,
    delta: e.delta,
    prev: e.prev,
    curr: e.curr,
    share: gross ? Math.abs(e.delta) / gross : 0,
  }));
}

/**
 * Jelaskan perubahan dari snapshot `prev` ke `curr`: siapa (Regional, NOP, Tipe, Kategori RC)
 * yang paling mendorong perubahan searah `dir`, plus total pergerakan bruto di kedua arah
 * (supaya terlihat kalau sebagian kenaikan tertahan penurunan di tempat lain).
 */
export function explainChange(prev, curr, dir) {
  const detailed = prev.detailed && curr.detailed;
  const regional = deltaBy(prev.items, curr.items, (it) => it.regional, (it) => it.regional);
  const nop = detailed
    ? deltaBy(prev.items, curr.items, (it) => `${it.regional}|${it.nop}`, (it) => (it.nop ? `${it.nop} (${it.regional})` : `Tanpa NOP (${it.regional})`))
    : null;
  const tipe = deltaBy(prev.items, curr.items, (it) => it.catAlarm, (it) => (it.catAlarm === 'CellDown' ? 'Cell Down' : 'Site Down'));
  const rc = detailed
    ? deltaBy(prev.items, curr.items, (it) => it.rc || RC_UNDER_REVIEW, (it) => it.rc || RC_UNDER_REVIEW)
    : null;

  const grossOf = (list, sign) => list.filter((e) => sign * e.delta > 0).reduce((s, e) => s + Math.abs(e.delta), 0);
  const base = nop || regional;

  return {
    detailed,
    netChange: curr.rawTotal - prev.rawTotal,
    grossUp: grossOf(base, 1),
    grossDown: grossOf(base, -1),
    regional: pickMovers(regional, dir, 3),
    nop: nop ? pickMovers(nop, dir, 5) : null,
    tipe: pickMovers(tipe, dir, 2),
    rcMovers: rc ? pickMovers(rc, dir, 3) : null,
  };
}

/** Komposisi snapshot: kategori RC terbanyak dan komposisi Cell Down vs Site Down. */
export function categoryBreakdown(snap, prevSnap = null) {
  if (!snap || !snap.detailed) return null;
  const prevMap = new Map();
  if (prevSnap?.detailed) {
    for (const it of prevSnap.items) {
      const k = it.rc || RC_UNDER_REVIEW;
      prevMap.set(k, (prevMap.get(k) || 0) + it.count);
    }
  }
  const map = new Map();
  for (const it of snap.items) {
    const k = it.rc || RC_UNDER_REVIEW;
    map.set(k, (map.get(k) || 0) + it.count);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  const rc = Array.from(map.entries())
    .map(([label, count]) => ({
      label,
      count,
      share: total ? count / total : 0,
      delta: prevSnap?.detailed ? count - (prevMap.get(label) || 0) : null,
    }))
    .sort((a, b) => b.count - a.count);
  const underReviewShare = rc.find((r) => r.label === RC_UNDER_REVIEW)?.share || 0;
  return {
    total,
    rc: rc.slice(0, 5),
    rcAll: rc,
    underReviewShare,
    cellDown: snap.cellDown,
    siteDown: snap.siteDown,
  };
}

// ---------------------------------------------------------------- periode

function periodBuckets(snaps, period) {
  const map = new Map();
  for (const s of snaps) {
    const { key, label } = getPeriodBucket(s.date, period);
    if (!map.has(key)) map.set(key, { key, label, snaps: [] });
    map.get(key).snaps.push(s);
  }
  return Array.from(map.values()).sort((a, b) => (a.key > b.key ? 1 : -1));
}

/** Daftar periode yang bisa dipilih untuk report (terbaru dulu), untuk dropdown di modal. */
export function listReportPeriods(log, criteria, period) {
  const snaps = buildSnapshots(log, criteria);
  if (!snaps.length) return [];
  const lastDate = snaps[snaps.length - 1].date;
  return periodBuckets(snaps, period)
    .map((b) => {
      const { start, end } = periodRange(period, b.key);
      const totalDays = daysBetween(start, end) + 1;
      const ongoing = end > lastDate;
      const coverage = period === 'daily' ? '' : ` - ${b.snaps.length}/${totalDays} hari data${ongoing ? ', berjalan' : ''}`;
      const title = periodTitle(period, b.key, b.label);
      return { key: b.key, title, label: `${title}${coverage}` };
    })
    .reverse();
}

function toPoint(group, isDailyGran) {
  const snap = mergeSnapshots(group.snaps);
  return {
    key: group.key,
    label: isDailyGran ? fmtDate(group.snaps[0].date, { year: false }) : group.label,
    shortLabel: isDailyGran ? fmtDate(group.snaps[0].date, { year: false, weekday: false }) : group.label,
    dates: snap.dates,
    days: snap.days,
    total: snap.total,
    cellDown: snap.cellDown,
    siteDown: snap.siteDown,
    snap,
  };
}

function describeMovers(list, { signed = true, limit = 2 } = {}) {
  if (!list?.length) return '';
  return list
    .slice(0, limit)
    .map((m) => `${m.label} (${signed ? fmtSigned(m.delta) : fmtNum(m.delta)})`)
    .join(', ');
}

function buildEvent(kind, from, to, dir) {
  const change = to.total - from.total;
  const explain = explainChange(from.snap, to.snap, dir);
  return {
    kind, // 'rise' | 'drop'
    from,
    to,
    change,
    pct: from.total ? change / from.total : 0,
    explain,
    categories: categoryBreakdown(to.snap, from.snap),
  };
}

/**
 * Susun seluruh isi report untuk 1 periode.
 *   period    : 'daily' | 'weekly' | 'monthly' | 'quarter' | 'annual'
 *   periodKey : key dari `listReportPeriods`
 */
export function buildReport({ log, criteria = {}, period, periodKey }) {
  const snaps = buildSnapshots(log, criteria);
  const buckets = periodBuckets(snaps, period);
  const idx = buckets.findIndex((b) => b.key === periodKey);
  if (idx < 0) throw new Error('Periode report tidak ditemukan pada data trend. Coba pilih periode lain.');

  const bucket = buckets[idx];
  const prevBucket = idx > 0 ? buckets[idx - 1] : null;
  const meta = REPORT_PERIODS.find((p) => p.key === period);
  const { start, end } = periodRange(period, periodKey);
  const totalDays = daysBetween(start, end) + 1;
  const lastDataDate = snaps[snaps.length - 1].date;
  const ongoing = end > lastDataDate;
  const title = periodTitle(period, periodKey, bucket.label);

  // hari yang seharusnya punya data tapi kosong (hanya sampai tanggal data terakhir)
  const have = new Set(bucket.snaps.map((s) => s.date));
  const missingDates = [];
  for (let d = start; d <= (ongoing ? lastDataDate : end); d = addDays(d, 1)) {
    if (!have.has(d)) missingDates.push(d);
  }

  const cur = mergeSnapshots(bucket.snaps);
  const dayTotals = bucket.snaps.map((s) => ({ date: s.date, total: s.total }));
  const highLevel = dayTotals.reduce((b, x) => (x.total > b.total ? x : b));
  const lowLevel = dayTotals.reduce((b, x) => (x.total < b.total ? x : b));
  const firstSnap = bucket.snaps[0];
  const lastSnap = bucket.snaps[bucket.snaps.length - 1];

  // ---- dibanding periode sebelumnya
  let vsPrevious = null;
  if (prevBucket) {
    const prev = mergeSnapshots(prevBucket.snaps);
    const change = cur.total - prev.total;
    const prevTitle = period === 'daily' ? fmtDate(prevBucket.key) : periodTitle(period, prevBucket.key, prevBucket.label);
    vsPrevious = {
      prevLabel: period === 'daily' ? fmtDate(prevBucket.key, { year: false }) : prevBucket.label,
      prevTitle,
      prevTotal: prev.total,
      change,
      pct: prev.total ? change / prev.total : 0,
      explain: change === 0 ? null : explainChange(prev, cur, change > 0 ? 1 : -1),
      categories: categoryBreakdown(cur, prev),
    };
  }

  // ---- trend rinci di dalam periode + kejadian kenaikan/penurunan tertinggi
  const subGran = SUB_GRANULARITY[period] || null;
  let subPoints = [];
  let rise = null;
  let drop = null;
  let transitions = [];
  let baselineUsed = false;

  if (subGran) {
    const isDailyGran = subGran === 'daily';
    const groups = periodBuckets(bucket.snaps, subGran).map((g) => toPoint(g, isDailyGran));
    subPoints = groups;

    const sequence = [...groups];
    // perubahan di hari pertama dihitung terhadap snapshot sebelumnya (kalau ada)
    if (isDailyGran && prevBucket) {
      const baseSnap = prevBucket.snaps[prevBucket.snaps.length - 1];
      const base = toPoint({ key: baseSnap.date, label: baseSnap.date, snaps: [baseSnap] }, true);
      base.outside = true;
      sequence.unshift(base);
      baselineUsed = true;
    }

    for (let i = 1; i < sequence.length; i++) {
      transitions.push({ from: sequence[i - 1], to: sequence[i], change: sequence[i].total - sequence[i - 1].total });
    }
    const up = transitions.filter((t) => t.change > 0).sort((a, b) => b.change - a.change)[0];
    const down = transitions.filter((t) => t.change < 0).sort((a, b) => a.change - b.change)[0];
    if (up) rise = buildEvent('rise', up.from, up.to, 1);
    if (down) drop = buildEvent('drop', down.from, down.to, -1);
  } else if (vsPrevious) {
    // Harian: "kejadian"-nya adalah perubahan hari ini vs snapshot sebelumnya.
    const prevPoint = toPoint({ key: prevBucket.key, label: prevBucket.key, snaps: prevBucket.snaps }, true);
    const curPoint = toPoint({ key: bucket.key, label: bucket.key, snaps: bucket.snaps }, true);
    if (curPoint.total > prevPoint.total) rise = buildEvent('rise', prevPoint, curPoint, 1);
    else if (curPoint.total < prevPoint.total) drop = buildEvent('drop', prevPoint, curPoint, -1);
  }

  // ---- kategori paling banyak: pada hari/kejadian puncak, fallback ke seluruh periode
  const periodCategories = categoryBreakdown(cur, null);
  const eventCategorySource = (ev) => {
    if (!ev) return null;
    if (ev.categories) return 'event';
    return periodCategories ? 'period' : null;
  };

  // ---- jendela data untuk grafik
  let trendWindow;
  if (period === 'daily') {
    const first = buckets[Math.max(0, idx - (DAILY_WINDOW - 1))];
    trendWindow = { from: first.key, to: bucket.key, granularity: 'daily', title: `Trend Harian (${DAILY_WINDOW} hari terakhir s.d. ${fmtDate(bucket.key, { year: false })})` };
  } else {
    const first = buckets[Math.max(0, idx - (TREND_WINDOW[period] - 1))];
    trendWindow = {
      from: first.snaps[0].date,
      to: bucket.snaps[bucket.snaps.length - 1].date,
      granularity: period,
      title: `Trend ${meta.adj} (${Math.min(idx + 1, TREND_WINDOW[period])} periode s.d. ${bucket.label})`,
    };
  }
  const subWindow = subGran
    ? { dates: bucket.snaps.map((s) => s.date), granularity: subGran, title: `Trend ${SUB_LABEL[subGran]} pada ${title}` }
    : null;

  // total (rata-rata) tiap periode di jendela grafik trend, untuk membaca arah beberapa periode terakhir
  const firstInWindow = Math.max(0, idx - ((period === 'daily' ? DAILY_WINDOW : TREND_WINDOW[period]) - 1));
  const trendSeries = buckets.slice(firstInWindow, idx + 1).map((b) => ({ label: b.label, total: mergeSnapshots(b.snaps).total }));

  const report = {
    period,
    shortLabel: period === 'daily' ? fmtDate(periodKey, { year: false }) : bucket.label,
    trendSeries,
    periodLabel: meta.adj,
    periodKey,
    title,
    start,
    end,
    rangeText: fmtRange(start, end),
    totalDays,
    daysWithData: bucket.snaps.length,
    ongoing,
    missingDates,
    detailed: cur.detailed,
    headline: {
      avg: cur.total,
      cellDown: cur.cellDown,
      siteDown: cur.siteDown,
      first: { date: firstSnap.date, total: firstSnap.total },
      last: { date: lastSnap.date, total: lastSnap.total },
      startToEnd: lastSnap.total - firstSnap.total,
      high: highLevel,
      low: lowLevel,
    },
    vsPrevious,
    subGranularity: subGran,
    subPoints,
    baselineUsed,
    rise,
    drop,
    riseCategorySource: eventCategorySource(rise),
    dropCategorySource: eventCategorySource(drop),
    periodCategories,
    trendWindow,
    subWindow,
  };
  report.points = buildPoints(report);
  return report;
}

// ---------------------------------------------------------------- narasi

function eventLabel(report, ev) {
  if (report.period === 'daily' || report.subGranularity === 'daily') return fmtDate(ev.to.dates[0], { year: false });
  return ev.to.label;
}

const UNIT_WORD = { daily: 'hari', weekly: 'minggu', monthly: 'bulan', quarter: 'quarter', annual: 'tahun' };

function trendDirectionText(series, unit) {
  if (series.length < 3) return null;
  const totals = series.map((x) => x.total);
  let dir = 0;
  let run = 0;
  for (let i = totals.length - 1; i > 0; i--) {
    const d = Math.sign(totals[i] - totals[i - 1]);
    if (d === 0) break;
    if (dir === 0) dir = d;
    if (d !== dir) break;
    run++;
  }
  if (run >= 2) return `${dir > 0 ? 'Naik' : 'Turun'} ${run} ${unit} berturut-turut.`;
  return 'Naik-turun, belum ada arah yang konsisten.';
}

function extremeText(series, unit) {
  if (series.length < 4) return null;
  const totals = series.map((x) => x.total);
  const cur = totals[totals.length - 1];
  if (cur === Math.max(...totals) && cur > Math.min(...totals)) return `Tertinggi dalam ${series.length} ${unit} terakhir.`;
  if (cur === Math.min(...totals) && cur < Math.max(...totals)) return `Terendah dalam ${series.length} ${unit} terakhir.`;
  return null;
}

function eventPoints(report, ev, src) {
  const x = ev.explain;
  const isRise = ev.kind === 'rise';
  const unit = UNIT_WORD[report.period] || 'periode';
  const lines = [];

  const list = x.nop || x.regional;
  if (list?.length) {
    const top = list[0];
    if (top.share >= 0.5) lines.push(`${top.label} mendominasi (${fmtPct(top.share)}).`);
    else if (list.length >= 3) {
      const top3 = list.slice(0, 3).reduce((sum, e) => sum + e.share, 0);
      lines.push(top3 >= 0.75 ? `3 teratas menyumbang ${fmtPct(top3)}.` : `Tersebar (3 teratas ${fmtPct(top3)}).`);
    }
  }
  if (!x.detailed) lines.push('Rincian NOP/kategori tidak tersimpan (data lama).');

  const cats = src === 'event' ? ev.categories : report.periodCategories;
  if (cats?.rc?.length) {
    const top = cats.rc[0];
    const scope = src === 'event' ? '' : ` (rata-rata ${unit})`;
    const unfilled = top.label === RC_UNDER_REVIEW ? ', RC belum diisi' : '';
    lines.push(`Kategori terbanyak${scope}: ${top.label} (${fmtPct(top.share)}${unfilled}).`);
  }
  const mover = src === 'event' ? x.rcMovers?.[0] : null;
  if (mover) lines.push(`Paling ${isRise ? 'bertambah' : 'berkurang'}: ${mover.label} (${fmtSigned(mover.delta)}).`);
  if (x.tipe.length) lines.push(`Tipe: ${describeMovers(x.tipe, { limit: 2 })}.`);

  const opposite = isRise ? x.grossDown : x.grossUp;
  if (opposite >= 0.5) lines.push(`Sebagian tertahan di area lain (${fmtSigned((isRise ? -1 : 1) * opposite)}).`);
  return lines;
}

/** Poin analisis singkat per bagian laporan (kalimat pendek, mengacu ke grafik). */
function buildPoints(report) {
  const h = report.headline;
  const unit = UNIT_WORD[report.period] || 'periode';
  const v = report.vsPrevious;
  const label = report.shortLabel;

  // --- grafik trend periode
  const trend = [];
  if (report.period === 'daily') {
    trend.push(`Backlog ${label}: ${fmtNum(h.avg)} tiket.`);
  } else {
    trend.push(
      v
        ? `Rata-rata ${label}: ${fmtNum(h.avg)}/hari (${fmtSigned(v.change)} vs ${v.prevLabel}, ${fmtSigned(v.pct * 100, 1)}%).`
        : `Rata-rata ${label}: ${fmtNum(h.avg)}/hari.`
    );
  }
  if (v && report.period === 'daily') trend.push(`${fmtSigned(v.change)} vs ${v.prevLabel} (${fmtSigned(v.pct * 100, 1)}%).`);
  const dirText = trendDirectionText(report.trendSeries, unit);
  if (dirText) trend.push(dirText);
  const extreme = extremeText(report.trendSeries, unit);
  if (extreme) trend.push(extreme);
  if (v?.explain) {
    const names = [describeMovers(v.explain.regional, { limit: 1 }), describeMovers(v.explain.nop, { limit: 1 })].filter(Boolean);
    if (names.length) trend.push(`Pendorong utama: ${names.join(', ')}.`);
  }

  // --- grafik trend rinci di dalam periode
  const daily = [];
  if (report.subPoints.length > 1) {
    daily.push(report.rise ? `Naik tertinggi: ${eventLabel(report, report.rise)}, ${fmtSigned(report.rise.change)} (${fmtNum(report.rise.from.total)} -> ${fmtNum(report.rise.to.total)}).` : 'Tidak ada kenaikan.');
    daily.push(report.drop ? `Turun terendah: ${eventLabel(report, report.drop)}, ${fmtSigned(report.drop.change)} (${fmtNum(report.drop.from.total)} -> ${fmtNum(report.drop.to.total)}).` : 'Tidak ada penurunan.');
    daily.push(`Puncak ${fmtNum(h.high.total)} (${fmtDate(h.high.date, { year: false })}), terendah ${fmtNum(h.low.total)} (${fmtDate(h.low.date, { year: false })}).`);
    daily.push(`Awal -> akhir ${unit}: ${fmtNum(h.first.total)} -> ${fmtNum(h.last.total)} (${fmtSigned(h.startToEnd)}).`);
  }

  const events = {};
  if (report.rise) events.rise = eventPoints(report, report.rise, report.riseCategorySource);
  if (report.drop) events.drop = eventPoints(report, report.drop, report.dropCategorySource);

  const notes = [];
  if (report.missingDates.length) notes.push(`${report.missingDates.length} tanggal tanpa snapshot (dilewati).`);
  if (report.ongoing) notes.push(`${unit.charAt(0).toUpperCase()}${unit.slice(1)} ini masih berjalan (${report.daysWithData}/${report.totalDays} hari).`);
  if (!report.detailed) notes.push('Sebagian data lama tanpa rincian NOP/kategori.');

  // Chip super singkat untuk PDF (ditaruh di bawah grafik).
  const chips = {
    trend: [dirText, extreme].filter(Boolean),
    daily:
      report.subPoints.length > 1
        ? [
            report.rise ? `Naik tertinggi ${eventLabel(report, report.rise)}: ${fmtSigned(report.rise.change)}` : null,
            report.drop ? `Turun terendah ${eventLabel(report, report.drop)}: ${fmtSigned(report.drop.change)}` : null,
            `Awal -> akhir: ${fmtNum(h.first.total)} -> ${fmtNum(h.last.total)} (${fmtSigned(h.startToEnd)})`,
          ].filter(Boolean)
        : [],
  };

  return { trend, daily, events, notes, chips };
}
