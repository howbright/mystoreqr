-- MyStoreQR - Supabase init schema (MVP)
-- Date: 2026-05-11
-- Goal: guest ordering + direct bank transfer + admin order management

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.store_admin_role as enum ('owner', 'manager', 'staff');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.order_fulfillment_type as enum ('delivery', 'pickup');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.order_status as enum (
    'pending',
    'payment_confirmed',
    'preparing',
    'delivering',
    'completed',
    'canceled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.payment_status as enum (
    'waiting_transfer',
    'transfer_submitted',
    'confirmed',
    'rejected',
    'not_ready'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.transfer_report_status as enum ('submitted', 'verified', 'rejected');
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- Common functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_order_code()
returns text
language plpgsql
as $$
declare
  v_date text;
  v_next integer;
begin
  v_date := to_char(timezone('Asia/Seoul', now()), 'YYYYMMDD');

  perform pg_advisory_xact_lock(hashtext('mystoreqr_order_code_' || v_date));

  select coalesce(max((substring(order_code from 10))::integer), 0) + 1
  into v_next
  from public.orders
  where order_code ~ ('^' || v_date || '-[0-9]+$');

  return v_date || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  phone text,
  description text,
  bank_name text not null,
  bank_account_number text not null,
  bank_account_holder text not null,
  business_registration_number text,
  address_road text,
  address_detail text,
  postal_code text,
  min_order_amount integer not null default 0 check (min_order_amount >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_slug_format_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.store_admins (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.store_admin_role not null default 'manager',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  unit text,
  sku text,
  price integer not null check (price >= 0),
  image_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  is_sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_store_sku_unique_idx
  on public.products (store_id, sku)
  where sku is not null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_code text not null unique default public.generate_order_code(),
  lookup_token uuid not null unique default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  fulfillment_type public.order_fulfillment_type not null default 'delivery',
  delivery_address text,
  delivery_address_detail text,
  postal_code text,
  customer_note text,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'waiting_transfer',
  payment_method text not null default 'bank_transfer',
  bank_depositor_name text,
  transferred_at timestamptz,
  subtotal_amount integer not null default 0 check (subtotal_amount >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_payment_method_chk check (payment_method = 'bank_transfer'),
  constraint orders_amount_chk check (total_amount = subtotal_amount + delivery_fee),
  constraint orders_delivery_address_chk check (
    (fulfillment_type = 'pickup')
    or (coalesce(btrim(delivery_address), '') <> '')
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total integer generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now()
);

create table public.transfer_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  depositor_name text not null,
  depositor_phone text,
  transferred_amount integer not null check (transferred_amount >= 0),
  transferred_at timestamptz,
  note text,
  status public.transfer_report_status not null default 'submitted',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  previous_status public.order_status,
  new_status public.order_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index stores_is_active_idx on public.stores (is_active);

create index store_admins_store_id_idx on public.store_admins (store_id);
create index store_admins_user_id_idx on public.store_admins (user_id);

create index categories_store_id_idx on public.categories (store_id);
create index categories_store_display_order_idx on public.categories (store_id, display_order);

create index products_store_id_idx on public.products (store_id);
create index products_category_id_idx on public.products (category_id);
create index products_store_active_order_idx on public.products (store_id, is_active, display_order);

create index orders_store_id_idx on public.orders (store_id);
create index orders_lookup_token_idx on public.orders (lookup_token);
create index orders_store_status_created_idx on public.orders (store_id, status, created_at desc);

create index order_items_order_id_idx on public.order_items (order_id);

create index transfer_reports_order_id_idx on public.transfer_reports (order_id);
create index transfer_reports_status_idx on public.transfer_reports (status);

create index order_status_events_order_id_idx on public.order_status_events (order_id);
create index order_status_events_store_created_idx on public.order_status_events (store_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------
create trigger trg_stores_set_updated_at
before update on public.stores
for each row
execute function public.set_updated_at();

create trigger trg_store_admins_set_updated_at
before update on public.store_admins
for each row
execute function public.set_updated_at();

create trigger trg_categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

create trigger trg_products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

create trigger trg_orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

create trigger trg_transfer_reports_set_updated_at
before update on public.transfer_reports
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helper functions for RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_store_admin(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_admins sa
    where sa.store_id = p_store_id
      and sa.user_id = auth.uid()
      and sa.is_active = true
  );
$$;

create or replace function public.is_order_store_admin(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.store_admins sa
      on sa.store_id = o.store_id
    where o.id = p_order_id
      and sa.user_id = auth.uid()
      and sa.is_active = true
  );
$$;

-- Guest order-tracking RPC (no customer account needed)
create or replace function public.get_order_tracking(
  p_lookup_token uuid,
  p_customer_phone text
)
returns table (
  order_code text,
  status public.order_status,
  payment_status public.payment_status,
  total_amount integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.order_code,
    o.status,
    o.payment_status,
    o.total_amount,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.lookup_token = p_lookup_token
    and regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Order event triggers
-- ---------------------------------------------------------------------------
create or replace function public.log_order_status_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_status_events (
    order_id,
    store_id,
    previous_status,
    new_status,
    changed_by,
    note
  )
  values (
    new.id,
    new.store_id,
    null,
    new.status,
    auth.uid(),
    'initial status'
  );

  return new;
end;
$$;

create or replace function public.log_order_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_status_events (
    order_id,
    store_id,
    previous_status,
    new_status,
    changed_by,
    note
  )
  values (
    new.id,
    new.store_id,
    old.status,
    new.status,
    auth.uid(),
    null
  );

  return new;
end;
$$;

create trigger trg_orders_log_initial_status
after insert on public.orders
for each row
execute function public.log_order_status_insert();

create trigger trg_orders_log_status_update
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.log_order_status_update();

-- When customer submits transfer report, mark order as transfer_submitted
create or replace function public.mark_order_transfer_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set
    payment_status = case
      when payment_status = 'waiting_transfer' then 'transfer_submitted'::public.payment_status
      else payment_status
    end,
    bank_depositor_name = coalesce(new.depositor_name, bank_depositor_name),
    transferred_at = coalesce(new.transferred_at, now())
  where id = new.order_id;

  return new;
end;
$$;

create trigger trg_transfer_reports_mark_order_submitted
after insert on public.transfer_reports
for each row
execute function public.mark_order_transfer_submitted();

-- ---------------------------------------------------------------------------
-- Permissions (least privilege for Data API exposure)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

grant select on public.stores to anon;
grant select on public.categories to anon;
grant select on public.products to anon;
grant insert on public.orders to anon;
grant insert on public.order_items to anon;
grant insert on public.transfer_reports to anon;

grant execute on function public.get_order_tracking(uuid, text) to anon;
grant execute on function public.generate_order_code() to anon;

grant select on public.stores to authenticated;
grant select, insert, update, delete on public.store_admins to authenticated;

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;

grant select, update on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, update on public.transfer_reports to authenticated;
grant select on public.order_status_events to authenticated;

grant execute on function public.is_store_admin(uuid) to anon, authenticated;
grant execute on function public.is_order_store_admin(uuid) to anon, authenticated;
grant execute on function public.get_order_tracking(uuid, text) to authenticated;
grant execute on function public.generate_order_code() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.store_admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transfer_reports enable row level security;
alter table public.order_status_events enable row level security;

-- stores
create policy stores_public_select_active
on public.stores
for select
to anon
using (is_active = true);

create policy stores_admin_select_own
on public.stores
for select
to authenticated
using ((select public.is_store_admin(id)));

create policy stores_admin_update_own
on public.stores
for update
to authenticated
using ((select public.is_store_admin(id)))
with check ((select public.is_store_admin(id)));

-- store_admins
create policy store_admins_select_for_store_admin
on public.store_admins
for select
to authenticated
using ((select public.is_store_admin(store_id)));

create policy store_admins_manage_for_store_admin
on public.store_admins
for all
to authenticated
using ((select public.is_store_admin(store_id)))
with check ((select public.is_store_admin(store_id)));

-- categories
create policy categories_public_select_active
on public.categories
for select
to anon
using (
  is_active = true
  and exists (
    select 1 from public.stores s
    where s.id = store_id
      and s.is_active = true
  )
);

create policy categories_admin_select_own
on public.categories
for select
to authenticated
using ((select public.is_store_admin(store_id)));

create policy categories_admin_insert_own
on public.categories
for insert
to authenticated
with check ((select public.is_store_admin(store_id)));

create policy categories_admin_update_own
on public.categories
for update
to authenticated
using ((select public.is_store_admin(store_id)))
with check ((select public.is_store_admin(store_id)));

create policy categories_admin_delete_own
on public.categories
for delete
to authenticated
using ((select public.is_store_admin(store_id)));

-- products
create policy products_public_select_active
on public.products
for select
to anon
using (
  is_active = true
  and exists (
    select 1 from public.stores s
    where s.id = store_id
      and s.is_active = true
  )
);

create policy products_admin_select_own
on public.products
for select
to authenticated
using ((select public.is_store_admin(store_id)));

create policy products_admin_insert_own
on public.products
for insert
to authenticated
with check ((select public.is_store_admin(store_id)));

create policy products_admin_update_own
on public.products
for update
to authenticated
using ((select public.is_store_admin(store_id)))
with check ((select public.is_store_admin(store_id)));

create policy products_admin_delete_own
on public.products
for delete
to authenticated
using ((select public.is_store_admin(store_id)));

-- orders
create policy orders_guest_insert_for_active_store
on public.orders
for insert
to anon
with check (
  exists (
    select 1 from public.stores s
    where s.id = store_id
      and s.is_active = true
  )
  and status = 'pending'
  and payment_status = 'waiting_transfer'
  and payment_method = 'bank_transfer'
  and confirmed_by is null
  and confirmed_at is null
);

create policy orders_admin_select_own
on public.orders
for select
to authenticated
using ((select public.is_store_admin(store_id)));

create policy orders_admin_update_own
on public.orders
for update
to authenticated
using ((select public.is_store_admin(store_id)))
with check ((select public.is_store_admin(store_id)));

-- order_items
create policy order_items_guest_insert
on public.order_items
for insert
to anon
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.status = 'pending'
      and o.payment_status in ('waiting_transfer', 'transfer_submitted')
  )
);

create policy order_items_admin_select_own
on public.order_items
for select
to authenticated
using ((select public.is_order_store_admin(order_id)));

create policy order_items_admin_insert_own
on public.order_items
for insert
to authenticated
with check ((select public.is_order_store_admin(order_id)));

create policy order_items_admin_update_own
on public.order_items
for update
to authenticated
using ((select public.is_order_store_admin(order_id)))
with check ((select public.is_order_store_admin(order_id)));

create policy order_items_admin_delete_own
on public.order_items
for delete
to authenticated
using ((select public.is_order_store_admin(order_id)));

-- transfer_reports
create policy transfer_reports_guest_insert
on public.transfer_reports
for insert
to anon
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.status <> 'canceled'
  )
);

create policy transfer_reports_admin_select_own
on public.transfer_reports
for select
to authenticated
using ((select public.is_order_store_admin(order_id)));

create policy transfer_reports_admin_update_own
on public.transfer_reports
for update
to authenticated
using ((select public.is_order_store_admin(order_id)))
with check ((select public.is_order_store_admin(order_id)));

-- order_status_events
create policy order_status_events_admin_select_own
on public.order_status_events
for select
to authenticated
using ((select public.is_store_admin(store_id)));
