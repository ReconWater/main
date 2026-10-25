-- Recon Water - International delivery currency update
-- International delivery is now a flat USD $30.00.
-- This updates existing international order snapshots that were previously stored as CAD.

BEGIN;

UPDATE public.orders
SET shipping_currency = 'USD'
WHERE market = 'international'
  AND shipping_cents = 3000
  AND shipping_currency = 'CAD';

COMMIT;
