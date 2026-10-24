-- Recon Water V5. APPLY ONLY AFTER A DATABASE BACKUP; run once in SQL Editor.
-- Historic orders remain intact. Legacy stock is quarantined pending physical reconciliation.
-- This release uses v2 RPCs; old RPCs remain for historical compatibility but are not called by the new API.
BEGIN;

CREATE TABLE IF NOT EXISTS public.product_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 code text NOT NULL CHECK (code IN ('single','ten','case')),
 sku text NOT NULL UNIQUE,
 label text NOT NULL,
 vials_per_pack integer NOT NULL CHECK (vials_per_pack IN (1,10,25)),
 stock_kind text NOT NULL CHECK (stock_kind IN ('loose','sealed')),
 price_cents integer CHECK (price_cents IS NULL OR price_cents > 0),
 active boolean NOT NULL DEFAULT false,
 max_per_request integer NOT NULL DEFAULT 10 CHECK (max_per_request BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,code),
 CONSTRAINT valid_pack_configuration CHECK (
   (code='single' AND vials_per_pack=1 AND stock_kind='loose') OR
   (code='ten' AND vials_per_pack=10 AND stock_kind='loose') OR
   (code='case' AND vials_per_pack=25 AND stock_kind='sealed'))
);

CREATE TABLE IF NOT EXISTS public.inventory_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 lot_code text NOT NULL,
 expiry_date date,
 supplier_reference text NOT NULL DEFAULT '',
 location text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'quarantine' CHECK(status IN ('available','quarantine','recalled')),
 loose_on_hand integer NOT NULL DEFAULT 0 CHECK(loose_on_hand>=0),
 loose_reserved integer NOT NULL DEFAULT 0 CHECK(loose_reserved>=0 AND loose_reserved<=loose_on_hand),
 sealed_on_hand integer NOT NULL DEFAULT 0 CHECK(sealed_on_hand>=0),
 sealed_reserved integer NOT NULL DEFAULT 0 CHECK(sealed_reserved>=0 AND sealed_reserved<=sealed_on_hand),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,lot_code)
);
CREATE INDEX IF NOT EXISTS inventory_lots_fefo_idx ON public.inventory_lots(product_id,status,expiry_date,id);

CREATE TABLE IF NOT EXISTS public.inventory_events_v2 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 lot_id uuid NOT NULL REFERENCES public.inventory_lots(id),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 loose_delta integer NOT NULL DEFAULT 0,
 sealed_delta integer NOT NULL DEFAULT 0,
 loose_reserved_delta integer NOT NULL DEFAULT 0,
 sealed_reserved_delta integer NOT NULL DEFAULT 0,
 reason text NOT NULL,
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.product_packages(id) ON DELETE RESTRICT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS package_label text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vials_per_pack integer;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS stock_kind text;
-- Replace the old one-product-per-order uniqueness with one-package-per-order.
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_product_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_package_idx ON public.order_items(order_id,package_id);
-- Preserve historical HW-* numbers but use Recon Water prefix for new requests.
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT ('RW-' || upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 12)));
-- Old rows keep a NULL package_id and their original 1-vial pricing snapshots.

CREATE TABLE IF NOT EXISTS public.order_allocations_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
 lot_id uuid NOT NULL REFERENCES public.inventory_lots(id) ON DELETE RESTRICT,
 stock_kind text NOT NULL CHECK(stock_kind IN ('loose','sealed')),
 units integer NOT NULL CHECK(units>0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','released','fulfilled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_item_id,lot_id)
);
CREATE INDEX IF NOT EXISTS allocations_item_idx ON public.order_allocations_v2(order_item_id);

