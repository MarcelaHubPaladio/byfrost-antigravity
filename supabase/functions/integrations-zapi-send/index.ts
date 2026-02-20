import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";
import { decryptText } from "../_shared/encryption.ts";

serve(async (req) => {
  const fn = "integrations-zapi-send";
  let external: any = null;
  let correlationId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Log headers
    const headers: Record<string, string> = {};
    req.headers.forEach((val, key) => { headers[key] = val; });
    console.log(`[${fn}] Headers:`, headers);

    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { tenantId, instanceId, to: rawTo, type = "text", text = null, mediaUrl = null, meta = {} } = body;
    correlationId = body.correlationId ?? correlationId;

    if (!tenantId || !instanceId || !rawTo) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields (tenantId, instanceId, to)" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let to = normalizePhoneE164Like(String(rawTo));

    // If it looks like a technical group ID but lacks the suffix, add it for Z-API
    if (to && (to.includes("-") || (to.startsWith("1203") && to.length > 15)) && !to.includes("@")) {
      to = `${to}@g.us`;
    }

    // [HOTFIX] Remove "-group" suffix if present (seen in some malformed IDs)
    if (to && to.includes("-group@")) {
      to = to.replace("-group@", "@");
    }

    if (!to) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid recipient phone number" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdmin();

    const { data: inst, error: instErr } = await supabase
      .from("wa_instances")
      .select("*")
      .eq("id", instanceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (instErr || !inst) {
      return new Response(JSON.stringify({ ok: false, error: "Instance not found", debug: instErr }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persistir Audit Outbound
    const { error: msgInsertError } = await supabase.from("wa_messages").insert({
      tenant_id: tenantId,
      instance_id: inst.id,
      case_id: body.caseId ?? meta?.case_id ?? null,
      direction: "outbound",
      from_phone: inst.phone_number ?? null,
      to_phone: to,
      type: (["image", "video", "audio", "document"].includes(type)) ? type : "text",
      body_text: text,
      media_url: mediaUrl,
      correlation_id: correlationId,
      occurred_at: new Date().toISOString(),
    });

    if (msgInsertError) {
      console.error(`[${fn}] Failed to insert wa_messages:`, msgInsertError);
    }

    // Validar credenciais Z-API
    const zapiInstanceId = inst.zapi_instance_id;
    let zapiToken = inst.zapi_token_encrypted;

    if (!zapiInstanceId || !zapiToken) {
      return new Response(JSON.stringify({
        ok: false,
        error: `Credenciais Z-API faltando na instância. (ID: ${zapiInstanceId ? "OK" : "Falta"}, Token: ${zapiToken ? "OK" : "Falta"})`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tentar descriptografar se necessário
    if (zapiToken.startsWith("v1:")) {
      const encryptionKey = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY");
      if (!encryptionKey) {
        return new Response(JSON.stringify({
          ok: false,
          error: "O servidor não possui a chave APP_TOKEN_ENCRYPTION_KEY configurada para descriptografar seu Token."
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        zapiToken = await decryptText(zapiToken);
      } catch (e: any) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Falha na descriptografia do token: ${e.message}`
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Chamar Z-API
    const zapiDomain = (Deno.env.get("ZAPI_DOMAIN") ?? "https://api.z-api.io").replace(/\/$/, "");
    let endpoint = "send-text";
    let bodyPayload: any = { phone: to };

    if (type === "text") {
      endpoint = "send-text";
      bodyPayload.message = text;
    } else if (type === "image") {
      endpoint = "send-image";
      bodyPayload.image = mediaUrl;
      if (text) bodyPayload.caption = text;
    } else if (type === "audio") {
      endpoint = "send-audio";
      bodyPayload.audio = mediaUrl;
    } else if (type === "video") {
      endpoint = "send-video";
      bodyPayload.video = mediaUrl;
      if (text) bodyPayload.caption = text;
    } else if (type === "document") {
      endpoint = "send-document/pdf";
      bodyPayload.document = mediaUrl;
      bodyPayload.extension = meta?.extension ?? "pdf";
      if (text) bodyPayload.caption = text;
    } else if (type === "location") {
      endpoint = "send-location";
      const lat = meta?.latitude ?? body.latitude;
      const lng = meta?.longitude ?? body.longitude;
      if (lat && lng) {
        bodyPayload.latitude = lat;
        bodyPayload.longitude = lng;
        if (text) bodyPayload.title = text;
      }
    }

    const url = `${zapiDomain}/instances/${zapiInstanceId}/token/${zapiToken}/${endpoint}`;
    console.log(`[${fn}] Calling Z-API: ${endpoint}`);

    const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
    if (clientToken) {
      zapiHeaders["Client-Token"] = clientToken;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: zapiHeaders,
      body: JSON.stringify(bodyPayload),
    });

    const resText = await res.text();
    let resJson: any = null;
    try { resJson = JSON.parse(resText); } catch { }

    external = { ok: res.ok, status: res.status, body: resJson ?? resText };

    // Ledger
    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: { kind: "wa_outbound_attempt", correlation_id: correlationId, to, external },
    });

    return new Response(JSON.stringify({
      ok: res.ok,
      correlationId,
      external,
      debug: { to, url: url.replace(zapiToken, "REDACTED"), dbError: msgInsertError },
      error: res.ok ? null : (resJson?.message || resText)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error(`[${fn}] Critical:`, e);
    return new Response(JSON.stringify({ ok: false, error: e.message, correlationId }), {
      status: 200, // Still return 200 for internal errors so frontend shows the message
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});