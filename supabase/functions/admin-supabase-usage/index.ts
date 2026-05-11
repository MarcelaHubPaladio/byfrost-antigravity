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
    const token = Deno.env.get("SB_MGMT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing SB_MGMT_TOKEN secret" }), { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

    // 4) Fetch Usage Data
    const now = new Date();
    const periods = [];
    for (let i = 0; i < 12; i++) { // Fetch up to 12 months to have data for selector
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    console.log(`[admin-supabase-usage] Fetching usage for project ${projectRef}...`);

    const statsPromises = periods.map(async (p) => {
      const url = `https://api.supabase.com/v1/projects/${projectRef}/usage?year=${p.year}&month=${p.month}`;
      try {
        const res = await fetch(url, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!res.ok) {
          console.error(`[admin-supabase-usage] Error fetching period ${p.month}/${p.year}:`, data);
          return { ...p, ok: false, error: data };
        }

        return { ...p, data, ok: true };
      } catch (err) {
        return { ...p, ok: false, error: err.message };
      }
    });

    const results = await Promise.all(statsPromises);

    // Filter results and format
    const formatted = results.reverse().map(r => {
      if (!r.ok) return { year: r.year, month: r.month, periodLabel: `${r.month}/${r.year}`, error: true };
      
      const d = r.data;
      // Helper to get usage safely
      const getUsage = (key: string) => {
        if (d[key] && typeof d[key].usage === 'number') return d[key].usage;
        return 0;
      };

      return {
        year: r.year,
        month: r.month,
        periodLabel: `${r.month}/${r.year}`,
        egress_gb: getUsage('egress') / (1024 * 1024 * 1024),
        db_size_gb: getUsage('db_size') / (1024 * 1024 * 1024),
        storage_size_gb: getUsage('storage_size') / (1024 * 1024 * 1024),
        auth_users: getUsage('auth_users'),
        edge_functions_invocations: getUsage('edge_functions_invocations'),
        raw: d
      };
    });

    return new Response(JSON.stringify({ ok: true, projectRef, stats: formatted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    return new Response(JSON.stringify({ ok: true, projectRef, stats: formatted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
