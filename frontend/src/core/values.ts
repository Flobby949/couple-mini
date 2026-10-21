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
export function parseStock(raw: string) { return /^(0|[1-9][0-9]*)$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) <= 1_000_000 ? Number(raw) : null }
export function beijingTimeSeconds(raw: string) { return new Date(new Date(raw).getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') }
export function beijingDeadline(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const raw = `${date}T${time}:00+08:00`, parsed = Date.parse(raw)
  return Number.isFinite(parsed) && beijingTimeSeconds(raw) === `${date} ${time}:00` ? raw : null
}
