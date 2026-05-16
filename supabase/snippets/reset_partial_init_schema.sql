-- Use only when the initial schema setup failed before creating app tables.
-- This removes partially-created MyStoreQR enum types/functions so
-- 202605110130_init_mystoreqr.sql can be run from a clean state.

drop function if exists public.get_order_tracking(uuid, text) cascade;
drop function if exists public.get_order_tracking_v2(uuid, text) cascade;
drop function if exists public.generate_order_code() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.log_order_status_insert() cascade;
drop function if exists public.log_order_status_update() cascade;
drop function if exists public.mark_order_transfer_submitted() cascade;
drop function if exists public.quote_order_price(uuid, jsonb, integer, integer, text, uuid) cascade;
drop function if exists public.is_order_store_admin(uuid) cascade;

drop type if exists public.transfer_report_status cascade;
drop type if exists public.payment_status cascade;
drop type if exists public.payment_method cascade;
drop type if exists public.order_price_status cascade;
drop type if exists public.order_status cascade;
drop type if exists public.order_fulfillment_type cascade;
drop type if exists public.store_admin_role cascade;
