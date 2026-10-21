export function parsePoints(raw: string): number | null {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(raw)) return null
  const [whole, fraction] = raw.split('.')
  let value = Number(whole)
  if (!Number.isSafeInteger(value) || value > 1_000_000_000) return null
  if (fraction && fraction[0] >= '5') value++
  return value <= 1_000_000_000 ? value : null
}
export function beijingTime(raw: string) {
  const date = new Date(new Date(raw).getTime() + 8 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 16).replace('T', ' ')
}
