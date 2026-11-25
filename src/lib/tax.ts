import type { Data, Rates, YearSettings } from './types'
import { defaultYear } from './types'
import { addDays, daysBetween, fyRange, within } from './dates'
import { totals } from './invoices'

// All amounts in cents except cents_per_km.
const R = (second: number, medicare: number, help: [number, number, number], km: number, cap: number): Rates => ({
  brackets: [[18200_00, second], [45000_00, 30], [135000_00, 37], [190000_00, 45]],
  medicare_threshold: medicare * 100, help: { from: help[0] * 100, mid: help[1] * 100, top: help[2] * 100 }, cents_per_km: km, super_cap: cap * 100
})
export const BUILT_IN: Record<string, Rates> = {
  '2025-26': R(16, 28011, [67000, 125000, 179285], 88, 30000),
  '2026-27': R(15, 28011, [69528, 129717, 186050], 91, 32500)
}
export function ratesFor(fy: string, own: Record<string, Rates>): { rates: Rates; estimated: boolean } {
  const exact = own[fy] ?? BUILT_IN[fy]
  return exact ? { rates: exact, estimated: false } : { rates: BUILT_IN[fy < '2025-26' ? '2025-26' : '2026-27'], estimated: true }
}
export function bracketTax(t: number, r: Rates) {
  let tax = 0
  r.brackets.forEach(([from, pct], i) => { const to = r.brackets[i + 1]?.[0] ?? Infinity; if (t > from) tax += ((Math.min(t, to) - from) * pct) / 100 })
  return Math.round(tax)
}
export function lito(t: number) {
  if (t <= 37500_00) return 700_00
  if (t <= 45000_00) return Math.round(700_00 - (t - 37500_00) * 0.05)
  return Math.max(0, Math.round(325_00 - (t - 45000_00) * 0.015))
}
export const medicare = (t: number, r: Rates) => Math.round(Math.min(t * 0.02, Math.max(0, t - r.medicare_threshold) * 0.1))
export function helpRepayment(t: number, { help: h }: Rates) {
  if (t <= h.from) return 0
  if (t > h.top) return Math.round(t * 0.1)
  return Math.round((Math.min(t, h.mid) - h.from) * 0.15 + Math.max(0, t - h.mid) * 0.17)
}
export const yearOf = (d: Data, fy: string): YearSettings => d.settings.by_fy[fy] ?? defaultYear()

export function vehicleTotals(d: Data, range: [string, string]) {
  const trips = d.trips.filter(t => within(t.date, range))
  const km = (b?: boolean) => trips.reduce((a, t) => a + (b === undefined || t.business === b ? t.end_tenths - t.start_tenths : 0), 0)
  const fuel = d.fuel.filter(f => within(f.date, range))
  const total = km(), business = km(true)
  return { total, business, pct: total ? (business / total) * 100 : 0, fuel: fuel.reduce((a, f) => a + f.cost_cents, 0), litres: fuel.reduce((a, f) => a + f.litres_ml, 0) }
}

