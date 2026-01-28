import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  // No hard crash: allows previewing the UI without Supabase configured.
  console.warn(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local."
  );
}

export const supabase = createClient(env.SUPABASE_URL || "", env.SUPABASE_ANON_KEY || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
