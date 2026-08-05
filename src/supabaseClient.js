import { createClient } from '@supabase/supabase-js';

// Branch env: .env.staging.local (GammaQuality-Staging) or .env.production.local (GammaQuality).
// See .env.example — run `npm run env:sync` then fill in Supabase Dashboard → API keys.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run npm run env:sync and edit .env.<mode>.local'
  );
}

export const appEnv = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
