-- Run once in Supabase > SQL Editor. Every row belongs to one login.
create table settings (owner_id uuid primary key default auth.uid() references auth.users on delete cascade, data jsonb not null);
create table clients (
  id uuid primary key, owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (name <> ''), lines text[] not null default '{}', rate_cents int check (rate_cents >= 0), unique (owner_id, id));
create table invoices (
  id uuid primary key, owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  number text not null, client_id uuid, status text not null check (status in ('draft','sent','paid')),
  issue_date date not null, due_date date not null check (due_date >= issue_date), sent_date date, paid_date date,
  gst boolean not null, items jsonb not null, daily jsonb not null, supplier jsonb, bill_to jsonb, notes text not null default '',
  unique (owner_id, number), unique (owner_id, id),
  foreign key (owner_id, client_id) references clients (owner_id, id) on delete set null (client_id));
create table work_entries (
  id uuid primary key, owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null, start time not null, finish time not null check (finish > start), break_min int not null check (break_min >= 0),
  client_id uuid, site text not null, rate_cents int not null check (rate_cents >= 0), notes text not null, invoice_id uuid,
  foreign key (owner_id, client_id) references clients (owner_id, id) on delete set null (client_id),
  foreign key (owner_id, invoice_id) references invoices (owner_id, id) on delete set null (invoice_id));
create table trips (
  id uuid primary key, owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null, start_tenths int not null check (start_tenths >= 0), end_tenths int not null check (end_tenths > start_tenths), purpose text not null, business boolean not null);
create table receipts (
  id uuid primary key, owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null, vendor text not null, amount_cents int not null check (amount_cents > 0), category text not null, gst_included boolean not null,
  notes text not null, file text, thumb text, mime text, business_pct int not null check (business_pct between 0 and 100),
  is_asset boolean not null, is_vehicle boolean not null, unique (owner_id, id));
create table fuel_entries (
  id uuid primary key, owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null, litres_ml int not null check (litres_ml > 0), cost_cents int not null check (cost_cents > 0), odo_tenths int check (odo_tenths >= 0), receipt_id uuid,
  foreign key (owner_id, receipt_id) references receipts (owner_id, id) on delete set null (receipt_id));

do $$ declare t text; begin
  foreach t in array array['settings','clients','invoices','work_entries','trips','receipts','fuel_entries'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own on %I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- Sent and paid invoices keep their contents.
create function lock_invoice() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- Deleting the whole login cascades here; that is allowed.
    if old.status <> 'draft' and exists (select 1 from auth.users where id = old.owner_id) then raise exception 'Only a draft can be deleted.'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.number, new.issue_date, new.due_date, new.gst, new.items, new.daily, new.supplier, new.bill_to)
     is distinct from (old.number, old.issue_date, old.due_date, old.gst, old.items, old.daily, old.supplier, old.bill_to) then
    raise exception 'Move this invoice back to draft before editing it.';
  end if;
  return new;
end $$;
-- The delete check reads auth.users, so it runs with the owner's rights.
alter function lock_invoice() security definer;
create trigger lock_invoice before update or delete on invoices for each row execute function lock_invoice();

create function lock_work() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from invoices where id = old.invoice_id and status <> 'draft')
     and (tg_op = 'DELETE' and exists (select 1 from auth.users where id = old.owner_id) or tg_op = 'UPDATE' and (new.date, new.start, new.finish, new.break_min, new.rate_cents, new.invoice_id)
          is distinct from (old.date, old.start, old.finish, old.break_min, old.rate_cents, old.invoice_id)) then
    raise exception 'This work is locked because its invoice has been sent.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
alter function lock_work() security definer;
create trigger lock_work before update or delete on work_entries for each row execute function lock_work();

create function save_invoice(p jsonb, work_ids uuid[]) returns void language plpgsql security invoker set search_path = public as $$
declare r invoices; n int;
begin
  r := jsonb_populate_record(null::invoices, p);
  r.owner_id := auth.uid();
  if exists (select 1 from invoices where id = r.id and status <> 'draft') then raise exception 'Move this invoice back to draft before editing it.'; end if;
  perform 1 from work_entries where id = any (work_ids) for update;
  if exists (select 1 from work_entries where id = any (work_ids) and invoice_id is not null and invoice_id <> r.id) then
    raise exception 'Some of this work is already on another invoice.';
  end if;
  -- Insert as a draft so hours can be linked, then apply the requested status.
  insert into invoices values (r.*) on conflict (id) do update set
    number = excluded.number, client_id = excluded.client_id, issue_date = excluded.issue_date, due_date = excluded.due_date,
    gst = excluded.gst, items = excluded.items, daily = excluded.daily, supplier = excluded.supplier, bill_to = excluded.bill_to, notes = excluded.notes;
  update invoices set status = 'draft' where id = r.id and status <> 'draft';
  update work_entries set invoice_id = null where invoice_id = r.id and id <> all (work_ids);
  update work_entries set invoice_id = r.id where id = any (work_ids);
  get diagnostics n = row_count;
  if n <> coalesce(array_length(work_ids, 1), 0) then raise exception 'Some of this work no longer exists. Reload and try again.'; end if;
  update invoices set status = r.status, sent_date = r.sent_date, paid_date = r.paid_date where id = r.id;
end $$;
revoke execute on function save_invoice(jsonb, uuid[]) from public, anon;
grant execute on function save_invoice(jsonb, uuid[]) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 15728640, array['image/jpeg','image/png','image/webp','application/pdf']);
create policy "own receipts" on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
