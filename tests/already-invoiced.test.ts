import 'fake-indexeddb/auto'
import { expect, test } from 'vitest'
import { LocalStore } from '../src/data/local'
import { attachable, coveredByLines, refreshDraft, totals, workStatus } from '../src/lib/invoices'
import { defaultSettings, type Invoice, type Work } from '../src/lib/types'

const w = (o: Partial<Work> = {}): Work => ({ id: 'a', date: '2026-11-24', start: '07:00', finish: '16:00', break_min: 0, client_id: 'c', site: '', rate_cents: 3000, notes: '', invoice_id: 'i', ...o })
const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i', number: 'INV-002', client_id: 'c', status: 'sent', issue_date: '2026-11-25', due_date: '2026-11-30', sent_date: null, paid_date: null, gst: false, items: [{ description: 'Gardening services', amount_cents: 66750 }], daily: [], supplier: null, bill_to: null, notes: '', ...o })
const s = defaultSettings()

test('hours can be attached to a sent invoice without changing it', async () => {
  const st = new LocalStore('x' + Math.random())
  await st.saveInvoice(inv(), [])
  await st.put('work', w())
  const d = await st.load()
  expect(workStatus(d.work[0], d.invoices)).toBe('Invoiced')
  expect(totals(d.invoices[0]).total).toBe(66750)
})
test('an unbilled entry can be marked as already invoiced later', async () => {
  const st = new LocalStore('x' + Math.random())
  await st.saveInvoice(inv({ status: 'paid' }), [])
  await st.put('work', w({ invoice_id: null }))
  await st.put('work', w())
  const d = await st.load()
  expect(workStatus(d.work[0], d.invoices)).toBe('Paid')
})
test('moving that invoice back to draft does not add the hours on top', () => {
  const d = refreshDraft(inv({ status: 'draft' }), [w()], s, [])
  expect(totals(d).total).toBe(66750)
  expect(coveredByLines(d, [w()])).toBe(true)
})
test('normal drafts still follow their hours', () => {
  const d = inv({ status: 'draft', items: [{ description: 'Gardening services', amount_cents: 1, source: 'work' }] })
  expect(totals(refreshDraft(d, [w()], s, [])).total).toBe(27000)
  expect(coveredByLines(d, [w()])).toBe(false)
})
test('a custom-line draft with no hours can still have work added', () =>
  expect(coveredByLines(inv({ status: 'draft' }), [])).toBe(false))
test('only sent or paid invoices for the same client are offered, newest first', () => {
  const list = [inv({ id: '1', number: 'INV-001', status: 'paid' }), inv({ id: '2' }), inv({ id: '3', number: 'INV-003', status: 'draft' }), inv({ id: '4', number: 'INV-004', client_id: 'z' })]
  expect(attachable(list, 'c').map(i => i.number)).toEqual(['INV-002', 'INV-001'])
  expect(attachable(list, '')).toEqual([])
})
