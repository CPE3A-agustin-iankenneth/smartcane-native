import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '@/constants/config';

export type NavigationTarget = {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
  created_at: string;
};

/**
 * Supabase client singleton.
 * URL and anon key come from EXPO_PUBLIC_ env vars (see .env.local).
 */
export const supabase = createClient<{ active_navigation: NavigationTarget }>(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  {
    realtime: { params: { eventsPerSecond: 2 } },
  },
);
