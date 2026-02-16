import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// NOTE: This function is intentionally self-contained.
// Some Supabase deploy flows bundle only the function folder and do not include sibling imports like ../_shared/*.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

const BUCKET = "tenant-assets";

type Body = {
  tenantId?: string;
  partyId?: string;
  filename?: string;
  contentType?: string;
  fileBase64?: string;
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, detail?: any) {
  return json({ ok: false, error: message, detail }, status);
}

function decodeBase64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function sanitizeFilename(filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return safe || "logo.png";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

serve(async (req) => {
  const fn = "party-upload-logo";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return err("invalid_json", 400);

    const tenantId = String(body.tenantId ?? "").trim();
    const partyId = String(body.partyId ?? "").trim();

    if (!tenantId || !isUuid(tenantId)) return err("invalid_tenantId", 400);
    if (!partyId || !isUuid(partyId)) return err("invalid_partyId", 400);

    const filename = sanitizeFilename(String(body.filename ?? "logo.png"));
    const contentType = String(body.contentType ?? "image/png");
    const fileBase64 = String(body.fileBase64 ?? "").trim();
    if (!fileBase64) return err("missing_fileBase64", 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;
    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    // Tenant boundary: require membership OR super-admin.
    const { data: membership } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership && !isSuperAdmin) return err("forbidden", 403);

    // Ensure party belongs to tenant and is a party
    const { data: party, error: pErr } = await supabase
      .from("core_entities")
      .select("id,tenant_id,entity_type,metadata")
      .eq("tenant_id", tenantId)
      .eq("id", partyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (pErr || !party) return err("party_not_found", 404);
    if ((party as any).entity_type !== "party") return err("entity_not_party", 400);

    const ext = filename.split(".").pop()?.toLowerCase() || "png";
    const path = `tenants/${tenantId}/parties/${partyId}/logo.${ext}`;

    const bytes = decodeBase64ToBytes(fileBase64);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      upsert: true,
      contentType,
    });

    if (upErr) return err("upload_failed", 500, { message: upErr.message });

    const nextMd = {
      ...((party as any).metadata ?? {}),
      logo: { bucket: BUCKET, path, updated_at: new Date().toISOString() },
    };

    const { error: uErr } = await supabase
      .from("core_entities")
      .update({ metadata: nextMd })
      .eq("tenant_id", tenantId)
      .eq("id", partyId);

    if (uErr) return err("party_update_failed", 500, { message: uErr.message });

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);

    return json({ ok: true, bucket: BUCKET, path, signedUrl: signed?.signedUrl ?? null });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500, { message: e?.message ?? String(e) });
  }
});