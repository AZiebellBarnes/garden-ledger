import type { Data } from './types'
import { toCsv, type Cell } from './csv'
import { workCols, tripCols, fuelCols, receiptCols, invoiceCols, type Col } from './columns'
import { summarise } from './tax'
import { today as now } from './dates'

export type Tab = 'work' | 'vehicle' | 'receipts' | 'invoices'
type Sheet = { name: string; head: string[]; rows: Cell[][]; money: string[] }
function table<R extends { date?: string; issue_date?: string }>(name: string, cols: Col<R>[], rows: R[], d: Data, today: string): Sheet {
  const key = (r: R) => r.date ?? r.issue_date ?? ''
  return { name, head: cols.map(c => c.label), rows: [...rows].sort((a, b) => key(a).localeCompare(key(b))).map(r => cols.map(c => c.value(r, d, today))), money: cols.filter(c => c.type === 'money').map(c => c.label) }
}
/** Trips and fuel share a sheet: one row per record, with a Type column. */
function vehicle(d: Data, today: string): Sheet {
  const a = table('', tripCols, d.trips, d, today), b = table('', fuelCols, d.fuel, d, today)
  const head = ['Type', ...a.head, ...b.head.slice(1)]
  const rows = [
    ...a.rows.map(r => ['Trip', ...r, ...b.head.slice(1).map(() => null)] as Cell[]),
    ...b.rows.map(r => ['Fuel', r[0], ...a.head.slice(1).map(() => null), ...r.slice(1)] as Cell[])
  ].sort((x, y) => String(x[1]).localeCompare(String(y[1])))
  return { name: 'Fuel & Distance', head, rows, money: b.money }
}
export function sheetFor(tab: Tab, d: Data, today: string): Sheet {
  if (tab === 'work') return table('Work Hours', workCols, d.work, d, today)
  if (tab === 'vehicle') return vehicle(d, today)
  if (tab === 'receipts') return table('Receipts', receiptCols, d.receipts, d, today)
  return table('Invoices', invoiceCols, d.invoices, d, today)
}
export function csvFor(tab: Tab, d: Data, today = now()) { const s = sheetFor(tab, d, today); return '﻿' + toCsv([s.head, ...s.rows]) }

export function taxRows(d: Data, fy: string, today: string): [string, number | string][] {
  const s = summarise(d, fy, today)
  const c = (n: number) => n / 100
  return [
    ['Financial year', fy], ['As at', today], ['Income counted', d.settings.income_basis === 'paid' ? 'Paid invoices only' : 'Sent and paid invoices'],
    ['Rates', s.estimated ? `No rates stored for ${fy}; nearest year used` : `Stored rates for ${fy}`],
    ['Income to date (ex GST)', c(s.income)], ['Receipt deductions', c(s.otherDeductions)], ['Vehicle deduction', c(s.vehicleDeduction)],
    ['Vehicle method', s.year.method === 'cents_per_km' ? `${s.rates.cents_per_km}c per km, up to 5,000 km` : `Logbook ${s.year.logbook_pct}%`],
    ['Total deductions', c(s.deductions)], ['Net to date', c(s.netYtd)], ['Asset receipts not deducted', c(s.assetsExcluded)],
    ['GST collected', c(s.gstCollected)], ['GST credits', c(s.gstCredits)],
    ['Wages (other income)', c(s.year.gross_cents)], ['Projected business income', c(s.projectedIncome)], ['Projected deductions', c(s.projectedDeductions)],
    ['Projected super deduction', c(s.superDeduction)], ['Projected taxable income', c(s.projectedTaxable)],
    ['Estimated income tax (after low income offset)', c(s.incomeTax)], ['Medicare levy', c(s.medicareLevy)], ['HELP repayment', c(s.help)], ['Tax already withheld', c(s.withheld)],
    ['Estimated amount owing', c(s.owed)], ['Average weekly income', c(s.avgWeekly)], ['Weekly tax set-aside', c(s.weeklyTax)], ['Weekly GST set-aside', c(s.weeklyGst)],
    ['Recommended weekly transfer', c(s.weeklyTotal)], ['Weekly voluntary super (separate)', c(s.weeklySuper)], ['Should be set aside so far', c(s.setAsideSoFar)]
  ]
}
export async function buildWorkbook(d: Data, fy: string, today: string): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  for (const tab of ['work', 'vehicle', 'receipts', 'invoices'] as Tab[]) {
    const s = sheetFor(tab, d, today)
    const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow(s.head).font = { bold: true }
    s.rows.forEach(r => ws.addRow(r))
    s.head.forEach((h, i) => { const col = ws.getColumn(i + 1); col.width = Math.max(12, h.length + 3); if (s.money.includes(h)) col.numFmt = '$#,##0.00' })
    if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.head.length } }
  }
  const ws = wb.addWorksheet(`Tax Summary ${fy}`)
  taxRows(d, fy, today).forEach(r => { const row = ws.addRow(r); if (typeof r[1] === 'number') row.getCell(2).numFmt = '$#,##0.00' })
  ws.addRow([])
  ws.addRow(['Estimate for budgeting only, not tax advice.'])
  ws.getColumn(1).width = 46
  ws.getColumn(2).width = 34
  return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer
}
