-- Recon Water Canadian shipping killswitch.
-- Adds an owner/admin controlled switch between live Chit Chats and a fixed $25 CAD fallback.
-- Requires 010_chitchats_shipping.sql and the existing app_settings/orders tables.
BEGIN;

DO $preflight$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(x.name ORDER BY x.name) INTO v_missing
  FROM (VALUES
    ('app_settings',to_regclass('public.app_settings') IS NOT NULL),
    ('orders',to_regclass('public.orders') IS NOT NULL),
    ('shipping_quotes',to_regclass('public.shipping_quotes') IS NOT NULL),
    ('shipping_profiles',to_regclass('public.shipping_profiles') IS NOT NULL),
    ('recon_store_shipping_quote',to_regprocedure('public.recon_store_shipping_quote(jsonb,public.market_code,jsonb,text,text,numeric,text,text,jsonb,integer)') IS NOT NULL),
    ('recon_create_order_v1',to_regprocedure('public.recon_create_order_v1(uuid,text,text,jsonb,public.market_code,character,numeric,jsonb,text,text,text,text)') IS NOT NULL)
  ) x(name,ok)
  WHERE NOT x.ok;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RECON_SHIPPING_KILLSWITCH_PREFLIGHT_FAILED: %',array_to_string(v_missing,', ');
  END IF;
END
$preflight$;

-- Default remains live Chit Chats. Existing configuration is never overwritten.
INSERT INTO public.app_settings(key,value,public_read,updated_at)
VALUES(
  'recon_shipping_mode',
  jsonb_build_object('mode','chitchats','flat_rate_cad',25),
  false,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Keep the human-facing carrier field consistent with the provider attached to
-- the verified quote. recon_create_order_v1 writes shipping_provider before commit.
CREATE OR REPLACE FUNCTION public.recon_sync_shipping_carrier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $fn$
BEGIN
  IF NEW.shipping_provider='flat_rate' THEN
    NEW.carrier:='Flat rate';
  ELSIF NEW.shipping_provider='chitchats' THEN
    NEW.carrier:='Chit Chats';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_recon_sync_shipping_carrier ON public.orders;
CREATE TRIGGER trg_recon_sync_shipping_carrier
BEFORE INSERT OR UPDATE OF shipping_provider,carrier
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.recon_sync_shipping_carrier();

COMMIT;
