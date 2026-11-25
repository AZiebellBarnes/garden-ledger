import { beforeAll, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { invoiceLabel, sharedInvoice, weekList } from '../src/lib/sharing'
import type { Invoice } from '../src/lib/types'

const r = (date: string, start = '07:00', finish = '08:00') => ({ id: date + start, date, start, finish, break_min: 0, site: '', rate_cents: 3000 })
test('weeks run Monday to Sunday, newest first, with their own totals', () => {
  const w = weekList([r('2026-11-22'), r('2026-11-23'), r('2026-11-25', '07:00', '09:00'), r('2026-11-16')], '', '')
  expect(w.map(x => [x.start, x.end, x.minutes, x.cents, x.days.map(d => d.date)])).toEqual([
    ['2026-11-23', '2026-11-29', 180, 9000, ['2026-11-25', '2026-11-23']],
    ['2026-11-16', '2026-11-22', 120, 6000, ['2026-11-22', '2026-11-16']]
  ])
})
test('weeks respect the date range', () => expect(weekList([r('2026-11-16'), r('2026-11-23')], '2026-11-20', '').length).toBe(1))
test('labels say which invoice, or not yet, or nothing when unknown', () => {
  expect(invoiceLabel('INV-002')).toBe('Invoiced, INV-002')
  expect(invoiceLabel(null)).toBe('Not yet invoiced')
  expect(invoiceLabel(undefined)).toBe('')
})
test('a draft does not count as invoiced', () => {
  const list = [{ id: 'd', number: 'INV-009', status: 'draft' }, { id: 's', number: 'INV-002', status: 'sent' }, { id: 'p', number: 'INV-001', status: 'paid' }] as Invoice[]
  expect(['d', 's', 'p', null].map(i => sharedInvoice({ invoice_id: i }, list))).toEqual([null, 'INV-002', 'INV-001', null])
})

const db = new PGlite()
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '30000000-0000-0000-0000-000000000001', D = '30000000-0000-0000-0000-000000000002'
const as = async (u: string) => { await db.exec(`reset role; set request.uid = '${u}'; set role authenticated`) }
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon; grant execute on function auth.uid() to authenticated;
    create table storage.buckets (id text, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text); alter table storage.objects enable row level security;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n, '/') $$;
    insert into auth.users values ('${A}', 'a@example.com', now()), ('${B}', 'b@example.com', now());`)
  for (const f of ['schema', 'contractor-access', 'contractor-invoices', 'contractor-invoices']) {
    const u = new URL(`../supabase/${f}.sql`, import.meta.url)
    if (existsSync(u)) await db.exec(readFileSync(u, 'utf8')) // the update is applied twice: re-running it must be harmless
  }
  await as(A)
  await db.exec(`insert into clients (id, name) values ('${C}', 'Theirs'), ('${D}', 'Other'); insert into viewers (email, client_id) values ('b@example.com', '${C}')`)
  const add = async (n: number, status: string | null, client = C) => {
    const i = `10000000-0000-0000-0000-00000000000${n}`
    if (status) await db.query(`insert into invoices (id, number, client_id, status, issue_date, due_date, gst, items, daily) values ($1, $2, $3, $4, '2026-11-25', '2026-11-30', false, '[]', '[]')`, [i, `INV-00${n}`, client, status])
    await db.query(`insert into work_entries (id, date, start, finish, break_min, client_id, site, rate_cents, notes, invoice_id) values (gen_random_uuid(), $1, '07:00', '08:00', 0, $2, '', 3000, '', $3)`, [`2026-11-0${n}`, client, status ? i : null])
  }
  await add(1, 'paid'); await add(2, 'sent'); await add(3, 'draft'); await add(4, null); await add(5, 'sent', D)
}, 60000)
test('the contractor gets invoice numbers for sent and paid work only, for their own business', async () => {
  await as(B)
  const rows = (await db.query<{ invoice: string | null }>('select * from shared_work()')).rows
  expect(rows.map(x => x.invoice)).toEqual([null, null, 'INV-002', 'INV-001'])
  expect((await db.query('select * from invoices')).rows).toEqual([])
})
test('visitors who are not signed in are still refused', async () => {
  await db.exec(`reset role; set request.uid = ''; set role anon`)
  await expect(db.query('select * from shared_work()')).rejects.toThrow(/permission denied/)
})
