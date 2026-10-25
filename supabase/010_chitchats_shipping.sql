-- Recon Water - Chit Chats live Canadian shipping, aligned to the current shared commerce schema.
-- Uses products + product_variants + inventory. Does NOT create product_packages.
-- The live-shipping override is scoped only to Recon Water bacteriostatic-water variants.
BEGIN;

DO $preflight$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(x.name ORDER BY x.name) INTO v_missing
  FROM (VALUES
    ('products',to_regclass('public.products') IS NOT NULL),
    ('product_variants',to_regclass('public.product_variants') IS NOT NULL),
    ('orders',to_regclass('public.orders') IS NOT NULL),
    ('order_items',to_regclass('public.order_items') IS NOT NULL),
    ('create_order_v3',to_regprocedure('public.create_order_v3(uuid,text,text,jsonb,public.market_code,character,numeric,jsonb,text,uuid,text)') IS NOT NULL),
    ('create_order_v5',to_regprocedure('public.create_order_v5(uuid,text,text,jsonb,public.market_code,character,numeric,jsonb,text,uuid,text,text)') IS NOT NULL)
  ) x(name,ok)
  WHERE NOT x.ok;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RECON_CHITCHATS_PREFLIGHT_FAILED: %',array_to_string(v_missing,', ');
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.shipping_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  package_type text NOT NULL DEFAULT 'parcel',
  weight_g numeric(10,2),
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_profiles_variant_uq UNIQUE (variant_id),
  CONSTRAINT shipping_profiles_dimensions_ck CHECK (
    (weight_g IS NULL OR weight_g > 0) AND
    (length_cm IS NULL OR length_cm > 0) AND
    (width_cm IS NULL OR width_cm > 0) AND
    (height_cm IS NULL OR height_cm > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.shipping_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market public.market_code NOT NULL,
  address_fingerprint text NOT NULL,
  items_fingerprint text NOT NULL,
  provider text NOT NULL DEFAULT 'chitchats',
  service_code text NOT NULL,
  service_name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency character(3) NOT NULL,
  estimate text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipping_quotes_expiry_idx ON public.shipping_quotes(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipping_quote_items (
  quote_id uuid NOT NULL REFERENCES public.shipping_quotes(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (quote_id,variant_id)
);

ALTER TABLE public.shipping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_quote_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_profiles,public.shipping_quotes,public.shipping_quote_items FROM anon,authenticated;
GRANT ALL ON public.shipping_profiles,public.shipping_quotes,public.shipping_quote_items TO service_role;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_provider text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_service_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_service_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_estimate text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_quote_id uuid REFERENCES public.shipping_quotes(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_quote_at timestamptz;

-- Create inactive profile rows for the domestic Recon Water variants without inventing measurements.
INSERT INTO public.shipping_profiles(variant_id,label,active)
SELECT v.id,
       CASE
         WHEN v.package_quantity=1 THEN 'Single vial'
         WHEN v.package_quantity=5 THEN '5-vial pack'
         WHEN v.package_quantity=10 THEN '10-vial pack'
         WHEN v.package_quantity=25 THEN '25-vial case'
         ELSE coalesce(nullif(btrim(v.package_type),''),p.name)
       END,
       false
FROM public.product_variants v
JOIN public.products p ON p.id=v.product_id
WHERE v.market='domestic'::public.market_code
  AND v.package_quantity IN (1,5,10,25)
  AND (lower(p.name) LIKE '%bacteriostatic%water%' OR lower(p.slug) LIKE '%bacteriostatic%water%')
ON CONFLICT (variant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recon_is_shipping_variant(p_variant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=public
AS $fn$
  SELECT EXISTS(
    SELECT 1
    FROM public.product_variants v
    JOIN public.products p ON p.id=v.product_id
    WHERE v.id=p_variant_id
      AND (lower(p.name) LIKE '%bacteriostatic%water%' OR lower(p.slug) LIKE '%bacteriostatic%water%')
  );
$fn$;

CREATE OR REPLACE FUNCTION public.recon_shipping_address_fingerprint(p_address jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=public
AS $fn$
  SELECT md5((coalesce(p_address,'{}'::jsonb)-'shipping_quote_id')::text);
$fn$;

CREATE OR REPLACE FUNCTION public.recon_shipping_items_fingerprint(p_items jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=public
AS $fn$
  WITH n AS (
    SELECT (x.item->>'variant_id')::uuid AS variant_id,
           sum((x.item->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x(item)
    GROUP BY 1
  )
  SELECT md5(coalesce((SELECT jsonb_agg(jsonb_build_object('variant_id',variant_id::text,'quantity',quantity) ORDER BY variant_id::text)::text FROM n),'[]'));
$fn$;

CREATE OR REPLACE FUNCTION public.recon_store_shipping_quote(
  p_shipping_address jsonb,
  p_market public.market_code,
  p_items jsonb,
  p_service_code text,
  p_service_name text,
  p_amount numeric,
  p_currency text,
  p_estimate text DEFAULT NULL,
  p_provider_payload jsonb DEFAULT '{}'::jsonb,
  p_ttl_minutes integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $fn$
DECLARE v_id uuid:=gen_random_uuid(); v_line record;
BEGIN
  IF p_market<>'domestic'::public.market_code THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CHITCHATS_DOMESTIC_ONLY'; END IF;
  IF p_shipping_address IS NULL OR jsonb_typeof(p_shipping_address)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SHIPPING_ADDRESS'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ITEMS'; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR upper(btrim(coalesce(p_currency,'')))<>'CAD' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SHIPPING_QUOTE'; END IF;
  IF p_ttl_minutes NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SHIPPING_QUOTE'; END IF;

  FOR v_line IN SELECT (x.item->>'variant_id')::uuid variant_id,sum((x.item->>'quantity')::integer)::integer quantity FROM jsonb_array_elements(p_items)x(item) GROUP BY 1 LOOP
    IF v_line.quantity<=0 OR NOT public.recon_is_shipping_variant(v_line.variant_id) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ITEMS';
    END IF;
  END LOOP;

  INSERT INTO public.shipping_quotes(id,market,address_fingerprint,items_fingerprint,provider,service_code,service_name,amount,currency,estimate,provider_payload,expires_at)
  VALUES(v_id,p_market,public.recon_shipping_address_fingerprint(p_shipping_address),public.recon_shipping_items_fingerprint(p_items),'chitchats',btrim(p_service_code),btrim(p_service_name),round(p_amount,2),'CAD',p_estimate,coalesce(p_provider_payload,'{}'::jsonb),now()+make_interval(mins=>p_ttl_minutes));

  INSERT INTO public.shipping_quote_items(quote_id,variant_id,quantity)
  SELECT v_id,(x.item->>'variant_id')::uuid,sum((x.item->>'quantity')::integer)::integer
  FROM jsonb_array_elements(p_items)x(item) GROUP BY 2;
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_resolve_checkout_shipping(
  p_shipping_address jsonb,
  p_market public.market_code,
  p_shipping_total numeric,
  p_items jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $fn$
DECLARE v_quote_id uuid; v_quote public.shipping_quotes%rowtype; v_recon boolean:=false;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_items)x(item)
    WHERE public.recon_is_shipping_variant((x.item->>'variant_id')::uuid)
  ) INTO v_recon;

  -- This wrapper is only for Recon Water checkout. Non-Recon orders continue
  -- through the existing create_order_v3/v4/v5 path and never call this function.
  IF NOT v_recon THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ITEMS';
  END IF;

  -- Chit Chats is not used for this product cross-border. Remove the legacy flat rate instead of silently charging it.
  IF p_market<>'domestic'::public.market_code THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INTERNATIONAL_SHIPPING_UNAVAILABLE';
  END IF;

  BEGIN v_quote_id:=nullif(btrim(coalesce(p_shipping_address->>'shipping_quote_id','')),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_REQUIRED'; END;
  IF v_quote_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_REQUIRED'; END IF;

  SELECT * INTO v_quote FROM public.shipping_quotes WHERE id=v_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.consumed_at IS NOT NULL OR v_quote.expires_at<=now() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_EXPIRED'; END IF;
  IF v_quote.market<>p_market OR upper(btrim(v_quote.currency::text))<>'CAD'
     OR v_quote.address_fingerprint<>public.recon_shipping_address_fingerprint(p_shipping_address)
     OR v_quote.items_fingerprint<>public.recon_shipping_items_fingerprint(p_items)
     OR p_shipping_total IS NULL OR round(p_shipping_total,2)<>round(v_quote.amount,2)
  THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_CHANGED'; END IF;
  RETURN round(v_quote.amount,2);
END
$fn$;

-- Wrapper used by Recon Water checkout so referral attribution/rewards and Chit Chats metadata
-- commit in the same database transaction as the existing v5 checkout chain.
CREATE OR REPLACE FUNCTION public.recon_create_order_v1(
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_email text,
  p_shipping_address jsonb,
  p_market public.market_code,
  p_currency character,
  p_shipping_total numeric,
  p_items jsonb,
  p_payment_method text,
  p_promo_code text DEFAULT NULL,
  p_referral_code text DEFAULT NULL,
  p_referral_reward_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $fn$
DECLARE v_result jsonb; v_order public.orders%rowtype; v_ref public.referral_codes%rowtype; v_reward public.referral_rewards%rowtype; v_discount numeric(12,2):=0; v_quote public.shipping_quotes%rowtype; v_verified_shipping numeric(12,2); v_quote_id uuid;
BEGIN
  -- Validate and lock the live quote before entering the existing checkout chain.
  -- The transaction-local setting lets mbl_calculate_shipping() recognize this trusted
  -- Recon Water checkout without changing create_order_v3/v4/v5 signatures.
  v_verified_shipping:=public.recon_resolve_checkout_shipping(p_shipping_address,p_market,p_shipping_total,p_items);
  BEGIN
    v_quote_id:=nullif(btrim(coalesce(p_shipping_address->>'shipping_quote_id','')),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_REQUIRED';
  END;
  PERFORM set_config('recon.shipping_quote_id',v_quote_id::text,true);

  v_result:=public.create_order_v5(p_idempotency_key,p_customer_name,p_customer_email,p_shipping_address,p_market,p_currency,v_verified_shipping,p_items,p_payment_method,NULL,NULL,p_promo_code);
  SELECT * INTO v_order FROM public.orders WHERE id=(v_result->>'order_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ORDER_NOT_FOUND'; END IF;

  UPDATE public.shipping_quotes
  SET consumed_at=now()
  WHERE id=v_quote_id AND consumed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_EXPIRED'; END IF;

  IF nullif(btrim(coalesce(p_referral_code,'')),'') IS NOT NULL THEN
    SELECT * INTO v_ref FROM public.referral_codes WHERE upper(code)=upper(btrim(p_referral_code)) AND coalesce(active,true) LIMIT 1;
    IF NOT FOUND OR lower(btrim(coalesce(v_ref.referrer_email,'')))=lower(btrim(p_customer_email)) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVALID_REFERRAL'; END IF;
    UPDATE public.orders SET referral_id=v_ref.id,referral_code=v_ref.code WHERE id=v_order.id;
  END IF;

  IF nullif(btrim(coalesce(p_referral_reward_code,'')),'') IS NOT NULL THEN
    SELECT rr.* INTO v_reward FROM public.referral_rewards rr JOIN public.referral_codes rc ON rc.id=rr.referral_id
    WHERE upper(rr.reward_code)=upper(btrim(p_referral_reward_code)) AND rr.redeemed_order_id IS NULL AND coalesce(rc.active,true)
      AND lower(btrim(coalesce(rc.referrer_email,'')))=lower(btrim(p_customer_email))
    ORDER BY rr.created_at LIMIT 1 FOR UPDATE OF rr;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVALID_REFERRAL_REWARD'; END IF;
    v_discount:=round(greatest(0,v_order.subtotal)*0.05,2);
    IF v_discount<=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVALID_REFERRAL_REWARD'; END IF;
    UPDATE public.referral_rewards SET redeemed_order_id=v_order.id,redeemed_at=now() WHERE id=v_reward.id AND redeemed_order_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVALID_REFERRAL_REWARD'; END IF;
    UPDATE public.orders SET
      original_subtotal=coalesce(original_subtotal,subtotal),
      subtotal=greatest(0,subtotal-v_discount),
      discount_total=coalesce(discount_total,0)+v_discount,
      total=greatest(0,subtotal-v_discount+shipping_total),
      referral_reward_referral_id=v_reward.referral_id,
      referral_reward_code=v_reward.reward_code,
      referral_reward_discount_cents=round(v_discount*100)::integer,
      referral_reward_currency='CAD',
      updated_at=now()
    WHERE id=v_order.id;
  END IF;

  BEGIN
    SELECT * INTO v_quote FROM public.shipping_quotes WHERE id=v_quote_id;
    IF FOUND THEN
      UPDATE public.orders SET shipping_provider=v_quote.provider,shipping_service_code=v_quote.service_code,shipping_service_name=v_quote.service_name,
        shipping_estimate=v_quote.estimate,shipping_quote_id=v_quote.id,shipping_quote_at=v_quote.created_at,
        carrier='Chit Chats',updated_at=now() WHERE id=v_order.id;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;

  SELECT * INTO v_order FROM public.orders WHERE id=v_order.id;
  UPDATE public.email_outbox SET payload=payload||jsonb_build_object('subtotal',coalesce(v_order.original_subtotal,v_order.subtotal),'discount_total',coalesce(v_order.discount_total,0),'shipping_total',v_order.shipping_total,'total',v_order.total),updated_at=now()
  WHERE dedupe_key='order-created:'||v_order.order_number;
  UPDATE public.commerce_events SET value=greatest(0,v_order.total),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('referral_reward_applied',v_order.referral_reward_code IS NOT NULL)
  WHERE order_id=v_order.id AND event_type='order_created';
  RETURN public.order_result_json(v_order.id,true)||jsonb_build_object('referral_code',v_order.referral_code,'referral_reward_code',v_order.referral_reward_code,'referral_reward_discount_cents',coalesce(v_order.referral_reward_discount_cents,0));
END
$fn$;

REVOKE ALL ON FUNCTION public.recon_store_shipping_quote(jsonb,public.market_code,jsonb,text,text,numeric,text,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recon_store_shipping_quote(jsonb,public.market_code,jsonb,text,text,numeric,text,text,jsonb,integer) TO service_role;
REVOKE ALL ON FUNCTION public.recon_resolve_checkout_shipping(jsonb,public.market_code,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recon_resolve_checkout_shipping(jsonb,public.market_code,numeric,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.recon_create_order_v1(uuid,text,text,jsonb,public.market_code,character,numeric,jsonb,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recon_create_order_v1(uuid,text,text,jsonb,public.market_code,character,numeric,jsonb,text,text,text,text) TO service_role;

-- Preserve the exact pre-Chit-Chats shipping implementation once, then wrap the
-- existing helper. This avoids modifying create_order_v3/v4/v5 and therefore remains
-- compatible with formatting or implementation changes inside those checkout functions.
DO $backup_shipping$
DECLARE
  v_source_oid oid:=to_regprocedure('public.mbl_calculate_shipping(public.market_code,numeric,jsonb)');
  v_backup_oid oid:=to_regprocedure('public.recon_mbl_calculate_shipping_before_chitchats_20261025(public.market_code,numeric,jsonb)');
  v_def text;
  v_copy text;
BEGIN
  IF v_source_oid IS NULL THEN
    RAISE EXCEPTION 'RECON_CHITCHATS_PATCH_ABORT: public.mbl_calculate_shipping(market_code,numeric,jsonb) was not found';
  END IF;

  IF v_backup_oid IS NULL THEN
    SELECT pg_get_functiondef(v_source_oid) INTO v_def;
    v_copy:=regexp_replace(
      v_def,
      'CREATE OR REPLACE FUNCTION[[:space:]]+public[.]mbl_calculate_shipping[[:space:]]*[(]',
      'CREATE OR REPLACE FUNCTION public.recon_mbl_calculate_shipping_before_chitchats_20261025(',
      'i'
    );
    IF v_copy=v_def THEN
      RAISE EXCEPTION 'RECON_CHITCHATS_PATCH_ABORT: could not clone the current shipping helper safely';
    END IF;
    EXECUTE v_copy;
  END IF;
END
$backup_shipping$;

REVOKE ALL ON FUNCTION public.recon_mbl_calculate_shipping_before_chitchats_20261025(public.market_code,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recon_mbl_calculate_shipping_before_chitchats_20261025(public.market_code,numeric,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mbl_calculate_shipping(
  p_market public.market_code,
  p_subtotal numeric,
  p_items jsonb
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp'
AS $fn$
DECLARE
  v_quote_id uuid;
  v_quote public.shipping_quotes%rowtype;
  v_has_recon boolean:=false;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x(item)
    WHERE public.recon_is_shipping_variant((x.item->>'variant_id')::uuid)
  ) INTO v_has_recon;

  IF NOT v_has_recon THEN
    RETURN public.recon_mbl_calculate_shipping_before_chitchats_20261025(p_market,p_subtotal,p_items);
  END IF;

  -- Recon Water no longer uses any legacy flat-rate branch.
  IF p_market<>'domestic'::public.market_code THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INTERNATIONAL_SHIPPING_UNAVAILABLE';
  END IF;

  BEGIN
    v_quote_id:=nullif(current_setting('recon.shipping_quote_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_quote_id:=NULL;
  END;
  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_REQUIRED';
  END IF;

  SELECT * INTO v_quote
  FROM public.shipping_quotes
  WHERE id=v_quote_id;

  IF NOT FOUND
     OR v_quote.consumed_at IS NOT NULL
     OR v_quote.expires_at<=now()
     OR v_quote.market<>p_market
     OR upper(btrim(v_quote.currency::text))<>'CAD'
     OR v_quote.items_fingerprint<>public.recon_shipping_items_fingerprint(p_items)
  THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SHIPPING_QUOTE_EXPIRED';
  END IF;

  RETURN round(v_quote.amount,2);
END
$fn$;

COMMENT ON FUNCTION public.mbl_calculate_shipping(public.market_code,numeric,jsonb)
IS 'Shared shipping resolver. Recon Water bacteriostatic-water variants require a transaction-scoped live Chit Chats quote; all other products delegate to the preserved pre-Chit-Chats helper.';

COMMIT;
