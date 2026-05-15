-- STEP 3 (run after STEP 2 completed)
-- Function-only script to avoid SQL editor partial-selection issues.

create or replace function public.quote_order_price(
  p_order_id uuid,
  p_subtotal_amount integer,
  p_delivery_fee integer,
  p_price_note text default null
)
returns table (
  order_id uuid,
  order_code text,
  price_status public.order_price_status,
  payment_status public.payment_status,
  subtotal_amount integer,
  delivery_fee integer,
  total_amount integer,
  quoted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_subtotal_amount < 0 or p_delivery_fee < 0 then
    raise exception 'amount must be >= 0';
  end if;

  if not public.is_order_store_admin(p_order_id) then
    raise exception 'forbidden';
  end if;

  return query
  update public.orders o
  set
    subtotal_amount = p_subtotal_amount,
    delivery_fee = p_delivery_fee,
    total_amount = p_subtotal_amount + p_delivery_fee,
    price_status = 'quoted'::public.order_price_status,
    price_note = p_price_note,
    quoted_at = now(),
    quoted_by = auth.uid(),
    payment_status = 'waiting_transfer'::public.payment_status,
    updated_at = now()
  where o.id = p_order_id
    and o.status = 'pending'
  returning
    o.id,
    o.order_code,
    o.price_status,
    o.payment_status,
    o.subtotal_amount,
    o.delivery_fee,
    o.total_amount,
    o.quoted_at;

  if not found then
    raise exception 'order not found or cannot be quoted';
  end if;
end;
$$;

grant execute on function public.quote_order_price(uuid, integer, integer, text)
  to authenticated;

create or replace function public.get_order_tracking_v2(
  p_lookup_token uuid,
  p_customer_phone text
)
returns table (
  order_code text,
  status public.order_status,
  payment_status public.payment_status,
  price_status public.order_price_status,
  price_note text,
  subtotal_amount integer,
  delivery_fee integer,
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
    o.price_status,
    o.price_note,
    o.subtotal_amount,
    o.delivery_fee,
    o.total_amount,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.lookup_token = p_lookup_token
    and regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
  limit 1;
$$;

grant execute on function public.get_order_tracking_v2(uuid, text)
  to anon, authenticated;
