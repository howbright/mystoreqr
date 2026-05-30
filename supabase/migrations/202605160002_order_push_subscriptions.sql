create table if not exists public.order_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_push_subscriptions_order_id_idx
  on public.order_push_subscriptions (order_id);

drop trigger if exists trg_order_push_subscriptions_set_updated_at
on public.order_push_subscriptions;

create trigger trg_order_push_subscriptions_set_updated_at
before update on public.order_push_subscriptions
for each row
execute function public.set_updated_at();

grant insert on public.order_push_subscriptions to anon;
grant select, insert, update, delete on public.order_push_subscriptions to authenticated;

alter table public.order_push_subscriptions enable row level security;

drop policy if exists order_push_subscriptions_guest_insert_own_order
on public.order_push_subscriptions;

create policy order_push_subscriptions_guest_insert_own_order
on public.order_push_subscriptions
for insert
to anon
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_push_subscriptions.order_id
      and o.store_id = order_push_subscriptions.store_id
  )
);

drop policy if exists order_push_subscriptions_admin_all_own_store
on public.order_push_subscriptions;

create policy order_push_subscriptions_admin_all_own_store
on public.order_push_subscriptions
for all
to authenticated
using ((select public.is_store_admin(store_id)))
with check ((select public.is_store_admin(store_id)));
