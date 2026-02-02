import { decryptText } from "./encryption.ts";

const GRAPH_VERSION = "v19.0";

type SupabaseAdmin = any;

type PublishStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "ASSISTED_REQUIRED";

type PublicationRow = {
  id: string;
  tenant_id: string;
  case_id: string | null;
  content_item_id: string;
  channel: "ig_story" | "ig_feed" | "ig_reels" | "fb_feed" | string;
  caption_text: string | null;
  creative_type: "IMAGE" | "VIDEO" | "CAROUSEL" | "MIXED" | null;
  media_storage_paths: string[];
  scheduled_at: string | null;
  publish_status: PublishStatus;
};

type MetaAccountRow = {
  id: string;
  tenant_id: string;
  ig_business_account_id: string;
  fb_page_id: string;
  fb_page_name: string;
  ig_username: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  scopes: string[] | null;
  is_active: boolean;
};

function isAllowedChannel(channel: string) {
  return channel === "ig_feed" || channel === "ig_story";
}

function isProbablyNotSupported(msg: string) {
  const m = (msg ?? "").toLowerCase();
  return (
    m.includes("not supported") ||
    m.includes("unsupported") ||
    m.includes("instagram_content_publish") ||
    m.includes("permissions") ||
    m.includes("permission") ||
    m.includes("requires")
  );
}

async function metaFetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let jsonBody: any = null;
  try {
    jsonBody = text ? JSON.parse(text) : null;
  } catch {
    jsonBody = null;
  }

  if (!res.ok) {
    const msg = jsonBody?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return jsonBody;
}

async function createContainer({
  igAccountId,
  accessToken,
  channel,
  creativeType,
  mediaUrl,
  caption,
}: {
  igAccountId: string;
  accessToken: string;
  channel: "ig_feed" | "ig_story";
  creativeType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  caption: string | null;
}) {
  const params = new URLSearchParams({
    access_token: accessToken,
  });

  if (channel === "ig_story") {
    params.set("media_type", "STORIES");
    if (creativeType === "VIDEO") params.set("video_url", mediaUrl);
    else params.set("image_url", mediaUrl);
    // Stories: caption is not consistently supported; avoid breaking.
  } else {
    if (creativeType === "VIDEO") {
      params.set("media_type", "VIDEO");
      params.set("video_url", mediaUrl);
    } else {
      params.set("image_url", mediaUrl);
    }
    if (caption?.trim()) params.set("caption", caption.trim());
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igAccountId)}/media`;
  return await metaFetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

async function publishContainer({
  igAccountId,
  accessToken,
  creationId,
}: {
  igAccountId: string;
  accessToken: string;
  creationId: string;
}) {
  const params = new URLSearchParams({
    access_token: accessToken,
    creation_id: creationId,
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igAccountId)}/media_publish`;
  return await metaFetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

