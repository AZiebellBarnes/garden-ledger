import { beforeAll, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { dayList } from '../src/lib/sharing'

const db = new PGlite()
const OWNER = '00000000-0000-0000-0000-00000000000a', CON = '00000000-0000-0000-0000-00000000000b', OTHER = '00000000-0000-0000-0000-00000000000c', UNCONF = '00000000-0000-0000-0000-00000000000d'
const C1 = '30000000-0000-0000-0000-000000000001', C2 = '30000000-0000-0000-0000-000000000002'
const as = async (u: string) => { await db.exec(`reset role; set request.uid = '${u}'; set role authenticated`) }
const rows = async () => (await db.query<Record<string, unknown>>('select * from shared_work()')).rows
const file = (n: string) => new URL(`../supabase/${n}`, import.meta.url)

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon; grant execute on function auth.uid() to authenticated;
    create table storage.buckets (id text, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text); alter table storage.objects enable row level security;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n, '/') $$;
    insert into auth.users values ('${OWNER}', 'owner@example.com', now()), ('${CON}', 'Boss@example.com', now()), ('${OTHER}', 'other@example.com', now()), ('${UNCONF}', 'new@example.com', null);`)
  await db.exec(readFileSync(file('schema.sql'), 'utf8'))
  if (existsSync(file('contractor-access.sql'))) await db.exec(readFileSync(file('contractor-access.sql'), 'utf8'))
  await as(OWNER)
  await db.exec(`insert into settings (data) values ('{"business":{"name":"Sam Example"},"bank":{"bsb":"000"}}');
    insert into clients (id, name) values ('${C1}', 'Their business'), ('${C2}', 'Someone else');
    insert into work_entries (id, date, start, finish, break_min, client_id, site, rate_cents, notes) values
      (gen_random_uuid(), '2026-11-16', '07:00', '16:30', 30, '${C1}', 'Beach', 3000, 'private note'),
      (gen_random_uuid(), '2026-11-17', '07:00', '16:00', 0, '${C2}', 'Secret', 9000, ''),
      (gen_random_uuid(), '2026-11-18', '07:00', '16:00', 0, null, 'None', 3000, '');
    insert into viewers (email, client_id) values ('boss@example.com', '${C1}'), ('new@example.com', '${C1}');`)
}, 60000)

test('the contractor sees only their own work, without notes', async () => {
  await as(CON)
  const r = await rows()
  expect(r.map(x => x.site)).toEqual(['Beach'])
  expect(Object.keys(r[0]).sort()).toEqual(['break_min', 'business', 'client', 'date', 'finish', 'id', 'rate_cents', 'site', 'start'])
  expect(r[0].business).toBe('Sam Example')
})
test('the contractor cannot read any table behind it', async () => {
  for (const t of ['work_entries', 'clients', 'invoices', 'settings', 'receipts', 'trips', 'fuel_entries', 'viewers']) expect((await db.query(`select * from ${t}`)).rows, t).toEqual([])
})
test('the contractor cannot change work or give themselves more access', async () => {
  expect((await db.query(`update work_entries set rate_cents = 1`)).affectedRows).toBe(0)
  expect((await db.query('delete from work_entries')).affectedRows).toBe(0)
  await expect(db.exec(`insert into viewers (owner_id, email, client_id) values ('${OWNER}', 'boss@example.com', '${C2}')`)).rejects.toThrow(/row-level/)
  await expect(db.exec(`insert into viewers (email, client_id) values ('boss@example.com', '${C2}')`)).rejects.toThrow(/foreign key/)
})
test('is_contractor tells the app which page to show', async () => {
  const role = async (u: string) => { await as(u); return (await db.query<{ r: boolean }>('select is_contractor() as r')).rows[0].r }
  expect([await role(CON), await role(OWNER), await role(OTHER)]).toEqual([true, false, false])
})
test('an owner cannot be locked out by someone sharing with their email', async () => {
  await as(OTHER)
  await db.exec(`insert into clients (id, name) values ('30000000-0000-0000-0000-000000000009', 'x'); insert into viewers (email, client_id) values ('owner@example.com', '30000000-0000-0000-0000-000000000009')`)
  await as(OWNER)
  expect((await db.query<{ r: boolean }>('select is_contractor() as r')).rows[0].r).toBe(false)
})
test('other logins and unconfirmed emails see nothing', async () => {
  for (const u of [OTHER, UNCONF]) { await as(u); expect(await rows()).toEqual([]) }
})
test('visitors who are not signed in are refused', async () => {
  await db.exec(`reset role; set request.uid = ''; set role anon`)
  await expect(rows()).rejects.toThrow(/permission denied/)
})
test('removing access takes effect at once', async () => {
  await as(OWNER)
  await db.exec(`delete from viewers where email = 'boss@example.com'`)
  await as(CON)
  expect(await rows()).toEqual([])
})
test('days are newest first, each with its jobs in time order, hours and amount', () => {
  const r = (date: string, start: string, finish: string) => ({ id: date + start, date, start, finish, break_min: 0, site: '', rate_cents: 3000 })
  const d = dayList([r('2026-11-16', '13:00', '15:00'), r('2026-11-16', '07:00', '12:00'), r('2026-11-17', '07:00', '08:30')], '', '')
  expect(d.map(x => [x.date, x.minutes, x.cents])).toEqual([['2026-11-17', 90, 4500], ['2026-11-16', 420, 21000]])
  expect(d[1].jobs.map(j => j.start)).toEqual(['07:00', '13:00'])
})
test('days can be limited to a date range', () => {
  const r = (date: string) => ({ id: date, date, start: '07:00', finish: '08:00', break_min: 0, site: '', rate_cents: 3000 })
  expect(dayList([r('2026-11-15'), r('2026-11-16'), r('2026-11-18')], '2026-11-16', '2026-11-17').map(d => d.date)).toEqual(['2026-11-16'])
})
