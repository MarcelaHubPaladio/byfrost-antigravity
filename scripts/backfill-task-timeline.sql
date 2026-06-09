-- ============================================================
-- BACKFILL: Timeline events para atividades master concluídas
-- Inclui tarefas SEM case vinculado (entity_id IS NULL)
-- Execute este SQL no Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/pryoirzeghatrgecwrci/editor
-- ============================================================

INSERT INTO timeline_events (
  tenant_id,
  case_id,
  event_type,
  actor_type,
  actor_id,
  message,
  meta_json,
  occurred_at
)
SELECT
  t.tenant_id,
  t.entity_id                                          AS case_id,   -- pode ser NULL (global)
  'task_completed'                                     AS event_type,
  'admin'                                              AS actor_type,
  COALESCE(t.assigned_to, t.created_by)               AS actor_id,
  CONCAT('Atividade concluída: "', t.title, '".')     AS message,
  jsonb_build_object(
    'task_id',     t.id,
    'task_title',  t.title,
    'assigned_to', t.assigned_to,
    'backfill',    true
  )                                                    AS meta_json,
  COALESCE(t.completed_at, t.updated_at, NOW())        AS occurred_at
FROM super_tasks t
WHERE
  t.is_completed = true
  -- Evita duplicatas: só insere se ainda não existe evento para esta tarefa
  AND NOT EXISTS (
    SELECT 1
    FROM timeline_events te
    WHERE te.event_type = 'task_completed'
      AND (te.meta_json->>'task_id') = t.id::text
  );

-- Confirma resultado
SELECT COUNT(*) AS eventos_de_tarefa
FROM timeline_events
WHERE event_type = 'task_completed';
