-- RECON WATER V5: safe, read-only deployment prerequisite check.
-- This query does not create, alter, approve or delete anything.
SELECT 'products' AS object_name, to_regclass('public.products') IS NOT NULL AS present
UNION ALL SELECT 'product_packages', to_regclass('public.product_packages') IS NOT NULL
UNION ALL SELECT 'inventory_lots', to_regclass('public.inventory_lots') IS NOT NULL
UNION ALL SELECT 'order_allocations_v2', to_regclass('public.order_allocations_v2') IS NOT NULL
UNION ALL SELECT 'inventory_events_v2', to_regclass('public.inventory_events_v2') IS NOT NULL
UNION ALL SELECT 'service_submit_order_v2', to_regprocedure('public.service_submit_order_v2(uuid,text,text,jsonb,jsonb,text)') IS NOT NULL
UNION ALL SELECT 'service_admin_order_transition_v2', to_regprocedure('public.service_admin_order_transition_v2(uuid,text,uuid)') IS NOT NULL
UNION ALL SELECT 'service_admin_set_package_v2', to_regprocedure('public.service_admin_set_package_v2(uuid,integer,boolean,integer,uuid)') IS NOT NULL;
