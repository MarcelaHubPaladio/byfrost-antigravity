import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function createSupabaseAuth(req: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function getAutentiqueGraphqlUrl() {
  return (
    (Deno.env.get("AUTENTIQUE_GQL_URL") ?? "").trim() ||
    "https://api.autentique.com.br/v2/graphql"
  );
}

// Strip HTML tags roughly for PDF printing.
function stripHtml(html: string) {
  return html
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "\n• ")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

async function buildTextContractPdf(params: { bodyText: string; title: string }) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const maxWidth = 595.28 - margin * 2;
  const lineHeight = 16;
  let y = 841.89 - margin;

  const wrapLine = (line: string, size: number, activeFont: any) => {
    const words = String(line ?? "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const out: string[] = [];
    let current = "";
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      const width = activeFont.widthOfTextAtSize(next, size);
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

  const drawLine = (line: string, size: number, isBold: boolean = false) => {
    const activeFont = isBold ? fontBold : font;
    const lines = wrapLine(line, size, activeFont);
    for (const l of lines) {
      if (y < margin + lineHeight) {
        page = pdf.addPage([595.28, 841.89]);
        y = 841.89 - margin;
      }
      page.drawText(l, {
        x: margin,
        y,
        size,
        font: activeFont,
        color: rgb(0.12, 0.12, 0.14),
      });
      y -= lineHeight;
    }
  };

  // Draw Title
  drawLine(params.title, 16, true);
  y -= 16;

  const body = String(params.bodyText ?? "").replace(/\r\n/g, "\n");
  const rawLines = body.split("\n");

  for (const ln of rawLines) {
    const trimmed = ln.trimEnd();
    if (!trimmed.trim()) {
      y -= 10;
      continue;
    }
    drawLine(trimmed, 11, false);
  }

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
  const url = getAutentiqueGraphqlUrl();

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
  } catch { }

  if (!res.ok || !json2?.data?.createDocument) {
    const gqlErr = String(json2?.errors?.[0]?.message ?? "").trim();
    throw new Error(gqlErr ? `autentique_${gqlErr}` : `autentique_http_${res.status}`);
  }

  return json2.data.createDocument;
}

async function autentiqueCreateSignatureLink(params: { apiToken: string; signerPublicId: string }) {
  const url = getAutentiqueGraphqlUrl();
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
  } catch { }

  const link = json2?.data?.createLinkToSignature?.short_link ?? null;
  if (!res.ok || !link) {
    const gqlErr = String(json2?.errors?.[0]?.message ?? "").trim();
    throw new Error(gqlErr ? `autentique_${gqlErr}` : `autentique_http_${res.status}`);
  }

  return String(link);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const fn = "autentique-goal-rules";

  try {
    const supabaseClient = createSupabaseAuth(req);
    const { data: { user }, error: uErr } = await supabaseClient.auth.getUser();
    if (uErr || !user) return err("unauthorized", 401);

    const { activeTenantId, roleKey } = await req.json();
    if (!activeTenantId || !roleKey) return err("missing_params", 400);

    const supabaseAdmin = createSupabaseAdmin();

    // 1. Encontrar a Regra Ativa
    const { data: rule, error: rErr } = await supabaseAdmin
      .from("goal_role_rules")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .eq("role_key", roleKey)
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rErr || !rule) return err("no_active_rule_found", 404);

    // 2. Verificar se o user já não assinou ELA especificamente
    const { data: existingSig } = await supabaseAdmin
      .from("user_goal_signatures")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .eq("user_id", user.id)
      .eq("goal_role_rule_id", rule.id)
      .maybeSingle();

    if (existingSig?.signing_link) {
      // Já gerou, basta devolver o link se nao tiver assinado
      return json({ ok: true, signing_link: existingSig.signing_link, status: existingSig.autentique_status });
    }

    // 3. Obter infos da conta do Autentique e do Cliente
    const apiToken = String(Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "").trim();
    if (!apiToken) return err("missing_autentique_token", 500);

    // Vamos pegar o e-mail e nome do usuário logado
    const { data: profile } = await supabaseAdmin
      .from("users_profile")
      .select("display_name, email")
      .eq("user_id", user.id)
      .eq("tenant_id", activeTenantId)
      .maybeSingle();

    const signerName = profile?.display_name || user.email || "Usuário";
    const signerEmail = profile?.email || user.email;

    if (!signerEmail) return err("missing_user_email", 400);

    // 4. Gerar corpo do PDF
    const textBody = stripHtml(rule.content_html);
    const pdfBytes = await buildTextContractPdf({
      title: `Regras de Metas - Cargo: ${roleKey} (v${rule.version})`,
      bodyText: `Termo gerado em: ${new Date().toLocaleString("pt-BR")}\n\n` + textBody
    });

    const docName = `Diretrizes de Metas - ${roleKey} - v${rule.version}`;
    const filename = `metas-${roleKey}-v${rule.version}.pdf`;

    // 5. Enviar ao Autentique
    const created = await autentiqueCreateDocument({
      apiToken,
      filename,
      fileBytes: pdfBytes,
      documentName: docName,
      signerName,
      signerEmail,
    });

    const docId = created?.id;
    const signerObj = (created?.signatures ?? []).find((s: any) => String(s?.email ?? "").toLowerCase() === signerEmail.toLowerCase());
    const signerPublicId = signerObj?.public_id;

    if (!docId || !signerPublicId) return err("autentique_creation_failed", 500);

    const signingLink = await autentiqueCreateSignatureLink({ apiToken, signerPublicId });

    // 6. Persistir novo doc no banco
    const sigPayload = {
      tenant_id: activeTenantId,
      user_id: user.id,
      goal_role_rule_id: rule.id,
      autentique_document_id: docId,
      autentique_status: "created",
      autentique_json: { document_id: docId, signer_public_id: signerPublicId },
      signing_link: signingLink
    };

    let responseId = existingSig?.id;

    if (existingSig) {
      await supabaseAdmin.from("user_goal_signatures").update(sigPayload).eq("id", existingSig.id);
    } else {
      const { data: insData, error: insErr } = await supabaseAdmin.from("user_goal_signatures").insert(sigPayload).select("id").single();
      if (insErr) throw insErr;
      responseId = insData.id;
    }

    return json({ ok: true, signing_link: signingLink, status: "created" });
  } catch (e: any) {
    console.error(`[${fn}] error:`, e);
    return err("internal_error", 500, { message: e.message ?? String(e) });
  }
});
