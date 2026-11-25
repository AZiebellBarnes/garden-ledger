import 'fake-indexeddb/auto'
import { expect, test, beforeEach } from 'vitest'
import { LocalStore } from '../src/data/local'
import type { Invoice, Work } from '../src/lib/types'

const w = (id: string): Work => ({ id, date: '2026-11-16', start: '07:00', finish: '16:00', break_min: 0, client_id: null, site: '', rate_cents: 3000, notes: '', invoice_id: null })
const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i', number: 'INV-001', client_id: null, status: 'draft', issue_date: '2026-11-16', due_date: '2026-11-21', sent_date: null, paid_date: null, gst: false, items: [{ description: 'x', amount_cents: 1 }], daily: [], supplier: null, bill_to: null, notes: '', ...o })
let s: LocalStore
beforeEach(async () => { s = new LocalStore('t' + Math.random()); await s.put('work', w('a')); await s.put('work', w('b')) })
test('saving an invoice links its work, and re-saving unlinks what was dropped', async () => {
  await s.saveInvoice(inv(), ['a', 'b'])
  expect((await s.load()).work.map(x => x.invoice_id)).toEqual(['i', 'i'])
  await s.saveInvoice(inv(), ['b'])
  expect((await s.load()).work.map(x => x.invoice_id)).toEqual([null, 'i'])
})
test('work cannot be billed twice', async () => {
  await s.saveInvoice(inv(), ['a'])
  await expect(s.saveInvoice(inv({ id: 'j', number: 'INV-002' }), ['a'])).rejects.toThrow(/already/i)
  expect((await s.load()).invoices.length).toBe(1)
})
test('invoice numbers are unique', async () => {
  await s.saveInvoice(inv(), [])
  await expect(s.saveInvoice(inv({ id: 'j' }), [])).rejects.toThrow(/number/i)
})
test('sent invoices are locked', async () => {
  await s.saveInvoice(inv({ status: 'sent' }), ['a'])
  await expect(s.saveInvoice(inv({ status: 'sent', items: [] }), ['a'])).rejects.toThrow(/draft/i)
  await expect(s.deleteInvoice('i')).rejects.toThrow(/draft/i)
  await expect(s.put('work', { ...w('a'), invoice_id: 'i', finish: '18:00' })).rejects.toThrow(/locked/i)
  await expect(s.remove('work', 'a')).rejects.toThrow(/locked/i)
})
test('deleting a draft releases its work', async () => {
  await s.saveInvoice(inv(), ['a'])
  await s.deleteInvoice('i')
  const d = await s.load()
  expect(d.invoices).toEqual([])
  expect(d.work.every(x => x.invoice_id === null)).toBe(true)
})
test('deleting a receipt unlinks its fuel fill', async () => {
  await s.put('receipts', { id: 'r', date: '2026-11-16', vendor: 'BP', amount_cents: 1, category: 'Fuel', gst_included: true, notes: '', file: null, thumb: null, mime: null, business_pct: 100, is_asset: false, is_vehicle: true })
  await s.put('fuel', { id: 'f', date: '2026-11-16', litres_ml: 1, cost_cents: 1, odo_tenths: null, receipt_id: 'r' })
  await s.remove('receipts', 'r')
  expect((await s.load()).fuel[0].receipt_id).toBeNull()
})
test('files round-trip', async () => {
  await s.putFile('x/1', new Blob(['hi'], { type: 'image/png' }))
  expect((await s.getFile('x/1'))?.type).toBe('image/png')
})
