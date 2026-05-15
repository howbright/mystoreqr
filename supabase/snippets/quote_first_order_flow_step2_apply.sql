-- STEP 2 (run after STEP 1 completed)
-- Prerequisite:
-- - Base schema exists (202605110130_init_mystoreqr.sql)
-- - STEP 1 enum additions already committed

-- ---------------------------------------------------------------------------
-- Type for quote flow
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.order_price_status as enum ('needs_review', 'quoted');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.payment_method as enum ('bank_transfer');
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- Product / item price can be unknown at first
-- ---------------------------------------------------------------------------
alter table public.products
  alter column price drop not null;

alter table public.order_items
  alter column unit_price drop not null;

-- ---------------------------------------------------------------------------
-- Orders: quote-first flow
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists price_status public.order_price_status not null default 'needs_review',
  add column if not exists price_note text,
  add column if not exists quoted_at timestamptz,
  add column if not exists quoted_by uuid references auth.users(id) on delete set null;

-- Drop dependent policy before changing payment_method column type.
drop policy if exists orders_guest_insert_for_active_store on public.orders;

alter table public.orders drop constraint if exists orders_payment_method_chk;

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'orders'
      and c.column_name = 'payment_method'
      and c.udt_name <> 'payment_method'
  ) then
    alter table public.orders
      alter column payment_method drop default;

    alter table public.orders
      alter column payment_method type public.payment_method
      using payment_method::public.payment_method;

    alter table public.orders
      alter column payment_method set default 'bank_transfer'::public.payment_method;
  elsif exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'orders'
      and c.column_name = 'payment_method'
      and c.udt_name = 'payment_method'
  ) then
    alter table public.orders
      alter column payment_method set default 'bank_transfer'::public.payment_method;
  end if;
end
$$;

alter table public.orders
  alter column payment_status set default 'not_ready',
  alter column subtotal_amount drop default,
  alter column total_amount drop default,
  alter column subtotal_amount drop not null,
  alter column total_amount drop not null;

alter table public.orders drop constraint if exists orders_amount_chk;
alter table public.orders drop constraint if exists orders_subtotal_amount_check;
alter table public.orders drop constraint if exists orders_total_amount_check;

alter table public.orders
  add constraint orders_subtotal_amount_non_negative_chk
    check (subtotal_amount is null or subtotal_amount >= 0),
  add constraint orders_total_amount_non_negative_chk
    check (total_amount is null or total_amount >= 0),
  add constraint orders_amount_pair_chk
    check ((subtotal_amount is null) = (total_amount is null)),
  add constraint orders_amount_math_chk
    check (total_amount is null or total_amount = subtotal_amount + delivery_fee);

create index if not exists orders_store_price_status_created_idx
  on public.orders (store_id, price_status, created_at desc);

update public.orders
set
  payment_status = 'not_ready'::public.payment_status,
  price_status = 'needs_review'::public.order_price_status,
  subtotal_amount = null,
  total_amount = null
where status = 'pending'
  and payment_status = 'waiting_transfer'::public.payment_status
  and coalesce(subtotal_amount, 0) = 0
  and coalesce(total_amount, 0) = 0;

-- ---------------------------------------------------------------------------
-- RLS policy updates
-- ---------------------------------------------------------------------------
drop policy if exists orders_guest_insert_for_active_store on public.orders;
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
  and payment_status = 'not_ready'
  and price_status = 'needs_review'
  and payment_method = 'bank_transfer'::public.payment_method
  and subtotal_amount is null
  and total_amount is null
  and confirmed_by is null
  and confirmed_at is null
);

drop policy if exists order_items_guest_insert on public.order_items;
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
      and o.payment_status in ('not_ready', 'waiting_transfer', 'transfer_submitted')
  )
);

drop policy if exists transfer_reports_guest_insert on public.transfer_reports;
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
      and o.price_status = 'quoted'
      and o.payment_status in ('waiting_transfer', 'transfer_submitted')
  )
);

