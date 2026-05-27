alter table public.stores
  add column if not exists order_policy text;

update public.stores
set
  order_policy = '3만원 이상 주문 시 배달비가 무료입니다. 3만원 미만 주문은 배달비가 별도로 추가될 수 있으며, 최종 결제 금액은 매장 확인 후 확정됩니다.',
  updated_at = now()
where slug = 'jinro'
  and (order_policy is null or btrim(order_policy) = '');

update public.stores
set
  description = null,
  bank_account_holder = case
    when bank_account_holder = '테스트마트' then '진로마트'
    else bank_account_holder
  end,
  updated_at = now()
where slug = 'jinro'
  and (
    description ilike '%테스트%'
    or bank_account_holder = '테스트마트'
  );
