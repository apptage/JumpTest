import { createClient } from '@supabase/supabase-js';

// Static process.env.NEXT_PUBLIC_* so Next.js inlines values in the client bundle.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local (local) or Vercel env (production).'
  );
}

export const appEnv =
  process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
