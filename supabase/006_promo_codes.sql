-- Recon Water - domestic promo codes
-- Additive schema only. No PL/pgSQL functions are created by this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  min_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (min_subtotal_cents >= 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  starts_on date,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  internal_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_code_format CHECK (code = upper(code) AND code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  CONSTRAINT promo_percentage_value CHECK (discount_type <> 'percentage' OR discount_value BETWEEN 1 AND 100),
  CONSTRAINT promo_date_order CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_unique ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS promo_codes_active_idx ON public.promo_codes(active, starts_on, ends_on);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_discount_currency text;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
GRANT ALL ON public.promo_codes TO service_role;

COMMIT;
