import { expect, test } from 'vitest'
import { parseCents, plain, parseScaled } from '../src/lib/money'
import { workMinutes, earningsCents, dailyTotals } from '../src/lib/hours'
import { nextNumber, effectiveStatus, workStatus, totals, buildWorkItems } from '../src/lib/invoices'
import { fyOf, fyRange, addDays } from '../src/lib/dates'
import { toCsv } from '../src/lib/csv'
import { validate } from '../src/lib/validate'
import { defaultSettings, type Work, type Invoice } from '../src/lib/types'

const w = (o: Partial<Work> = {}): Work => ({ id: 'a', date: '2026-11-16', start: '07:00', finish: '16:30', break_min: 30, client_id: 'c', site: '', rate_cents: 3000, notes: '', invoice_id: null, ...o })
const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i', number: 'INV-001', client_id: 'c', status: 'sent', issue_date: '2026-11-16', due_date: '2026-11-21', sent_date: null, paid_date: null, gst: false, items: [], daily: [], supplier: null, bill_to: null, notes: '', ...o })

test('money parses exactly and rejects junk', () => {
  expect(parseCents('1,250.05')).toBe(125005)
  expect(parseCents('$30')).toBe(3000)
  expect(parseCents('1.005')).toBeNull()
  expect(parseCents('abc')).toBeNull()
  expect(parseCents('')).toBeNull()
})
test('money prints like the reference invoices', () => {
  expect(plain(27000)).toBe('270.00')
  expect(plain(125000)).toBe('1,250.00')
  expect(plain(-5)).toBe('-0.05')
})
test('scaled numbers avoid float drift', () => {
  expect(parseScaled('45.678', 3)).toBe(45678)
  expect(parseScaled('1234.5', 1)).toBe(12345)
  expect(parseScaled('1.23', 1)).toBeNull()
})
test('hours subtract the break', () => expect(workMinutes('07:00', '16:30', 30)).toBe(540))
test('finish before start is invalid', () => expect(workMinutes('16:00', '07:00', 0)).toBeNull())
test('break as long as the shift is invalid', () => expect(workMinutes('07:00', '08:00', 60)).toBeNull())
test('earnings are hours times rate', () => {
  expect(earningsCents(540, 3000)).toBe(27000)
  expect(earningsCents(1335, 3000)).toBe(66750)
})
test('daily totals group jobs by date in order', () =>
  expect(dailyTotals([w({ date: '2026-11-17' }), w({ id: 'b' }), w({ id: 'c', finish: '08:30' })]).map(d => [d.date, d.minutes, d.cents]))
    .toEqual([['2026-11-16', 600, 30000], ['2026-11-17', 540, 27000]]))
test('work becomes one Gardening services line', () =>
  expect(buildWorkItems([w(), w({ id: 'b', date: '2026-11-17' })])).toEqual([{ description: 'Gardening services', amount_cents: 54000, source: 'work' }]))
test('no work gives no line', () => expect(buildWorkItems([])).toEqual([]))
test('next number follows the highest, not the count', () => {
  expect(nextNumber([inv(), inv({ number: 'INV-007' }), inv({ number: 'X-99' })], 'INV-', 3)).toBe('INV-008')
  expect(nextNumber([], 'INV-', 3)).toBe('INV-001')
})
test('due date crosses months', () => expect(addDays('2026-11-28', 5)).toBe('2026-12-03'))
test('overdue only after the due date', () => {
  expect(effectiveStatus(inv(), '2026-11-21')).toBe('sent')
  expect(effectiveStatus(inv(), '2026-11-22')).toBe('overdue')
  expect(effectiveStatus(inv({ status: 'paid' }), '2027-01-01')).toBe('paid')
})
test('work status follows its invoice', () => {
  expect(workStatus(w(), [])).toBe('Unbilled')
  expect(workStatus(w({ invoice_id: 'i' }), [inv({ status: 'draft' })])).toBe('Invoiced')
  expect(workStatus(w({ invoice_id: 'i' }), [inv({ status: 'paid' })])).toBe('Paid')
})
test('GST is added only when registered', () => {
  const i = inv({ items: [{ description: 'x', amount_cents: 10005 }] })
  expect(totals(i)).toEqual({ subtotal: 10005, gst: 0, total: 10005 })
  expect(totals({ ...i, gst: true })).toEqual({ subtotal: 10005, gst: 1001, total: 11006 })
})
test('financial year boundaries', () => {
  expect(fyOf('2026-06-30')).toBe('2025-26')
  expect(fyOf('2026-07-01')).toBe('2026-27')
  expect(fyRange('2026-27')).toEqual(['2026-07-01', '2027-06-30'])
})
test('csv quotes and defuses formulas', () =>
  expect(toCsv([['a', '=1+1', 'x"y,z', -5]])).toBe('a,\'=1+1,"x""y,z",-5'))
test('validation blocks bad rows', () => {
  expect(validate('work', w())).toBeNull()
  expect(validate('work', w({ finish: '06:00' }))).toMatch(/finish/i)
  expect(validate('work', w({ date: '2026-02-31' }))).toMatch(/date/i)
  expect(validate('trips', { id: 't', date: '2026-11-16', start_tenths: 100, end_tenths: 90, purpose: '', business: true })).toMatch(/odometer/i)
  expect(validate('receipts', { id: 'r', date: '2026-11-16', vendor: '', amount_cents: 100, category: 'Fuel', gst_included: true, notes: '', file: null, thumb: null, mime: null, business_pct: 100, is_asset: false, is_vehicle: true })).toMatch(/vendor/i)
})
test('settings defaults hold no personal details', () => {
  expect(defaultSettings().default_rate_cents).toBe(3000)
  expect(defaultSettings().business.abn).toBe('')
})