CREATE TABLE IF NOT EXISTS public.package_price_events_v2 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 package_id uuid NOT NULL REFERENCES public.product_packages(id),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 old_price_cents integer,
 new_price_cents integer,
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_events_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_allocations_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_price_events_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_packages,public.inventory_lots,public.inventory_events_v2,public.order_allocations_v2,public.package_price_events_v2 FROM anon,authenticated;
GRANT ALL ON public.product_packages,public.inventory_lots,public.inventory_events_v2,public.order_allocations_v2,public.package_price_events_v2 TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Seed exactly three variants of the existing product. Prices are intentionally UNSET.
INSERT INTO public.product_packages(product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request)
SELECT p.id,v.code,v.sku,v.label,v.units,v.kind,NULL,false,v.maximum
FROM public.products p CROSS JOIN (VALUES
 ('single','RW-BAC-01','Single vial',1,'loose',50),
 ('ten','RW-BAC-10','10-vial pack',10,'loose',20),
 ('case','RW-BAC-25','Factory-sealed case',25,'sealed',10)
) AS v(code,sku,label,units,kind,maximum)
WHERE p.sku='BW-30ML'
ON CONFLICT(product_id,code) DO NOTHING;
-- No invented lot number or expiry. Old stock is held until an authorized reconciliation.
INSERT INTO public.inventory_lots(product_id,lot_code,loose_on_hand,status)
SELECT id,'LEGACY-RECONCILE',stock_quantity,'quarantine' FROM public.products
WHERE sku='BW-30ML' AND stock_quantity>0
ON CONFLICT(product_id,lot_code) DO NOTHING;

