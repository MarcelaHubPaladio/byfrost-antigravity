import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "content-media";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

function decodeBase64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const caseId = String(body?.caseId ?? "").trim();
    const publicationId = String(body?.publicationId ?? "").trim();
    const filename = String(body?.filename ?? "file.bin").trim();
    const contentType = String(body?.contentType ?? "application/octet-stream").trim();
    const fileBase64 = String(body?.fileBase64 ?? "").trim();

    if (!tenantId || !caseId || !publicationId || !fileBase64) {
      return err("missing_params", 400);
    }

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;

    // Multi-tenant boundary: require membership OR super-admin.
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (memErr || (!membership && !isSuperAdmin)) return err("forbidden", 403);

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file.bin";
    const uid = crypto.randomUUID();
    const path = `tenants/${tenantId}/content/${caseId}/${publicationId}/${uid}-${safeName}`;

    const bytes = decodeBase64ToBytes(fileBase64);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      upsert: false,
      contentType,
    });

    if (upErr) {
      console.error("[content-media-upload] upload failed", { error: upErr.message, tenantId, caseId });
      return err(upErr.message, 500);
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    console.log("[content-media-upload] uploaded", { tenantId, caseId, publicationId, path, by: userId });

    return json({ ok: true, bucket: BUCKET, path, publicUrl });
  } catch (e: any) {
    console.error("[content-media-upload] unhandled", { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