async function fetchPermalink({
  mediaId,
  accessToken,
}: {
  mediaId: string;
  accessToken: string;
}) {
  const params = new URLSearchParams({
    fields: "permalink",
    access_token: accessToken,
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}?${params.toString()}`;
  const j = await metaFetchJson(url);
  return (j?.permalink as string | undefined) ?? null;
}

function publicStorageUrl(bucket: string, path: string) {
  const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") ?? "pryoirzeghatrgecwrci";
  // Bucket is public (phase1 migration). This yields a stable public URL.
  return `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}/${path}`;
}

async function createHumanTask({
  supabase,
  tenantId,
  caseId,
  publicationId,
  title,
  description,
  errorMessage,
}: {
  supabase: SupabaseAdmin;
  tenantId: string;
  caseId: string | null;
  publicationId: string;
  title: string;
  description: string;
  errorMessage: string | null;
}) {
  // Task
  await supabase.from("tasks").insert({
    tenant_id: tenantId,
    case_id: caseId,
    title,
    description: `${description}${errorMessage ? `\n\nErro: ${errorMessage}` : ""}`,
    assigned_to_role: "admin",
    status: "open",
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    created_by: "system",
    meta_json: { kind: "meta_publish", publication_id: publicationId },
  });

  // Timeline
  if (caseId) {
    await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "content_publish_attention_required",
      actor_type: "system",
      actor_id: null,
      message: title,
      meta_json: { publication_id: publicationId, error: errorMessage },
      occurred_at: new Date().toISOString(),
    });
  }

  // Audit ledger (best-effort)
  try {
    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: { kind: "meta_publish_attention_required", publication_id: publicationId, case_id: caseId },
    });
  } catch {
    // ignore
  }
}

export async function publishContentPublication({
  supabase,
  tenantId,
  publicationId,
  requestedByUserId,
}: {
  supabase: SupabaseAdmin;
  tenantId: string;
  publicationId: string;
  requestedByUserId?: string | null;
}) {
  const fn = "meta-publish";

  // 1) Load publication (hard tenant boundary)
  const { data: pub, error: pubErr } = await supabase
    .from("content_publications")
    .select(
      "id,tenant_id,case_id,content_item_id,channel,caption_text,creative_type,media_storage_paths,scheduled_at,publish_status"
    )
    .eq("id", publicationId)
    .maybeSingle();

  if (pubErr || !pub) {
    console.error(`[${fn}] publication not found`, { publicationId, error: pubErr?.message });
    return { ok: false as const, status: "FAILED" as PublishStatus, error: "publication_not_found" };
  }

  const row = pub as any as PublicationRow;

  if (row.tenant_id !== tenantId) {
    console.error(`[${fn}] tenant mismatch`, { tenantId, publicationTenantId: row.tenant_id, publicationId });
    return { ok: false as const, status: "FAILED" as PublishStatus, error: "tenant_mismatch" };
  }

  if (row.publish_status === "PUBLISHED") {
    return { ok: true as const, status: row.publish_status, id: row.id };
  }

  // 2) Only IG Feed + Stories for this phase
  if (!isAllowedChannel(row.channel)) {
    const message = `Canal não suportado para autopublish nesta fase: ${row.channel}`;
    await supabase
      .from("content_publications")
      .update({ publish_status: "ASSISTED_REQUIRED", last_error: message })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    await createHumanTask({
      supabase,
      tenantId,
      caseId: row.case_id,
      publicationId,
      title: `Publicação requer ação humana (${row.channel})`,
      description: `Autopublish não suportado para este canal nesta fase.`,
      errorMessage: message,
    });

    return { ok: false as const, status: "ASSISTED_REQUIRED" as const, error: message };
  }

  // 3) Resolve active Meta account
  const { data: acc, error: accErr } = await supabase
    .from("meta_accounts")
    .select(
      "id,tenant_id,ig_business_account_id,fb_page_id,fb_page_name,ig_username,access_token_encrypted,token_expires_at,scopes,is_active"
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accErr || !acc) {
    const message = "Nenhuma meta_accounts ativa encontrada para o tenant.";
    await supabase
      .from("content_publications")
      .update({ publish_status: "ASSISTED_REQUIRED", last_error: message })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    await createHumanTask({
      supabase,
      tenantId,
      caseId: row.case_id,
      publicationId,
      title: "Conectar conta Meta para publicar",
      description: "Não foi encontrada conta Meta ativa. Conecte em Integrações → Meta.",
      errorMessage: message,
    });

    return { ok: false as const, status: "ASSISTED_REQUIRED" as const, error: message };
  }

  const meta = acc as any as MetaAccountRow;

  if (meta.token_expires_at && new Date(meta.token_expires_at).getTime() < Date.now()) {
    const message = "Token Meta expirado. Refaça a conexão da conta.";
    await supabase
      .from("content_publications")
      .update({ publish_status: "ASSISTED_REQUIRED", last_error: message })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    await createHumanTask({
      supabase,
      tenantId,
      caseId: row.case_id,
      publicationId,
      title: "Token Meta expirado",
      description: "A conta Meta está conectada, mas o token expirou. Refaça a conexão em Integrações → Meta.",
      errorMessage: message,
    });

    return { ok: false as const, status: "ASSISTED_REQUIRED" as const, error: message };
  }

  // 4) Validate media
  const mediaPaths = Array.isArray(row.media_storage_paths) ? row.media_storage_paths.filter(Boolean) : [];
  const caption = row.caption_text ?? null;

  // Only handle single media (MVP)
  if (mediaPaths.length !== 1) {
    const message =
      mediaPaths.length === 0
        ? "Publicação sem mídia. Faça upload (imagem/vídeo) antes de publicar."
        : "Autopublish suporta apenas 1 mídia nesta fase. Use publicação assistida.";

    const nextStatus: PublishStatus = "ASSISTED_REQUIRED";

    await supabase
      .from("content_publications")
      .update({ publish_status: nextStatus, last_error: message })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    await createHumanTask({
      supabase,
      tenantId,
      caseId: row.case_id,
      publicationId,
      title: "Publicação requer ação humana (mídia)",
      description: "A publicação não está em um formato suportado para autopublish.",
      errorMessage: message,
    });

    return { ok: false as const, status: nextStatus, error: message };
  }

  const mediaUrl = publicStorageUrl("content-media", mediaPaths[0]);

  // Creative type inference
  const ct = (row.creative_type ?? "IMAGE") as any;
  const creativeType: "IMAGE" | "VIDEO" = ct === "VIDEO" ? "VIDEO" : "IMAGE";

  // 5) Publish via Graph API
  let accessToken = "";
  try {
    accessToken = await decryptText(meta.access_token_encrypted);
  } catch (e: any) {
    const message = `Falha ao descriptografar token Meta: ${e?.message ?? "erro"}`;
    await supabase
      .from("content_publications")
      .update({ publish_status: "ASSISTED_REQUIRED", last_error: message })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    await createHumanTask({
      supabase,
      tenantId,
      caseId: row.case_id,
      publicationId,
      title: "Token Meta inválido",
      description: "Falha ao descriptografar token. Refaça a conexão em Integrações → Meta.",
      errorMessage: message,
    });

    return { ok: false as const, status: "ASSISTED_REQUIRED" as const, error: message };
  }

  const igAccountId = String(meta.ig_business_account_id);

  try {
    console.log(`[${fn}] publishing`, {
      tenantId,
      publicationId,
      channel: row.channel,
      igAccountId,
      by: requestedByUserId ?? "system",
    });

    const container = await createContainer({
      igAccountId,
      accessToken,
      channel: row.channel as any,
      creativeType,
      mediaUrl,
      caption,
    });

    const creationId = String(container?.id ?? "");
    if (!creationId) throw new Error("Missing creation id");

    const published = await publishContainer({ igAccountId, accessToken, creationId });
    const mediaId = String(published?.id ?? "");
    if (!mediaId) throw new Error("Missing media id");

    const permalink = await fetchPermalink({ mediaId, accessToken }).catch(() => null);

    await supabase
      .from("content_publications")
      .update({
        publish_status: "PUBLISHED",
        meta_post_id: mediaId,
        meta_permalink: permalink,
        last_error: null,
      })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    if (row.case_id) {
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: row.case_id,
        event_type: "content_published",
        actor_type: requestedByUserId ? "admin" : "system",
        actor_id: requestedByUserId ?? null,
        message: `Publicado (${row.channel}).`,
        meta_json: { publication_id: publicationId, meta_post_id: mediaId },
        occurred_at: new Date().toISOString(),
      });
    }

    try {
      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: tenantId,
        p_payload: { kind: "meta_published", publication_id: publicationId, meta_post_id: mediaId },
      });
    } catch {
      // ignore
    }

    return { ok: true as const, status: "PUBLISHED" as const, meta_post_id: mediaId, meta_permalink: permalink };
  } catch (e: any) {
    const message = String(e?.message ?? "publish_failed");
    const assisted = isProbablyNotSupported(message);
    const nextStatus: PublishStatus = assisted ? "ASSISTED_REQUIRED" : "FAILED";

    await supabase
      .from("content_publications")
      .update({ publish_status: nextStatus, last_error: message })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    await createHumanTask({
      supabase,
      tenantId,
      caseId: row.case_id,
      publicationId,
      title: assisted ? "Publicação requer ação humana" : "Falha ao publicar automaticamente",
      description: assisted
        ? "A API da Meta indicou que este formato/conta não suporta autopublish. Faça publicação assistida." 
        : "A publicação automática falhou. Verifique o erro e tente novamente ou publique assistido.",
      errorMessage: message,
    });

    console.error(`[${fn}] publish failed`, { tenantId, publicationId, message, nextStatus });

    return { ok: false as const, status: nextStatus, error: message };
  }
}