-- Service-only helpers; all stock operations use locked row updates inside a transaction.
CREATE OR REPLACE FUNCTION public.service_submit_order_v2(
 p_customer_id uuid,p_email text,p_name text,p_shipping jsonb,p_items jsonb,p_notes text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_i jsonb; v_pack public.product_packages%ROWTYPE; v_product public.products%ROWTYPE;
 v_qty integer; v_sum bigint:=0; v_vials integer:=0; v_seen uuid[]:=ARRAY[]::uuid[]; v_free integer;
BEGIN
 IF p_customer_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_customer_id)
 OR length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 100
 OR length(coalesce(p_notes,''))>1000 THEN RAISE EXCEPTION 'Invalid customer details'; END IF;
 IF p_shipping IS NULL OR jsonb_typeof(p_shipping)<>'object'
 OR length(btrim(coalesce(p_shipping->>'address','')))<5
 OR length(btrim(coalesce(p_shipping->>'city','')))<2
 OR coalesce(p_shipping->>'region','') NOT IN ('AB','BC','MB','NB','NL','NT','NS','NU','ON','PE','QC','SK','YT')
 OR upper(btrim(coalesce(p_shipping->>'postal',''))) !~ '^[A-CEGHJ-NPRSTVXY][0-9][A-CEGHJ-NPRSTV-Z][ ]?[0-9][A-CEGHJ-NPRSTV-Z][0-9]$'
 OR (p_shipping->>'country') IS DISTINCT FROM 'Canada' OR length(p_shipping::text)>1200
 THEN RAISE EXCEPTION 'Invalid Canadian shipping address'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 3
 THEN RAISE EXCEPTION 'Select up to three packaging formats'; END IF;
 IF (SELECT count(*) FROM public.orders WHERE customer_id=p_customer_id AND created_at>now()-interval '15 minutes')>=3
 THEN RAISE EXCEPTION 'Too many recent requests'; END IF;
 INSERT INTO public.orders(customer_id,customer_name,customer_email,shipping,notes)
 VALUES(p_customer_id,btrim(p_name),p_email,p_shipping,coalesce(p_notes,'')) RETURNING id INTO v_id;
 FOR v_i IN SELECT value FROM jsonb_array_elements(p_items) AS t(value) LOOP
   IF (v_i->>'package_id') IS NULL OR (v_i->>'quantity') IS NULL THEN RAISE EXCEPTION 'Invalid package selection'; END IF;
   SELECT * INTO v_pack FROM public.product_packages WHERE id=(v_i->>'package_id')::uuid AND active=true;
   IF NOT FOUND OR v_pack.price_cents IS NULL THEN RAISE EXCEPTION 'Package unavailable'; END IF;
   SELECT * INTO v_product FROM public.products WHERE id=v_pack.product_id AND is_active=true;
   IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;
   IF v_pack.id=ANY(v_seen) THEN RAISE EXCEPTION 'Duplicate package'; END IF;
   v_seen:=array_append(v_seen,v_pack.id);
   v_qty:=(v_i->>'quantity')::integer;
   IF v_qty IS NULL OR v_qty NOT BETWEEN 1 AND v_pack.max_per_request THEN RAISE EXCEPTION 'Invalid package quantity'; END IF;
   v_vials:=v_vials+v_qty*v_pack.vials_per_pack;
   IF v_vials>500 THEN RAISE EXCEPTION 'Request exceeds vial limit'; END IF;
   SELECT coalesce(sum(CASE WHEN v_pack.stock_kind='loose' THEN greatest(0,l.loose_on_hand-l.loose_reserved)
                      ELSE greatest(0,l.sealed_on_hand-l.sealed_reserved) END),0)::integer INTO v_free
   FROM public.inventory_lots l WHERE l.product_id=v_product.id AND l.status='available' AND l.expiry_date>current_date;
   -- Requests do not reserve stock. Check each pool again at approval.
   IF v_free< v_qty * CASE WHEN v_pack.stock_kind='loose' THEN v_pack.vials_per_pack ELSE 1 END
   THEN RAISE EXCEPTION 'Insufficient inventory for selected package'; END IF;
   IF v_pack.code='ten' AND v_qty > (SELECT coalesce(sum((l.loose_on_hand-l.loose_reserved)/10),0)
      FROM public.inventory_lots l WHERE l.product_id=v_product.id AND l.status='available' AND l.expiry_date>current_date)
   THEN RAISE EXCEPTION 'Insufficient same-lot 10-vial bundles'; END IF;
   INSERT INTO public.order_items(order_id,product_id,product_name,sku,quantity,unit_price_cents,
      package_id,package_label,vials_per_pack,stock_kind)
   VALUES(v_id,v_product.id,v_product.name,v_pack.sku,v_qty,v_pack.price_cents,
      v_pack.id,v_pack.label,v_pack.vials_per_pack,v_pack.stock_kind);
   v_sum:=v_sum+v_qty::bigint*v_pack.price_cents;
 END LOOP;
 -- Mixed single and ten-pack requests must fit the SAME shared loose-vial pool.
 IF (SELECT coalesce(sum(i.quantity*i.vials_per_pack),0) FROM public.order_items i WHERE i.order_id=v_id AND i.stock_kind='loose') >
    (SELECT coalesce(sum(greatest(0,l.loose_on_hand-l.loose_reserved)),0)
       FROM public.inventory_lots l WHERE l.status='available' AND l.expiry_date>current_date AND
       l.product_id=(SELECT product_id FROM public.order_items WHERE order_id=v_id LIMIT 1))
 THEN RAISE EXCEPTION 'Insufficient loose-vial inventory'; END IF;
 IF v_sum>2147483647 THEN RAISE EXCEPTION 'Request total exceeds limit'; END IF;
 UPDATE public.orders SET subtotal_cents=v_sum::integer WHERE id=v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_order_transition_v2(p_order_id uuid,p_status text,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders%ROWTYPE; v_item record; v_lot record; v_needed integer; v_free integer; v_take integer;
 v_a record;
BEGIN
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF v_order.status='pending_review' AND p_status='approved' THEN
   -- Deterministic item and FEFO lot locking. Failure rolls back ALL allocations.
   FOR v_item IN SELECT * FROM public.order_items WHERE order_id=p_order_id
        ORDER BY CASE WHEN vials_per_pack=10 THEN 0 WHEN stock_kind='loose' THEN 1 ELSE 2 END,id LOOP
     IF v_item.package_id IS NULL THEN RAISE EXCEPTION 'Legacy request needs manual reconciliation'; END IF;
     v_needed:=v_item.quantity*CASE WHEN v_item.stock_kind='loose' THEN v_item.vials_per_pack ELSE 1 END;
     FOR v_lot IN SELECT * FROM public.inventory_lots
       WHERE product_id=v_item.product_id AND status='available' AND expiry_date>current_date
       ORDER BY expiry_date,id FOR UPDATE LOOP
       EXIT WHEN v_needed=0;
       v_free:=CASE WHEN v_item.stock_kind='loose' THEN v_lot.loose_on_hand-v_lot.loose_reserved ELSE v_lot.sealed_on_hand-v_lot.sealed_reserved END;
       IF v_item.vials_per_pack=10 THEN v_free:=(v_free/10)*10; END IF;
       v_take:=least(v_needed,v_free);
       IF v_take>0 THEN
         IF v_item.stock_kind='loose' THEN
           UPDATE public.inventory_lots SET loose_reserved=loose_reserved+v_take,updated_at=now() WHERE id=v_lot.id;
           INSERT INTO public.inventory_events_v2(lot_id,actor_id,loose_reserved_delta,reason,order_id)
           VALUES(v_lot.id,p_actor,v_take,'Reserve approved request',p_order_id);
         ELSE
           UPDATE public.inventory_lots SET sealed_reserved=sealed_reserved+v_take,updated_at=now() WHERE id=v_lot.id;
           INSERT INTO public.inventory_events_v2(lot_id,actor_id,sealed_reserved_delta,reason,order_id)
           VALUES(v_lot.id,p_actor,v_take,'Reserve sealed case',p_order_id);
         END IF;
         INSERT INTO public.order_allocations_v2(order_item_id,lot_id,stock_kind,units)
         VALUES(v_item.id,v_lot.id,v_item.stock_kind,v_take);
         v_needed:=v_needed-v_take;
       END IF;
     END LOOP;
     IF v_needed>0 THEN RAISE EXCEPTION 'Insufficient available inventory'; END IF;
   END LOOP;
 ELSIF v_order.status='approved' AND p_status IN ('cancelled','fulfilled') THEN
   IF p_status='fulfilled' AND EXISTS(SELECT 1 FROM public.order_allocations_v2 a JOIN public.order_items oi ON oi.id=a.order_item_id JOIN public.inventory_lots l ON l.id=a.lot_id WHERE oi.order_id=p_order_id AND a.state='reserved' AND (l.status<>'available' OR l.expiry_date<=current_date)) THEN RAISE EXCEPTION 'Allocated lot is not eligible for fulfillment'; END IF;
   IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=p_order_id AND package_id IS NULL) THEN
     IF p_status='cancelled' THEN RAISE EXCEPTION 'Legacy approved order requires reconciliation'; END IF;
   END IF;
   FOR v_a IN SELECT a.* FROM public.order_allocations_v2 a JOIN public.order_items i ON i.id=a.order_item_id
      WHERE i.order_id=p_order_id AND a.state='reserved' ORDER BY a.lot_id,a.id LOOP
     PERFORM 1 FROM public.inventory_lots WHERE id=v_a.lot_id FOR UPDATE;
     IF v_a.stock_kind='loose' THEN
       UPDATE public.inventory_lots SET loose_reserved=loose_reserved-v_a.units,
         loose_on_hand=loose_on_hand-CASE WHEN p_status='fulfilled' THEN v_a.units ELSE 0 END,
         updated_at=now() WHERE id=v_a.lot_id;
       INSERT INTO public.inventory_events_v2(lot_id,actor_id,loose_delta,loose_reserved_delta,reason,order_id)
       VALUES(v_a.lot_id,p_actor,CASE WHEN p_status='fulfilled' THEN -v_a.units ELSE 0 END,-v_a.units,
         CASE WHEN p_status='fulfilled' THEN 'Fulfilled loose vials' ELSE 'Released reservation' END,p_order_id);
     ELSE
       UPDATE public.inventory_lots SET sealed_reserved=sealed_reserved-v_a.units,
         sealed_on_hand=sealed_on_hand-CASE WHEN p_status='fulfilled' THEN v_a.units ELSE 0 END,
         updated_at=now() WHERE id=v_a.lot_id;
       INSERT INTO public.inventory_events_v2(lot_id,actor_id,sealed_delta,sealed_reserved_delta,reason,order_id)
       VALUES(v_a.lot_id,p_actor,CASE WHEN p_status='fulfilled' THEN -v_a.units ELSE 0 END,-v_a.units,
         CASE WHEN p_status='fulfilled' THEN 'Fulfilled sealed cases' ELSE 'Released reservation' END,p_order_id);
     END IF;
     UPDATE public.order_allocations_v2 SET state=CASE WHEN p_status='fulfilled' THEN 'fulfilled' ELSE 'released' END,
       updated_at=now() WHERE id=v_a.id;
   END LOOP;
 ELSIF v_order.status='pending_review' AND p_status='cancelled' THEN NULL;
 ELSE RAISE EXCEPTION 'Invalid order status transition';
 END IF;
 UPDATE public.orders SET status=p_status,updated_at=now() WHERE id=p_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_manual_order_v2(
 p_name text,p_email text,p_package_id uuid,p_quantity integer,p_notes text,p_actor uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pack public.product_packages%ROWTYPE; v_product public.products%ROWTYPE; v_order uuid;
BEGIN
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 100 OR
    length(btrim(coalesce(p_email,''))) NOT BETWEEN 5 AND 200 OR position('@' IN p_email)=0 OR
    length(coalesce(p_notes,''))>1000 THEN RAISE EXCEPTION 'Invalid manual order'; END IF;
 SELECT * INTO v_pack FROM public.product_packages WHERE id=p_package_id;
 IF NOT FOUND OR v_pack.price_cents IS NULL THEN RAISE EXCEPTION 'Package price not configured'; END IF;
 IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND v_pack.max_per_request OR p_quantity*v_pack.vials_per_pack>500 OR p_quantity::bigint*v_pack.price_cents>2147483647 THEN RAISE EXCEPTION 'Invalid package quantity'; END IF;
 SELECT * INTO v_product FROM public.products WHERE id=v_pack.product_id;
 INSERT INTO public.orders(customer_name,customer_email,notes,status,subtotal_cents)
 VALUES(btrim(p_name),btrim(p_email),coalesce(p_notes,''),'pending_review',v_pack.price_cents*p_quantity)
 RETURNING id INTO v_order;
 INSERT INTO public.order_items(order_id,product_id,product_name,sku,quantity,unit_price_cents,
 package_id,package_label,vials_per_pack,stock_kind)
 VALUES(v_order,v_product.id,v_product.name,v_pack.sku,p_quantity,v_pack.price_cents,
 v_pack.id,v_pack.label,v_pack.vials_per_pack,v_pack.stock_kind);
 PERFORM public.service_admin_order_transition_v2(v_order,'approved',p_actor);
 RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_set_package_v2(
 p_package_id uuid,p_price_cents integer,p_active boolean,p_max_per_request integer,p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old integer;
BEGIN
 IF (p_price_cents IS NOT NULL AND p_price_cents NOT BETWEEN 1 AND 100000000)
   OR p_max_per_request NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid package pricing'; END IF;
 SELECT price_cents INTO v_old FROM public.product_packages WHERE id=p_package_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Package not found'; END IF;
 UPDATE public.product_packages SET price_cents=p_price_cents,active=coalesce(p_active,false),
 max_per_request=p_max_per_request,updated_at=now() WHERE id=p_package_id;
 IF v_old IS DISTINCT FROM p_price_cents THEN
  INSERT INTO public.package_price_events_v2(package_id,actor_id,old_price_cents,new_price_cents)
  VALUES(p_package_id,p_actor,v_old,p_price_cents);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_receive_lot_v2(
 p_product_id uuid,p_lot_code text,p_expiry date,p_supplier text,p_location text,
 p_loose integer,p_sealed integer,p_actor uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF length(btrim(coalesce(p_lot_code,''))) NOT BETWEEN 2 AND 80 OR p_expiry IS NULL OR p_expiry<=current_date OR
 length(btrim(coalesce(p_supplier,'')))<3 OR p_loose NOT BETWEEN 0 AND 100000 OR p_sealed NOT BETWEEN 0 AND 10000 OR
 p_loose+p_sealed=0 THEN RAISE EXCEPTION 'Invalid receiving details'; END IF;
 INSERT INTO public.inventory_lots(product_id,lot_code,expiry_date,supplier_reference,location,loose_on_hand,sealed_on_hand,status)
 VALUES(p_product_id,btrim(p_lot_code),p_expiry,btrim(p_supplier),coalesce(p_location,''),p_loose,p_sealed,'quarantine') RETURNING id INTO v_id;
 INSERT INTO public.inventory_events_v2(lot_id,actor_id,loose_delta,sealed_delta,reason)
 VALUES(v_id,p_actor,p_loose,p_sealed,'Received; held for release verification');
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_update_lot_v2(
 p_lot_id uuid,p_lot_code text,p_expiry date,p_supplier text,p_location text,p_status text,p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lot public.inventory_lots%ROWTYPE;
BEGIN
 SELECT * INTO v_lot FROM public.inventory_lots WHERE id=p_lot_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;
 IF length(btrim(coalesce(p_lot_code,''))) NOT BETWEEN 2 AND 80 OR p_expiry IS NULL OR
 length(btrim(coalesce(p_supplier,'')))<3 OR p_status NOT IN ('available','quarantine','recalled')
 THEN RAISE EXCEPTION 'Invalid lot details'; END IF;
 IF p_status='available' AND p_expiry<=current_date THEN RAISE EXCEPTION 'Expired lot cannot be released'; END IF;
 UPDATE public.inventory_lots SET lot_code=btrim(p_lot_code),expiry_date=p_expiry,
 supplier_reference=btrim(p_supplier),location=coalesce(p_location,''),status=p_status,updated_at=now() WHERE id=p_lot_id;
 INSERT INTO public.inventory_events_v2(lot_id,actor_id,reason)
 VALUES(p_lot_id,p_actor,'Lot metadata/status reviewed: '||v_lot.status||' → '||p_status);
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_adjust_lot_v2(
 p_lot_id uuid,p_loose_delta integer,p_sealed_delta integer,p_reason text,p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lot public.inventory_lots%ROWTYPE;
BEGIN
 IF p_loose_delta IS NULL OR p_sealed_delta IS NULL OR (p_loose_delta=0 AND p_sealed_delta=0) OR
 abs(p_loose_delta)>100000 OR abs(p_sealed_delta)>10000 OR
 length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 200 THEN RAISE EXCEPTION 'Invalid stock adjustment'; END IF;
 SELECT * INTO v_lot FROM public.inventory_lots WHERE id=p_lot_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;
 IF v_lot.loose_on_hand+p_loose_delta<v_lot.loose_reserved OR
    v_lot.sealed_on_hand+p_sealed_delta<v_lot.sealed_reserved THEN RAISE EXCEPTION 'Cannot adjust below reserved inventory'; END IF;
 UPDATE public.inventory_lots SET loose_on_hand=loose_on_hand+p_loose_delta,
 sealed_on_hand=sealed_on_hand+p_sealed_delta,updated_at=now() WHERE id=p_lot_id;
 INSERT INTO public.inventory_events_v2(lot_id,actor_id,loose_delta,sealed_delta,reason)
 VALUES(p_lot_id,p_actor,p_loose_delta,p_sealed_delta,btrim(p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.service_admin_open_case_v2(p_lot_id uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lot public.inventory_lots%ROWTYPE;
BEGIN
 SELECT * INTO v_lot FROM public.inventory_lots WHERE id=p_lot_id FOR UPDATE;
 IF NOT FOUND OR v_lot.status<>'available' OR v_lot.expiry_date<=current_date OR
 v_lot.sealed_on_hand-v_lot.sealed_reserved<1 THEN RAISE EXCEPTION 'No eligible sealed case available'; END IF;
 UPDATE public.inventory_lots SET sealed_on_hand=sealed_on_hand-1,loose_on_hand=loose_on_hand+25,
 updated_at=now() WHERE id=p_lot_id;
 INSERT INTO public.inventory_events_v2(lot_id,actor_id,loose_delta,sealed_delta,reason)
 VALUES(p_lot_id,p_actor,25,-1,'Opened factory-sealed 25-vial case');
END $$;

-- Ensure legacy inventory mutations cannot bypass the new lot ledger after cutover.
-- Old service RPCs were granted only to service_role by the original schema. Revoke execution
-- from service_role as well, since the v5 API no longer uses these endpoints.
REVOKE EXECUTE ON FUNCTION public.service_submit_order(uuid,text,text,jsonb,jsonb,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.service_admin_set_stock(uuid,integer,uuid,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.service_admin_change_order_status(uuid,text,uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.service_admin_place_order(text,text,uuid,integer,text,uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.service_submit_order_v2(uuid,text,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_order_transition_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_manual_order_v2(text,text,uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_set_package_v2(uuid,integer,boolean,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_receive_lot_v2(uuid,text,date,text,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_update_lot_v2(uuid,text,date,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_adjust_lot_v2(uuid,integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_admin_open_case_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_submit_order_v2(uuid,text,text,jsonb,jsonb,text),
 public.service_admin_order_transition_v2(uuid,text,uuid),
 public.service_admin_manual_order_v2(text,text,uuid,integer,text,uuid),
 public.service_admin_set_package_v2(uuid,integer,boolean,integer,uuid),
 public.service_admin_receive_lot_v2(uuid,text,date,text,text,integer,integer,uuid),
 public.service_admin_update_lot_v2(uuid,text,date,text,text,text,uuid),
 public.service_admin_adjust_lot_v2(uuid,integer,integer,text,uuid),
 public.service_admin_open_case_v2(uuid,uuid) TO service_role;
COMMIT;
