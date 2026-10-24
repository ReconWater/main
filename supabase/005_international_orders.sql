-- Recon Water additive migration: International order requests.
-- International rules are server-authoritative:
--   1–5 loose vials maximum
--   USD $20.00 per vial
--   CAD $30.00 flat delivery
-- Run once after 003_packaging_and_lots.sql and 004_five_pack_and_recon_pricing.sql.
BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'domestic';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal_currency text NOT NULL DEFAULT 'CAD';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_currency text NOT NULL DEFAULT 'CAD';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_market_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_subtotal_currency_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_currency_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_cents_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_market_check CHECK (market IN ('domestic','international')),
  ADD CONSTRAINT orders_subtotal_currency_check CHECK (subtotal_currency IN ('CAD','USD')),
  ADD CONSTRAINT orders_shipping_currency_check CHECK (shipping_currency IN ('CAD','USD')),
  ADD CONSTRAINT orders_shipping_cents_check CHECK (shipping_cents >= 0);

CREATE OR REPLACE FUNCTION public.service_submit_international_order_v1(
  p_email text,
  p_name text,
  p_shipping jsonb,
  p_quantity integer,
  p_notes text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_pack public.product_packages%ROWTYPE;
  v_order uuid;
  v_free integer;
  v_country text;
BEGIN
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 100 OR
     length(btrim(coalesce(p_email,''))) NOT BETWEEN 5 AND 200 OR
     position('@' IN coalesce(p_email,'')) = 0 OR
     length(coalesce(p_notes,'')) > 500 THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;

  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'International orders are limited to 1–5 vials';
  END IF;

  IF p_shipping IS NULL OR jsonb_typeof(p_shipping) <> 'object' OR
     length(btrim(coalesce(p_shipping->>'address',''))) < 5 OR
     length(btrim(coalesce(p_shipping->>'city',''))) < 2 OR
     length(btrim(coalesce(p_shipping->>'region',''))) < 1 OR
     length(btrim(coalesce(p_shipping->>'postal',''))) < 2 OR
     length(btrim(coalesce(p_shipping->>'country',''))) < 2 OR
     length(p_shipping::text) > 1200 THEN
    RAISE EXCEPTION 'A complete international delivery address is required';
  END IF;

  v_country := lower(btrim(p_shipping->>'country'));
  IF v_country IN ('canada','ca','can') THEN
    RAISE EXCEPTION 'Canadian addresses must use the domestic ordering flow';
  END IF;

  IF (SELECT count(*) FROM public.orders
      WHERE lower(customer_email)=lower(btrim(p_email))
        AND market='international'
        AND created_at > now()-interval '15 minutes') >= 3 THEN
    RAISE EXCEPTION 'Too many recent international requests';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE sku='BW-30ML' AND is_active=true
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;

  SELECT * INTO v_pack
  FROM public.product_packages
  WHERE product_id=v_product.id AND code='single'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'International format unavailable'; END IF;

  SELECT coalesce(sum(greatest(0,l.loose_on_hand-l.loose_reserved)),0)::integer
  INTO v_free
  FROM public.inventory_lots l
  WHERE l.product_id=v_product.id
    AND l.status='available'
    AND l.expiry_date>current_date;

  IF v_free < p_quantity THEN
    RAISE EXCEPTION 'Insufficient inventory for selected quantity';
  END IF;

  INSERT INTO public.orders(
    customer_id,customer_name,customer_email,shipping,notes,status,
    subtotal_cents,market,subtotal_currency,shipping_cents,shipping_currency
  ) VALUES (
    NULL,btrim(p_name),btrim(p_email),p_shipping,coalesce(p_notes,''),'pending_review',
    p_quantity*2000,'international','USD',3000,'CAD'
  ) RETURNING id INTO v_order;

  INSERT INTO public.order_items(
    order_id,product_id,product_name,sku,quantity,unit_price_cents,
    package_id,package_label,vials_per_pack,stock_kind
  ) VALUES (
    v_order,v_product.id,v_product.name,'RW-INTL-BAC-01',p_quantity,2000,
    v_pack.id,'International single vial',1,'loose'
  );

  RETURN v_order;
END
$$;

REVOKE ALL ON FUNCTION public.service_submit_international_order_v1(text,text,jsonb,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_submit_international_order_v1(text,text,jsonb,integer,text) TO service_role;

COMMIT;
