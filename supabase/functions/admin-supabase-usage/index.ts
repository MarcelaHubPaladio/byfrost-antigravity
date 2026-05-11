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

    console.log(`[admin-supabase-usage] Fetching log-based usage for project ${projectRef}...`);

    // 4) Fetch Egress via Logs (Last 7 days)
    const egressSql = `
      SELECT 
          date_trunc('day', timestamp_seconds(cast(timestamp / 1000000 as int64))) as day,
          sum(safe_cast(m.response[OFFSET(0)].headers[OFFSET(0)].content_length as int64)) as bytes,
          count(*) as requests
      FROM 
          edge_logs CROSS JOIN UNNEST(metadata) as m
      WHERE 
          m.request[OFFSET(0)].path LIKE '%/storage/%' 
          AND m.response[OFFSET(0)].status_code IN (200, 206)
          AND timestamp >= timestamp_sub(current_timestamp(), interval 7 day)
      GROUP BY 1
      ORDER BY 1 DESC
    `;

    const logsUrl = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all?sql=${encodeURIComponent(egressSql)}`;
    const logsRes = await fetch(logsUrl, {
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const logsData = await logsRes.json();
    const dailyEgress = logsData.result || [];

    // 5) Fetch DB Metrics (Directly from DB via RPC or Query)
    // We'll try to get these from the Management API first, if it fails, we show what we have from logs
    const now = new Date();
    const currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 };
    
    const usageUrl = `https://api.supabase.com/v1/projects/${projectRef}/usage?year=${currentPeriod.year}&month=${currentPeriod.month}`;
    const usageRes = await fetch(usageUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    let stats = [];
    if (usageRes.ok) {
      const d = await usageRes.json();
      const getUsage = (key: string) => (d[key] && typeof d[key].usage === 'number') ? d[key].usage : 0;
      
      stats.push({
        year: currentPeriod.year,
        month: currentPeriod.month,
        periodLabel: `${currentPeriod.month}/${currentPeriod.year}`,
        egress_gb: getUsage('egress') / (1024 * 1024 * 1024),
        db_size_gb: getUsage('db_size') / (1024 * 1024 * 1024),
        storage_size_gb: getUsage('storage_size') / (1024 * 1024 * 1024),
        auth_users: getUsage('auth_users'),
        edge_functions_invocations: getUsage('edge_functions_invocations'),
        from_official_api: true
      });
    }

    // Always include the log-based metrics for the dashboard
    return new Response(JSON.stringify({ 
      ok: true, 
      projectRef, 
      stats: stats,
      daily_egress: dailyEgress.map((d: any) => ({
        day: d.day,
        egress_gb: (d.bytes || 0) / (1024 * 1024 * 1024),
        requests: d.requests
      }))
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});

