import { createClient } from '@supabase/supabase-js';

// Public Supabase project settings. These values are safe to ship to the browser.
// Deployment VITE_* values still take precedence when present.
const PUBLIC_SUPABASE_URL = 'https://tcwymmpvaoetmyxgoixi.supabase.co';
const PUBLIC_SUPABASE_KEY = 'sb_publishable_QM3hQ7kk2UnpDKT7VyVoMA_iTsB18zK';

const url = (import.meta.env.VITE_SUPABASE_URL || PUBLIC_SUPABASE_URL).trim();
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  PUBLIC_SUPABASE_KEY
).trim();

export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT'));
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function callApi(action, session, payload = {}) {
  const response = await fetch(`/.netlify/functions/api?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Service unavailable. Check the Netlify Function configuration.');
  }

  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const money = cents =>
  cents == null
    ? 'Price pending'
    : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
