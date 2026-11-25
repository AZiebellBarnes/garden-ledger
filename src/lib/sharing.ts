import type { Day, Work } from './types'
import { dailyTotals } from './hours'

/** What a contractor may see of a work entry. */
export type SharedRow = Pick<Work, 'id' | 'date' | 'start' | 'finish' | 'break_min' | 'site' | 'rate_cents'>
export type SharedDay = Day & { jobs: SharedRow[] }
export function dayList(rows: SharedRow[], from: string, to: string): SharedDay[] {
  const shown = rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to))
  return dailyTotals(shown).reverse().map(d => ({ ...d, jobs: shown.filter(r => r.date === d.date).sort((a, b) => a.start.localeCompare(b.start)) }))
}
