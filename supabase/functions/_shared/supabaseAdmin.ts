import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function createSupabaseAdmin(token: string) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";

  if (!url || !token) {
    throw new Error("Missing SUPABASE_URL or token");
  }

  return createClient(url, token, {
    auth: { persistSession: false },
  });
}
