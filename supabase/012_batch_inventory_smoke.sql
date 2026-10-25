-- Read-only verification after 012_batch_state_inventory.sql.
SELECT to_regclass('public.recon_inventory_lots') AS lots_table,
       to_regclass('public.recon_inventory_lot_movements') AS movement_table,
       to_regclass('public.recon_inventory_config') AS config_table,
       to_regprocedure('public.recon_open_inventory_case(uuid,uuid)') AS open_case_rpc,
       to_regprocedure('public.recon_activate_batch_inventory(uuid,uuid)') AS activate_rpc;

SELECT c.product_id,c.enabled,c.case_size,c.activated_at,
       p.slug,p.name
FROM public.recon_inventory_config c
JOIN public.products p ON p.id=c.product_id
ORDER BY c.updated_at DESC;

SELECT l.product_id,l.lot_code,l.expiry_date,l.status,
       l.loose_on_hand,l.loose_reserved,
       l.sealed_on_hand,l.sealed_reserved,
       l.loose_on_hand + (25*l.sealed_on_hand) AS physical_vial_equivalent
FROM public.recon_inventory_lots l
ORDER BY l.expiry_date,l.lot_code;

SELECT p.name,v.id,v.sku,v.package_type,v.package_quantity,
       v.inventory_pool_variant_id,v.metadata->>'stock_kind' AS stock_kind,
       i.on_hand,i.reserved
FROM public.product_variants v
JOIN public.products p ON p.id=v.product_id
LEFT JOIN public.inventory i ON i.variant_id=v.id
WHERE lower(p.name) LIKE '%bacteriostatic%water%'
  AND v.market::text='domestic'
ORDER BY v.package_quantity,v.sku;
