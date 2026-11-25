import type { RowOf, Table } from './types'
import { CATEGORIES } from './types'
import { isDate } from './dates'
import { workMinutes } from './hours'
const whole = (n: unknown, min = 0) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min
export function validate<T extends Table>(table: T, row: RowOf[T]): string | null {
  if (table === 'clients') return (row as RowOf['clients']).name.trim() ? null : 'Enter a client name.'
  if (!isDate((row as { date: string }).date)) return 'Enter a valid date.'
  if (table === 'work') {
    const w = row as RowOf['work']
    if (!whole(w.break_min)) return 'Break must be whole minutes.'
    if (workMinutes(w.start, w.finish, w.break_min) === null) return 'Finish must be after start, with time left after the break.'
    if (!whole(w.rate_cents)) return 'Enter an hourly rate.'
  }
  if (table === 'trips') {
    const t = row as RowOf['trips']
    if (!whole(t.start_tenths) || !whole(t.end_tenths)) return 'Enter both odometer readings.'
    if (t.end_tenths <= t.start_tenths) return 'The end odometer must be higher than the start.'
  }
  if (table === 'fuel') {
    const f = row as RowOf['fuel']
    if (!whole(f.litres_ml, 1)) return 'Enter the litres.'
    if (!whole(f.cost_cents, 1)) return 'Enter the price per litre or the total cost.'
    if (f.odo_tenths !== null && !whole(f.odo_tenths)) return 'Check the odometer reading.'
  }
  if (table === 'receipts') {
    const r = row as RowOf['receipts']
    if (!r.vendor.trim()) return 'Enter the vendor.'
    if (!whole(r.amount_cents, 1)) return 'Enter the amount.'
    if (!CATEGORIES.includes(r.category)) return 'Choose a category.'
    if (!whole(r.business_pct) || r.business_pct > 100) return 'Business use must be 0 to 100%.'
  }
  return null
}
