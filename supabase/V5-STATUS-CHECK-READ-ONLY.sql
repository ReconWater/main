-- READ-ONLY: determines whether V5 database objects exist. Does not mutate data.
SELECT name, to_regclass('public.' || name) IS NOT NULL AS exists_in_database
FROM (VALUES ('product_packages'),('inventory_lots'),('inventory_events_v2'),('order_allocations_v2'),('package_price_events_v2')) AS expected(name);
SELECT proname, pg_get_function_identity_arguments(oid) AS signature
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'service_%_v2' ORDER BY proname;
