import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { embedText, toVectorString } from "../_shared/ai.ts";

function chunkText(input: string, chunkSize = 900, overlap = 120) {
  const text = (input ?? "").replace(/\r/g, "").trim();
  if (!text) return [];

  const chunks: string[] = [];

  // Prefer paragraph chunking first.
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  let buf = "";
  for (const p of paras) {
    if (!buf) {
      buf = p;
      continue;
    }
    if ((buf + "\n\n" + p).length <= chunkSize) {
      buf += "\n\n" + p;
    } else {
      chunks.push(buf);
      buf = p;
    }
  }
  if (buf) chunks.push(buf);

  // If we still have very large blocks, fall back to sliding window.
  const final: string[] = [];
  for (const c of chunks) {
    if (c.length <= chunkSize * 1.2) {
      final.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += chunkSize - overlap) {
      final.push(c.slice(i, i + chunkSize));
      if (i + chunkSize >= c.length) break;
    }
  }

  return final.map((c) => c.trim()).filter(Boolean);
}

serve(async (req) => {
  const fn = "kb-ingest";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    const journeyId = body.journeyId as string | undefined;
    const title = (body.title as string | undefined) ?? "Documento";
    const source = (body.source as string | undefined) ?? null;
    const storagePath = (body.storagePath as string | undefined) ?? null;
    const text = (body.text as string | undefined) ?? "";

    if (!tenantId || !text.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId or text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdmin();

    const { data: doc, error: dErr } = await supabase
      .from("kb_documents")
      .insert({
        tenant_id: tenantId,
        journey_id: journeyId ?? null,
        title,
        source,
        storage_path: storagePath,
        status: "processing",
      })
      .select("id")
      .single();

    if (dErr || !doc) {
      console.error(`[${fn}] Failed to create document`, { dErr });
      return new Response(JSON.stringify({ ok: false, error: "Failed to create document" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = chunkText(text);

    let embedded = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      let vector: string | null = null;
      let provider = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase() || "other";
      let model = Deno.env.get("EMBEDDINGS_MODEL") ?? "";

      try {
        const emb = await embedText(chunk, {});
        vector = toVectorString(emb);
        embedded += 1;
      } catch (e) {
        // If provider/key is missing, we still ingest chunks with null embedding.
        console.warn(`[${fn}] Embedding failed (continuing with null)`, { provider, model, e: String(e) });
      }

      const { error: cErr } = await supabase.from("kb_chunks").insert({
        tenant_id: tenantId,
        document_id: doc.id,
        chunk_text: chunk,
        embedding: vector,
        meta_json: { idx: i, provider, model },
      });

      if (cErr) {
        console.error(`[${fn}] Failed to insert chunk`, { cErr });
        // keep going
      }
    }

    await supabase
      .from("kb_documents")
      .update({ status: "ready" })
      .eq("id", doc.id)
      .eq("tenant_id", tenantId);

    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: {
        kind: "kb_ingest",
        document_id: doc.id,
        chunks: chunks.length,
        embedded,
        provider: (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase() || "other",
      },
    });

    return new Response(JSON.stringify({ ok: true, documentId: doc.id, chunks: chunks.length, embedded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[kb-ingest] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
