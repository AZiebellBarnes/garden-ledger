import type { Day, Invoice, Work } from './types'
import { dailyTotals } from './hours'
import { addDays, monday } from './dates'

/** What a contractor may see of a work entry. `invoice` is absent until the database supplies it. */
export type SharedRow = Pick<Work, 'id' | 'date' | 'start' | 'finish' | 'break_min' | 'site' | 'rate_cents'> & { invoice?: string | null }
export type SharedDay = Day & { jobs: SharedRow[] }
export type SharedWeek = { start: string; end: string; minutes: number; cents: number; days: SharedDay[] }

export function dayList(rows: SharedRow[], from: string, to: string): SharedDay[] {
  const shown = rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to))
  return dailyTotals(shown).reverse().map(d => ({ ...d, jobs: shown.filter(r => r.date === d.date).sort((a, b) => a.start.localeCompare(b.start)) }))
}
export function weekList(rows: SharedRow[], from: string, to: string): SharedWeek[] {
  const weeks: SharedWeek[] = []
  for (const d of dayList(rows, from, to)) {
    const start = monday(d.date)
    let w = weeks.at(-1)
    if (w?.start !== start) weeks.push((w = { start, end: addDays(start, 6), minutes: 0, cents: 0, days: [] }))
    w.minutes += d.minutes; w.cents += d.cents; w.days.push(d)
  }
  return weeks
}
/** A draft has not gone out, so its work is not invoiced yet. */
export const sharedInvoice = (w: Pick<Work, 'invoice_id'>, list: Invoice[]) => list.find(i => i.id === w.invoice_id && i.status !== 'draft')?.number ?? null
export const invoiceLabel = (n?: string | null) => (n === undefined ? '' : n ? `Invoiced, ${n}` : 'Not yet invoiced')
