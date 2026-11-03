// Logika tabel "Report Daily EAS" (Extended & Quickwin) seperti sheet Report Extended / Report Quickwin
// di Excel Report Daily:
//
//   Baseline (site belum validasi) : P1 | P2-P5 | P6 | P7 | Total   <- dari File EAS (Prio Actual) hari ini
//   Target D-1
//   Ach Validasi                   : P1 | P2-P5 | P6 | P7 | Total   <- dari Upload Data Streamlit
//   % Daily Ach                    : Total Ach Validasi / Target D-1
//   Ach Total                      : Baseline (total site) | Done | Ach% | Sisa Target
//
// Alur harian (urutan penting):
//   1. ACH VALIDASI dulu: site yang Date Revisi-nya H-1 dan sudah Done di Streamlit dicocokkan dengan
//      BASELINE TERAKHIR yang tersimpan (upload sebelumnya) untuk tahu prioritasnya SEBELUM berubah ke Done.
//   2. Setelah itu BASELINE diperbarui dari File EAS hari ini (site yang masih terbuka per Prio Actual)
//      dan disimpan untuk dipakai upload berikutnya.
//
// Done = Total site - Baseline hari ini (Prio Actual pagi ini sudah memuat site yang selesai kemarin,
// jadi Ach Validasi TIDAK ditambahkan lagi ke Done supaya tidak dobel).

export const CATEGORIES = [
  { key: 'extended', label: 'Extended' },
  { key: 'quickwin', label: 'Quickwin' },
]

export const BUCKETS = ['P1', 'P2-P5', 'P6', 'P7']
export const BUCKET_LABELS = { P1: 'P1', 'P2-P5': 'P2 - P5', P6: 'P6', P7: 'P7' }

// Target D-1 per NOP, diambil apa adanya dari template Report Daily EAS
// (kolom "Target D-1"). Ubah angkanya di sini kalau target berubah.
export const DEFAULT_TARGETS = {
  extended: {
    'NOP BENGKULU': 2, 'NOP JAMBI': 3, 'NOP LAMPUNG': 5, 'NOP PALEMBANG': 7, 'NOP PANGKAL PINANG': 3,
    'NOP BATAM': 3, 'NOP BUKITTINGGI': 3, 'NOP DUMAI': 5, 'NOP PADANG': 3, 'NOP PEKANBARU': 5,
    'NOP BANDA ACEH': 2, 'NOP BINJAI': 3, 'NOP MEDAN': 7, 'NOP PADANG SIDEMPUAN': 1,
    'NOP PEMATANG SIANTAR': 3, 'NOP RANTAU PRAPAT': 2,
  },
  quickwin: {
    'NOP BENGKULU': 1, 'NOP JAMBI': 1, 'NOP LAMPUNG': 1, 'NOP PALEMBANG': 1, 'NOP PANGKAL PINANG': 1,
    'NOP BATAM': 1, 'NOP BUKITTINGGI': 1, 'NOP DUMAI': 1, 'NOP PADANG': 1, 'NOP PEKANBARU': 1,
    'NOP BANDA ACEH': 1, 'NOP BINJAI': 1, 'NOP MEDAN': 1, 'NOP PADANG SIDEMPUAN': 1,
    'NOP PEMATANG SIANTAR': 1, 'NOP RANTAU PRAPAT': 1,
  },
}

export const DONE_RANK = 99

export function nopKey(name) {
  return (name ?? '').toString().trim().replace(/\s+/g, ' ').toUpperCase()
}

// "R02_Sumbagsel" -> "SUMBAGSEL"
export function normalizeRegional(name) {
  return (name ?? '').toString().replace(/^R\d+_/i, '').trim().toUpperCase()
}

export function normalizeCategory(value) {
  const v = (value ?? '').toString().trim().toUpperCase()
  if (v === 'EXTENDED') return 'extended'
  if (v === 'QUICKWIN') return 'quickwin'
  return null
}

/**
 * "Done" -> DONE_RANK, "P3" -> 3, "P3+P7" -> 3 (diambil yang paling kecil, sama seperti
 * baris pertama pada VLOOKUP), selain itu null.
 */
export function priorityRank(value) {
  const v = (value ?? '').toString().trim().toUpperCase()
  if (!v) return null
  if (v === 'DONE') return DONE_RANK
  const nums = [...v.matchAll(/P\s*([1-7])/g)].map((m) => Number(m[1]))
  return nums.length ? Math.min(...nums) : null
}

export function bucketOfRank(rank) {
  if (rank === 1) return 'P1'
  if (rank >= 2 && rank <= 5) return 'P2-P5'
  if (rank === 6) return 'P6'
  if (rank === 7) return 'P7'
  return null
}

const emptyBuckets = () => ({ P1: 0, 'P2-P5': 0, P6: 0, P7: 0 })

function bucketTotal(b) {
  return BUCKETS.reduce((s, k) => s + (b[k] || 0), 0)
}

// Satu baris tabel (NOP / regional / area) dari angka mentah.
function finalizeRow({ label, total, baseline, ach, target }) {
  const baselineTotal = bucketTotal(baseline)
  const achTotal = bucketTotal(ach)
  const done = total - baselineTotal
  return {
    label,
    baseline: { ...baseline, total: baselineTotal },
    target,
    ach: { ...ach, total: achTotal },
    dailyAchPct: target > 0 ? (achTotal / target) * 100 : null,
    total,
    done,
    donePct: total > 0 ? (done / total) * 100 : null,
    sisa: total - done,
  }
}

