-- Recon Water: remove the retired Chit Chats integration.
-- Preserves the rest of the commerce schema and restores the pre-Chit-Chats
-- shared shipping helper if migration 010 had wrapped it.
BEGIN;

-- Restore the exact shared shipping helper that existed before the Chit Chats
-- migration, but only when that preserved backup exists.
DO $restore_shipping$
DECLARE
  v_backup_oid oid;
  v_def text;
  v_restored text;
BEGIN
  SELECT p.oid
    INTO v_backup_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'recon_mbl_calculate_shipping_before_chitchats_20261025'
  ORDER BY p.oid
  LIMIT 1;

  IF v_backup_oid IS NOT NULL THEN
    SELECT pg_get_functiondef(v_backup_oid) INTO v_def;
    v_restored := regexp_replace(
      v_def,
      'CREATE OR REPLACE FUNCTION[[:space:]]+public[.]recon_mbl_calculate_shipping_before_chitchats_20261025[[:space:]]*[(]',
      'CREATE OR REPLACE FUNCTION public.mbl_calculate_shipping(',
      'i'
    );

    IF v_restored <> v_def THEN
      EXECUTE v_restored;
    END IF;
  END IF;
END
$restore_shipping$;

-- Remove the trigger introduced only to label Chit Chats/flat-rate orders.
DROP TRIGGER IF EXISTS trg_recon_sync_shipping_carrier ON public.orders;

-- Drop all integration-specific helper functions without depending on exact
-- argument signatures or optional custom types.
DO $drop_functions$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'recon_sync_shipping_carrier',
        'recon_save_shipping_mode',
        'recon_store_shipping_quote',
        'recon_resolve_checkout_shipping',
        'recon_create_order_v1',
        'recon_shipping_address_fingerprint',
        'recon_shipping_items_fingerprint',
        'recon_is_shipping_variant',
        'recon_mbl_calculate_shipping_before_chitchats_20261025'
      ])
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  END LOOP;
END
$drop_functions$;

-- Remove the retired runtime mode setting if it was created.
DO $remove_setting$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    DELETE FROM public.app_settings WHERE key = 'recon_shipping_mode';
  END IF;
END
$remove_setting$;

-- Remove Chit Chats-specific order metadata. Core shipping_cents,
-- shipping_currency and the shipping JSON address remain intact.
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS shipping_provider,
  DROP COLUMN IF EXISTS shipping_service_code,
  DROP COLUMN IF EXISTS shipping_service_name,
  DROP COLUMN IF EXISTS shipping_estimate,
  DROP COLUMN IF EXISTS shipping_quote_id,
  DROP COLUMN IF EXISTS shipping_quote_at;

-- Remove quote/profile storage created solely for the integration.
DROP TABLE IF EXISTS public.shipping_quote_items CASCADE;
DROP TABLE IF EXISTS public.shipping_quotes CASCADE;
DROP TABLE IF EXISTS public.shipping_profiles CASCADE;

-- Remove the Chit Chats-specific description if the shared helper exists.
DO $clear_comment$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='mbl_calculate_shipping'
  LOOP
    EXECUTE format(
      'COMMENT ON FUNCTION %I.%I(%s) IS NULL',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  END LOOP;
END
$clear_comment$;

NOTIFY pgrst, 'reload schema';
COMMIT;
