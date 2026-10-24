-- Recon Water additive migration: dedicated international request channel.
-- International rules are server-authoritative:
--   * 1-5 loose vials per request
--   * $20 USD per vial, no quantity discounts
--   * flat $30 CAD delivery charge
-- Run once after 003_packaging_and_lots.sql (and 004 if used). Back up first.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'domestic',
  ADD COLUMN IF NOT EXISTS product_currency text NOT NULL DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_currency text NOT NULL DEFAULT 'CAD';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_currency text NOT NULL DEFAULT 'CAD';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_market_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_product_currency_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_currency_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_cents_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_market_check CHECK (market IN ('domestic','international')),
  ADD CONSTRAINT orders_product_currency_check CHECK (product_currency IN ('CAD','USD')),
  ADD CONSTRAINT orders_shipping_currency_check CHECK (shipping_currency IN ('CAD','USD')),
  ADD CONSTRAINT orders_shipping_cents_check CHECK (shipping_cents >= 0);

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_unit_currency_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_unit_currency_check CHECK (unit_currency IN ('CAD','USD'));

CREATE INDEX IF NOT EXISTS orders_market_date_idx ON public.orders(market,created_at DESC);

CREATE OR REPLACE FUNCTION public.service_submit_international_order_v1(
  p_customer_id uuid,
  p_email text,
  p_name text,
  p_shipping jsonb,
  p_quantity integer,
  p_notes text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_order uuid;
  v_product public.products%ROWTYPE;
  v_pack public.product_packages%ROWTYPE;
  v_free integer := 0;
  v_country text;
  v_product_price integer := 2000; -- USD cents, fixed by business rule.
  v_shipping integer := 3000;      -- CAD cents, flat delivery rate.
BEGIN
  IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_customer_id) THEN
    RAISE EXCEPTION 'A verified customer account is required';
  END IF;

  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 100
     OR length(coalesce(p_email,'')) > 200
     OR length(coalesce(p_notes,'')) > 1000 THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;

  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'International requests are limited to 1-5 vials';
  END IF;

  IF p_shipping IS NULL OR jsonb_typeof(p_shipping) <> 'object'
     OR length(btrim(coalesce(p_shipping->>'address',''))) < 5
     OR length(btrim(coalesce(p_shipping->>'city',''))) < 2
     OR length(btrim(coalesce(p_shipping->>'country',''))) < 2
     OR length(p_shipping::text) > 1200 THEN
    RAISE EXCEPTION 'Invalid international delivery address';
  END IF;

  v_country := upper(btrim(coalesce(p_shipping->>'country','')));
  IF v_country IN ('CANADA','CA','CAN') THEN
    RAISE EXCEPTION 'International requests require a destination outside Canada';
  END IF;

  IF (SELECT count(*) FROM public.orders
      WHERE customer_id=p_customer_id AND created_at>now()-interval '15 minutes') >= 3 THEN
    RAISE EXCEPTION 'Too many recent requests';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE sku='BW-30ML' AND is_active=true
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;

  -- Reuse the single-vial package identity for stock allocation only. The order item
  -- snapshots its international SKU, label, USD price and currency independently.
  SELECT * INTO v_pack
  FROM public.product_packages
  WHERE product_id=v_product.id AND code='single'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Single-vial inventory configuration unavailable'; END IF;

  SELECT coalesce(sum(greatest(0,l.loose_on_hand-l.loose_reserved)),0)::integer INTO v_free
  FROM public.inventory_lots l
  WHERE l.product_id=v_product.id
    AND l.status='available'
    AND l.expiry_date>current_date;

  IF v_free < p_quantity THEN
    RAISE EXCEPTION 'Insufficient loose-vial inventory';
  END IF;

  INSERT INTO public.orders(
    customer_id,customer_name,customer_email,shipping,notes,status,
    subtotal_cents,market,product_currency,shipping_cents,shipping_currency
  ) VALUES (
    p_customer_id,btrim(p_name),p_email,p_shipping,coalesce(p_notes,''),'pending_review',
    v_product_price*p_quantity,'international','USD',v_shipping,'CAD'
  ) RETURNING id INTO v_order;

  INSERT INTO public.order_items(
    order_id,product_id,product_name,sku,quantity,unit_price_cents,
    package_id,package_label,vials_per_pack,stock_kind,unit_currency
  ) VALUES (
    v_order,v_product.id,v_product.name,'RW-BAC-INTL',p_quantity,v_product_price,
    v_pack.id,'International single vial',1,'loose','USD'
  );

  RETURN v_order;
END $$;

REVOKE ALL ON FUNCTION public.service_submit_international_order_v1(uuid,text,text,jsonb,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_submit_international_order_v1(uuid,text,text,jsonb,integer,text)
  TO service_role;

COMMIT;
