-- Rename storefront slug from test-mart to jinro and store details to 진로마트
-- Result: /s/test-mart -> /s/jinro
--
-- Safe behavior:
-- 1) Fails if "jinro" is already used by a different store.
-- 2) Updates admin_action_logs.store_slug for consistency when the table exists.
-- 3) No-op if test-mart does not exist.

do $$
declare
  target_store_id uuid;
begin
  if to_regclass('public.stores') is null then
    raise notice 'public.stores table does not exist. Apply the initial mystoreqr migration before running this snippet.';
    return;
  end if;

  select id
    into target_store_id
  from public.stores
  where slug = 'test-mart'
  limit 1;

  if target_store_id is null then
    raise notice 'No store found with slug test-mart. Nothing changed.';
    return;
  end if;

  if exists (
    select 1
    from public.stores
    where slug = 'jinro'
      and id <> target_store_id
  ) then
    raise exception 'Slug "jinro" is already used by another store.';
  end if;

  update public.stores
  set slug = 'jinro',
      name = '진로마트',
      phone = '0507-1392-5070',
      address_road = '경기도 성남시 중원구 둔촌대로 159 1층 진로마트 모란점',
      address_detail = '성남동 3791',
      updated_at = now()
  where id = target_store_id;

  if to_regclass('public.admin_action_logs') is not null then
    update public.admin_action_logs
    set store_slug = 'jinro'
    where store_slug = 'test-mart';
  end if;

  raise notice 'Updated store % slug: test-mart -> jinro, name -> 진로마트, phone/address updated', target_store_id;
end $$ language plpgsql;
