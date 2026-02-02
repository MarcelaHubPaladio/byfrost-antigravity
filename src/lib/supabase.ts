import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Allow the UI to boot even when Vite env vars are not configured.
// Falls back to this project's Supabase instance.
const FALLBACK_SUPABASE_URL = "https://pryoirzeghatrgecwrci.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs";

// IMPORTANT: Edge Functions URLs are hardcoded to this project.
// If the frontend points to another Supabase project via env vars, auth tokens won't validate
// against our Edge Functions (leading to "Unauthorized").
const EXPECTED_PROJECT_REF = "pryoirzeghatrgecwrci";

function isExpectedProjectUrl(url?: string | null) {
  const u = String(url ?? "");
  return u.includes(EXPECTED_PROJECT_REF);
}

const envUrl = env.SUPABASE_URL;
const envKey = env.SUPABASE_ANON_KEY;

const useEnv = Boolean(envUrl && envKey && isExpectedProjectUrl(envUrl));

const supabaseUrl = useEnv ? envUrl! : FALLBACK_SUPABASE_URL;
const supabaseAnonKey = useEnv ? envKey! : FALLBACK_SUPABASE_ANON_KEY;

if (!useEnv) {
  if (envUrl && !isExpectedProjectUrl(envUrl)) {
    console.warn(
      "Supabase env vars point to a different project. Using fallback project keys to match Edge Functions.",
      { envUrl }
    );
  } else {
    console.warn(
      "Supabase env vars missing/incomplete. Using fallback project keys. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to override (must match this project)."
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});