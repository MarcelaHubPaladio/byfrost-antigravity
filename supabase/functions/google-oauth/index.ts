import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    let reqBody: any = {};
    
    if (req.method === "POST") {
      try {
        reqBody = await req.json();
        if (reqBody.action) action = reqBody.action;
      } catch (e) {
        // Ignore json parse error if empty body
      }
    }

    // 1. Generate OAuth URL
    if (action === "url") {
      const redirectUri = reqBody.redirect_uri || url.searchParams.get("redirect_uri");
      if (!redirectUri) throw new Error("Missing redirect_uri parameter");

      const scopes = [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email"
      ].join(" ");

      const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

      return new Response(JSON.stringify({ url: oauthUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Handle Callback (Exchange code for tokens)
    if (action === "callback") {
      const { code, redirect_uri } = reqBody;
      if (!code || !redirect_uri) throw new Error("Missing code or redirect_uri");

      // Verify the user making the request
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Missing Authorization header");

      const supabase = createSupabaseAdmin();
      const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userError || !user) throw new Error("Unauthorized");

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri,
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        throw new Error(`Failed to fetch tokens: ${errorText}`);
      }

      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_in } = tokenData;

      // Get user email from Google to save as provider_account_id
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userInfo = await userInfoRes.json();
      const provider_account_id = userInfo.email;

      // Calculate expiry date
      const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

      if (refresh_token) {
        const { error: upsertError } = await supabase
          .from("user_integrations")
          .upsert({
            user_id: user.id,
            provider: "google_calendar",
            provider_account_id,
            access_token,
            refresh_token,
            expires_at,
            updated_at: new Date().toISOString()
          }, {
            onConflict: "user_id, provider"
          });
        if (upsertError) throw upsertError;
      } else {
        // If no refresh token, update existing record (assuming it exists from a previous consent)
        const { error: updateError } = await supabase
          .from("user_integrations")
          .update({
            provider_account_id,
            access_token,
            expires_at,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.id)
          .eq("provider", "google_calendar");
        if (updateError) throw updateError;
      }

      return new Response(JSON.stringify({ ok: true, email: provider_account_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. List Calendars
    if (action === "calendars") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Missing Authorization header");

      const supabase = createSupabaseAdmin();
      const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userError || !user) throw new Error("Unauthorized");

      // Get the integration
      const { data: integration, error: intError } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", "google_calendar")
        .single();

      if (intError || !integration) throw new Error("Google Calendar integration not found");

      let { access_token, refresh_token, expires_at } = integration;

      // Check if token is expired
      if (new Date(expires_at) <= new Date()) {
        if (!refresh_token) throw new Error("Token expired and no refresh token available");

        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token,
            grant_type: "refresh_token",
          }),
        });

        if (!refreshRes.ok) throw new Error("Failed to refresh token");

        const tokenData = await refreshRes.json();
        access_token = tokenData.access_token;
        expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        // Save new token
        await supabase
          .from("user_integrations")
          .update({ access_token, expires_at, updated_at: new Date().toISOString() })
          .eq("id", integration.id);
      }

      // Fetch calendars
      const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!calRes.ok) throw new Error("Failed to fetch calendars");

      const calData = await calRes.json();
      const calendars = calData.items.map((item: any) => ({
        id: item.id,
        summary: item.summary,
        primary: item.primary || false,
      }));

      return new Response(JSON.stringify({ calendars }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // 4. Disconnect
    if (action === "disconnect") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Missing Authorization header");

      const supabase = createSupabaseAdmin();
      const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userError || !user) throw new Error("Unauthorized");
      
      const { error } = await supabase
        .from("user_integrations")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "google_calendar");
        
      if (error) throw error;
      
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response("Unknown action", { status: 400, headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