function sumRaw(items) {
  const acc = { total: 0, baseline: emptyBuckets(), ach: emptyBuckets(), target: 0 }
  for (const it of items) {
    acc.total += it.total
    acc.target += it.target
    for (const k of BUCKETS) {
      acc.baseline[k] += it.baseline[k] || 0
      acc.ach[k] += it.ach[k] || 0
    }
  }
  return acc
}

/** Peta "SITEID|kategori" -> { nopKey, nop, regional, rank } dari daftar site terbuka yang disimpan. */
export function indexBaselineSites(easSites) {
  const map = new Map()
  for (const [key, n] of Object.entries(easSites || {})) {
    for (const cat of CATEGORIES) {
      for (const [rank, ids] of Object.entries(n[cat.key] || {})) {
        for (const id of ids) {
          map.set(`${id}|${cat.key}`, { nopKey: key, nop: n.nop, regional: n.regional, rank: Number(rank) })
        }
      }
    }
  }
  return map
}

/**
 * ACH VALIDASI: untuk tiap site yang sudah Done di Streamlit dan Date Revisi-nya H-1, cari
 * prioritasnya di baseline TERAKHIR yang tersimpan (sebelum berubah ke Done).
 * Site yang tidak ada di baseline itu (mis. sudah Done sejak lama) dilewati.
 *
 * @param revisedDone [{ site, cat }]  hasil parseEasDetail
 * @param prevSites   easSites dari record baseline sebelumnya (atau null kalau belum ada)
 * @returns { byNop, matched, unmatched }
 */
export function computeAch({ revisedDone, prevSites }) {
  const byNop = {}
  let matched = 0
  let unmatched = 0
  if (!prevSites) return { byNop, matched, unmatched: revisedDone.length }
  const index = indexBaselineSites(prevSites)
  for (const r of revisedDone) {
    const hit = index.get(`${r.site}|${r.cat}`)
    const bucket = hit && bucketOfRank(hit.rank)
    if (!bucket) {
      unmatched += 1
      continue
    }
    const n = (byNop[hit.nopKey] ||= {
      nop: hit.nop,
      regional: hit.regional,
      extended: emptyBuckets(),
      quickwin: emptyBuckets(),
    })
    n[r.cat][bucket] += 1
    matched += 1
  }
  return { byNop, matched, unmatched }
}

/**
 * @param baseline  [{ regional, nop, extended:{ total, notDone:{P1,'P2-P5',P6,P7} }, quickwin:{..} }]  (File EAS hari ini)
 * @param ach       { [nopKey]: { nop, regional, extended:{..buckets}, quickwin:{..} } }                 (computeAch)
 * @returns { extended: Report, quickwin: Report }  Report = { area, regionals: [{ regional, ...row, nops: [row] }] }
 */
export function buildEasReport({ baseline, ach = {}, targets = DEFAULT_TARGETS }) {
  const out = {}

  for (const cat of CATEGORIES) {
    const nopMap = new Map() // nopKey -> { regional, nop, total, baseline, ach }

    for (const n of baseline || []) {
      const c = n[cat.key]
      if (!c) continue
      nopMap.set(nopKey(n.nop), {
        regional: normalizeRegional(n.regional),
        nop: n.nop,
        total: c.total || 0,
        baseline: { ...emptyBuckets(), ...(c.notDone || {}) },
        ach: emptyBuckets(),
      })
    }
    for (const [key, r] of Object.entries(ach)) {
      const c = r[cat.key]
      if (!c) continue
      if (!nopMap.has(key)) {
        nopMap.set(key, {
          regional: normalizeRegional(r.regional),
          nop: r.nop,
          total: 0,
          baseline: emptyBuckets(),
          ach: emptyBuckets(),
        })
      }
      const entry = nopMap.get(key)
      for (const k of BUCKETS) entry.ach[k] += c[k] || 0
    }

    const byRegional = new Map()
    for (const [key, v] of nopMap) {
      const target = targets?.[cat.key]?.[key] ?? 0
      if (!byRegional.has(v.regional)) byRegional.set(v.regional, [])
      byRegional.get(v.regional).push({ key, ...v, target })
    }

    const regionals = [...byRegional.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((regional) => {
        const nops = byRegional.get(regional).sort((a, b) => a.nop.localeCompare(b.nop))
        const nopRows = nops.map((n) => finalizeRow({ ...n, label: n.nop }))
        return { regional, ...finalizeRow({ ...sumRaw(nops), label: regional }), nops: nopRows }
      })

    const all = [...byRegional.values()].flat()
    out[cat.key] = { area: finalizeRow({ ...sumRaw(all), label: 'Area 1' }), regionals }
  }
  return out
}

export function revisiDateOf(reportDateISO) {
  // Tanggal report - 1 hari (H-1), dihitung tanpa timezone supaya tidak bergeser.
  const [y, m, d] = reportDateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - 1))
  return dt.toISOString().slice(0, 10)
}
