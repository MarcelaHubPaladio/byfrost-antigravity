import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

serve(async (req: Request) => {
  const fn = "crm-generate-sales-order";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ ok: false, error: "Missing auth" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createSupabaseAdmin();
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) return new Response(JSON.stringify({ ok: false, error: `Unauthorized: ${userErr?.message || "User not found"}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { tenantId, caseId, linked_goal_metric, attachments, generationMode = "crm" } = body;
    if (!tenantId || !caseId) return new Response(JSON.stringify({ ok: false, error: "Missing tenantId or caseId in body" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 1. Get the CRM Case
    console.log(`[${fn}] Fetching case ${caseId} for tenant ${tenantId}`);
    const { data: crmCase, error: caseErr } = await supabase
      .from("cases")
      .select("*, customer_accounts(*), customer_id")
      .eq("tenant_id", tenantId)
      .eq("id", caseId)
      .maybeSingle();

    if (caseErr || !crmCase) {
      return new Response(JSON.stringify({ ok: false, error: "Case not found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Get the sales_order Journey
    console.log(`[${fn}] Fetching sales_order journey`);
    const { data: salesOrderJourney, error: jrnErr } = await supabase
      .from("journeys")
      .select("id")
      .eq("key", "sales_order")
      .maybeSingle();

    if (jrnErr || !salesOrderJourney) {
      return new Response(JSON.stringify({ ok: false, error: "Sales Order journey not found in database" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Customer info transfer
    const customerName = crmCase.customer_accounts?.name || crmCase.meta_json?.name || crmCase.title || "Novo Lead";
    const customerPhone = crmCase.customer_accounts?.phone_e164 || crmCase.meta_json?.phone || "";
    const customerEmail = crmCase.customer_accounts?.email || crmCase.meta_json?.email || "";

    // 3. Create the Sales Order Case
    console.log(`[${fn}] Creating sales order case`);
    const { data: orderCase, error: insertErr } = await supabase
      .from("cases")
      .insert({
        tenant_id: tenantId,
        journey_id: salesOrderJourney.id,
        customer_id: crmCase.customer_id,
        status: "open",
        state: "new",
        case_type: "order",
        title: `Pedido: ${customerName}`,
        created_by_channel: "panel",
        meta_json: {
          parent_case_id: caseId,
          source: "crm_generation",
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          linked_goal_metric: linked_goal_metric || null
        }
      })
      .select("id")
      .single();

    if (insertErr || !orderCase) {
      throw insertErr || new Error("Failed to create order case");
    }

    // 4. Duplicate Items
    if (generationMode === "crm") {
      console.log(`[${fn}] Duplicating items from CRM case`);
      // Get existing CRM items
      const { data: existingItems } = await supabase
        .from("case_items")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId)
        .order("line_no", { ascending: true });

    if (existingItems && existingItems.length > 0) {
      const itemsToInsert = existingItems.map((item: any) => ({
        tenant_id: tenantId,
        case_id: orderCase.id,
        line_no: item.line_no,
        code: item.code,
        description: item.description,
        qty: item.qty,
        price: item.price,
        total: item.total,
        confidence_json: item.confidence_json || {},
        offering_entity_id: item.offering_entity_id
      }));

      const { error: itemsErr } = await supabase.from("case_items").insert(itemsToInsert);
      if (itemsErr) console.error(`[${fn}] Failed to copy case items:`, itemsErr);

      // 4.1. Clean CRM Items (Reset the bucket)
      const idsToDelete = existingItems.map((item: any) => item.id);
      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("case_items")
          .delete()
          .in("id", idsToDelete);
        if (delErr) console.error(`[${fn}] Failed to delete original CRM items:`, delErr);
      }
    }
  }

    // 4.2 Duplicate Fields & Inject Customer Data
    console.log(`[${fn}] Duplicating fields from CRM case`);
    const { data: existingFields } = await supabase
      .from("case_fields")
      .select("*")
      .eq("case_id", caseId);

    const fieldsToInsert = (existingFields || []).map((f: any) => ({
      tenant_id: tenantId,
      case_id: orderCase.id,
      key: f.key,
      value_text: f.value_text,
      value_number: f.value_number,
      value_date: f.value_date,
      confidence: f.confidence || 1,
      source: f.source || "crm_generation",
      last_updated_by: f.last_updated_by || "system"
    }));

    const hasField = (k: string) => fieldsToInsert.some((f: any) => f.key === k);

    if (fieldsToInsert.length > 0) {
      const { error: fieldsErr } = await supabase.from("case_fields").insert(fieldsToInsert);
      if (fieldsErr) console.error(`[${fn}] Failed to copy case fields:`, fieldsErr);
    }

    // 4.2.5 Duplicate existing attachments from CRM Case
    console.log(`[${fn}] Duplicating existing attachments from CRM case`);
    const { data: existingAtts } = await supabase
      .from("case_attachments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("case_id", caseId);

    if (existingAtts && existingAtts.length > 0) {
      const attsToInsert = existingAtts.map((att: any) => ({
        tenant_id: tenantId,
        case_id: orderCase.id,
        kind: att.kind,
        storage_path: att.storage_path,
        original_filename: att.original_filename,
        content_type: att.content_type,
        meta_json: { ...att.meta_json, source: "crm_copied" }
      }));
      console.log(`[${fn}] Atts to insert: ${JSON.stringify(attsToInsert)}`);
      const { error: attsErr } = await supabase.from("case_attachments").insert(attsToInsert);
      if (attsErr) throw new Error("Falha ao copiar anexos existentes: " + JSON.stringify(attsErr));
    } else {
      console.log(`[${fn}] No existing attachments found for case ${caseId}`);
    }

    // 4.3 Link Modal Attachments
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      console.log(`[${fn}] Linking ${attachments.length} attachments`);
      const attachmentsToInsert = attachments.map((att: any) => ({
        tenant_id: tenantId,
        case_id: orderCase.id,
        kind: att.content_type?.startsWith("image/") ? "image" : (att.content_type?.startsWith("audio/") ? "audio" : "doc"),
        storage_path: att.storage_path,
        original_filename: att.original_filename,
        content_type: att.content_type,
        meta_json: { source: "crm_generation", original_case_id: caseId }
      }));

      console.log(`[${fn}] Modal Atts to insert: ${JSON.stringify(attachmentsToInsert)}`);
      const { error: attErr } = await supabase.from("case_attachments").insert(attachmentsToInsert);
      if (attErr) throw new Error("Falha ao salvar novos anexos: " + JSON.stringify(attErr));
      else console.log(`[${fn}] Successfully inserted modal attachments`);

      // 4.4 Enqueue OCR job if there's an image
      const hasImage = attachmentsToInsert.some(att => att.kind === "image");
      if (hasImage) {
        console.log(`[${fn}] Enqueuing OCR job for order case ${orderCase.id}`);
        const { error: jobErr } = await supabase.from("job_queue").insert({
          tenant_id: tenantId,
          type: "OCR_IMAGE",
          payload_json: { case_id: orderCase.id },
          status: "pending",
          run_after: new Date().toISOString(),
          idempotency_key: `OCR_IMAGE:${orderCase.id}`
        });
        if (jobErr) console.error(`[${fn}] Failed to enqueue OCR job:`, jobErr);
      }
    }

    // 5. Audit & Timeline
    console.log(`[${fn}] Finalizing audit and timeline`);
    await Promise.all([
      supabase.rpc("append_audit_ledger", {
        p_tenant_id: tenantId,
        p_payload: { kind: "sales_order_generated", source_case_id: caseId, order_case_id: orderCase.id }
      }),
      supabase.from("timeline_events").insert([
        {
          tenant_id: tenantId,
          case_id: caseId,
          event_type: "order_generated",
          actor_type: "admin",
          actor_id: user.id,
          message: "Gerou um novo pedido de venda a partir deste case.",
          meta_json: { order_case_id: orderCase.id }
        },
        {
          tenant_id: tenantId,
          case_id: orderCase.id,
          event_type: "order_created",
          actor_type: "admin",
          actor_id: user.id,
          message: "Pedido criado automaticamente a partir do CRM.",
          meta_json: { source_case_id: caseId }
        }
      ])
    ]);

    return new Response(JSON.stringify({ ok: true, orderCaseId: orderCase.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(`[${fn}] Critical:`, err);
    return new Response(JSON.stringify({ ok: false, error: `Runtime Exception: ${err?.message || String(err)}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
