import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "financial-ingestion";

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
  const fn = "financial-ingestion-upload";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const fileName = String(body?.fileName ?? "").trim();
    const contentType = String(body?.contentType ?? "application/octet-stream").trim();
    const fileBase64 = String(body?.fileBase64 ?? "").trim();

    if (!tenantId || !fileName || !fileBase64) return err("missing_params", 400);

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

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file.bin";
    const uid = crypto.randomUUID();
    const path = `tenants/${tenantId}/financial-ingestion/${uid}-${safeName}`;

    const bytes = decodeBase64ToBytes(fileBase64);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      upsert: false,
      contentType,
    });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { tenantId, error: upErr.message });
      return err(upErr.message, 500);
    }

    const { data: job, error: jobErr } = await supabase
      .from("ingestion_jobs")
      .insert({
        tenant_id: tenantId,
        file_name: safeName,
        status: "pending",
        processed_rows: 0,
        error_log: null,
      })
      .select("id")
      .maybeSingle();

    if (jobErr || !job?.id) {
      console.error(`[${fn}] failed to create ingestion job`, { tenantId, jobErr });
      return err("failed_to_create_job", 500);
    }

    const idempotencyKey = `FIN_INGEST:${job.id}`;

    const { error: qErr } = await supabase.from("job_queue").insert({
      tenant_id: tenantId,
      type: "FINANCIAL_INGESTION",
      idempotency_key: idempotencyKey,
      payload_json: {
        ingestion_job_id: job.id,
        storage_bucket: BUCKET,
        storage_path: path,
        file_name: safeName,
        content_type: contentType,
      },
      status: "pending",
      run_after: new Date().toISOString(),
    });

    if (qErr) {
      console.error(`[${fn}] failed to enqueue job_queue`, { tenantId, qErr });
      await supabase.from("ingestion_jobs").update({ status: "failed", error_log: String(qErr.message ?? qErr) }).eq(
        "id",
        job.id
      );
      return err("failed_to_enqueue", 500);
    }

    console.log(`[${fn}] uploaded + enqueued`, { tenantId, jobId: job.id, path, by: userId });

    return json({ ok: true, ingestionJobId: job.id });
  } catch (e: any) {
    console.error("[financial-ingestion-upload] unhandled", { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
