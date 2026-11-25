import type { SupabaseClient } from '@supabase/supabase-js'
import type { SharedRow } from '../lib/sharing'

export type Viewer = { id: string; email: string; client_id: string }
export type SharedWork = SharedRow & { client: string; business: string }
/** contractor-access.sql has not been run yet. */
const missing = (code?: string) => code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883'

export async function isContractor(c: SupabaseClient): Promise<boolean> {
  const { data, error } = await c.rpc('is_contractor')
  if (error && !missing(error.code)) throw new Error(error.message)
  return !error && data === true
}
export async function sharedWork(c: SupabaseClient): Promise<SharedWork[]> {
  const out: SharedWork[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await c.rpc('shared_work').order('date', { ascending: false }).order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    const page = data as SharedWork[]
    out.push(...page.map(r => ({ ...r, start: r.start.slice(0, 5), finish: r.finish.slice(0, 5) })))
    if (page.length < 1000) return out
  }
}
export class Sharing {
  constructor(private c: SupabaseClient) {}
  async list(): Promise<Viewer[]> {
    const { data, error } = await this.c.from('viewers').select('id, email, client_id').order('email')
    if (error) throw new Error(missing(error.code) ? 'Run supabase/contractor-access.sql in Supabase first.' : error.message)
    return data
  }
  async add(email: string, client_id: string) {
    const { error } = await this.c.from('viewers').insert({ email: email.trim().toLowerCase(), client_id })
    if (error) throw new Error(error.code === '23505' ? 'That email already has access.' : error.code === '23514' ? 'Enter a valid email.' : error.message)
  }
  async remove(id: string) {
    const { error } = await this.c.from('viewers').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }
}
