/**
 * Backfill: Timeline events para atividades master concluídas
 *
 * Executa: node scripts/backfill-task-timeline.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pryoirzeghatrgecwrci.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log("🔍 Buscando tarefas concluídas vinculadas a cases...");

  // 1. Busca todas as tarefas concluídas que têm entity_id (case)
  const { data: tasks, error: tasksErr } = await supabase
    .from("super_tasks")
    .select("id, tenant_id, entity_id, title, completed_at, created_by, assigned_to")
    .eq("is_completed", true)
    .not("entity_id", "is", null)
    .order("completed_at", { ascending: true });

  if (tasksErr) {
    console.error("❌ Erro ao buscar tarefas:", tasksErr.message);
    process.exit(1);
  }

  console.log(`📋 ${tasks.length} tarefas concluídas encontradas.`);

  if (tasks.length === 0) {
    console.log("✅ Nada a fazer.");
    return;
  }

  // 2. Busca todos os task_ids que já têm evento na timeline para evitar duplicatas
  const taskIds = tasks.map((t) => t.id);

  // Supabase não suporta @> em anon key facilmente, então filtramos em JS
  const { data: existingEvents, error: eventsErr } = await supabase
    .from("timeline_events")
    .select("meta_json")
    .eq("event_type", "task_completed");

  if (eventsErr) {
    console.error("❌ Erro ao buscar eventos existentes:", eventsErr.message);
    process.exit(1);
  }

  const alreadyRegisteredTaskIds = new Set(
    (existingEvents ?? [])
      .map((e) => e.meta_json?.task_id)
      .filter(Boolean)
  );

  console.log(`⏭️  ${alreadyRegisteredTaskIds.size} tarefas já têm evento na timeline.`);

  // 3. Filtra apenas as que precisam de backfill
  const toInsert = tasks.filter((t) => !alreadyRegisteredTaskIds.has(t.id));

  console.log(`📝 ${toInsert.length} tarefas precisam de backfill.`);

  if (toInsert.length === 0) {
    console.log("✅ Todos os eventos já existem. Nada a fazer.");
    return;
  }

  // 4. Insere os eventos em lotes de 50
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);

    const payload = batch.map((t) => ({
      tenant_id: t.tenant_id,
      case_id: t.entity_id,
      event_type: "task_completed",
      actor_type: "admin",
      actor_id: t.assigned_to ?? t.created_by ?? null,
      message: `Atividade concluída: "${t.title}".`,
      meta_json: {
        task_id: t.id,
        task_title: t.title,
        assigned_to: t.assigned_to,
        backfill: true,
      },
      occurred_at: t.completed_at ?? new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
      .from("timeline_events")
      .insert(payload);

    if (insertErr) {
      console.error(`❌ Erro no lote ${i / BATCH_SIZE + 1}:`, insertErr.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  ✅ Lote ${i / BATCH_SIZE + 1}: ${batch.length} eventos inseridos.`);
    }
  }

  console.log("\n=== RESUMO ===");
  console.log(`✅ Inseridos com sucesso: ${inserted}`);
  if (errors > 0) console.log(`❌ Erros: ${errors}`);
  console.log("🎉 Backfill concluído!");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
