import { createClient } from '@supabase/supabase-js';

// Public Supabase project settings. These values are safe to ship to the browser.
// Deployment VITE_* values still take precedence when present.
const PUBLIC_SUPABASE_URL = 'https://tcwymmpvaoetmyxgoixi.supabase.co';
const PUBLIC_SUPABASE_KEY = 'sb_publishable_QM3hQ7kk2UnpDKT7VyVoMA_iTsB18zK';

const url = (import.meta.env.VITE_SUPABASE_URL || PUBLIC_SUPABASE_URL).trim();
const anonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  PUBLIC_SUPABASE_KEY
).trim();

export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
