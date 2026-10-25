-- Recon Water batch-state inventory.
-- Current-schema implementation: products -> product_variants -> inventory.
-- Sealed manufacturer cases and loose/opened vials are distinct physical states.
-- Opening one case is irreversible in inventory accounting: -1 sealed case, +25 loose vials.
BEGIN;

DO $preflight$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(x.name ORDER BY x.name) INTO v_missing
  FROM (VALUES
    ('products',to_regclass('public.products') IS NOT NULL),
    ('product_variants',to_regclass('public.product_variants') IS NOT NULL),
    ('inventory',to_regclass('public.inventory') IS NOT NULL),
    ('profiles',to_regclass('public.profiles') IS NOT NULL)
  ) x(name,ok)
  WHERE NOT x.ok;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RECON_BATCH_INVENTORY_PREFLIGHT_FAILED: %',array_to_string(v_missing,', ');
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.recon_inventory_config (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  case_size integer NOT NULL DEFAULT 25 CHECK (case_size=25),
  activated_at timestamptz,
  activated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recon_inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_code text NOT NULL,
  expiry_date date NOT NULL,
  supplier_reference text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'quarantine' CHECK (status IN ('quarantine','available','recalled')),
  loose_on_hand integer NOT NULL DEFAULT 0 CHECK (loose_on_hand>=0),
  loose_reserved integer NOT NULL DEFAULT 0 CHECK (loose_reserved>=0 AND loose_reserved<=loose_on_hand),
  sealed_on_hand integer NOT NULL DEFAULT 0 CHECK (sealed_on_hand>=0),
  sealed_reserved integer NOT NULL DEFAULT 0 CHECK (sealed_reserved>=0 AND sealed_reserved<=sealed_on_hand),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id,lot_code)
);
CREATE INDEX IF NOT EXISTS recon_inventory_lots_fefo_idx
  ON public.recon_inventory_lots(product_id,status,expiry_date,id);