export function summarise(d: Data, fy: string, today: string) {
  const s = d.settings, range = fyRange(fy), y = yearOf(d, fy)
  const { rates, estimated } = ratesFor(fy, s.rates)
  const asAt = today < range[0] ? range[0] : today > range[1] ? range[1] : today

  // Income, ex-GST, dated by payment on a cash basis and by issue otherwise.
  const income_ = d.invoices
    .filter(i => (s.income_basis === 'paid' ? i.status === 'paid' : i.status !== 'draft'))
    .map(i => ({ date: s.income_basis === 'paid' ? i.paid_date ?? i.issue_date : i.issue_date, ...totals(i) }))
    .filter(i => within(i.date, range) && i.date <= asAt)
  const income = income_.reduce((a, i) => a + i.subtotal, 0)
  const gstCollected = income_.reduce((a, i) => a + i.gst, 0)

  // Deductions
  const rec = d.receipts.filter(r => within(r.date, range) && r.date <= asAt)
  const credit = (r: (typeof rec)[number]) => (s.gst_registered && r.gst_included ? Math.round((r.amount_cents * r.business_pct) / 1100) : 0)
  const exGst = (r: (typeof rec)[number]) => (s.gst_registered && r.gst_included ? (r.amount_cents * 10) / 11 : r.amount_cents)
  const gstCredits = rec.reduce((a, r) => a + credit(r), 0)
  const otherDeductions = rec.filter(r => !r.is_vehicle && !r.is_asset).reduce((a, r) => a + Math.round((exGst(r) * r.business_pct) / 100), 0)
  const assetsExcluded = rec.filter(r => r.is_asset).reduce((a, r) => a + r.amount_cents, 0)
  const v = vehicleTotals(d, [range[0], asAt])
  const ids = new Set(d.receipts.map(r => r.id))
  const looseFuel = d.fuel.filter(f => within(f.date, range) && f.date <= asAt && !(f.receipt_id && ids.has(f.receipt_id))).reduce((a, f) => a + f.cost_cents, 0)
  const vehicleCosts = rec.filter(r => r.is_vehicle && !r.is_asset).reduce((a, r) => a + exGst(r), 0) + looseFuel
  const vehicleDeduction = y.method === 'cents_per_km'
    ? Math.round((Math.min(v.business, 50000) / 10) * rates.cents_per_km)
    : Math.round((vehicleCosts * y.logbook_pct) / 100)
  const deductions = otherDeductions + vehicleDeduction

  // Weekly average: the window never reaches back past the first income.
  const first = income_.reduce((a, i) => (i.date < a ? i.date : a), asAt)
  const span = daysBetween(first, asAt) + 1
  const days = Math.max(7, s.window === 'ytd' ? span : Math.min(Number(s.window) * 7, span))
  const from = addDays(asAt, 1 - days)
  const recent = income_.filter(i => i.date >= from)
  const weeks = days / 7
  const avgWeekly = Math.round(recent.reduce((a, i) => a + i.subtotal, 0) / weeks)

  // Full-year projection: what has happened, plus the average for the weeks left.
  const projectedIncome = income + Math.round((avgWeekly * Math.max(0, daysBetween(asAt, range[1]))) / 7)
  // Only deductions already recorded count, so a one-off purchase never shrinks the set-aside for months.
  const beforeSuper = Math.max(0, projectedIncome - deductions + y.gross_cents)
  const projectedSuper = s.super_on ? Math.min(rates.super_cap, Math.round((projectedIncome * s.super_pct) / 100)) : 0
  const superDeduction = Math.min(projectedSuper, beforeSuper)
  const projectedTaxable = beforeSuper - superDeduction
  const repaymentIncome = projectedTaxable + superDeduction
  const incomeTax = Math.max(0, bracketTax(projectedTaxable, rates) - lito(projectedTaxable))
  const medicareLevy = medicare(projectedTaxable, rates)
  const help = s.help_debt ? helpRepayment(repaymentIncome, rates) : 0
  const owed = incomeTax + medicareLevy + help - y.withheld_cents
  const rate = s.buffer_on ? s.buffer_pct / 100 : projectedIncome ? Math.max(0, owed) / projectedIncome : 0
  const weeklyTax = Math.round(rate * avgWeekly)
  const weeklyGst = s.gst_registered || gstCollected ? Math.max(0, Math.round((gstCollected - gstCredits) / (span < 7 ? 1 : span / 7))) : 0
  const weeklySuper = s.super_on && projectedIncome ? Math.round((projectedSuper / projectedIncome) * avgWeekly) : 0
  const setAsideSoFar = Math.round(rate * income) + Math.max(0, gstCollected - gstCredits)
  return { fy, estimated, rates, year: y, income, gstCollected, gstCredits, otherDeductions, vehicleDeduction, deductions, assetsExcluded, vehicle: v, netYtd: income - deductions, weeks, avgWeekly, projectedIncome, projectedDeductions: deductions, projectedTaxable, projectedSuper, superDeduction, repaymentIncome, incomeTax, medicareLevy, help, withheld: y.withheld_cents, owed, rate, weeklyTax, weeklyGst, weeklySuper, weeklyTotal: weeklyTax + weeklyGst, setAsideSoFar }
}
export type Summary = ReturnType<typeof summarise>
