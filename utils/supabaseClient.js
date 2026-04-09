import { createClient } from '@supabase/supabase-js';

// Replace these placeholders with your real values in .env.local
// (EXPO_PUBLIC_ prefix makes them available at runtime in Expo)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