CREATE TABLE IF NOT EXISTS public.recon_inventory_lot_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id uuid NOT NULL REFERENCES public.recon_inventory_lots(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  loose_on_hand_delta integer NOT NULL DEFAULT 0,
  loose_reserved_delta integer NOT NULL DEFAULT 0,
  sealed_on_hand_delta integer NOT NULL DEFAULT 0,
  sealed_reserved_delta integer NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  note text NOT NULL DEFAULT '',
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recon_inventory_lot_movements_lot_idx
  ON public.recon_inventory_lot_movements(lot_id,created_at DESC);

ALTER TABLE public.recon_inventory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recon_inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recon_inventory_lot_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recon_inventory_config,public.recon_inventory_lots,public.recon_inventory_lot_movements FROM anon,authenticated;
GRANT ALL ON public.recon_inventory_config,public.recon_inventory_lots,public.recon_inventory_lot_movements TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE OR REPLACE FUNCTION public.recon_sync_variant_inventory(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $fn$
DECLARE
  v_enabled boolean:=false;
  v_loose_variant uuid;
  v_case_variant uuid;
  v_loose_free integer:=0;
  v_loose_reserved integer:=0;
  v_sealed_free integer:=0;
  v_sealed_reserved integer:=0;
  v_loose_on_hand integer:=0;
  v_sealed_on_hand integer:=0;
  r record;
BEGIN
  SELECT enabled INTO v_enabled FROM public.recon_inventory_config WHERE product_id=p_product_id;
  IF NOT coalesce(v_enabled,false) THEN
    RETURN jsonb_build_object('enabled',false);
  END IF;

  SELECT id INTO v_loose_variant
  FROM public.product_variants
  WHERE product_id=p_product_id AND market::text='domestic' AND package_quantity=1
  ORDER BY active DESC,updated_at DESC,id LIMIT 1;

  SELECT id INTO v_case_variant
  FROM public.product_variants
  WHERE product_id=p_product_id AND market::text='domestic' AND package_quantity=25
  ORDER BY active DESC,updated_at DESC,id LIMIT 1;

  IF v_loose_variant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RECON_BATCH_INVENTORY_REQUIRES_SINGLE_VIAL_VARIANT';
  END IF;
  IF v_case_variant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RECON_BATCH_INVENTORY_REQUIRES_25_VIAL_CASE_VARIANT';
  END IF;

  SELECT
    coalesce(sum(CASE WHEN status='available' AND expiry_date>=current_date THEN greatest(loose_on_hand-loose_reserved,0) ELSE 0 END),0)::integer,
    coalesce(sum(loose_reserved),0)::integer,
    coalesce(sum(CASE WHEN status='available' AND expiry_date>=current_date THEN greatest(sealed_on_hand-sealed_reserved,0) ELSE 0 END),0)::integer,
    coalesce(sum(sealed_reserved),0)::integer
  INTO v_loose_free,v_loose_reserved,v_sealed_free,v_sealed_reserved
  FROM public.recon_inventory_lots
  WHERE product_id=p_product_id;

  v_loose_on_hand:=v_loose_free+v_loose_reserved;
  v_sealed_on_hand:=v_sealed_free+v_sealed_reserved;

  PERFORM set_config('recon.inventory_sync','1',true);

  -- Single/5/10-vial formats consume the same physical loose-vial pool.
  UPDATE public.product_variants
  SET inventory_pool_variant_id=CASE WHEN id=v_loose_variant THEN NULL ELSE v_loose_variant END,
      metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{stock_kind}','"loose"'::jsonb,true),
      updated_at=now()
  WHERE product_id=p_product_id AND market::text='domestic' AND package_quantity IN (1,5,10)
    AND (inventory_pool_variant_id IS DISTINCT FROM CASE WHEN id=v_loose_variant THEN NULL ELSE v_loose_variant END
         OR lower(coalesce(metadata->>'stock_kind','')) IS DISTINCT FROM 'loose');

  -- Factory-sealed cases are a separate physical state and never share loose stock.
  UPDATE public.product_variants
  SET inventory_pool_variant_id=NULL,
      metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{stock_kind}','"sealed"'::jsonb,true),
      updated_at=now()
  WHERE id=v_case_variant
    AND (inventory_pool_variant_id IS NOT NULL OR lower(coalesce(metadata->>'stock_kind','')) IS DISTINCT FROM 'sealed');

  INSERT INTO public.inventory(variant_id,on_hand,reserved,reorder_level,incoming_quantity,updated_at)
  VALUES(v_loose_variant,v_loose_on_hand,v_loose_reserved,0,0,now())
  ON CONFLICT(variant_id) DO UPDATE
    SET on_hand=excluded.on_hand,reserved=excluded.reserved,updated_at=now()
    WHERE public.inventory.on_hand IS DISTINCT FROM excluded.on_hand OR public.inventory.reserved IS DISTINCT FROM excluded.reserved;

  INSERT INTO public.inventory(variant_id,on_hand,reserved,reorder_level,incoming_quantity,updated_at)
  VALUES(v_case_variant,v_sealed_on_hand,v_sealed_reserved,0,0,now())
  ON CONFLICT(variant_id) DO UPDATE
    SET on_hand=excluded.on_hand,reserved=excluded.reserved,updated_at=now()
    WHERE public.inventory.on_hand IS DISTINCT FROM excluded.on_hand OR public.inventory.reserved IS DISTINCT FROM excluded.reserved;

  IF to_regprocedure('public.mbl_sync_inventory_pool(uuid)') IS NOT NULL THEN
    PERFORM public.mbl_sync_inventory_pool(v_loose_variant);
  ELSE
    FOR r IN
      SELECT id,package_quantity FROM public.product_variants
      WHERE product_id=p_product_id AND market::text='domestic' AND package_quantity IN (5,10)
    LOOP
      INSERT INTO public.inventory(variant_id,on_hand,reserved,reorder_level,incoming_quantity,updated_at)
      VALUES(r.id,floor(v_loose_free::numeric/greatest(r.package_quantity,1))::integer,0,0,0,now())
      ON CONFLICT(variant_id) DO UPDATE
        SET on_hand=excluded.on_hand,reserved=0,updated_at=now();
    END LOOP;
  END IF;

  PERFORM set_config('recon.inventory_sync','0',true);
  RETURN jsonb_build_object(
    'enabled',true,
    'loose_variant_id',v_loose_variant,
    'case_variant_id',v_case_variant,
    'loose_on_hand',v_loose_on_hand,
    'loose_reserved',v_loose_reserved,
    'loose_available',v_loose_free,
    'sealed_on_hand',v_sealed_on_hand,
    'sealed_reserved',v_sealed_reserved,
    'sealed_available',v_sealed_free
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_apply_batch_delta(
  p_product_id uuid,
  p_kind text,
  p_action text,
  p_units integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $fn$
DECLARE r record; v_need integer; v_take integer; v_free integer;
BEGIN
  IF p_units<=0 THEN RETURN; END IF;
  IF p_kind NOT IN ('loose','sealed') OR p_action NOT IN ('reserve','release','consume_reserved','consume_free') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid batch inventory operation';
  END IF;
  v_need:=p_units;

  IF p_kind='loose' THEN
    IF p_action='reserve' THEN
      FOR r IN SELECT id,loose_on_hand,loose_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND status='available' AND expiry_date>=current_date AND loose_on_hand>loose_reserved
        ORDER BY expiry_date,id FOR UPDATE
      LOOP
        v_free:=r.loose_on_hand-r.loose_reserved; v_take:=least(v_need,v_free);
        UPDATE public.recon_inventory_lots SET loose_reserved=loose_reserved+v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_reserved_delta,note)
        VALUES(r.id,p_product_id,'system_reserve',v_take,'Checkout reservation mirrored from canonical loose inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    ELSIF p_action='release' THEN
      FOR r IN SELECT id,loose_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND loose_reserved>0 ORDER BY expiry_date DESC,id DESC FOR UPDATE
      LOOP
        v_take:=least(v_need,r.loose_reserved);
        UPDATE public.recon_inventory_lots SET loose_reserved=loose_reserved-v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_reserved_delta,note)
        VALUES(r.id,p_product_id,'system_release',-v_take,'Reservation release mirrored from canonical loose inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    ELSIF p_action='consume_reserved' THEN
      FOR r IN SELECT id,loose_on_hand,loose_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND loose_reserved>0 ORDER BY expiry_date,id FOR UPDATE
      LOOP
        v_take:=least(v_need,r.loose_reserved);
        UPDATE public.recon_inventory_lots SET loose_on_hand=loose_on_hand-v_take,loose_reserved=loose_reserved-v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_on_hand_delta,loose_reserved_delta,note)
        VALUES(r.id,p_product_id,'system_consume_reserved',-v_take,-v_take,'Fulfillment consumed reserved loose inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    ELSE
      FOR r IN SELECT id,loose_on_hand,loose_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND status='available' AND expiry_date>=current_date AND loose_on_hand>loose_reserved
        ORDER BY expiry_date,id FOR UPDATE
      LOOP
        v_free:=r.loose_on_hand-r.loose_reserved; v_take:=least(v_need,v_free);
        UPDATE public.recon_inventory_lots SET loose_on_hand=loose_on_hand-v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_on_hand_delta,note)
        VALUES(r.id,p_product_id,'system_consume_free',-v_take,'Physical loose inventory consumption mirrored from canonical inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    END IF;
  ELSE
    IF p_action='reserve' THEN
      FOR r IN SELECT id,sealed_on_hand,sealed_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND status='available' AND expiry_date>=current_date AND sealed_on_hand>sealed_reserved
        ORDER BY expiry_date,id FOR UPDATE
      LOOP
        v_free:=r.sealed_on_hand-r.sealed_reserved; v_take:=least(v_need,v_free);
        UPDATE public.recon_inventory_lots SET sealed_reserved=sealed_reserved+v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,sealed_reserved_delta,note)
        VALUES(r.id,p_product_id,'system_reserve',v_take,'Checkout reservation mirrored from canonical sealed-case inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    ELSIF p_action='release' THEN
      FOR r IN SELECT id,sealed_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND sealed_reserved>0 ORDER BY expiry_date DESC,id DESC FOR UPDATE
      LOOP
        v_take:=least(v_need,r.sealed_reserved);
        UPDATE public.recon_inventory_lots SET sealed_reserved=sealed_reserved-v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,sealed_reserved_delta,note)
        VALUES(r.id,p_product_id,'system_release',-v_take,'Reservation release mirrored from canonical sealed-case inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    ELSIF p_action='consume_reserved' THEN
      FOR r IN SELECT id,sealed_on_hand,sealed_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND sealed_reserved>0 ORDER BY expiry_date,id FOR UPDATE
      LOOP
        v_take:=least(v_need,r.sealed_reserved);
        UPDATE public.recon_inventory_lots SET sealed_on_hand=sealed_on_hand-v_take,sealed_reserved=sealed_reserved-v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,sealed_on_hand_delta,sealed_reserved_delta,note)
        VALUES(r.id,p_product_id,'system_consume_reserved',-v_take,-v_take,'Fulfillment consumed reserved sealed-case inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    ELSE
      FOR r IN SELECT id,sealed_on_hand,sealed_reserved FROM public.recon_inventory_lots
        WHERE product_id=p_product_id AND status='available' AND expiry_date>=current_date AND sealed_on_hand>sealed_reserved
        ORDER BY expiry_date,id FOR UPDATE
      LOOP
        v_free:=r.sealed_on_hand-r.sealed_reserved; v_take:=least(v_need,v_free);
        UPDATE public.recon_inventory_lots SET sealed_on_hand=sealed_on_hand-v_take,updated_at=now() WHERE id=r.id;
        INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,sealed_on_hand_delta,note)
        VALUES(r.id,p_product_id,'system_consume_free',-v_take,'Physical sealed-case consumption mirrored from canonical inventory');
        v_need:=v_need-v_take; EXIT WHEN v_need=0;
      END LOOP;
    END IF;
  END IF;

  IF v_need>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Batch inventory no longer matches aggregate inventory; no changes were committed.';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_mirror_inventory_to_batches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $fn$
DECLARE
  v_product uuid; v_qty integer; v_pack text; v_meta jsonb; v_pool uuid; v_enabled boolean:=false;
  v_kind text; d_on integer; d_res integer; v_consume_reserved integer;
BEGIN
  IF coalesce(current_setting('recon.inventory_sync',true),'')='1' THEN RETURN NEW; END IF;

  SELECT product_id,package_quantity,package_type,metadata,inventory_pool_variant_id
  INTO v_product,v_qty,v_pack,v_meta,v_pool
  FROM public.product_variants WHERE id=NEW.variant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT enabled INTO v_enabled FROM public.recon_inventory_config WHERE product_id=v_product;
  IF NOT coalesce(v_enabled,false) THEN RETURN NEW; END IF;

  -- Shadow 5/10 pack rows are derived from the canonical loose-vial pool.
  IF v_pool IS NOT NULL AND v_pool<>NEW.variant_id THEN RETURN NEW; END IF;

  IF v_qty=25 AND (lower(coalesce(v_meta->>'stock_kind',''))='sealed' OR lower(coalesce(v_pack,'')) LIKE '%case%') THEN
    v_kind:='sealed';
  ELSIF v_qty=1 THEN
    v_kind:='loose';
  ELSE
    RETURN NEW;
  END IF;

  d_on:=coalesce(NEW.on_hand,0)-coalesce(OLD.on_hand,0);
  d_res:=coalesce(NEW.reserved,0)-coalesce(OLD.reserved,0);

  IF d_on>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Recon Water physical inventory is batch-managed. Receive or adjust stock from Admin > Lot inventory.';
  END IF;

  IF d_res>0 THEN
    PERFORM public.recon_apply_batch_delta(v_product,v_kind,'reserve',d_res);
  END IF;

  IF d_on<0 AND d_res<0 THEN
    v_consume_reserved:=least(-d_on,-d_res);
    IF v_consume_reserved>0 THEN
      PERFORM public.recon_apply_batch_delta(v_product,v_kind,'consume_reserved',v_consume_reserved);
    END IF;
    IF (-d_res)>v_consume_reserved THEN
      PERFORM public.recon_apply_batch_delta(v_product,v_kind,'release',(-d_res)-v_consume_reserved);
    END IF;
    IF (-d_on)>v_consume_reserved THEN
      PERFORM public.recon_apply_batch_delta(v_product,v_kind,'consume_free',(-d_on)-v_consume_reserved);
    END IF;
  ELSIF d_res<0 THEN
    PERFORM public.recon_apply_batch_delta(v_product,v_kind,'release',-d_res);
  ELSIF d_on<0 THEN
    PERFORM public.recon_apply_batch_delta(v_product,v_kind,'consume_free',-d_on);
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_recon_mirror_inventory_to_batches ON public.inventory;
CREATE TRIGGER trg_recon_mirror_inventory_to_batches
AFTER UPDATE OF on_hand,reserved ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.recon_mirror_inventory_to_batches();

CREATE OR REPLACE FUNCTION public.recon_receive_inventory_lot(
  p_product_id uuid,p_lot_code text,p_expiry date,p_supplier text,p_location text,
  p_loose integer,p_sealed integer,p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_id uuid; v_enabled boolean:=false;
BEGIN
  IF p_product_id IS NULL OR length(btrim(coalesce(p_lot_code,'')))<2 OR p_expiry IS NULL
     OR p_loose<0 OR p_sealed<0 OR (p_loose=0 AND p_sealed=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid batch receipt';
  END IF;
  INSERT INTO public.recon_inventory_lots(product_id,lot_code,expiry_date,supplier_reference,location,status,loose_on_hand,sealed_on_hand,created_by,updated_by)
  VALUES(p_product_id,btrim(p_lot_code),p_expiry,btrim(coalesce(p_supplier,'')),btrim(coalesce(p_location,'')),'quarantine',p_loose,p_sealed,p_actor,p_actor)
  RETURNING id INTO v_id;
  INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_on_hand_delta,sealed_on_hand_delta,note,performed_by)
  VALUES(v_id,p_product_id,'receipt',p_loose,p_sealed,'Inventory received into quarantine',p_actor);
  SELECT enabled INTO v_enabled FROM public.recon_inventory_config WHERE product_id=p_product_id;
  IF coalesce(v_enabled,false) THEN PERFORM public.recon_sync_variant_inventory(p_product_id); END IF;
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_update_inventory_lot(
  p_lot_id uuid,p_lot_code text,p_expiry date,p_supplier text,p_location text,p_status text,p_actor uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_product uuid; v_enabled boolean:=false;
BEGIN
  IF p_status NOT IN ('quarantine','available','recalled') OR p_expiry IS NULL OR length(btrim(coalesce(p_lot_code,'')))<2 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lot update';
  END IF;
  UPDATE public.recon_inventory_lots
  SET lot_code=btrim(p_lot_code),expiry_date=p_expiry,supplier_reference=btrim(coalesce(p_supplier,'')),location=btrim(coalesce(p_location,'')),status=p_status,updated_by=p_actor,updated_at=now()
  WHERE id=p_lot_id RETURNING product_id INTO v_product;
  IF v_product IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Lot not found'; END IF;
  INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,note,performed_by)
  VALUES(p_lot_id,v_product,'lot_review','Lot metadata/status reviewed: '||p_status,p_actor);
  SELECT enabled INTO v_enabled FROM public.recon_inventory_config WHERE product_id=v_product;
  IF coalesce(v_enabled,false) THEN PERFORM public.recon_sync_variant_inventory(v_product); END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_adjust_inventory_lot(
  p_lot_id uuid,p_loose_delta integer,p_sealed_delta integer,p_reason text,p_actor uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE l public.recon_inventory_lots%rowtype; v_enabled boolean:=false;
BEGIN
  IF length(btrim(coalesce(p_reason,'')))<5 OR (coalesce(p_loose_delta,0)=0 AND coalesce(p_sealed_delta,0)=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Adjustment reason and quantity are required';
  END IF;
  SELECT * INTO l FROM public.recon_inventory_lots WHERE id=p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Lot not found'; END IF;
  IF l.loose_on_hand+coalesce(p_loose_delta,0)<l.loose_reserved OR l.sealed_on_hand+coalesce(p_sealed_delta,0)<l.sealed_reserved THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Cannot adjust physical inventory below reserved inventory';
  END IF;
  UPDATE public.recon_inventory_lots
  SET loose_on_hand=loose_on_hand+coalesce(p_loose_delta,0),sealed_on_hand=sealed_on_hand+coalesce(p_sealed_delta,0),updated_by=p_actor,updated_at=now()
  WHERE id=p_lot_id;
  INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_on_hand_delta,sealed_on_hand_delta,note,performed_by)
  VALUES(p_lot_id,l.product_id,'adjustment',coalesce(p_loose_delta,0),coalesce(p_sealed_delta,0),left(btrim(p_reason),500),p_actor);
  SELECT enabled INTO v_enabled FROM public.recon_inventory_config WHERE product_id=l.product_id;
  IF coalesce(v_enabled,false) THEN PERFORM public.recon_sync_variant_inventory(l.product_id); END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_open_inventory_case(p_lot_id uuid,p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE l public.recon_inventory_lots%rowtype; v_enabled boolean:=false;
BEGIN
  SELECT * INTO l FROM public.recon_inventory_lots WHERE id=p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Lot not found'; END IF;
  IF l.sealed_on_hand-l.sealed_reserved<1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='No unreserved sealed case is available to open';
  END IF;
  UPDATE public.recon_inventory_lots
  SET sealed_on_hand=sealed_on_hand-1,loose_on_hand=loose_on_hand+25,updated_by=p_actor,updated_at=now()
  WHERE id=p_lot_id;
  INSERT INTO public.recon_inventory_lot_movements(lot_id,product_id,movement_type,loose_on_hand_delta,sealed_on_hand_delta,note,performed_by)
  VALUES(p_lot_id,l.product_id,'case_open',25,-1,'Opened one manufacturer-sealed 25-vial case. Opened vials remain loose permanently.',p_actor);
  SELECT enabled INTO v_enabled FROM public.recon_inventory_config WHERE product_id=l.product_id;
  IF coalesce(v_enabled,false) THEN PERFORM public.recon_sync_variant_inventory(l.product_id); END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_activate_batch_inventory(p_product_id uuid,p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_reserved integer:=0; v_lots integer:=0; v_result jsonb;
BEGIN
  SELECT count(*) INTO v_lots FROM public.recon_inventory_lots WHERE product_id=p_product_id;
  IF v_lots=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Receive and reconcile at least one batch before activating batch inventory'; END IF;

  SELECT coalesce(sum(i.reserved),0)::integer INTO v_reserved
  FROM public.inventory i
  JOIN public.product_variants v ON v.id=i.variant_id
  WHERE v.product_id=p_product_id AND v.market::text='domestic';
  IF v_reserved>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Cannot activate batch inventory while existing Recon Water reservations are active. Fulfill or release them first.';
  END IF;

  INSERT INTO public.recon_inventory_config(product_id,enabled,activated_at,activated_by,updated_at)
  VALUES(p_product_id,true,now(),p_actor,now())
  ON CONFLICT(product_id) DO UPDATE SET enabled=true,activated_at=coalesce(recon_inventory_config.activated_at,now()),activated_by=p_actor,updated_at=now();

  v_result:=public.recon_sync_variant_inventory(p_product_id);
  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.recon_sync_variant_inventory(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recon_apply_batch_delta(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recon_receive_inventory_lot(uuid,text,date,text,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recon_update_inventory_lot(uuid,text,date,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recon_adjust_inventory_lot(uuid,integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recon_open_inventory_case(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recon_activate_batch_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recon_sync_variant_inventory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_apply_batch_delta(uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_receive_inventory_lot(uuid,text,date,text,text,integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_update_inventory_lot(uuid,text,date,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_adjust_inventory_lot(uuid,integer,integer,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_open_inventory_case(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_activate_batch_inventory(uuid,uuid) TO service_role;

COMMIT;
