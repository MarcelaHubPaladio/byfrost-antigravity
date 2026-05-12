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

    // 3) Get Parameters
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "week"; // week, day, hour, minute

    const token = Deno.env.get("SB_MGMT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing SB_MGMT_TOKEN secret" }), { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

    console.log(`[admin-supabase-usage] Fetching egress logs for range: ${range}`);

    // 4) Dynamic SQL based on range
    let interval = "7 day";
    let trunc = "DAY";
    
    if (range === "day") {
      interval = "24 hour";
      trunc = "HOUR";
    } else if (range === "hour") {
      interval = "1 hour";
      trunc = "MINUTE";
    } else if (range === "minute") {
      interval = "1 minute";
      trunc = "SECOND";
    }

    const egressSql = `
      SELECT 
          timestamp_trunc(timestamp, ${trunc}) as time_bucket,
          sum(safe_cast(m.response[OFFSET(0)].headers[OFFSET(0)].content_length as int64)) as bytes,
          count(*) as requests
      FROM 
          edge_logs CROSS JOIN UNNEST(metadata) as m
      WHERE 
          m.request[OFFSET(0)].path LIKE '%/storage/%' 
          AND m.response[OFFSET(0)].status_code IN (200, 206)
          AND timestamp >= timestamp_sub(current_timestamp(), interval ${interval})
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
    if (!logsRes.ok) {
      console.error(`[admin-supabase-usage] Logs API error:`, logsData);
    }
    const egressData = logsData.result || [];

    // 4) Fetch TOP PATHS by egress to find where the traffic is
    const topPathsSql = `
      SELECT 
          m.request[OFFSET(0)].path as path,
          sum(safe_cast(m.response[OFFSET(0)].headers[OFFSET(0)].content_length as int64)) as bytes,
          count(*) as requests
      FROM 
          edge_logs CROSS JOIN UNNEST(metadata) as m
      WHERE 
          timestamp >= timestamp_sub(current_timestamp(), interval 1 day)
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 5
    `;
    
    const topPathsRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all?sql=${encodeURIComponent(topPathsSql)}`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    });
    const topPathsData = await topPathsRes.json();

    // 5) Fetch DB Metrics (Current month only)
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
        edge_functions_invocations: getUsage('edge_functions_invocations')
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      projectRef, 
      range,
      stats: stats,
      egress_metrics: egressData.map((d: any) => ({
        time: d.time_bucket,
        egress_gb: (d.bytes || 0) / (1024 * 1024 * 1024),
        requests: d.requests
      })),
      top_paths: topPathsData.result || [],
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });





  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});


