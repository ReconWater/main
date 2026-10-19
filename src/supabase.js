import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!(url && key && !url.includes('YOUR_PROJECT'));
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export async function callApi(action, session, payload = {}) {
  const response = await fetch(`/.netlify/functions/api?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(payload)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Service unavailable. Check the Netlify Function configuration.'); }
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export const money = (cents) => cents == null ? 'Price pending' : new Intl.NumberFormat('en-CA',{ style:'currency', currency:'CAD' }).format(cents/100);
