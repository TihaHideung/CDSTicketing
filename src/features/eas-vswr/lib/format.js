export function idNumber(n, digits = 2) {
  return n.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function idSigned(n, digits = 2) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${idNumber(Math.abs(n), digits)}`
}

export function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function isoToIdLabel(iso) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso + 'T00:00:00'))
}

export function isoToShortLabel(iso) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso + 'T00:00:00'))
}

// Formats a full ISO timestamp (Date.toISOString()) as "HH.mm WIB" —
// always converted to Indonesia Western Time (UTC+7) regardless of the
// viewer's own device/browser timezone, since that's the convention the
// reports use.
export function timestampToWIB(isoTimestamp) {
  if (!isoTimestamp) return ''
  const d = new Date(isoTimestamp)
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  const hh = String(wib.getUTCHours()).padStart(2, '0')
  const mm = String(wib.getUTCMinutes()).padStart(2, '0')
  return `${hh}.${mm} WIB`
}

// Selisih dalam poin persentase, mis. "+2,35 pp".
export function idPP(n, digits = 2) {
  return `${idSigned(n, digits)} pp`
}
