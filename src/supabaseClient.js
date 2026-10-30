import { createClient } from '@supabase/supabase-js';
import { appEnvName, publicEnv } from './env.public.js';

// Branch env: .env.staging.local (GammaQuality-Staging) or .env.production.local (GammaQuality).
// See .env.example — run `npm run env:sync` then fill in Supabase Dashboard → API keys.
const SUPABASE_URL = publicEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = publicEnv('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Run npm run env:sync and edit .env.<mode>.local'
  );
}

export const appEnv = appEnvName();
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
