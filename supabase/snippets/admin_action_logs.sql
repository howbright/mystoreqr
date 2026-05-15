-- MyStoreQR optional table
-- Run once to enable custom admin action logs

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  store_slug text not null,
  order_id uuid,
  action_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_logs_store_created_idx
  on public.admin_action_logs (store_slug, created_at desc);

create index if not exists admin_action_logs_order_idx
  on public.admin_action_logs (order_id);

alter table public.admin_action_logs enable row level security;

drop policy if exists admin_action_logs_admin_select on public.admin_action_logs;
create policy admin_action_logs_admin_select
on public.admin_action_logs
for select
to authenticated
using (true);

drop policy if exists admin_action_logs_admin_insert on public.admin_action_logs;
create policy admin_action_logs_admin_insert
on public.admin_action_logs
for insert
to authenticated
with check (true);

grant select, insert on public.admin_action_logs to authenticated;
grant select, insert on public.admin_action_logs to service_role;
