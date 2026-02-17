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

type ProposalRow = {
  id: string;
  tenant_id: string;
  party_entity_id: string;
  token: string;
  selected_commitment_ids: string[];
  status: string;
  approved_at: string | null;
  approval_json: any;
  autentique_json: any;
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

function getInput(req: Request) {
  const url = new URL(req.url);
  const tenant_slug = url.searchParams.get("tenant_slug") ?? undefined;
  const token = url.searchParams.get("token") ?? undefined;
  return { tenant_slug, token };
}

function ensureArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function renderTemplate(body: string, vars: Record<string, string>) {
  let out = String(body ?? "");
  for (const [k, val] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, String(val ?? ""));
  }
  return out;
}

function toBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(bin);
}

async function buildTextContractPdf(params: { bodyText: string }) {
  const { PDFDocument, StandardFonts, rgb } = await import("https://esm.sh/pdf-lib@1.17.1");

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const margin = 48;
  const maxWidth = 595.28 - margin * 2;
  const lineHeight = 16;

  let y = 841.89 - margin;

  const wrapLine = (line: string, size: number) => {
    const words = String(line ?? "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const out: string[] = [];
    let current = "";
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      const width = font.widthOfTextAtSize(next, size);
      if (width <= maxWidth) {
        current = next;
      } else {
        if (current) out.push(current);
        current = w;
      }
    }
    if (current) out.push(current);
    return out.length ? out : [""];
  };

  const drawLine = (line: string, size: number) => {
    const lines = wrapLine(line, size);
    for (const l of lines) {
      if (y < margin + lineHeight) {
        page = pdf.addPage([595.28, 841.89]);
        y = 841.89 - margin;
      }
      page.drawText(l, {
        x: margin,
        y,
        size,
        font,
        color: rgb(0.12, 0.12, 0.14),
      });
      y -= lineHeight;
    }
  };

  const body = String(params.bodyText ?? "").replace(/\r\n/g, "\n");
  const rawLines = body.split("\n");

  for (const ln of rawLines) {
    const trimmed = ln.trimEnd();

    // Simple formatting: lines starting with "# " become titles.
    if (trimmed.startsWith("# ")) {
      drawLine(trimmed.replace(/^#\s+/, ""), 16);
      y -= 4;
      continue;
    }

    // Empty line
    if (!trimmed.trim()) {
      y -= 10;
      continue;
    }

    drawLine(trimmed, 11);
  }

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

async function buildSimpleContractPdf(params: {
  tenantName: string;
  tenantCompany: any;
  partyName: string;
  partyCustomer: any;
  scopeLines: string[];
}) {
  const { PDFDocument, StandardFonts, rgb } = await import("https://esm.sh/pdf-lib@1.17.1");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const margin = 48;
  let y = 800;

  const draw = (text: string, size = 11) => {
    const f = font;
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: f,
      color: rgb(0.12, 0.12, 0.14),
    });
    y -= size + 8;
  };

  draw("CONTRATO / PROPOSTA", 16);
  draw(`Tenant: ${params.tenantName}`, 11);
  if (params.tenantCompany?.cnpj) draw(`CNPJ: ${params.tenantCompany.cnpj}`, 11);
  if (params.tenantCompany?.address_line) draw(`Endereço: ${params.tenantCompany.address_line}`, 11);
  draw("", 8);

  draw(`Cliente: ${params.partyName}`, 11);
  if (params.partyCustomer?.cnpj) draw(`CNPJ: ${params.partyCustomer.cnpj}`, 11);
  if (params.partyCustomer?.address_line) draw(`Endereço: ${params.partyCustomer.address_line}`, 11);
  if (params.partyCustomer?.phone) draw(`Telefone: ${params.partyCustomer.phone}`, 11);
  if (params.partyCustomer?.email) draw(`Email: ${params.partyCustomer.email}`, 11);
  draw("", 8);

  draw("ESCOPO (deliverables)", 12);
  const lines = params.scopeLines.length ? params.scopeLines : ["(sem itens)"];
  for (const l of lines.slice(0, 60)) {
    draw(`• ${l}`, 10);
    if (y < 80) break;
  }

  draw("", 8);
  draw(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 9);

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

function getAutentiqueGraphqlUrl() {
  // Defaults to Autentique v2 endpoint.
  // Some accounts use the corporate endpoint: https://api.autentique.com.br/v2/graphql/corporate
  return (
    (Deno.env.get("AUTENTIQUE_GQL_URL") ?? "").trim() ||
    "https://api.autentique.com.br/v2/graphql"
  );
}

async function autentiqueCreateDocument(params: {
  apiToken: string;
  filename: string;
  fileBytes: Uint8Array;
  documentName: string;
  signerName: string;
  signerEmail: string;
}) {
  const url = getAutentiqueGraphqlUrl();

  // Autentique v2: Document does NOT expose public_id; the signature does.
  // We keep only fields we actually need.
  const query = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(document: $document, signers: $signers, file: $file) {
      id
      name
      signatures { public_id name email action { name } }
    }
  }`;

  const operations = {
    query,
    variables: {
      document: { name: params.documentName },
      signers: [{ name: params.signerName, email: params.signerEmail, action: "SIGN" }],
      file: null,
    },
  };

  const form = new FormData();
  form.set("operations", JSON.stringify(operations));
  form.set("map", JSON.stringify({ "0": ["variables.file"] }));

  const blob = new Blob([params.fileBytes], { type: "application/pdf" });
  form.set("0", blob, params.filename);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.apiToken}` },
    body: form,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok || !json?.data?.createDocument) {
    const gqlErr = String(json?.errors?.[0]?.message ?? "").trim();
    const hint = res.status === 404 ? " (verifique AUTENTIQUE_GQL_URL: v2/graphql vs v2/graphql/corporate)" : "";
    throw new Error(gqlErr ? `autentique_${gqlErr}` : `autentique_http_${res.status}${hint}`);
  }

  return json.data.createDocument as {
    id: string;
    name?: string;
    signatures?: Array<{ public_id: string; name: string; email: string; action?: { name?: string } | null }>;
  };
}

