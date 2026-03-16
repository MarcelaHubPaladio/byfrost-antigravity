import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "tenant-assets";

type UploadKind = "participants" | "events" | "branding" | "links"; // Added "branding" and "links"

type Body = {
  action?: "upload" | "sign";
  tenantId?: string;
  tenant_id?: string;
  kind?: UploadKind;

  // upload (robust support)
  filename?: string;
  fileName?: string;
  contentType?: string;
  mimeType?: string;
  fileBase64?: string;
  mediaBase64?: string;

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
    if (req.method !== "POST") return err(`${fn}:method_not_allowed`, 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err(`${fn}:missing_auth`, 401);
    const token = auth.slice("Bearer ".length).trim();

    const contentTypeHeader = (req.headers.get("Content-Type") ?? "").toLowerCase();
    let action: string = "upload";
    let tenantIdStr: string = "";
    let kindStr: string = "";
    let fileName: string = "";
    let mimeType: string = "";
    let fileBytes: Uint8Array | null = null;
    let pathParam: string = "";
    let expiresInParam: number = 3600;
    let decodedBody: Body | null = null;

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await req.formData();
      action = String(formData.get("action") ?? "upload");
      tenantIdStr = String(formData.get("tenantId") ?? formData.get("tenant_id") ?? "").trim();
      kindStr = String(formData.get("kind") ?? "").trim();

      const file = formData.get("file");
      if (file instanceof File) {
        fileName = file.name;
        mimeType = file.type;
        fileBytes = new Uint8Array(await file.arrayBuffer());
      }

      pathParam = String(formData.get("path") ?? "").trim();
      expiresInParam = Number(formData.get("expiresIn") ?? 3600);
    } else {
      decodedBody = (await req.json().catch(() => null)) as Body | null;
      if (!decodedBody) return err(`${fn}:invalid_json_or_empty_body`, 400);

      action = decodedBody.action ?? "upload";
      tenantIdStr = String(decodedBody.tenantId ?? decodedBody.tenant_id ?? "").trim();
      kindStr = String(decodedBody.kind ?? "").trim();
      fileName = String(decodedBody.filename ?? decodedBody.fileName ?? "file.bin");
      mimeType = String(decodedBody.contentType ?? decodedBody.mimeType ?? "application/octet-stream");

      const b64 = String(decodedBody.fileBase64 ?? decodedBody.mediaBase64 ?? "").trim();
      if (b64) fileBytes = decodeBase64ToBytes(b64);

      pathParam = String(decodedBody.path ?? "").trim();
      expiresInParam = Number(decodedBody.expiresIn ?? 3600);
    }

    if (!tenantIdStr || !isUuid(tenantIdStr)) return err(`${fn}:invalid_tenant_id:${tenantIdStr}`, 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err(`${fn}:unauthorized:${userErr?.message ?? "no_user"}`, 401);

    const userId = userRes.user.id;
    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin ||
      (userRes.user.app_metadata as any)?.super_admin,
    );

    // Tenant boundary
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantIdStr)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memErr || (!membership && !isSuperAdmin)) {
      console.warn(`[${fn}] forbidden`, { tenantId: tenantIdStr, userId, memErr });
      return err(`${fn}:forbidden`, 403);
    }

    if (action === "sign") {
      if (!pathParam) return err(`${fn}:missing_path`, 400);

      const pathTenantId = tenantIdFromPath(pathParam);
      if (pathTenantId !== tenantIdStr) return err(`${fn}:cross_tenant_path`, 403);

      const expiresIn = Math.max(60, Math.min(expiresInParam, 60 * 60 * 24));

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(pathParam, expiresIn);

      if (error || !data?.signedUrl) {
        return err(`${fn}:sign_failed:${error?.message ?? "unknown"}`, 500);
      }

      return json({ ok: true, bucket: BUCKET, path: pathParam, signedUrl: data.signedUrl, expiresIn });
    }

    // action === "upload"
    const kind = kindStr as UploadKind;
    if (kind !== "participants" && kind !== "events" && kind !== "branding" && kind !== "links") {
      return err(`${fn}:invalid_kind:${kindStr}:received_body:${JSON.stringify(decodedBody)}`, 400);
    }

    if (!fileBytes || fileBytes.length === 0) return err(`${fn}:missing_file_content`, 400);

    const safeFilenameStr = sanitizeFilename(fileName);
    const uid = crypto.randomUUID();
    const path = `${tenantIdStr}/${kind}/${uid}-${safeFilenameStr}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, fileBytes, {
      upsert: false,
      contentType: mimeType || "application/octet-stream",
    });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { error: upErr.message, tenantId: tenantIdStr, path });
      return err(`${fn}:storage_upload_failed:${upErr.message}`, 500);
    }

    const { data: signData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600 * 24 * 7); // 7 days is enough for most usages

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    return json({
      ok: true,
      bucket: BUCKET,
      path,
      signedUrl: signData?.signedUrl || null,
      publicUrl,
      expiresIn: 3600 * 24 * 7
    });
  } catch (e: any) {
    console.error(`[upload-tenant-asset] unhandled`, { error: e?.message ?? String(e) });
    return err(`${fn}:internal_error:${e?.message ?? "unknown"}`, 500);
  }
});
