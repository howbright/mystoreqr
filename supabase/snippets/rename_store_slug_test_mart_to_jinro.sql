-- Rename storefront slug from test-mart to jinro
-- Result: /s/test-mart -> /s/jinro
--
-- Safe behavior:
-- 1) Fails if "jinro" is already used by a different store.
-- 2) Updates admin_action_logs.store_slug for consistency.
-- 3) No-op if test-mart does not exist.

do $$
declare
  target_store_id uuid;
begin
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
      updated_at = now()
  where id = target_store_id;

  update public.admin_action_logs
  set store_slug = 'jinro'
  where store_slug = 'test-mart';

  raise notice 'Updated store % slug: test-mart -> jinro', target_store_id;
end $$ language plpgsql;

