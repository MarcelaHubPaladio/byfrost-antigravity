import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, detail?: any) {
  return json({ ok: false, error: message, detail }, status);
}

type OrchestrateInput = {
  commitment_id?: string;
};

serve(async (req) => {
  const fn = "commitment-orchestrator";

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return err("method_not_allowed", 405);

  try {
    const input = (await req.json().catch(() => ({}))) as OrchestrateInput;
    const commitmentId = String(input?.commitment_id ?? "").trim();
    if (!commitmentId) return err("missing_commitment_id", 400);

    const supabase = createSupabaseAdmin();

    // 1) Load commitment
    const { data: commitment, error: cErr } = await supabase
      .from("commercial_commitments")
      .select("id, tenant_id, status, commitment_type, customer_entity_id, total_value, deleted_at")
      .eq("id", commitmentId)
      .maybeSingle();

    if (cErr) {
      console.error(`[${fn}] commitment query failed`, { cErr, commitmentId });
      return err("commitment_query_failed", 500, { message: cErr.message });
    }

    if (!commitment || (commitment as any).deleted_at) return err("commitment_not_found", 404);

    const tenantId = String((commitment as any).tenant_id);
    const status = String((commitment as any).status ?? "");

    if (status !== "active") {
      return json({ ok: true, skipped: true, reason: "commitment_not_active", tenant_id: tenantId, commitment_id: commitmentId });
    }

    // 2) Idempotency guard: if deliverables already exist for this commitment, do nothing.
    const { data: existingAny, error: eErr } = await supabase
      .from("deliverables")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("commitment_id", commitmentId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (eErr) {
      console.error(`[${fn}] deliverables existence check failed`, { eErr, tenantId, commitmentId });
      return err("deliverables_check_failed", 500, { message: eErr.message });
    }

    if ((existingAny as any)?.id) {
      return json({ ok: true, skipped: true, reason: "deliverables_already_generated", tenant_id: tenantId, commitment_id: commitmentId });
    }

    // 3) Read commitment_items
    const { data: items, error: iErr } = await supabase
      .from("commitment_items")
      .select("id, offering_entity_id, quantity, price, requires_fulfillment, metadata, deleted_at")
      .eq("tenant_id", tenantId)
      .eq("commitment_id", commitmentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (iErr) {
      console.error(`[${fn}] commitment_items query failed`, { iErr, tenantId, commitmentId });
      return err("commitment_items_query_failed", 500, { message: iErr.message });
    }

    const commitmentItems = (items ?? []) as any[];
    if (!commitmentItems.length) {
      // Still record that orchestration ran.
      await supabase.rpc("log_commercial_commitment_event", {
        p_tenant_id: tenantId,
        p_commitment_id: commitmentId,
        p_event_type: "deliverables_generated",
        p_payload: { deliverables: 0, dependencies: 0, note: "no_commitment_items" },
      });

      return json({ ok: true, tenant_id: tenantId, commitment_id: commitmentId, deliverables_created: 0, dependencies_created: 0 });
    }

    // 4) For each item: locate templates + create deliverables
    const createdDeliverables: Array<{ id: string; entity_id: string; template_id: string; template_name: string; item_id: string }> = [];

    for (const it of commitmentItems) {
      const offeringEntityId = String(it.offering_entity_id);
      const itemId = String(it.id);

      const { data: templates, error: tErr } = await supabase
        .from("deliverable_templates")
        .select("id, name, estimated_minutes, required_resource_type")
        .eq("tenant_id", tenantId)
        .eq("offering_entity_id", offeringEntityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (tErr) {
        console.error(`[${fn}] deliverable_templates query failed`, { tErr, tenantId, offeringEntityId, commitmentId });
        return err("deliverable_templates_query_failed", 500, { message: tErr.message, offering_entity_id: offeringEntityId });
      }

      for (const tpl of (templates ?? []) as any[]) {
        const templateId = String(tpl.id);
        const overrides = it.metadata?.deliverable_overrides ?? {};
        const overrideQty = overrides[templateId]?.quantity;

        // Final quantity: override if present, else use item quantity (multiplier)
        const finalQty = typeof overrideQty === "number" ? overrideQty : Number(it.quantity ?? 1);

        for (let q = 0; q < Math.max(0, finalQty); q++) {
          const { data: inserted, error: dErr } = await supabase
            .from("deliverables")
            .insert({
              tenant_id: tenantId,
              commitment_id: commitmentId,
              entity_id: offeringEntityId,
              status: "planned",
              owner_user_id: null,
              due_date: null,
              // Keep track of index/template for debugging and dependencies
              metadata: {
                template_id: templateId,
                commitment_item_id: itemId,
                seq: q + 1,
                total: finalQty
              }
            })
            .select("id")
            .maybeSingle();

          if (dErr || !inserted) {
            console.error(`[${fn}] deliverable insert failed`, { dErr, tenantId, commitmentId, offeringEntityId, templateId });
            return err("deliverable_insert_failed", 500, { message: dErr?.message ?? "insert_failed" });
          }

          const deliverableId = String((inserted as any).id);
          createdDeliverables.push({
            id: deliverableId,
            entity_id: offeringEntityId,
            template_id: templateId,
            template_name: String(tpl.name ?? ""),
            item_id: itemId,
          });

          // Extra explicit event (strong audit trail of generation intent)
          await supabase.rpc("log_deliverable_event", {
            p_tenant_id: tenantId,
            p_deliverable_id: deliverableId,
            p_event_type: "deliverable_generated_from_template",
            p_before: null,
            p_after: {
              template_id: tpl.id,
              template_name: tpl.name,
              estimated_minutes: tpl.estimated_minutes ?? null,
              required_resource_type: tpl.required_resource_type ?? null,
              commitment_item_id: itemId,
              offering_entity_id: offeringEntityId,
              seq: q + 1,
              total: finalQty
            },
          });
        }
      }
    }

    // 5) Create dependencies automatically (single model: Finish -> Start)
    // Strategy (simple + deterministic): chain all generated deliverables in creation order.
    let dependenciesCreated = 0;

    for (let i = 1; i < createdDeliverables.length; i++) {
      const cur = createdDeliverables[i];
      const prev = createdDeliverables[i - 1];

      const { error: depErr } = await supabase.from("deliverable_dependencies").insert({
        tenant_id: tenantId,
        deliverable_id: cur.id,
        depends_on_deliverable_id: prev.id,
      });

      if (depErr) {
        const msg = String((depErr as any)?.message ?? "").toLowerCase();
        // Unique constraint may fire if rerun; ignore.
        if (!msg.includes("duplicate") && !msg.includes("unique")) {
          console.error(`[${fn}] dependency insert failed`, { depErr, tenantId, deliverable_id: cur.id, depends_on: prev.id });
          return err("dependency_insert_failed", 500, { message: depErr.message });
        }
      } else {
        dependenciesCreated += 1;
      }
    }

    // 6) Register commitment-level event
    await supabase.rpc("log_commercial_commitment_event", {
      p_tenant_id: tenantId,
      p_commitment_id: commitmentId,
      p_event_type: "deliverables_generated",
      p_payload: {
        deliverables: createdDeliverables.length,
        dependencies: dependenciesCreated,
      },
    });

    return json({
      ok: true,
      tenant_id: tenantId,
      commitment_id: commitmentId,
      deliverables_created: createdDeliverables.length,
      dependencies_created: dependenciesCreated,
    });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500, { message: e?.message ?? String(e) });
  }
});
