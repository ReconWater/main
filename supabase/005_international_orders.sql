-- Recon Water - International order metadata only
-- No PL/pgSQL function is required. International validation/pricing is enforced
-- by the server-side Netlify function using the Supabase service-role client.
-- Safe to run as one complete query after migrations 003 and 004.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'domestic',
  ADD COLUMN IF NOT EXISTS subtotal_currency text NOT NULL DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_currency text NOT NULL DEFAULT 'CAD';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_market_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_subtotal_currency_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_currency_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_cents_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_market_check
    CHECK (market IN ('domestic','international')),
  ADD CONSTRAINT orders_subtotal_currency_check
    CHECK (subtotal_currency IN ('CAD','USD')),
  ADD CONSTRAINT orders_shipping_currency_check
    CHECK (shipping_currency IN ('CAD','USD')),
  ADD CONSTRAINT orders_shipping_cents_check
    CHECK (shipping_cents >= 0);

COMMIT;
