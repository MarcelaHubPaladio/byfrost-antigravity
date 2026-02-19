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

function json(data: any, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(extraHeaders ?? {}) },
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
    // Avoid relying on String.prototype.replaceAll in older runtimes
    out = out.split(`{{${k}}}`).join(String(val ?? ""));
  }
  return out;
}

const DEFAULT_CONTRACT_BODY = `CONTRATO / PROPOSTA\n\nTenant: {{tenant_name}}\nCliente: {{party_name}}\nPortal do cliente: {{portal_link}}\n\nCliente (documento): {{party_document}}\nCliente (whatsapp): {{party_whatsapp}}\nCliente (email): {{party_email}}\nCliente (endereço): {{party_address_full}}\n\nPrazo: {{contract_term}}\nValor total: {{contract_total_value}}\nForma de pagamento: {{payment_method}}\nVencimento das parcelas: {{installments_due_date}}\n\nESCOPO (deliverables)\n{{scope_lines}}\n\nObservações\n{{scope_notes}}\n\nGerado em: {{generated_at}}\n`;

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
  if (params.tenantCompany?.cnpj) draw(`CNPJ: ${formatDocument(params.tenantCompany.cnpj)}`, 11);
  if (params.tenantCompany?.address_line) draw(`Endereço: ${params.tenantCompany.address_line}`, 11);
  draw("", 8);

  draw(`Cliente: ${params.partyName}`, 11);
  if (params.partyCustomer?.cnpj) draw(`CNPJ: ${formatDocument(params.partyCustomer.cnpj)}`, 11);
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
  let json2: any = null;
  try {
    json2 = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok || !json2?.data?.createDocument) {
    const gqlErr = String(json2?.errors?.[0]?.message ?? "").trim();
    const hint = res.status === 404 ? " (verifique AUTENTIQUE_GQL_URL: v2/graphql vs v2/graphql/corporate)" : "";
    throw new Error(gqlErr ? `autentique_${gqlErr}` : `autentique_http_${res.status}${hint}`);
  }

  return json2.data.createDocument as {
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
  let json2: any = null;
  try {
    json2 = JSON.parse(text);
  } catch {
    // ignore
  }

  const link = json2?.data?.createLinkToSignature?.short_link ?? null;
  if (!res.ok || !link) {
    const gqlErr = String(json2?.errors?.[0]?.message ?? "").trim();
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
  let json2: any = null;
  try {
    json2 = JSON.parse(text);
  } catch {
    // ignore
  }

  const status = json2?.data?.document?.status ?? null;
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
  // IMPORTANT: party data is stored as top-level metadata keys (cpf_cnpj / whatsapp / email / address / city / uf / cep).
  // Do NOT rely on md.customer.
  return {
    legal_name: md?.legal_name ?? null,
    document: md?.cpf_cnpj ?? md?.cpfCnpj ?? md?.document ?? null,
    address: md?.address ?? null,
    city: md?.city ?? null,
    uf: md?.uf ?? md?.state ?? null,
    cep: md?.cep ?? null,
    whatsapp: md?.whatsapp ?? md?.phone ?? md?.phone_e164 ?? null,
    email: md?.email ?? null,
  };
}

function partyAddressFull(customer: any) {
  const parts: string[] = [];
  const addr = safeStr(customer?.address);
  const city = safeStr(customer?.city);
  const uf = safeStr(customer?.uf);
  const cep = safeStr(customer?.cep);

  const cityUf = [city, uf].filter(Boolean).join("/");

  if (addr) parts.push(addr);
  if (cityUf) parts.push(cityUf);
  if (cep) parts.push(`CEP ${cep}`);

  return parts.join(" • ");
}

function formatDocument(v: any) {
  const s = String(v ?? "").replace(/\D/g, "");
  if (s.length === 11) {
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (s.length === 14) {
    return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return String(v ?? "");
}

function inferOrigin(req: Request) {
  const origin = String(req.headers.get("origin") ?? "").trim();
  if (origin) return origin;
  const ref = String(req.headers.get("referer") ?? "").trim();
  if (!ref) return "";
  try {
    return new URL(ref).origin;
  } catch {
    return "";
  }
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
        .select("id,tenant_id,commitment_id,offering_entity_id,quantity,metadata,created_at")
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
          .select("id,tenant_id,offering_entity_id,name,estimated_minutes,required_resource_type,quantity,created_at")
          .eq("tenant_id", tenant.id)
          .in("offering_entity_id", offeringIds)
          .is("deleted_at", null);
        if (tErr2) return err("deliverable_templates_load_failed", 500, { message: tErr2.message });
        templates = ts ?? [];
      }
    }

    // ---------------------------------
    // Contract PDF preview
    // ---------------------------------
    const url = new URL(req.url);
    const actionFromQuery = url.searchParams.get("action") ?? "";

    let actionFromBody = "";
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => null);
        actionFromBody = String(body?.action ?? "").trim();
      } catch {
        // ignore
      }
    }

    const action = actionFromBody || actionFromQuery;

    const customer = getPartyCustomer((party as any)?.metadata ?? {});

    if (req.method === "GET" && action === "contract_pdf") {
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
        if (!off) continue; // Skip items pointing to deleted or missing offerings

        const offName = String(off.display_name ?? oid);
        const itemQty = Number((it as any).quantity ?? 1);
        const ts = templatesByOffering.get(oid) ?? [];
        const overrides = (it as any).metadata?.deliverable_overrides ?? {};

        // Product name
        scopeLines.push(`${offName} [PRODUTO] (qtd ${itemQty})`);

        for (const t of ts) {
          const tId = String((t as any).id);
          const overrideQty = overrides[tId]?.quantity;
          const baseQty = Number((t as any).quantity ?? 1);
          const finalQty = typeof overrideQty === "number" ? overrideQty : (itemQty * baseQty);

          if (finalQty > 0) {
            scopeLines.push(`  └─ Entregável: ${(t as any).name} (qtd ${finalQty})`);
          }
        }
      }

      const tenantTemplates = ensureArray((tenant as any)?.branding_json?.contract_templates).filter(Boolean);
      const chosenId = safeStr((pr as any)?.approval_json?.contract_template_id) || "";
      const chosen = tenantTemplates.find((t: any) => safeStr(t?.id) === chosenId) ?? tenantTemplates[0] ?? null;
      const chosenBody = safeStr(chosen?.body);

      const scopeBlock = scopeLines.length ? scopeLines.map((l) => `• ${l}`).join("\n") : "(sem itens)";

      const origin = inferOrigin(req);
      const portalLink = origin ? `${origin}/p/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pr.token)}` : "";

      const vars: Record<string, string> = {
        tenant_name: safeStr((tenant as any).name ?? tenantSlug),
        tenant_cnpj: formatDocument(company?.cnpj),
        party_name: safeStr((party as any).display_name ?? "Cliente"),
        party_legal_name: safeStr(customer?.legal_name ?? (party as any).display_name),
        party_document: formatDocument(customer?.document),
        party_whatsapp: safeStr(customer?.whatsapp),
        party_email: safeStr(customer?.email),
        party_address_full: partyAddressFull(customer),
        portal_link: portalLink,
        contract_term: safeStr((pr as any)?.approval_json?.contract_term),
        contract_total_value: safeStr((pr as any)?.approval_json?.contract_total_value),
        payment_method: safeStr((pr as any)?.approval_json?.payment_method),
        installments_due_date: safeStr((pr as any)?.approval_json?.installments_due_date),
        scope_notes: safeStr((pr as any)?.approval_json?.scope_notes),
        scope_lines: scopeBlock,
        generated_at: new Date().toLocaleString("pt-BR"),
      };

      const bodyText = chosenBody
        ? renderTemplate(chosenBody, vars)
        : renderTemplate("{{tenant_name}}\n{{party_name}}\n{{portal_link}}\n\n{{scope_lines}}\n\n{{scope_notes}}", vars);
      const pdfBytes = await buildTextContractPdf({ bodyText });

      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=contrato-previa-${tenantSlug}-${String(pr.id).slice(0, 8)}.pdf`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ---------------------------------
    // Action handling
    // ---------------------------------

    if (req.method === "POST" && (action === "sign" || action === "sign_force")) {
      const force = action === "sign_force";

      // Validate/refresh proposal status
      const { data: fresh, error: fErr } = await supabase
        .from("party_proposals")
        .select("id,approved_at,approval_json,autentique_json")
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (fErr || !fresh) return err("proposal_not_found", 404);

      const approvedAt = (fresh as any)?.approved_at ?? null;
      if (!approvedAt) return err("scope_not_approved", 403);

      // BLOCK: do not create multiple signing links/documents (unless force).
      const existingLink = String((fresh as any)?.autentique_json?.signing_link ?? "").trim();
      if (!force && existingLink) {
        return json({ ok: true, signing_link: existingLink, already: true });
      }

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
        if (!off) continue; // Skip items pointing to deleted or missing offerings

        const offName = String(off.display_name ?? oid);
        const itemQty = Number((it as any).quantity ?? 1);
        const ts = templatesByOffering.get(oid) ?? [];
        const overrides = (it as any).metadata?.deliverable_overrides ?? {};

        // Product name
        scopeLines.push(`${offName} [PRODUTO] (qtd ${itemQty})`);

        for (const t of ts) {
          const tId = String((t as any).id);
          const overrideQty = overrides[tId]?.quantity;
          const baseQty = Number((t as any).quantity ?? 1);
          const finalQty = typeof overrideQty === "number" ? overrideQty : (itemQty * baseQty);

          if (finalQty > 0) {
            scopeLines.push(`  └─ Entregável: ${(t as any).name} (qtd ${finalQty})`);
          }
        }
      }

      const tenantCompany = {
        cnpj: company?.cnpj ?? null,
        address_line: company?.address_line ?? null,
      };

      const partyCustomer = {
        cnpj: customer?.document ?? null,
        address_line: partyAddressFull(customer),
        phone: customer?.whatsapp ?? null,
        email: customer?.email ?? null,
      };

      // ---------------------------------
      // Contract template (per tenant)
      // ---------------------------------
      const tenantTemplates = ensureArray((tenant as any)?.branding_json?.contract_templates).filter(Boolean);
      const chosenId =
        safeStr((fresh as any)?.approval_json?.contract_template_id) ||
        safeStr((pr as any)?.approval_json?.contract_template_id) ||
        "";

      const chosen = tenantTemplates.find((t: any) => safeStr(t?.id) === chosenId) ?? tenantTemplates[0] ?? null;
      const chosenBody = safeStr(chosen?.body);

      // Always generate contract from (template body OR default body). This avoids sending a "generic" PDF
      // when the tenant has no templates or the chosen template body is empty.
      const contractBody = chosenBody || DEFAULT_CONTRACT_BODY;

      const scopeBlock = scopeLines.length ? scopeLines.map((l) => `• ${l}`).join("\n") : "(sem itens)";

      const customerName = safeStr(customer?.legal_name ?? (party as any).display_name);
      const origin = inferOrigin(req);
      const portalLink = origin ? `${origin}/p/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pr.token)}` : "";

      const vars: Record<string, string> = {
        tenant_name: safeStr((tenant as any).name ?? tenantSlug),
        tenant_cnpj: formatDocument(company?.cnpj),
        party_name: safeStr((party as any).display_name ?? "Cliente"),
        party_legal_name: customerName,
        party_document: formatDocument(customer?.document),
        party_whatsapp: safeStr(customer?.whatsapp),
        party_email: safeStr(customer?.email),
        party_address_full: partyAddressFull(customer),
        portal_link: portalLink,
        contract_term: safeStr((fresh as any)?.approval_json?.contract_term ?? (pr as any)?.approval_json?.contract_term),
        contract_total_value: safeStr(
          (fresh as any)?.approval_json?.contract_total_value ?? (pr as any)?.approval_json?.contract_total_value
        ),
        payment_method: safeStr((fresh as any)?.approval_json?.payment_method ?? (pr as any)?.approval_json?.payment_method),
        installments_due_date: safeStr(
          (fresh as any)?.approval_json?.installments_due_date ?? (pr as any)?.approval_json?.installments_due_date
        ),
        scope_notes: safeStr((fresh as any)?.approval_json?.scope_notes ?? (pr as any)?.approval_json?.scope_notes),
        scope_lines: scopeBlock,
        generated_at: new Date().toLocaleString("pt-BR"),
      };

      const bodyText = renderTemplate(contractBody, vars);
      const pdfBytes = await buildTextContractPdf({ bodyText });

      const filename = `contrato-${tenantSlug}-${String((party as any).id).slice(0, 8)}.pdf`;
      const documentName = `Contrato • ${String((tenant as any).name ?? tenantSlug)} • ${String((party as any).display_name ?? "Cliente")}`;

      const apiToken2 = String(Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "").trim();
      if (!apiToken2) return err("missing_autentique_token", 500);

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
        message: force ? "Contrato reenviado para assinatura." : "Contrato emitido para assinatura.",
        occurredAt: nowIso(),
        meta: { proposal_id: pr.id, party_entity_id: pr.party_entity_id, document_id: created.id, signing_link: signingLink },
      });

      return json({ ok: true, signing_link: signingLink, document_id: created.id, forced: force });
    }

    if (req.method === "POST" && action === "approve") {
      const { error: upErr } = await supabase
        .from("party_proposals")
        .update({ status: "approved", approved_at: nowIso() })
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .is("deleted_at", null);

      if (upErr) return err("proposal_update_failed", 500, { message: upErr.message });

      await insertTimelineEventOnce(supabase, {
        tenantId: tenant.id,
        eventType: "proposal_approved",
        actorType: "system",
        message: "Proposta aprovada.",
        occurredAt: nowIso(),
        meta: { proposal_id: pr.id, party_entity_id: pr.party_entity_id },
      });

      effectiveProposalStatus = "approved";
      return json({ ok: true });
    }

    // ---------------------
    // Default: GET payload
    // ---------------------

    const partyAddressLine = partyAddressFull(customer);

    return json({
      ok: true,
      tenant: {
        id: (tenant as any)?.id,
        slug: (tenant as any)?.slug,
        name: (tenant as any)?.name,
        logo_url: tenantLogoUrl,
        company,
      },
      party: {
        id: (party as any)?.id,
        display_name: (party as any)?.display_name,
        logo_url: partyLogoUrl,
        customer: {
          document: safeStr(customer?.document) || null,
          address_line: partyAddressLine || null,
          whatsapp: safeStr(customer?.whatsapp) || null,
          email: safeStr(customer?.email) || null,
        },
      },
      proposal: {
        id: pr.id,
        status: effectiveProposalStatus,
        approved_at: pr.approved_at,
        selected_commitment_ids: pr.selected_commitment_ids ?? [],
        signing_link: safeStr(pr.autentique_json?.signing_link) || null,
        autentique_status: safeStr(pr.autentique_json?.status) || null,
      },
      palette: portalPalette,
      report: {
        commitments_selected: commitmentIds.length,
        deliverables_in_scope: templates.length,
        cases_related: 0,
        timeline_events: 0,
        publications_scheduled: 0,
        publications_published: 0,
      },
      calendar: { publications: [] },
      history: { cases: [], events: [] },
      scope: {
        commitments,
        items,
        offeringsById,
        templates,
      },
    });
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