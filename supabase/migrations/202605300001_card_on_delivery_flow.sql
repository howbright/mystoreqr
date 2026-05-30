alter type public.payment_method add value if not exists 'card_on_delivery';
alter type public.payment_status add value if not exists 'waiting_card_payment';

alter table public.orders
  add column if not exists customer_price_confirmed_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_method_chk;

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
  and status = 'pending'::public.order_status
  and price_status = 'needs_review'::public.order_price_status
  and payment_status::text = 'not_ready'
  and payment_method::text in ('bank_transfer', 'card_on_delivery')
  and confirmed_by is null
  and confirmed_at is null
  and customer_price_confirmed_at is null
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
      and o.status = 'pending'::public.order_status
      and o.payment_status::text in (
        'not_ready',
        'waiting_transfer',
        'transfer_submitted',
        'waiting_card_payment'
      )
  )
);
