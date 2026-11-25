import { beforeAll, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Runs the real schema on an embedded Postgres, with the parts Supabase provides stubbed.
const db = new PGlite()
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
const INV = '10000000-0000-0000-0000-000000000001', W1 = '20000000-0000-0000-0000-000000000001', W2 = '20000000-0000-0000-0000-000000000002'
const as = async (u: string) => { await db.exec(`reset role; set request.uid = '${u}'; set role authenticated`) }
const inv = (o = {}) => JSON.stringify({ id: INV, number: 'INV-001', client_id: null, status: 'draft', issue_date: '2026-11-16', due_date: '2026-11-21', sent_date: null, paid_date: null, gst: false, items: [{ a: 1 }], daily: [], supplier: null, bill_to: null, notes: '', ...o })
const save = (p: string, ids: string[]) => db.query('select save_invoice($1::jsonb, $2::uuid[])', [p, ids])
const work = (id: string) => db.query(`insert into work_entries (id, date, start, finish, break_min, site, rate_cents, notes) values ($1, '2026-11-16', '07:00', '16:00', 0, '', 3000, '')`, [id])
const linked = async () => (await db.query<{ id: string }>('select id from work_entries where invoice_id is not null order by id')).rows.map(r => r.id)

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated; grant execute on function auth.uid() to authenticated;
    create table storage.buckets (id text, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text); alter table storage.objects enable row level security;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n, '/') $$;
    insert into auth.users values ('${A}'), ('${B}');`)
  await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
  await as(A)
  await work(W1)
  await work(W2)
}, 60000)

test('links work, relinks on save, and stores status', async () => {
  await save(inv(), [W1, W2])
  expect(await linked()).toEqual([W1, W2])
  await save(inv({ status: 'sent' }), [W2])
  expect(await linked()).toEqual([W2])
})
test('sent invoices and their work are locked', async () => {
  await expect(save(inv(), [])).rejects.toThrow(/draft/)
  await expect(db.exec(`update invoices set items = '[]'`)).rejects.toThrow(/draft/)
  await expect(db.exec('delete from invoices')).rejects.toThrow(/draft/)
  await expect(db.exec(`update work_entries set finish = '18:00' where id = '${W2}'`)).rejects.toThrow(/locked/)
  await expect(db.exec(`delete from work_entries where id = '${W2}'`)).rejects.toThrow(/locked/)
})
test('status can still change', async () => {
  await db.exec(`update invoices set status = 'paid', paid_date = '2026-11-20'`)
})
test('another login sees and changes nothing', async () => {
  await as(B)
  for (const t of ['invoices', 'work_entries', 'settings']) expect((await db.query(`select * from ${t}`)).rows).toEqual([])
  await expect(save(inv({ id: INV.replace(/1$/, '9') }), [W1])).rejects.toThrow(/no longer exists/)
  await expect(db.exec(`insert into clients (id, owner_id, name) values ('${W1}', '${A}', 'x')`)).rejects.toThrow(/row-level/)
  await as(A)
})
test('work cannot be billed twice and numbers are unique', async () => {
  const other = INV.replace(/1$/, '2')
  await expect(save(inv({ id: other, number: 'INV-002' }), [W2])).rejects.toThrow(/already/)
  await expect(save(inv({ id: other }), [])).rejects.toThrow(/unique/)
})
test('deleting a draft releases its work', async () => {
  const d = INV.replace(/1$/, '3')
  await save(inv({ id: d, number: 'INV-003' }), [W1])
  await db.exec(`delete from invoices where id = '${d}'`)
  expect(await linked()).toEqual([W2])
})
test('a deleted login takes its records with it', async () => {
  await db.exec(`reset role; delete from auth.users where id = '${A}'`)
  expect((await db.query('select * from invoices')).rows).toEqual([])
})
