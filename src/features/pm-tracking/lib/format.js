export { todayISO, isoToIdLabel, isoToShortLabel, timestampToWIB, idNumber, idSigned } from '../../eas-vswr/lib/format.js'

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10" -> "Oktober - 2026"
export function periodLabel(period, fallbackISO) {
  const p = period || (fallbackISO ? fallbackISO.slice(0, 7) : '')
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  if (!m) return ''
  return `${MONTHS_ID[Number(m[2]) - 1]} - ${m[1]}`
}

// "2026-10" -> "Oct_2026" (dipakai untuk nama file export)
export function periodFileLabel(period, fallbackISO) {
  const p = period || (fallbackISO ? fallbackISO.slice(0, 7) : '')
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  if (!m) return 'PM'
  return `${MONTHS_EN_SHORT[Number(m[2]) - 1]}_${m[1]}`
}

// Persen dengan 2 desimal (titik), sama seperti teks summary EAS & VSWR.
export const fmtPct = (v) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : '-')
