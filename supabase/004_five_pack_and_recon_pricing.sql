-- Recon Water additive migration: add the 5-vial pack and apply current pricing.
-- Requires the existing V5 product_packages schema (003_packaging_and_lots.sql).
-- Run once in Supabase SQL Editor after a backup. Does not recreate users or orders.
BEGIN;

ALTER TABLE public.product_packages DROP CONSTRAINT IF EXISTS product_packages_code_check;
ALTER TABLE public.product_packages DROP CONSTRAINT IF EXISTS product_packages_vials_per_pack_check;
ALTER TABLE public.product_packages DROP CONSTRAINT IF EXISTS valid_pack_configuration;

ALTER TABLE public.product_packages
  ADD CONSTRAINT product_packages_code_check CHECK (code IN ('single','five','ten','case')),
  ADD CONSTRAINT product_packages_vials_per_pack_check CHECK (vials_per_pack IN (1,5,10,25)),
  ADD CONSTRAINT valid_pack_configuration CHECK (
    (code='single' AND vials_per_pack=1 AND stock_kind='loose') OR
    (code='five' AND vials_per_pack=5 AND stock_kind='loose') OR
    (code='ten' AND vials_per_pack=10 AND stock_kind='loose') OR
    (code='case' AND vials_per_pack=25 AND stock_kind='sealed')
  );

INSERT INTO public.product_packages(
  product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request
)
SELECT p.id,'five','RW-BAC-05','5-vial pack',5,'loose',7000,true,30
FROM public.products p
WHERE p.sku='BW-30ML'
ON CONFLICT(product_id,code) DO UPDATE SET
  sku=excluded.sku,
  label=excluded.label,
  vials_per_pack=excluded.vials_per_pack,
  stock_kind=excluded.stock_kind,
  price_cents=excluded.price_cents,
  active=excluded.active,
  max_per_request=excluded.max_per_request,
  updated_at=now();

UPDATE public.product_packages pp
SET price_cents = CASE pp.code
      WHEN 'single' THEN 1500
      WHEN 'five'   THEN 7000
      WHEN 'ten'    THEN 13000
      WHEN 'case'   THEN 30000
    END,
    active = true,
    label = CASE pp.code
      WHEN 'single' THEN 'Single vial'
      WHEN 'five'   THEN '5-vial pack'
      WHEN 'ten'    THEN '10-vial pack'
      WHEN 'case'   THEN 'Factory-sealed case'
    END,
    updated_at = now()
FROM public.products p
WHERE pp.product_id=p.id
  AND p.sku='BW-30ML'
  AND pp.code IN ('single','five','ten','case');

COMMIT;
