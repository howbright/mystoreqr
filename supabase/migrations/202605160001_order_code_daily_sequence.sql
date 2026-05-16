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
