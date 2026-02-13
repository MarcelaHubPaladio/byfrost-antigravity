import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Allow the UI to boot even when Vite env vars are not configured.
// Falls back to this project's Supabase instance.
const FALLBACK_SUPABASE_URL = "https://pryoirzeghatrgecwrci.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs";

const envUrl = env.SUPABASE_URL;
const envKey = env.SUPABASE_ANON_KEY;

// In real deployments, the app should point to *your* Supabase project.
// The fallback is only for local preview convenience.
const useEnv = Boolean(envUrl && envKey);

export const SUPABASE_URL_IN_USE = useEnv ? envUrl! : FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY_IN_USE = useEnv ? envKey! : FALLBACK_SUPABASE_ANON_KEY;

const supabaseUrl = SUPABASE_URL_IN_USE;
const supabaseAnonKey = SUPABASE_ANON_KEY_IN_USE;

if (!useEnv) {
  console.warn(
    "Supabase env vars missing/incomplete. Using fallback project keys. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use your own Supabase project."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});