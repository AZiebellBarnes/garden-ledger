import type { Work, Day } from './types'
const mins = (t: string) => { const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN }
export function workMinutes(start: string, finish: string, brk: number): number | null {
  const n = mins(finish) - mins(start) - brk
  return Number.isFinite(n) && brk >= 0 && n > 0 ? n : null
}
export const minutesOf = (w: Work) => workMinutes(w.start, w.finish, w.break_min) ?? 0
export const earningsCents = (m: number, rate: number) => Math.round((m * rate) / 60)
export const earningsOf = (w: Work) => earningsCents(minutesOf(w), w.rate_cents)
export const hrs = (m: number) => (m / 60).toFixed(2).replace(/\.?0+$/, '')
export function dailyTotals(rows: Work[]): Day[] {
  const by = new Map<string, Day>()
  for (const w of rows) {
    const d = by.get(w.date) ?? { date: w.date, minutes: 0, cents: 0 }
    d.minutes += minutesOf(w); d.cents += earningsOf(w)
    by.set(w.date, d)
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}
