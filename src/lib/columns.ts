import { CATEGORIES, type Data, type Fuel, type Invoice, type Receipt, type Trip, type Work } from './types'
import type { Cell } from './csv'
import { earningsOf, minutesOf } from './hours'
import { effectiveStatus, totals, workStatus } from './invoices'
import { parseScaled } from './money'

export type ColType = 'text' | 'date' | 'time' | 'number' | 'money' | 'bool' | 'select'
export type Col<R> = {
  label: string; type: ColType; value: (r: R, d: Data, today: string) => Cell
  /** Returns the changed row, or null when the text cannot be read. Absent means calculated. */
  set?: (r: R, text: string) => R | null
  options?: (d: Data) => [string, string][]
  /** Raw value for the editor when it differs from what is shown. */
  raw?: (r: R) => string
}
type KeysOf<R, V> = { [K in keyof R]: R[K] extends V ? K : never }[keyof R]
function kit<R>() {
  return {
    text: (k: KeysOf<R, string>, label: string, type: ColType = 'text'): Col<R> => ({ label, type, value: r => r[k] as string, set: (r, t) => ({ ...r, [k]: t }) }),
    num: (k: KeysOf<R, number | null>, label: string, places: number, type: ColType = 'number', optional = false): Col<R> => ({
      label, type,
      value: r => (r[k] === null ? null : (r[k] as number) / 10 ** places),
      set: (r, t) => { if (optional && !t.trim()) return { ...r, [k]: null }; const v = parseScaled(t, places); return v === null ? null : { ...r, [k]: v } }
    }),
    bool: (k: KeysOf<R, boolean>, label: string, yes = 'Yes', no = 'No'): Col<R> => ({
      label, type: 'select', value: r => (r[k] ? yes : no), raw: r => (r[k] ? '1' : '0'), set: (r, t) => ({ ...r, [k]: t === '1' }), options: () => [['1', yes], ['0', no]]
    })
  }
}
const w = kit<Work>(), t = kit<Trip>(), f = kit<Fuel>(), r = kit<Receipt>()
const clientName = (d: Data, id: string | null) => d.clients.find(c => c.id === id)?.name ?? ''

export const workCols: Col<Work>[] = [
  w.text('date', 'Date', 'date'), w.text('start', 'Start', 'time'), w.text('finish', 'Finish', 'time'), w.num('break_min', 'Break (min)', 0),
  { label: 'Hours', type: 'number', value: x => Math.round((minutesOf(x) / 60) * 100) / 100 },
  { label: 'Client', type: 'select', value: (x, d) => clientName(d, x.client_id), raw: x => x.client_id ?? '', set: (x, v) => ({ ...x, client_id: v || null }), options: d => [['', 'No client'], ...d.clients.map(c => [c.id, c.name] as [string, string])] },
  w.text('site', 'Site'), w.num('rate_cents', 'Rate', 2, 'money'),
  { label: 'Earnings', type: 'money', value: x => earningsOf(x) / 100 },
  { label: 'Status', type: 'text', value: (x, d) => workStatus(x, d.invoices) },
  w.text('notes', 'Notes')
]
export const tripCols: Col<Trip>[] = [
  t.text('date', 'Date', 'date'), t.num('start_tenths', 'Start odometer', 1), t.num('end_tenths', 'End odometer', 1),
  { label: 'Distance (km)', type: 'number', value: x => (x.end_tenths - x.start_tenths) / 10 },
  t.text('purpose', 'Purpose / location'), t.bool('business', 'Use', 'Business', 'Personal')
]
export const fuelCols: Col<Fuel>[] = [
  f.text('date', 'Date', 'date'), f.num('litres_ml', 'Litres', 3),
  { label: 'Price per litre', type: 'number', value: x => (x.litres_ml ? Math.round((x.cost_cents * 100000) / x.litres_ml) / 10000 : 0) },
  f.num('cost_cents', 'Total cost', 2, 'money'), f.num('odo_tenths', 'Odometer', 1, 'number', true),
  { label: 'Receipt', type: 'text', value: (x, d) => d.receipts.find(y => y.id === x.receipt_id)?.vendor ?? '' }
]
export const receiptCols: Col<Receipt>[] = [
  r.text('date', 'Date', 'date'), r.text('vendor', 'Vendor'), r.num('amount_cents', 'Amount', 2, 'money'),
  { label: 'Category', type: 'select', value: x => x.category, set: (x, v) => ({ ...x, category: v as Receipt['category'] }), options: () => CATEGORIES.map(c => [c, c]) },
  r.bool('gst_included', 'GST included'), r.num('business_pct', 'Business %', 0), r.bool('is_vehicle', 'Vehicle cost'), r.bool('is_asset', 'Asset'), r.text('notes', 'Notes')
]
export const invoiceCols: Col<Invoice>[] = [
  { label: 'Number', type: 'text', value: x => x.number },
  { label: 'Client', type: 'text', value: x => x.bill_to?.name ?? '' },
  { label: 'Status', type: 'text', value: (x, _d, today) => { const s = effectiveStatus(x, today); return s[0].toUpperCase() + s.slice(1) } },
  { label: 'Issued', type: 'date', value: x => x.issue_date, set: (x, v) => ({ ...x, issue_date: v }) },
  { label: 'Due', type: 'date', value: x => x.due_date, set: (x, v) => ({ ...x, due_date: v }) },
  { label: 'Paid on', type: 'date', value: x => x.paid_date },
  { label: 'Subtotal', type: 'money', value: x => totals(x).subtotal / 100 },
  { label: 'GST', type: 'money', value: x => totals(x).gst / 100 },
  { label: 'Total', type: 'money', value: x => totals(x).total / 100 },
  { label: 'Notes', type: 'text', value: x => x.notes, set: (x, v) => ({ ...x, notes: v }) }
]
