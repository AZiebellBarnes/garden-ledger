-- Run once in Supabase > SQL Editor, after contractor-access.sql. Safe to run again.
-- Adds the invoice number to what a contractor sees. Drafts count as not yet invoiced.
begin;
drop function if exists public.shared_work();
create function public.shared_work()
returns table (id uuid, date date, start time, finish time, break_min int, site text, rate_cents int, client text, business text, invoice text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.date, w.start, w.finish, w.break_min, w.site, w.rate_cents, c.name, coalesce(s.data->'business'->>'name', ''), i.number
  from auth.users u
  join public.viewers v on v.email = lower(u.email)
  join public.clients c on c.id = v.client_id and c.owner_id = v.owner_id
  join public.work_entries w on w.client_id = v.client_id and w.owner_id = v.owner_id
  left join public.invoices i on i.id = w.invoice_id and i.owner_id = v.owner_id and i.status <> 'draft'
  left join public.settings s on s.owner_id = v.owner_id
  where u.id = auth.uid() and u.email_confirmed_at is not null
  order by w.date desc, w.id
$$;
revoke execute on function public.shared_work() from public, anon;
grant execute on function public.shared_work() to authenticated;
commit;
notify pgrst, 'reload schema';
