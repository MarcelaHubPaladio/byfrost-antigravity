import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

function randomTempPassword() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const raw = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "A")
        .replace(/\//g, "b")
        .replace(/=/g, "");
    return `Pwd-${raw.slice(0, 10)}${Math.floor(Math.random() * 10)}!`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    try {
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

        const { targetUserId } = await req.json().catch(() => ({}));
        if (!targetUserId) {
            return new Response(JSON.stringify({ ok: false, error: "Missing targetUserId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const tempPassword = randomTempPassword();

        const { error: updateErr } = await supabase.auth.admin.updateUserById(targetUserId, {
            password: tempPassword,
        });

        if (updateErr) {
            return new Response(JSON.stringify({ ok: false, error: updateErr.message }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(
            JSON.stringify({ ok: true, tempPassword }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (e: any) {
        console.error(`[admin-reset-pwd] error`, e);
        return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
