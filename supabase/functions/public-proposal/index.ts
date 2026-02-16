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

function toBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(bin);
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

async function autentiqueCreateDocument(params: {
  apiToken: string;
  filename: string;
  fileBytes: Uint8Array;
  documentName: string;
  signerName: string;
  signerEmail: string;
}) {
  const url = "https://api.autentique.com.br/graphql";

  const query = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(document: $document, signers: $signers, file: $file) {
      id
      public_id
      status
      signers { public_id name email }
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

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.createDocument) {
    throw new Error(String(json?.errors?.[0]?.message ?? `autentique_error_${res.status}`));
  }

  return json.data.createDocument as {
    id: string;
    public_id: string;
    status: string;
    signers: Array<{ public_id: string; name: string; email: string }>;
  };
}

async function autentiqueCreateSignatureLink(params: { apiToken: string; signerPublicId: string }) {
  const url = "https://api.autentique.com.br/graphql";
  const query = `mutation { createLinkToSignature(public_id: \\\"${params.signerPublicId}\\\") { short_link } }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json().catch(() => null);
  const link = json?.data?.createLinkToSignature?.short_link ?? null;
  if (!res.ok || !link) {
    throw new Error(String(json?.errors?.[0]?.message ?? `autentique_link_error_${res.status}`));
  }

  return String(link);
}

async function autentiqueGetDocumentStatus(params: { apiToken: string; documentPublicId: string }) {
  const url = "https://api.autentique.com.br/graphql";
  const query = `query { document(public_id: \\\"${params.documentPublicId}\\\") { public_id status } }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json().catch(() => null);
  const status = json?.data?.document?.status ?? null;
  if (!res.ok || !status) return null;
  return String(status);
}

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function formatCpfCnpj(digitsRaw: string) {
  const d = onlyDigits(digitsRaw).slice(0, 14);

  // CPF: 000.000.000-00
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += "." + p2;
    if (p3) out += "." + p3;
    if (p4) out += "-" + p4;
    return out;
  }

  // CNPJ: 00.000.000/0000-00
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "/" + p4;
  if (p5) out += "-" + p5;
  return out;
}

function normalizeWhatsappDigits(digitsRaw: string) {
  const d = onlyDigits(digitsRaw);
  if (d.startsWith("55") && d.length > 13) return d.slice(0, 13);
  if (d.startsWith("55") && d.length <= 13) return d;
  return d.slice(0, 11);
}

function formatWhatsappBr(digitsRaw: string) {
  const d0 = normalizeWhatsappDigits(digitsRaw);
  const has55 = d0.startsWith("55") && d0.length > 11;
  const d = has55 ? d0.slice(2) : d0;

  const dd = d.slice(0, 2);
  const rest = d.slice(2);

  const isMobile = rest.length >= 9;
  const a = isMobile ? rest.slice(0, 5) : rest.slice(0, 4);
  const b = isMobile ? rest.slice(5, 9) : rest.slice(4, 8);

  let out = "";
  if (has55) out += "+55 ";
  if (dd) out += `(${dd}) `;
  out += a;
  if (b) out += "-" + b;
  return out.trim();
}

function getPartyCustomer(meta: any) {
  const md = (meta ?? {}) as any;
  const legacy = (md.customer ?? {}) as any;

  const docDigits =
    onlyDigits(String(md.cpf_cnpj ?? md.cpfCnpj ?? md.document ?? legacy.cnpj ?? legacy.cpf ?? "")).slice(0, 14) ||
    "";

  const email = String(md.email ?? legacy.email ?? "").trim() || null;
  const whatsapp = formatWhatsappBr(String(md.whatsapp ?? md.phone ?? md.phone_e164 ?? legacy.phone ?? "")) || null;

  const addressLine =
    String(md.address_line ?? legacy.address_line ?? "").trim() ||
    [
      String(md.address ?? "").trim(),
      String(md.city ?? "").trim(),
      String(md.uf ?? md.state ?? "").trim(),
      String(md.cep ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" • ") ||
    null;

  const legalName = String(legacy.legal_name ?? md.legal_name ?? "").trim() || null;

  return {
    legal_name: legalName,
    document: docDigits ? formatCpfCnpj(docDigits) : null,
    email,
    whatsapp,
    address_line: addressLine,
  };
}

serve(async (req) => {
  const fn = "public-proposal";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const palettePrimaryHex = (tenant as any)?.branding_json?.palette?.primary?.hex ?? null;

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
          .select("id,tenant_id,offering_entity_id,name,minutes,created_at")
          .eq("tenant_id", tenant.id)
          .in("offering_entity_id", offeringIds)
          .is("deleted_at", null);
        if (tErr2) return err("templates_load_failed", 500, { message: tErr2.message });
        templates = ts ?? [];
      }
    }

    // Autentique status best-effort
    let autentiqueStatus: string | null = null;
    const apiToken = Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "";
    const docPublicId = pr.autentique_json?.document_public_id ?? null;
    if (apiToken && docPublicId) {
      autentiqueStatus = await autentiqueGetDocumentStatus({ apiToken, documentPublicId: String(docPublicId) });
      if (autentiqueStatus) {
        // Best effort: mirror into proposal
        await supabase
          .from("party_proposals")
          .update({
            autentique_json: { ...(pr.autentique_json ?? {}), status: autentiqueStatus, checked_at: new Date().toISOString() },
          })
          .eq("tenant_id", tenant.id)
          .eq("id", pr.id);
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
          palette_primary_hex: palettePrimaryHex,
        },
        party: {
          id: party.id,
          display_name: (party as any).display_name,
          logo_url: partyLogoUrl,
          customer: getPartyCustomer((party as any).metadata ?? {}),
        },
        proposal: {
          id: pr.id,
          status: pr.status,
          approved_at: pr.approved_at,
          selected_commitment_ids: pr.selected_commitment_ids,
          signing_link: pr.autentique_json?.signing_link ?? null,
          autentique_status: autentiqueStatus ?? pr.autentique_json?.status ?? null,
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

      const { error: uErr } = await supabase
        .from("party_proposals")
        .update({ status: "approved", approved_at: new Date().toISOString(), approval_json: nextApproval })
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .is("deleted_at", null);

      if (uErr) return err("approve_failed", 500, { message: uErr.message });

      return json({ ok: true });
    }

    if (action === "sign") {
      const apiToken2 = Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "";
      if (!apiToken2) return err("missing_AUTENTIQUE_API_TOKEN", 500);

      // Require approval before signing
      const fresh = await supabase
        .from("party_proposals")
        .select("approved_at,autentique_json,status")
        .eq("tenant_id", tenant.id)
        .eq("id", pr.id)
        .maybeSingle();

      const approvedAt = (fresh.data as any)?.approved_at ?? null;
      if (!approvedAt) return err("scope_not_approved", 403);

      const customer = getPartyCustomer((party as any).metadata ?? {});
      const signerName = String(customer?.legal_name ?? (party as any).display_name ?? "Cliente").trim();
      const signerEmail = String(customer?.email ?? "").trim();
      if (!signerEmail) return err("missing_customer_email", 400);

      // Scope lines
      const lines: string[] = [];
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
          lines.push(`${offName} — ${(t as any).name}`);
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

      const pdfBytes = await buildSimpleContractPdf({
        tenantName: String((tenant as any).name ?? tenantSlug),
        tenantCompany,
        partyName: String((party as any).display_name ?? "Cliente"),
        partyCustomer,
        scopeLines: lines,
      });

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

      const signerPublicId = String(created.signers?.[0]?.public_id ?? "");
      if (!signerPublicId) return err("autentique_signer_missing", 500);

      const signingLink = await autentiqueCreateSignatureLink({ apiToken: apiToken2, signerPublicId });

      const nextAut = {
        ...(pr.autentique_json ?? {}),
        document_id: created.id,
        document_public_id: created.public_id,
        signer_public_id: signerPublicId,
        signing_link: signingLink,
        status: created.status,
        created_at: new Date().toISOString(),
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

      return json({ ok: true, signing_link: signingLink, document_public_id: created.public_id });
    }

    return err("invalid_action", 400);
  } catch (e: any) {
    console.error(`[public-proposal] unhandled`, { fn, error: e?.message ?? String(e) });
    return err("internal_error", 500, { message: e?.message ?? String(e) });
  }
});