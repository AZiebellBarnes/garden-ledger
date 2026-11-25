import { expect, test } from 'vitest'
import { bracketTax, lito, medicare, helpRepayment, ratesFor, summarise } from '../src/lib/tax'
import { emptyData, type Data, type Receipt, type Invoice } from '../src/lib/types'

const R = ratesFor('2026-27', {}).rates
const $ = (n: number) => Math.round(n * 100)
const T = '2026-11-25'
const inv = (id: string, issue: string, cents: number, o: Partial<Invoice> = {}): Invoice => ({ id, number: id, client_id: null, status: 'sent', issue_date: issue, due_date: issue, sent_date: null, paid_date: null, gst: false, items: [{ description: 'x', amount_cents: cents }], daily: [], supplier: null, bill_to: null, notes: '', ...o })
let n = 0
const rec = (o: Partial<Receipt>): Receipt => ({ id: `r${n++}`, date: '2026-11-18', vendor: 'v', amount_cents: 11000, category: 'Supplies', gst_included: true, notes: '', file: null, thumb: null, mime: null, business_pct: 100, is_asset: false, is_vehicle: false, ...o })
const trip = (id: string, a: number, b: number, business: boolean) => ({ id, date: T, start_tenths: a, end_tenths: b, purpose: '', business })
const base = (): Data => {
  const d = emptyData()
  d.invoices = [inv('a', '2026-11-16', 27000, { status: 'paid' }), inv('b', '2026-11-25', 66750), inv('c', '2026-11-25', 99900, { status: 'draft' }), inv('old', '2026-06-30', 50000)]
  return d
}

test('2026-27 brackets', () => {
  expect(bracketTax($(18200), R)).toBe(0)
  expect(bracketTax($(45000), R)).toBe($(4020))
  expect(bracketTax($(135000), R)).toBe($(31020))
  expect(bracketTax($(190000), R)).toBe($(51370))
  expect(bracketTax($(200000), R)).toBe($(55870))
})
test('low income offset tapers', () => {
  expect(lito($(30000))).toBe($(700))
  expect(lito($(45000))).toBe($(325))
  expect(lito($(66667))).toBe(0)
})
test('medicare shades in', () => {
  expect(medicare($(28011), R)).toBe(0)
  expect(medicare($(29011), R)).toBe($(100))
  expect(medicare($(50000), R)).toBe($(1000))
})
test('HELP is marginal, then whole-income', () => {
  expect(helpRepayment($(69528), R)).toBe(0)
  expect(helpRepayment($(79528), R)).toBe($(1500))
  expect(helpRepayment($(129717), R)).toBe($(9028.35))
  expect(helpRepayment($(200000), R)).toBe($(20000))
})
test('unknown year falls back and says so', () => expect(ratesFor('2031-32', {}).estimated).toBe(true))
test('income toggles, and drafts never count', () => {
  const d = base()
  expect(summarise(d, '2026-27', T).income).toBe(93750)
  d.settings.income_basis = 'paid'
  expect(summarise(d, '2026-27', T).income).toBe(27000)
})
test('paid basis uses the payment date year', () => {
  const d = base()
  d.settings.income_basis = 'paid'
  d.invoices = [inv('x', '2026-06-29', 50000, { status: 'paid', paid_date: '2026-07-02' })]
  expect(summarise(d, '2026-27', T).income).toBe(50000)
})
test('cents per km excludes vehicle receipts and fuel', () => {
  const d = base()
  d.receipts = [rec({}), rec({ is_vehicle: true, category: 'Fuel' }), rec({ is_asset: true })]
  d.fuel = [{ id: 'f', date: T, litres_ml: 40000, cost_cents: 8000, odo_tenths: null, receipt_id: null }]
  d.trips = [trip('t', 0, 1000, true), trip('u', 1000, 2000, false)]
  const s = summarise(d, '2026-27', T)
  expect(s.vehicleDeduction).toBe(9100)
  expect(s.otherDeductions).toBe(11000)
  expect(s.deductions).toBe(20100)
  expect(s.assetsExcluded).toBe(11000)
})
test('cents per km stops at 5000 km', () => {
  const d = base()
  d.trips = [trip('t', 0, 90000, true)]
  expect(summarise(d, '2026-27', T).vehicleDeduction).toBe(455000)
})
test('logbook counts a linked fuel fill once', () => {
  const d = base()
  d.settings.by_fy['2026-27'] = { gross_cents: 0, withheld_cents: 0, method: 'logbook', logbook_pct: 50 }
  d.receipts = [rec({ id: 'r', is_vehicle: true, amount_cents: 8000 })]
  d.fuel = [{ id: 'f', date: T, litres_ml: 40000, cost_cents: 8000, odo_tenths: null, receipt_id: 'r' }, { id: 'g', date: T, litres_ml: 1, cost_cents: 2000, odo_tenths: null, receipt_id: null }]
  expect(summarise(d, '2026-27', T).vehicleDeduction).toBe(5000)
})
test('weekly average starts at the first income, so a new business is not diluted', () => {
  const s = summarise(base(), '2026-27', T)
  expect(s.weeks).toBeCloseTo(10 / 7, 3)
  expect(s.avgWeekly).toBe(65625)
})
test('wages push the rate up, and withheld tax is credited', () => {
  const d = base()
  const a = summarise(d, '2026-27', T)
  const wages = (w: number) => { d.settings.by_fy['2026-27'] = { gross_cents: $(20000), withheld_cents: w, method: 'cents_per_km', logbook_pct: 0 } }
  wages(0)
  const b = summarise(d, '2026-27', T)
  wages($(1000))
  const c = summarise(d, '2026-27', T)
  expect(b.owed).toBeGreaterThan(a.owed)
  expect(b.owed - c.owed).toBe($(1000))
  expect(c.weeklyTax).toBeLessThan(b.weeklyTax)
})
test('manual buffer replaces the estimated tax', () => {
  const d = base()
  d.settings.buffer_on = true
  d.settings.buffer_pct = 25
  expect(summarise(d, '2026-27', T).weeklyTax).toBe(16406)
})
test('super deducts within the cap but is added back for HELP', () => {
  const d = base()
  d.settings.super_on = true
  d.settings.super_pct = 100
  const s = summarise(d, '2026-27', T)
  expect(s.superDeduction).toBeLessThanOrEqual($(32500))
  expect(s.superDeduction).toBeGreaterThan(0)
  expect(s.repaymentIncome - s.projectedTaxable).toBe(s.superDeduction)
})
test('GST: income excludes it, credits reduce it, deductions are ex-GST', () => {
  const d = base()
  d.settings.gst_registered = true
  d.invoices = [inv('g', '2026-11-16', 100000, { gst: true })]
  d.receipts = [rec({})]
  const s = summarise(d, '2026-27', T)
  expect(s.income).toBe(100000)
  expect(s.gstCollected).toBe(10000)
  expect(s.gstCredits).toBe(1000)
  expect(s.otherDeductions).toBe(10000)
  expect(s.weeklyGst).toBe(6300)
})
test('no income gives zeros rather than NaN', () => {
  const s = summarise(emptyData(), '2026-27', T)
  expect(s.weeklyTotal).toBe(0)
  expect(Number.isFinite(s.owed)).toBe(true)
})
test('a one-off purchase is not multiplied across the rest of the year', () => {
  const d = base()
  d.receipts = [rec({ amount_cents: 50000 })]
  expect(summarise(d, '2026-27', T).projectedDeductions).toBe(50000)
})
