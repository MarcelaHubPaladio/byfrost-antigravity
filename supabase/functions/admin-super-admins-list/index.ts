import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function parseAllowlist() {
  const raw = Deno.env.get("APP_SUPER_ADMIN_EMAILS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type Row = {
  email: string;
  userId: string | null;
  allowlisted: boolean;
  claimSuperAdmin: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  state: "not_found" | "allowlist_only" | "claim";
};

serve(async (req) => {
  const fn = "admin-super-admins-list";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdmin();

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      console.error(`[${fn}] auth.getUser failed`, { authErr });
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = authData.user;
    const isSuperAdmin = Boolean(
      (caller.app_metadata as any)?.byfrost_super_admin || (caller.app_metadata as any)?.super_admin
    );

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowlist = parseAllowlist();

    const rows: Row[] = [];

    const byEmail = new Map<string, any>();

    const PER_PAGE = 200;
    const MAX_PAGES = 25;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error(`[${fn}] listUsers failed`, { error });
        return new Response(JSON.stringify({ ok: false, error: "Failed to list users" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const users = data?.users ?? [];
      for (const u of users) {
        const email = String(u.email ?? "").toLowerCase();
        if (!email) continue;
        byEmail.set(email, u);
      }

      if (users.length < PER_PAGE) break;
    }

    // 1) Start with allowlist
    for (const email of allowlist) {
      const u = byEmail.get(email) ?? null;
      const claim = Boolean((u?.app_metadata as any)?.byfrost_super_admin || (u?.app_metadata as any)?.super_admin);

      rows.push({
        email,
        userId: u?.id ?? null,
        allowlisted: true,
        claimSuperAdmin: claim,
        createdAt: (u as any)?.created_at ?? null,
        lastSignInAt: (u as any)?.last_sign_in_at ?? null,
        state: u ? (claim ? "claim" : "allowlist_only") : "not_found",
      });
    }

    // 2) Add users with claim but not in allowlist
    for (const [email, u] of byEmail.entries()) {
      const claim = Boolean((u?.app_metadata as any)?.byfrost_super_admin || (u?.app_metadata as any)?.super_admin);
      if (!claim) continue;
      if (allowlist.includes(email)) continue;

      rows.push({
        email,
        userId: u?.id ?? null,
        allowlisted: false,
        claimSuperAdmin: true,
        createdAt: (u as any)?.created_at ?? null,
        lastSignInAt: (u as any)?.last_sign_in_at ?? null,
        state: "claim",
      });
    }

    rows.sort((a, b) =>
      a.email.localeCompare(b.email) ||
      Number(b.claimSuperAdmin) - Number(a.claimSuperAdmin) ||
      Number(b.allowlisted) - Number(a.allowlisted)
    );

    return new Response(JSON.stringify({ ok: true, rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[admin-super-admins-list] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
