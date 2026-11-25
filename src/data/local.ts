import { emptyData, type Data, type Invoice, type RowOf, type Settings, type Table, type Work } from '../lib/types'
import type { Store } from './store'
import { workLocked } from '../lib/invoices'

const done = <T>(r: IDBRequest<T>) => new Promise<T>((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })

/** Browser-only storage, used until Supabase is connected. */
export class LocalStore implements Store {
  private db: Promise<IDBDatabase>
  constructor(name = 'garden-ledger') {
    const r = indexedDB.open(name, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('data'); r.result.createObjectStore('files') }
    this.db = done(r)
  }
  private async read(): Promise<Data> {
    const d = await done((await this.db).transaction('data').objectStore('data').get('all')) as Data | undefined
    return merge(d)
  }
  load() { return this.read() }
  /** Read, change and write inside one transaction, so two tabs cannot overwrite each other. */
  private async mutate(fn: (d: Data) => void) {
    const tx = (await this.db).transaction('data', 'readwrite')
    const os = tx.objectStore('data')
    const finished = new Promise<void>((ok, no) => { tx.oncomplete = () => ok(); tx.onabort = () => no(tx.error ?? new Error('Not saved.')) })
    finished.catch(() => {})
    const d = merge(await done(os.get('all')) as Data | undefined)
    try { fn(d) } catch (e) { tx.abort(); throw e }
    os.put(d, 'all')
    await finished
  }
  async put<T extends Table>(table: T, row: RowOf[T]) {
    await this.mutate(d => {
      const list = d[table] as RowOf[T][]
      const i = list.findIndex(r => r.id === row.id)
      if (table === 'work') assertUnlocked(d, i < 0 ? undefined : (list[i] as Work))
      if (i < 0) list.push(row); else list[i] = row
    })
  }
  async remove(table: Table, id: string) {
    await this.mutate(d => {
      if (table === 'work') assertUnlocked(d, d.work.find(w => w.id === id))
      if (table === 'receipts') d.fuel.forEach(f => { if (f.receipt_id === id) f.receipt_id = null })
      if (table === 'clients') { d.work.forEach(w => { if (w.client_id === id) w.client_id = null }); d.invoices.forEach(i => { if (i.client_id === id) i.client_id = null }) }
      ;(d as Record<Table, { id: string }[]>)[table] = d[table].filter(r => r.id !== id)
    })
  }
  saveSettings(s: Settings) { return this.mutate(d => { d.settings = s }) }
  saveInvoice(inv: Invoice, ids: string[]) {
    return this.mutate(d => {
      const old = d.invoices.find(i => i.id === inv.id)
      if (old && old.status !== 'draft') throw new Error('Move this invoice back to draft before editing it.')
      if (d.invoices.some(i => i.number === inv.number && i.id !== inv.id)) throw new Error(`Invoice number ${inv.number} is already used.`)
      for (const w of d.work) {
        if (ids.includes(w.id)) {
          if (w.invoice_id && w.invoice_id !== inv.id) throw new Error('Some of this work is already on another invoice.')
          w.invoice_id = inv.id
        } else if (w.invoice_id === inv.id) w.invoice_id = null
      }
      d.invoices = [...d.invoices.filter(i => i.id !== inv.id), inv]
    })
  }
  setStatus(inv: Invoice) {
    return this.mutate(d => { const o = d.invoices.find(i => i.id === inv.id); if (o) Object.assign(o, { status: inv.status, sent_date: inv.sent_date, paid_date: inv.paid_date }) })
  }
  deleteInvoice(id: string) {
    return this.mutate(d => {
      if (d.invoices.find(i => i.id === id)?.status !== 'draft') throw new Error('Only a draft can be deleted.')
      d.work.forEach(w => { if (w.invoice_id === id) w.invoice_id = null })
      d.invoices = d.invoices.filter(i => i.id !== id)
    })
  }
  private async files(mode: IDBTransactionMode) { return (await this.db).transaction('files', mode).objectStore('files') }
  async putFile(path: string, b: Blob) { const buf = await b.arrayBuffer(); await done((await this.files('readwrite')).put({ buf, type: b.type }, path)) }
  async getFile(path: string) { const f = await done((await this.files('readonly')).get(path)) as { buf: ArrayBuffer; type: string } | undefined; return f ? new Blob([f.buf], { type: f.type }) : null }
  async removeFile(path: string) { await done((await this.files('readwrite')).delete(path)) }
}
function assertUnlocked(d: Data, w?: Work) { if (w && workLocked(w, d.invoices)) throw new Error('This work is locked because its invoice has been sent.') }
function merge(d?: Data): Data { const e = emptyData(); return d ? { ...e, ...d, settings: { ...e.settings, ...d.settings } } : e }
