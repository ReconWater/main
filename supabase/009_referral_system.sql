-- Recon Water — referral attribution + stackable one-time 5% reward codes
-- Additive schema only. No PL/pgSQL functions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  referrer_name text,
  referrer_email text,
  active boolean DEFAULT true,
  internal_note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS referrer_name text;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS referrer_email text;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS internal_note text DEFAULT '';
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_unique
  ON public.referral_codes (upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_email_unique
  ON public.referral_codes (lower(referrer_email));
CREATE INDEX IF NOT EXISTS referral_codes_active_idx
  ON public.referral_codes (active, created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  source_order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  reward_code text,
  redeemed_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  redeemed_at timestamptz
);

ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS referral_id uuid REFERENCES public.referral_codes(id) ON DELETE RESTRICT;
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT;
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS reward_code text;
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS redeemed_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS redeemed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_source_order_unique
  ON public.referral_rewards (source_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_reward_code_unique
  ON public.referral_rewards (upper(reward_code))
  WHERE reward_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_redeemed_order_unique
  ON public.referral_rewards (redeemed_order_id)
  WHERE redeemed_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_rewards_available_idx
  ON public.referral_rewards (referral_id, created_at)
  WHERE redeemed_order_id IS NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_id uuid REFERENCES public.referral_codes(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_reward_referral_id uuid REFERENCES public.referral_codes(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_reward_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_reward_discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_reward_currency text;

UPDATE public.referral_codes SET active = true WHERE active IS NULL;
UPDATE public.referral_codes SET internal_note = '' WHERE internal_note IS NULL;
UPDATE public.referral_codes SET created_at = now() WHERE created_at IS NULL;
UPDATE public.referral_codes SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_codes, public.referral_rewards FROM anon, authenticated;
GRANT ALL ON public.referral_codes, public.referral_rewards TO service_role;

COMMIT;