async function autentiqueCreateSignatureLink(params: { apiToken: string; signerPublicId: string }) {
  const url = getAutentiqueGraphqlUrl();

  // Use variables to avoid GraphQL parsing/escaping issues.
  // Autentique expects UUID for public_id.
  const query = `mutation CreateLink($publicId: UUID!) {
    createLinkToSignature(public_id: $publicId) { short_link }
  }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { publicId: params.signerPublicId } }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  const link = json?.data?.createLinkToSignature?.short_link ?? null;
  if (!res.ok || !link) {
    const gqlErr = String(json?.errors?.[0]?.message ?? "").trim();
    const hint = res.status === 404 ? " (verifique AUTENTIQUE_GQL_URL: v2/graphql vs v2/graphql/corporate)" : "";
    throw new Error(gqlErr ? `autentique_${gqlErr}` : `autentique_http_${res.status}${hint}`);
  }

  return String(link);
}

async function autentiqueGetDocumentStatus(params: { apiToken: string; documentId: string }) {
  const url = getAutentiqueGraphqlUrl();

  const query = `query DocumentStatus($id: UUID!) {
    document(id: $id) { id status }
  }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: params.documentId } }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  const status = json?.data?.document?.status ?? null;
  return status ? String(status).toLowerCase() : null;
}

function nowIso() {
  return new Date().toISOString();
}

