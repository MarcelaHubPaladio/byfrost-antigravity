import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "tenant-assets";

type UploadKind = "participants" | "events";

type Body = {
  action?: "upload" | "sign";
  tenantId?: string;
  kind?: UploadKind;

  // upload
  filename?: string;
  contentType?: string;
  fileBase64?: string;

  // sign
  path?: string;
  expiresIn?: number;
};

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

function sanitizeFilename(filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return safe || "file.bin";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function tenantIdFromPath(path: string) {
  const seg1 = path.split("/")[0] ?? "";
  const seg2 = path.split("/")[1] ?? "";
  if (seg1 === "tenants") return seg2;
  return seg1;
}

serve(async (req) => {
  const fn = "upload-tenant-asset";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return err("invalid_json", 400);

    const action = body.action ?? "upload";
    const tenantId = String(body.tenantId ?? "").trim();
    if (!tenantId || !isUuid(tenantId)) return err("invalid_tenantId", 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;
    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin ||
        (userRes.user.app_metadata as any)?.super_admin,
    );

    // Tenant boundary: require membership OR super-admin.
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memErr || (!membership && !isSuperAdmin)) {
      console.warn(`[${fn}] forbidden`, { tenantId, userId, memErr });
      return err("forbidden", 403);
    }

    if (action === "sign") {
      const path = String(body.path ?? "").trim();
      if (!path) return err("missing_path", 400);

      const pathTenantId = tenantIdFromPath(path);
      if (pathTenantId !== tenantId) return err("cross_tenant_path", 403);

      const expiresIn = Math.max(60, Math.min(Number(body.expiresIn ?? 3600), 60 * 60 * 24));

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, expiresIn);

      if (error || !data?.signedUrl) {
        console.error(`[${fn}] createSignedUrl failed`, { error: error?.message, tenantId, path });
        return err(error?.message ?? "sign_failed", 500);
      }

      return json({ ok: true, bucket: BUCKET, path, signedUrl: data.signedUrl, expiresIn });
    }

    // action === "upload"
    const kind = body.kind as UploadKind | undefined;
    if (kind !== "participants" && kind !== "events") return err("invalid_kind", 400);

    const filename = sanitizeFilename(String(body.filename ?? "file.bin").trim());
    const contentType = String(body.contentType ?? "application/octet-stream").trim();
    const fileBase64 = String(body.fileBase64 ?? "").trim();
    if (!fileBase64) return err("missing_fileBase64", 400);

    const uid = crypto.randomUUID();
    const path = `${tenantId}/${kind}/${uid}-${filename}`;

    const bytes = decodeBase64ToBytes(fileBase64);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      upsert: false,
      contentType,
    });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { error: upErr.message, tenantId, path, by: userId });
      return err(upErr.message, 500);
    }

    const { data: signData, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (signErr || !signData?.signedUrl) {
      console.error(`[${fn}] createSignedUrl failed after upload`, {
        error: signErr?.message,
        tenantId,
        path,
      });
      return json({ ok: true, bucket: BUCKET, path, signedUrl: null, expiresIn: 3600 });
    }

    console.log(`[${fn}] uploaded`, { tenantId, kind, path, by: userId });

    return json({ ok: true, bucket: BUCKET, path, signedUrl: signData.signedUrl, expiresIn: 3600 });
  } catch (e: any) {
    console.error(`[upload-tenant-asset] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
