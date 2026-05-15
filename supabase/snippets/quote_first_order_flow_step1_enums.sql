-- STEP 1 (run first, alone)
-- Commit enum value additions before any usage.

alter type public.payment_status add value if not exists 'not_ready';
alter type public.order_status add value if not exists 'delivering';
