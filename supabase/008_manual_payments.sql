-- Recon Water — manual payment rails (Interac e-Transfer + USDC on Ethereum)
-- Additive schema only. No PL/pgSQL functions.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS payment_amount_cents integer,
  ADD COLUMN IF NOT EXISTS payment_currency text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_tx_hash text,
  ADD COLUMN IF NOT EXISTS payment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_amount_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_currency_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('etransfer','usdc_eth')),
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('not_requested','awaiting_payment','paid','refunded','cancelled')),
  ADD CONSTRAINT orders_payment_amount_check
    CHECK (payment_amount_cents IS NULL OR payment_amount_cents >= 0),
  ADD CONSTRAINT orders_payment_currency_check
    CHECK (payment_currency IS NULL OR payment_currency IN ('CAD','USD'));

CREATE TABLE IF NOT EXISTS public.payment_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  etransfer_enabled boolean NOT NULL DEFAULT false,
  etransfer_email text NOT NULL DEFAULT '',
  etransfer_recipient_name text NOT NULL DEFAULT '',
  etransfer_note text NOT NULL DEFAULT '',
  usdc_eth_enabled boolean NOT NULL DEFAULT false,
  usdc_eth_address text NOT NULL DEFAULT '',
  usdc_note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.payment_settings(id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_settings FROM anon, authenticated;
GRANT ALL ON public.payment_settings TO service_role;

CREATE INDEX IF NOT EXISTS orders_payment_status_idx
  ON public.orders(payment_status, created_at DESC);

COMMIT;
