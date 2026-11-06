import { createClient } from '@supabase/supabase-js';
import { appEnvName, publicEnv } from './env.public.js';

// Keys from .env.local (local) or Vercel env (production). See .env.example.
const SUPABASE_URL = publicEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = publicEnv('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local (or set in Vercel).'
  );
}

export const appEnv = appEnvName();
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
