import { TABLES, type Data, type Table } from './types'
import type { Store } from '../data/store'
import { workLocked } from './invoices'

type Backup = Partial<Data> & { files?: Record<string, { type: string; b64: string }> }
async function encode(b: Blob) {
  const u = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192))
  return btoa(s)
}
export async function makeBackup(d: Data, store: Store): Promise<Backup> {
  const files: Backup['files'] = {}
  for (const p of d.receipts.flatMap(r => [r.file, r.thumb])) {
    const b = p && (await store.getFile(p))
    if (p && b) files[p] = { type: b.type, b64: await encode(b) }
  }
  return { ...d, files }
}
/** Adds and updates records. Sent and paid invoices that already exist are left alone. */
export async function restore(b: Backup, store: Store) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || (!b.settings && !TABLES.some(t => Array.isArray(b[t])))) throw new Error('That file is not a Garden Ledger backup.')
  const have = await store.load()
  if (b.settings) await store.saveSettings({ ...have.settings, ...b.settings })
  for (const [p, f] of Object.entries(b.files ?? {})) await store.putFile(p, new Blob([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], { type: f.type }))
  for (const t of ['clients', 'receipts', 'work', 'trips', 'fuel'] as Table[]) for (const row of b[t] ?? []) {
    if (t !== 'work') { await store.put(t, row as never); continue }
    const old = have.work.find(w => w.id === row.id)
    if (old && workLocked(old, have.invoices)) continue
    await store.put('work', { ...(row as Data['work'][number]), invoice_id: old?.invoice_id ?? null })
  }
  for (const inv of b.invoices ?? []) {
    const old = have.invoices.find(i => i.id === inv.id)
    if (old && old.status !== 'draft') continue
    await store.saveInvoice(inv, (b.work ?? []).filter(w => w.invoice_id === inv.id).map(w => w.id))
  }
}
