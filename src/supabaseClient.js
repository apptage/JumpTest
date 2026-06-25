import { createClient } from '@supabase/supabase-js';

// Plug in your Supabase project credentials here, or set them in a .env file
// as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
