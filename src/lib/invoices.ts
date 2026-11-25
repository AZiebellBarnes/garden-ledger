import type { Invoice, Item, Work, Settings, Client, Supplier } from './types'
import { dailyTotals } from './hours'
export function nextNumber(list: Invoice[], prefix: string, pad: number): string {
  let max = 0
  for (const { number: n } of list) if (n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length))) max = Math.max(max, Number(n.slice(prefix.length)))
  return prefix + String(max + 1).padStart(pad, '0')
}
export const effectiveStatus = (i: Invoice, today: string) => (i.status === 'sent' && i.due_date < today ? ('overdue' as const) : i.status)
export function workStatus(w: Work, invoices: Invoice[]): 'Unbilled' | 'Invoiced' | 'Paid' {
  const i = w.invoice_id && invoices.find(x => x.id === w.invoice_id)
  return !i ? 'Unbilled' : i.status === 'paid' ? 'Paid' : 'Invoiced'
}
/** Draft work can still be corrected; once an invoice is sent its hours are fixed. */
export const workLocked = (w: Work, invoices: Invoice[]) => invoices.some(i => i.id === w.invoice_id && i.status !== 'draft')
export function totals(i: Pick<Invoice, 'items' | 'gst'>) {
  const subtotal = i.items.reduce((a, x) => a + x.amount_cents, 0)
  const gst = i.gst ? Math.round(subtotal / 10) : 0
  return { subtotal, gst, total: subtotal + gst }
}
export function buildWorkItems(work: Work[]): Item[] {
  return work.length ? [{ description: 'Gardening services', amount_cents: dailyTotals(work).reduce((a, d) => a + d.cents, 0), source: 'work' }] : []
}
export const supplierOf = (s: Settings): Supplier => ({ ...s.business, bank: s.bank })
export const billTo = (c?: Client) => (c ? { name: c.name, lines: c.lines } : null)
const hasWorkLine = (i: Invoice) => i.items.some(x => x.source === 'work')
/** Hours attached afterwards to an invoice whose lines already charge for them. */
export const coveredByLines = (i: Invoice, work: Work[]) => i.items.length > 0 && !hasWorkLine(i) && work.some(w => w.invoice_id === i.id)
/** Invoices that hours can be marked as already billed on. */
export const attachable = (list: Invoice[], clientId: string) => (clientId ? list.filter(i => i.status !== 'draft' && i.client_id === clientId).sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true })) : [])
/** Drafts follow current hours and details; sent invoices keep what was on them. */
export function refreshDraft(i: Invoice, work: Work[], s: Settings, clients: Client[]): Invoice {
  if (i.status !== 'draft') return i
  const linked = work.filter(w => w.invoice_id === i.id)
  return { ...i, gst: s.gst_registered, items: [...(coveredByLines(i, work) ? [] : buildWorkItems(linked)), ...i.items.filter(x => x.source !== 'work')], daily: dailyTotals(linked), supplier: supplierOf(s), bill_to: billTo(clients.find(c => c.id === i.client_id)) }
}