async function insertTimelineEventOnce(
  supabase: any,
  params: {
    tenantId: string;
    eventType: string;
    actorType: string;
    message: string;
    occurredAt: string;
    meta: any;
  }
) {
  const { tenantId, eventType, actorType, message, occurredAt, meta } = params;

  // Check for duplicate by (event_type + proposal_id + occurred_at day)
  // Keep it simple and only dedupe by event_type + proposal_id.
  const proposalId = String(meta?.proposal_id ?? "");

  const { data: existing } = await supabase
    .from("timeline_events")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("case_id", null)
    .eq("event_type", eventType)
    .eq("meta_json->>proposal_id", proposalId)
    .limit(1);

  if ((existing ?? []).length) return;

  await supabase.from("timeline_events").insert({
    tenant_id: tenantId,
    case_id: null,
    event_type: eventType,
    actor_type: actorType,
    actor_id: null,
    message,
    meta_json: meta,
    occurred_at: occurredAt,
  });
}

function getPartyCustomer(md: any) {
  const c = md?.customer ?? {};
  return {
    legal_name: c?.legal_name ?? null,
    document: c?.document ?? md?.cpf_cnpj ?? null,
    address_line: c?.address_line ?? null,
    whatsapp: c?.whatsapp ?? md?.whatsapp ?? null,
    email: c?.email ?? md?.email ?? null,
  };
}

