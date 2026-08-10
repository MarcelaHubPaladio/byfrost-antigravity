import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function err(msg: string, status = 400, details?: any) {
  return new Response(JSON.stringify({ error: msg, details }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAutentiqueGraphqlUrl() {
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
    const hint = res.status === 404 ? " (verifique AUTENTIQUE_GQL_URL)" : "";
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

  const query = `mutation CreateLink($publicId: UUID!) {
    createLinkToSignature(public_id: $publicId) { short_link }
  }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { publicId: params.signerPublicId },
    }),
  });

  const text = await res.text();
  let json2: any = null;
  try {
    json2 = JSON.parse(text);
  } catch {}

  if (!res.ok || !json2?.data?.createLinkToSignature?.short_link) {
    const gqlErr = String(json2?.errors?.[0]?.message ?? "").trim();
    const hint = res.status === 404 ? " (verifique AUTENTIQUE_GQL_URL)" : "";
    throw new Error(gqlErr ? `autentique_${gqlErr}` : `autentique_http_${res.status}${hint}`);
  }

  return json2.data.createLinkToSignature.short_link as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !supabaseKey) {
    return err("missing_supabase_env", 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { payslip_id } = await req.json();
    if (!payslip_id) return err("missing_payslip_id", 400);

    // 1. Get payslip data
    const { data: payslip, error: payslipErr } = await supabase
      .from("employee_payslips")
      .select("*")
      .eq("id", payslip_id)
      .single();

    if (payslipErr || !payslip) {
      return err("payslip_not_found", 404, payslipErr);
    }

    const { data: userProfile } = await supabase
      .from("users_profile")
      .select("display_name, email")
      .eq("tenant_id", payslip.tenant_id)
      .eq("user_id", payslip.user_id)
      .single();

    if (payslip.signing_link) {
      return json({ ok: true, message: "Already sent to Autentique", link: payslip.signing_link });
    }

    // 2. Download the file from storage
    // file_url might be a full URL or a storage path.
    // If it's a full URL, we might need to extract the path.
    // Assuming the file_url is the storage path like "tenant_id/user_id/filename.pdf"
    let storagePath = payslip.file_url;
    // If it's a public URL, extract the path part after the bucket name
    const bucketPrefix = "/storage/v1/object/public/employee_documents/";
    if (storagePath.includes(bucketPrefix)) {
        storagePath = storagePath.substring(storagePath.indexOf(bucketPrefix) + bucketPrefix.length);
    }

    const { data: fileData, error: downloadErr } = await supabase.storage
      .from("employee_documents")
      .download(storagePath);

    if (downloadErr || !fileData) {
      return err("failed_to_download_pdf", 500, downloadErr);
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    
    // 3. Prepare Autentique integration
    const apiToken = String(Deno.env.get("AUTENTIQUE_API_TOKEN") ?? "").trim();
    if (!apiToken) return err("missing_autentique_token", 500);

    const userName = userProfile?.display_name || "Colaborador";
    let userEmail = userProfile?.email;

    if (!userEmail) {
      // Fallback to auth.users if email is not in profile
      const { data: authUser } = await supabase.auth.admin.getUserById(payslip.user_id);
      userEmail = authUser?.user?.email;
    }

    if (!userEmail) {
      return err("user_has_no_email", 400);
    }

    const docTypeLabel = payslip.document_type === 'receipt' ? 'Recibo de Pagamento' : 'Holerite';
    const documentName = `${docTypeLabel} - ${String(payslip.reference_month).padStart(2, '0')}/${payslip.reference_year} - ${userName}`;

    // 4. Create document in Autentique
    const created = await autentiqueCreateDocument({
      apiToken,
      filename: storagePath.split("/").pop() || "holerite.pdf",
      fileBytes,
      documentName,
      signerName: userName,
      signerEmail: userEmail,
    });

    const signerPublicId = created.signatures?.[0]?.public_id;
    if (!signerPublicId) return err("autentique_signer_missing", 500);

    // 5. Create signing link
    const signingLink = await autentiqueCreateSignatureLink({
      apiToken,
      signerPublicId,
    });

    // 6. Update database
    const { error: updateErr } = await supabase
      .from("employee_payslips")
      .update({
        autentique_document_id: created.id,
        signing_link: signingLink,
        autentique_status: "pending"
      })
      .eq("id", payslip_id);

    if (updateErr) {
       console.error("Failed to update payslip with Autentique links", updateErr);
       return err("failed_to_update_payslip", 500, updateErr);
    }

    return json({ ok: true, signing_link: signingLink, autentique_document_id: created.id });

  } catch (e: any) {
    const msg = String(e?.message ?? String(e) ?? "internal_error").trim();
    console.error(`[autentique-payslips] unhandled`, { error: msg });
    return err(msg, 500, { message: msg });
  }
});
