import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Edge Function: admin-supabase-usage
 * Purpose: Fetch usage statistics from Supabase Management API
 * Authorization: Only super-admins
 */

serve(async (req) => {
  // 1) Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2) Auth check: must be a super-admin
    const supabase = createSupabaseAdmin();
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const isSuperAdmin = !!(user.app_metadata?.byfrost_super_admin || user.app_metadata?.super_admin);
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Super-admin only" }), { status: 403, headers: corsHeaders });
    }

    // 3) Get Configuration
    const token = Deno.env.get("SUPABASE_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE_ACCESS_TOKEN secret" }), { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

    // 4) Fetch Usage Data
    // We want to fetch current and last 5 months to show a trend
    const now = new Date();
    const periods = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    // Fetch in parallel
    const statsPromises = periods.map(p => {
      const url = `https://api.supabase.com/v1/projects/${projectRef}/usage?year=${p.year}&month=${p.month}`;
      return fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
      }).then(res => res.json().then(data => ({ ...p, data, ok: res.ok })));
    });

    const results = await Promise.all(statsPromises);

    // Filter results and format
    const formatted = results.reverse().map(r => {
      if (!r.ok) return { year: r.year, month: r.month, error: true };
      
      return {
        year: r.year,
        month: r.month,
        periodLabel: `${r.month}/${r.year}`,
        egress_gb: (r.data.egress?.usage ?? 0) / (1024 * 1024 * 1024), // Bytes to GB
        db_size_gb: (r.data.db_size?.usage ?? 0) / (1024 * 1024 * 1024),
        storage_size_gb: (r.data.storage_size?.usage ?? 0) / (1024 * 1024 * 1024),
        auth_users: r.data.auth_users?.usage ?? 0,
        edge_functions_invocations: r.data.edge_functions_invocations?.usage ?? 0,
        raw: r.data
      };
    });

    return new Response(JSON.stringify({ ok: true, projectRef, stats: formatted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