const fn = "public-proposal";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_slug, token } = getInput(req);
    const tenantSlug = String(tenant_slug ?? "").trim();
    const proposalToken = String(token ?? "").trim();

    if (!tenantSlug || !proposalToken) return err("missing_params", 400);

    const supabase = createSupabaseAdmin();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, slug, name, branding_json")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tErr || !tenant) return err("tenant_not_found", 404);

    const { data: proposal, error: pErr } = await supabase
      .from("party_proposals")
      .select(
        "id,tenant_id,party_entity_id,token,selected_commitment_ids,status,approved_at,approval_json,autentique_json"
      )
      .eq("tenant_id", tenant.id)
      .eq("token", proposalToken)
      .is("deleted_at", null)
      .maybeSingle();

    if (pErr || !proposal) return err("proposal_not_found", 404);

    const pr = proposal as ProposalRow;

    // Track effective status in this request (since we may update DB during GET).
    let effectiveProposalStatus: string = String(pr.status ?? "");
    let effectiveAutentiqueStatus: string | null = pr.autentique_json?.status ?? null;

    // Load party entity
    const { data: party, error: eErr } = await supabase
      .from("core_entities")
      .select("id,tenant_id,entity_type,display_name,metadata")
      .eq("tenant_id", tenant.id)
      .eq("id", pr.party_entity_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (eErr || !party) return err("party_not_found", 404);

    const company = (tenant as any)?.branding_json?.company ?? {};

    // Public portal palette:
    // 1) Prefer party.metadata.public_portal.palette (customer-specific theme for this proposal link)
    // 2) Fallback to tenant.branding_json.palette
    const partyPalette = (party as any)?.metadata?.public_portal?.palette ?? null;
    const tenantPalette = (tenant as any)?.branding_json?.palette ?? null;
    const portalPalette = partyPalette ?? tenantPalette ?? null;

    const tenantLogoBucket = (tenant as any)?.branding_json?.logo?.bucket ?? null;
    const tenantLogoPath = (tenant as any)?.branding_json?.logo?.path ?? null;
    let tenantLogoUrl: string | null = null;

    if (tenantLogoBucket && tenantLogoPath) {
      const { data } = await supabase.storage.from(String(tenantLogoBucket)).createSignedUrl(String(tenantLogoPath), 60 * 30);
      if (data?.signedUrl) tenantLogoUrl = data.signedUrl;
    }

    const partyLogoBucket = (party as any)?.metadata?.logo?.bucket ?? null;
    const partyLogoPath = (party as any)?.metadata?.logo?.path ?? null;
    let partyLogoUrl: string | null = null;

    if (partyLogoBucket && partyLogoPath) {
      const { data } = await supabase.storage.from(String(partyLogoBucket)).createSignedUrl(String(partyLogoPath), 60 * 30);
      if (data?.signedUrl) partyLogoUrl = data.signedUrl;
    }

    // Load commitments + items + templates (scope)
    const commitmentIds = (pr.selected_commitment_ids ?? []).filter(Boolean);
    let commitments: any[] = [];
    let items: any[] = [];
    let templates: any[] = [];
    let offeringsById: Record<string, any> = {};

    if (commitmentIds.length) {
      const { data: cs, error: cErr } = await supabase
        .from("commercial_commitments")
        .select("id,tenant_id,customer_entity_id,commitment_type,status,created_at")
        .eq("tenant_id", tenant.id)
        .in("id", commitmentIds)
        .is("deleted_at", null);
      if (cErr) return err("commitments_load_failed", 500, { message: cErr.message });
      commitments = cs ?? [];

      const { data: its, error: iErr } = await supabase
        .from("commitment_items")
        .select("id,tenant_id,commitment_id,offering_entity_id,quantity,created_at")
        .eq("tenant_id", tenant.id)
        .in("commitment_id", commitmentIds)
        .is("deleted_at", null);
      if (iErr) return err("items_load_failed", 500, { message: iErr.message });
      items = its ?? [];

      const offeringIds = Array.from(new Set(items.map((it: any) => String(it.offering_entity_id)).filter(Boolean)));

      if (offeringIds.length) {
        const { data: offs, error: oErr } = await supabase
          .from("core_entities")
          .select("id,display_name,entity_type")
          .eq("tenant_id", tenant.id)
          .in("id", offeringIds)
          .is("deleted_at", null);
        if (oErr) return err("offerings_load_failed", 500, { message: oErr.message });
        offeringsById = Object.fromEntries((offs ?? []).map((o: any) => [String(o.id), o]));

        const { data: ts, error: tErr2 } = await supabase
          .from("deliverable_templates")
          .select("id,tenant_id,offering_entity_id,name,estimated_minutes,required_resource_type,created_at")
          .eq("tenant_id", tenant.id)
          .in("offering_entity_id", offeringIds)
          .is("deleted_at", null);
        if (tErr2) return err("templates_load_failed", 500, { message: tErr2.message });
        templates = ts ?? [];
      }
    }

    // -------------------------
    // Public portal extra menus
    // -------------------------

    // Timeline (journeys/cases) related to this entity.
    // The CRM bridge stores cases.customer_entity_id.
    const { data: cases, error: casesErr } = await supabase
      .from("cases")
      .select("id,case_type,title,status,state,created_at,updated_at")
      .eq("tenant_id", tenant.id)
      .eq("customer_entity_id", pr.party_entity_id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (casesErr) return err("cases_load_failed", 500, { message: casesErr.message });

    const caseIds = (cases ?? []).map((c: any) => String(c.id)).filter(Boolean);

    // 1) Case/journey events
    let timelineEvents: any[] = [];
    if (caseIds.length) {
      const q = supabase
        .from("timeline_events")
        .select("id,case_id,event_type,actor_type,message,occurred_at,meta_json")
        .eq("tenant_id", tenant.id)
        .in("case_id", caseIds)
        .order("occurred_at", { ascending: false })
        .limit(400);

      const { data: evs, error: evErr } = await q;
      if (evErr) return err("timeline_load_failed", 500, { message: evErr.message });
      timelineEvents = evs ?? [];
    }

    // 2) Entity events (core_entity_events) mapped into timeline shape
    const { data: entityEventsRaw } = await supabase
      .from("core_entity_events")
      .select("id,event_type,before,after,actor_user_id,created_at")
      .eq("tenant_id", tenant.id)
      .eq("entity_id", pr.party_entity_id)
      .order("created_at", { ascending: false })
      .limit(200);

    const entityEvents = (entityEventsRaw ?? []).map((r: any) => ({
      id: `ce:${String(r.id)}`,
      case_id: null,
      event_type: `entity:${String(r.event_type)}`,
      actor_type: r.actor_user_id ? "admin" : "system",
      message: `Evento da entidade: ${String(r.event_type)}`,
      occurred_at: String(r.created_at),
      meta_json: { before: r.before ?? null, after: r.after ?? null, actor_user_id: r.actor_user_id ?? null },
    }));

    // 3) Proposal lifecycle events stored in timeline_events (case_id null)
    const { data: proposalEventsRaw } = await supabase
      .from("timeline_events")
      .select("id,case_id,event_type,actor_type,message,occurred_at,meta_json")
      .eq("tenant_id", tenant.id)
      .is("case_id", null)
      .eq("meta_json->>proposal_id", String(pr.id))
      .order("occurred_at", { ascending: false })
      .limit(200);

    const proposalEvents = proposalEventsRaw ?? [];

    const allHistoryEvents = [...(proposalEvents ?? []), ...(entityEvents ?? []), ...(timelineEvents ?? [])]
      .sort((a: any, b: any) => new Date(String(b.occurred_at)).getTime() - new Date(String(a.occurred_at)).getTime())
      .slice(0, 800);

    // Publications calendar for this entity: by cases -> content_publications
    let publications: any[] = [];
    if (caseIds.length) {
      const { data: pubs, error: pubErr } = await supabase
        .from("content_publications")
        .select("id,channel,scheduled_at,publish_status,content_items(theme_title,client_name)")
        .eq("tenant_id", tenant.id)
        .in("case_id", caseIds)
        .order("scheduled_at", { ascending: true })
        .limit(2000);
      if (pubErr) return err("publications_load_failed", 500, { message: pubErr.message });
      publications = pubs ?? [];
    }

    const report = {
      commitments_selected: commitmentIds.length,
      deliverables_in_scope: (items ?? []).length * (templates ?? []).length,
      cases_related: (cases ?? []).length,
      timeline_events: allHistoryEvents.length,
      publications_scheduled: (publications ?? []).filter((p: any) => String(p?.publish_status ?? "") === "SCHEDULED").length,
      publications_published: (publications ?? []).filter((p: any) => String(p?.publish_status ?? "") === "PUBLISHED").length,
    };

    // Autentique status best-effort
    let autentiqueStatus: string | null = null;
    const apiToken = Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "";
    const docId = pr.autentique_json?.document_id ?? null;
    if (apiToken && docId) {
      autentiqueStatus = await autentiqueGetDocumentStatus({ apiToken, documentId: String(docId) });
      if (autentiqueStatus) {
        // Best effort: mirror into proposal
        const nextAut = {
          ...(pr.autentique_json ?? {}),
          status: autentiqueStatus,
          checked_at: new Date().toISOString(),
        };

        // If Autentique reports signed, reflect it in the proposal status as well.
        const nextStatus = autentiqueStatus === "signed" ? "signed" : effectiveProposalStatus;

        effectiveProposalStatus = nextStatus;
        effectiveAutentiqueStatus = autentiqueStatus;

        await supabase
          .from("party_proposals")
          .update({
            status: nextStatus,
            autentique_json: nextAut,
          })
          .eq("tenant_id", tenant.id)
          .eq("id", pr.id);

        if (autentiqueStatus === "signed") {
          await insertTimelineEventOnce(supabase, {
            tenantId: tenant.id,
            eventType: "contract_signed",
            actorType: "system",
            message: "Contrato assinado.",
            occurredAt: nowIso(),
            meta: { proposal_id: pr.id, party_entity_id: pr.party_entity_id, document_id: docId },
          });
        }
      }
    }

    if (req.method === "GET") {
      return json({
        ok: true,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          logo_url: tenantLogoUrl,
          company,
        },
        party: {
          id: party.id,
          display_name: (party as any).display_name,
          logo_url: partyLogoUrl,
          customer: getPartyCustomer((party as any).metadata ?? {}),
        },
        proposal: {
          id: pr.id,
          status: effectiveProposalStatus,
          approved_at: pr.approved_at,
          selected_commitment_ids: pr.selected_commitment_ids,
          signing_link: pr.autentique_json?.signing_link ?? null,
          autentique_status: effectiveAutentiqueStatus ?? autentiqueStatus ?? null,
        },
        palette: portalPalette,
        report,
        calendar: {
          publications,
        },
        history: {
          cases: cases ?? [],
          events: allHistoryEvents,
        },
        scope: {
          commitments,
          items,
          offeringsById,
          templates,
        },
      });
    }

    if (req.method !== "POST") return err("method_not_allowed", 405);

    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? "").trim();

    if (action === "approve") {
      if (pr.approved_at) {
        return json({ ok: true, already: true, approved_at: pr.approved_at });
      }

      const forwardedFor = req.headers.get("x-forwarded-for") ?? null;
      const ua = req.headers.get("user-agent") ?? null;

      const nextApproval = {
        ...(pr.approval_json ?? {}),
        approved_ip: forwardedFor,
        user_agent: ua,
        approved_at: new Date().toISOString(),
      };

      const approvedAtIso = nowIso();

      const { error: uErr } = await supabase
        .from("party_proposals")
        .update({ status: "approved", approved_at: approvedAtIso, approval_json: nextApproval })
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .is("deleted_at", null);

      if (uErr) return err("approve_failed", 500, { message: uErr.message });

      await insertTimelineEventOnce(supabase, {
        tenantId: tenant.id,
        eventType: "proposal_approved",
        actorType: "customer",
        message: "Cliente aprovou o escopo da proposta.",
        occurredAt: approvedAtIso,
        meta: { proposal_id: pr.id, party_entity_id: pr.party_entity_id },
      });

      return json({ ok: true });
    }

    if (action === "sign") {
      const apiToken2 = Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "";
      if (!apiToken2) return err("missing_AUTENTIQUE_API_TOKEN", 500);

      // Require approval before signing
      const fresh = await supabase
        .from("party_proposals")
        .select("approved_at,autentique_json,status,approval_json")
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .maybeSingle();

      const approvedAt = (fresh.data as any)?.approved_at ?? null;
      if (!approvedAt) return err("scope_not_approved", 403);

      // BLOCK: do not create multiple signing links/documents.
      const existingLink = String((fresh.data as any)?.autentique_json?.signing_link ?? "").trim();
      if (existingLink) {
        return json({ ok: true, signing_link: existingLink, already: true });
      }

      const customer = getPartyCustomer((party as any).metadata ?? {});
      const signerName = String(customer?.legal_name ?? (party as any).display_name ?? "Cliente").trim();
      const signerEmail = String(customer?.email ?? "").trim();
      if (!signerEmail) return err("missing_customer_email", 400);

      // Scope lines
      const scopeLines: string[] = [];
      const templatesByOffering = new Map<string, any[]>();
      for (const t of templates ?? []) {
        const oid = String((t as any).offering_entity_id);
        if (!templatesByOffering.has(oid)) templatesByOffering.set(oid, []);
        templatesByOffering.get(oid)!.push(t);
      }

      for (const it of items ?? []) {
        const oid = String((it as any).offering_entity_id);
        const off = offeringsById[oid];
        const offName = String(off?.display_name ?? oid);
        const ts = templatesByOffering.get(oid) ?? [];
        for (const t of ts) {
          scopeLines.push(`${offName} — ${(t as any).name}`);
        }
      }

      const tenantCompany = {
        cnpj: company?.cnpj ?? null,
        address_line: company?.address_line ?? null,
      };

      const partyCustomer = {
        cnpj: customer?.document ?? null,
        address_line: customer?.address_line ?? null,
        phone: customer?.whatsapp ?? null,
        email: customer?.email ?? null,
      };

      // ---------------------------------
      // Contract template (per tenant)
      // ---------------------------------
      const tenantTemplates = ensureArray((tenant as any)?.branding_json?.contract_templates).filter(Boolean);
      const chosenId =
        safeStr((fresh.data as any)?.approval_json?.contract_template_id) ||
        safeStr((pr as any)?.approval_json?.contract_template_id) ||
        "";

      const chosen = tenantTemplates.find((t: any) => safeStr(t?.id) === chosenId) ?? tenantTemplates[0] ?? null;
      const chosenBody = safeStr(chosen?.body);

      let pdfBytes: Uint8Array;
      if (chosenBody) {
        const scopeBlock = scopeLines.length ? scopeLines.map((l) => `• ${l}`).join("\n") : "(sem itens)";
        const bodyText = renderTemplate(chosenBody, {
          tenant_name: safeStr((tenant as any).name ?? tenantSlug),
          party_name: safeStr((party as any).display_name ?? "Cliente"),
          scope_lines: scopeBlock,
          generated_at: new Date().toLocaleString("pt-BR"),
        });

        pdfBytes = await buildTextContractPdf({ bodyText });
      } else {
        // Fallback to the built-in PDF.
        pdfBytes = await buildSimpleContractPdf({
          tenantName: safeStr((tenant as any).name ?? tenantSlug),
          tenantCompany,
          partyName: safeStr((party as any).display_name ?? "Cliente"),
          partyCustomer,
          scopeLines,
        });
      }

      const filename = `contrato-${tenantSlug}-${String((party as any).id).slice(0, 8)}.pdf`;
      const documentName = `Contrato • ${String((tenant as any).name ?? tenantSlug)} • ${String((party as any).display_name ?? "Cliente")}`;

      const created = await autentiqueCreateDocument({
        apiToken: apiToken2,
        filename,
        fileBytes: pdfBytes,
        documentName,
        signerName,
        signerEmail,
      });

      const sig =
        (created.signatures ?? []).find(
          (s) =>
            String(s?.email ?? "").trim().toLowerCase() === signerEmail.toLowerCase() &&
            String(s?.action?.name ?? "").toUpperCase() === "SIGN"
        ) ??
        (created.signatures ?? []).find((s) => String(s?.action?.name ?? "").toUpperCase() === "SIGN") ??
        null;

      const signerPublicId = String(sig?.public_id ?? "");
      if (!signerPublicId) return err("autentique_signer_missing", 500);

      const signingLink = await autentiqueCreateSignatureLink({ apiToken: apiToken2, signerPublicId });

      const nextAut = {
        ...(pr.autentique_json ?? {}),
        document_id: created.id,
        document_public_id: null,
        signer_public_id: signerPublicId,
        signing_link: signingLink,
        status: null,
        created_at: new Date().toISOString(),
        contract_template_id: safeStr(chosen?.id) || null,
        contract_template_name: safeStr(chosen?.name) || null,
        file_b64_sha256: crypto.subtle
          ? await crypto.subtle
              .digest("SHA-256", pdfBytes)
              .then((h) => Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""))
          : null,
        file_base64: null,
      };

      const { error: upErr } = await supabase
        .from("party_proposals")
        .update({ status: "contract_sent", autentique_json: nextAut })
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .is("deleted_at", null);

      if (upErr) return err("proposal_update_failed", 500, { message: upErr.message });

      await insertTimelineEventOnce(supabase, {
        tenantId: tenant.id,
        eventType: "contract_sent",
        actorType: "system",
        message: "Contrato emitido para assinatura.",
        occurredAt: nowIso(),
        meta: { proposal_id: pr.id, party_entity_id: pr.party_entity_id, document_id: created.id, signing_link: signingLink },
      });

      return json({ ok: true, signing_link: signingLink, document_id: created.id });
    }

    return err("invalid_action", 400);
  } catch (e: any) {
    const msg = String(e?.message ?? String(e) ?? "internal_error").trim();

    // Prefer returning the real message for known integration failures (helps UX and debugging).
    if (msg.startsWith("autentique_")) {
      console.error(`[public-proposal] autentique_error`, { message: msg });
      return err(msg, 500, { message: msg });
    }

    console.error(`[public-proposal] unhandled`, { fn, error: msg });
    return err("internal_error", 500, { message: msg });
  }
});