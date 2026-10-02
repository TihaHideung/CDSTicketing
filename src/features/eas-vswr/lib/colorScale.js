const RED = [248, 105, 107] // #F8696B
const YELLOW = [255, 235, 132] // #FFEB84
const GREEN = [99, 190, 123] // #63BE7B

function lerp(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t))
}

// Excel's default 3-color-scale conditional formatting colors a cell based
// on where its value falls *within that column's own min/max*, not on a
// fixed 0-100 scale. This matches that: min -> red, midpoint -> yellow,
// max -> green.
function relativeHeatRgb(value, min, max) {
  if (value == null || !Number.isFinite(value)) return null
  if (max === min) return GREEN // flat column (all equal) reads as "good"
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return t <= 0.5 ? lerp(RED, YELLOW, t / 0.5) : lerp(YELLOW, GREEN, (t - 0.5) / 0.5)
}

export function relativeHeatColorCss(value, min, max) {
  const rgb = relativeHeatRgb(value, min, max)
  if (!rgb) return null
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

export function relativeHeatColorHexARGB(value, min, max) {
  const rgb = relativeHeatRgb(value, min, max)
  if (!rgb) return null
  const hex = (n) => n.toString(16).padStart(2, '0').toUpperCase()
  return `FF${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`
}

// Computes {min, max} for a list of numeric values, ignoring null/NaN.
export function columnRange(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(v))
  if (!nums.length) return { min: 0, max: 0 }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}
