-- Recon Water - Chit Chats live Canadian shipping integration
-- Additive migration. Chit Chats live rates are used for Canadian orders only.
BEGIN;

CREATE TABLE IF NOT EXISTS public.shipping_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  package_type text NOT NULL DEFAULT 'parcel',
  weight_g numeric(10,2),
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_profile_dimensions CHECK (
    (weight_g IS NULL OR weight_g > 0) AND
    (length_cm IS NULL OR length_cm > 0) AND
    (width_cm IS NULL OR width_cm > 0) AND
    (height_cm IS NULL OR height_cm > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_profiles_package_uq
  ON public.shipping_profiles(package_id);

ALTER TABLE public.shipping_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_profiles FROM anon, authenticated;
GRANT ALL ON public.shipping_profiles TO service_role;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_provider text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_service_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_service_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_quote_cad_cents integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_estimate text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_quote_at timestamptz;

COMMIT;
