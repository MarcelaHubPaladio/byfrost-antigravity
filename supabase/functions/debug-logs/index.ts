import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
        const supabase = createSupabaseAdmin();
        const [msgRes, auditRes] = await Promise.all([
            supabase
                .from("wa_messages")
                .select("id, to_phone, type, body_text, occurred_at")
                .eq("direction", "outbound")
                .order("occurred_at", { ascending: false })
                .limit(10),
            supabase
                .from("audit_ledger")
                .select("*")
                .order("occurred_at", { ascending: false })
                .limit(10)
        ]);

        return new Response(JSON.stringify({
            messages: msgRes.data,
            audit: auditRes.data,
            msgError: msgRes.error,
            auditError: auditRes.error
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }
});
