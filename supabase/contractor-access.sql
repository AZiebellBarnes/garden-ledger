-- Run once in Supabase > SQL Editor, after schema.sql.
-- Lets a contractor's own login see the work done for their business, and nothing else.
create table viewers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  client_id uuid not null,
  unique (owner_id, email, client_id),
  foreign key (owner_id, client_id) references clients (owner_id, id) on delete cascade);
alter table viewers enable row level security;
create policy own on viewers for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on viewers from anon;
grant select, insert, update, delete on viewers to authenticated;

-- These run with the database owner's rights, so each one filters by the signed-in user itself.
create function shared_work()
returns table (id uuid, date date, start time, finish time, break_min int, site text, rate_cents int, client text, business text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.date, w.start, w.finish, w.break_min, w.site, w.rate_cents, c.name, coalesce(s.data->'business'->>'name', '')
  from auth.users u
  join public.viewers v on v.email = lower(u.email)
  join public.clients c on c.id = v.client_id and c.owner_id = v.owner_id
  join public.work_entries w on w.client_id = v.client_id and w.owner_id = v.owner_id
  left join public.settings s on s.owner_id = v.owner_id
  where u.id = auth.uid() and u.email_confirmed_at is not null
  order by w.date desc, w.id
$$;
-- Someone with their own ledger is never treated as a contractor, so sharing cannot lock them out of it.
create function is_contractor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.viewers v on v.email = lower(u.email) where u.id = auth.uid() and u.email_confirmed_at is not null)
    and not exists (select 1 from public.settings where owner_id = auth.uid())
$$;
revoke execute on function shared_work(), is_contractor() from public, anon;
grant execute on function shared_work(), is_contractor() to authenticated;
