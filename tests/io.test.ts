import 'fake-indexeddb/auto'
import { expect, test } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook, csvFor } from '../src/lib/exports'
import { makeBackup, restore } from '../src/lib/backup'
import { LocalStore } from '../src/data/local'
import { emptyData, type Data } from '../src/lib/types'

function sample(): Data {
  const d = emptyData()
  d.clients = [{ id: 'c', name: '=Evil()', lines: [], rate_cents: null }]
  d.work = [{ id: 'w', date: '2026-11-16', start: '07:00', finish: '16:00', break_min: 0, client_id: 'c', site: 'Beach', rate_cents: 3000, notes: '', invoice_id: 'i' }]
  d.invoices = [{ id: 'i', number: 'INV-001', client_id: 'c', status: 'sent', issue_date: '2026-11-16', due_date: '2026-11-21', sent_date: null, paid_date: null, gst: false, items: [{ description: 'Gardening services', amount_cents: 27000, source: 'work' }], daily: [], supplier: null, bill_to: { name: '=Evil()', lines: [] }, notes: '' }]
  d.receipts = [{ id: 'r', date: '2026-11-16', vendor: 'BP', amount_cents: 5000, category: 'Fuel', gst_included: true, notes: '', file: 'r/f', thumb: null, mime: 'image/png', business_pct: 100, is_asset: false, is_vehicle: true }]
  d.fuel = [{ id: 'f', date: '2026-11-16', litres_ml: 25500, cost_cents: 5000, odo_tenths: 12345, receipt_id: 'r' }]
  d.trips = [{ id: 't', date: '2026-11-16', start_tenths: 100, end_tenths: 350, purpose: 'Job', business: true }]
  return d
}
test('workbook has four data sheets plus the tax summary, with real numbers', async () => {
  const bytes = await buildWorkbook(sample(), '2026-27', '2026-11-25')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as never)
  expect(wb.worksheets.map(s => s.name)).toEqual(['Work Hours', 'Fuel & Distance', 'Receipts', 'Invoices', 'Tax Summary 2026-27'])
  const head = wb.worksheets[0].getRow(1).values as string[]
  expect(wb.worksheets[0].getRow(2).getCell(head.indexOf('Earnings')).value).toBe(270)
  const tax = JSON.stringify(wb.worksheets[4].getSheetValues())
  expect(tax).toMatch(/Estimated income tax/)
})
test('fuel and distance share one sheet', () => {
  const csv = csvFor('vehicle', sample())
  expect(csv).toMatch(/Trip/)
  expect(csv).toMatch(/Fuel/)
  expect(csv).toMatch(/25\.5/)
})
test('csv defuses formula text', () => expect(csvFor('work', sample())).toContain("'=Evil()"))
test('backup restores everything into an empty store, including files and links', async () => {
  const a = new LocalStore('a' + Math.random()), b = new LocalStore('b' + Math.random())
  const d = sample()
  await a.putFile('r/f', new Blob(['img'], { type: 'image/png' }))
  const back = JSON.parse(JSON.stringify(await makeBackup(d, a)))
  await restore(back, b)
  const got = await b.load()
  expect(got.work[0].invoice_id).toBe('i')
  expect(got.invoices[0].status).toBe('sent')
  expect(got.fuel[0].receipt_id).toBe('r')
  expect(await (await b.getFile('r/f'))!.text()).toBe('img')
})
test('restoring twice is harmless and leaves sent invoices alone', async () => {
  const b = new LocalStore('c' + Math.random())
  await restore(sample(), b)
  const changed = sample()
  changed.invoices[0].items[0].amount_cents = 1
  await restore(changed, b)
  const got = await b.load()
  expect(got.invoices[0].items[0].amount_cents).toBe(27000)
  expect(got.work.length).toBe(1)
})
test('a file that is not a backup is refused', async () =>
  await expect(restore([1] as never, new LocalStore('d'))).rejects.toThrow(/backup/i))
