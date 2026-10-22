export const weekdays = ['一', '二', '三', '四', '五', '六', '日']
function monthParts(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('无效月份')
  return month.split('-').map(Number)
}
export function shiftMonth(month: string, offset: number) {
  const [year, value] = monthParts(month)
  return new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7)
}
export function calendarCells(month: string): (string | null)[] {
  const [year, value] = monthParts(month)
  const leading = (new Date(Date.UTC(year, value - 1, 1)).getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate()
  const days = Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  return cells
}
export function monthLabel(month: string) { const [year, value] = monthParts(month); return `${year}年${value}月` }
export function dayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `${month}月${day}日 · 星期${['日', '一', '二', '三', '四', '五', '六'][weekday]}`
}
export function untilNextDay(serverTime: string, businessDate: string) {
  return Math.max(100, Date.parse(`${businessDate}T00:00:00+08:00`) + 86400000 - Date.parse(serverTime) + 100)
}
