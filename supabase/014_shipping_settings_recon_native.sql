-- Run in the Recon Water project (inventory_lots / product_packages).
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_read boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO service_role;
INSERT INTO public.app_settings(key,value,public_read)
VALUES ('recon_shipping_mode','{"mode":"chitchats","flat_rate_cad":25}'::jsonb,false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recon_save_shipping_mode(p_mode text,p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_value jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('chitchats','flat_25') THEN
    RAISE EXCEPTION 'Invalid shipping mode';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id=p_actor
  ) THEN
    RAISE EXCEPTION 'Administrator permission required';
  END IF;
  v_value:=jsonb_build_object('mode',p_mode,'flat_rate_cad',25,
    'updated_by',p_actor,'updated_at',now());
  INSERT INTO public.app_settings(key,value,public_read,updated_by,updated_at)
  VALUES ('recon_shipping_mode',v_value,false,p_actor,now())
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,
    public_read=false,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;

  -- Quote storage is optional in the native manual-order build.
  -- If present, expiry and settings update succeed or roll back together.
  IF to_regclass('public.shipping_quotes') IS NOT NULL THEN
    EXECUTE 'UPDATE public.shipping_quotes SET expires_at=now()
      WHERE consumed_at IS NULL AND expires_at>now()';
  END IF;
  RETURN jsonb_build_object('mode',p_mode,'flat_rate_cad',25);
END;
$function$;
REVOKE ALL ON FUNCTION public.recon_save_shipping_mode(text,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recon_save_shipping_mode(text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
