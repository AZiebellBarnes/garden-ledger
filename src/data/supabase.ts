import type { SupabaseClient } from '@supabase/supabase-js'
import { emptyData, TABLES, type Data, type Invoice, type RowOf, type Settings, type Table } from '../lib/types'
import type { Store } from './store'

const NAME: Record<Table | 'invoices', string> = { clients: 'clients', work: 'work_entries', trips: 'trips', fuel: 'fuel_entries', receipts: 'receipts', invoices: 'invoices' }
const PAGE = 1000
const BUCKET = 'receipts'

export class SupabaseStore implements Store {
  constructor(private c: SupabaseClient, private uid: string) {}
  private async all(table: Table | 'invoices') {
    const out: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.c.from(NAME[table]).select('*').order('id').range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const { owner_id: _, ...row } of data) out.push(table === 'work' ? { ...row, start: String(row.start).slice(0, 5), finish: String(row.finish).slice(0, 5) } : row)
      if (data.length < PAGE) return out
    }
  }
  async load(): Promise<Data> {
    const d = emptyData()
    const [set, ...lists] = await Promise.all([this.c.from('settings').select('data').maybeSingle(), ...[...TABLES, 'invoices' as const].map(t => this.all(t))])
    if (set.error) throw new Error(set.error.message)
    if (set.data) d.settings = { ...d.settings, ...(set.data.data as Settings) }
    ;[...TABLES, 'invoices' as const].forEach((t, i) => { (d as unknown as Record<string, unknown>)[t] = lists[i] })
    return d
  }
  async put<T extends Table>(table: T, row: RowOf[T]) { check(await this.c.from(NAME[table]).upsert({ ...row, owner_id: this.uid })) }
  async remove(table: Table, id: string) { check(await this.c.from(NAME[table]).delete().eq('id', id)) }
  async saveSettings(s: Settings) { check(await this.c.from('settings').upsert({ owner_id: this.uid, data: s })) }
  async saveInvoice(i: Invoice, ids: string[]) { check(await this.c.rpc('save_invoice', { p: i, work_ids: ids })) }
  async setStatus(i: Invoice) { check(await this.c.from('invoices').update({ status: i.status, sent_date: i.sent_date, paid_date: i.paid_date }).eq('id', i.id)) }
  async deleteInvoice(id: string) { check(await this.c.from('invoices').delete().eq('id', id)) }
  async putFile(path: string, b: Blob) { check(await this.c.storage.from(BUCKET).upload(`${this.uid}/${path}`, b, { contentType: b.type, upsert: true })) }
  async getFile(path: string) { const { data } = await this.c.storage.from(BUCKET).download(`${this.uid}/${path}`); return data }
  async removeFile(path: string) { check(await this.c.storage.from(BUCKET).remove([`${this.uid}/${path}`])) }
}
function check(r: { error: { message: string; code?: string } | null }) {
  if (r.error) throw new Error(r.error.code === '23505' ? 'That invoice number is already used.' : r.error.message)
}
