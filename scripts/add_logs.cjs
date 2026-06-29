const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30Case.tsx', 'utf-8');

const helperLogFn = `
    const logEvent = async (message: string) => {
        if (!activeTenantId || !id) return;
        await supabase.from("timeline_events").insert({
            tenant_id: activeTenantId,
            case_id: id,
            event_type: "case_updated",
            actor_type: "admin",
            actor_id: (user as any)?.id ?? null,
            message,
            meta_json: {},
            occurred_at: new Date().toISOString(),
        });
    };
`;

// Insert the helper right after `const qc = useQueryClient();`
content = content.replace(
    '    const locks = useM30CasePresence(activeTenantId);',
    '    const locks = useM30CasePresence(activeTenantId);\n' + helperLogFn
);

// handleCreateProductionTasks
content = content.replace(
    '            showSuccess("Tarefas de produção criadas com sucesso!");',
    '            logEvent(`Foram geradas ${subtasks.length} tarefas de produção a partir do planejamento.`);\n            showSuccess("Tarefas de produção criadas com sucesso!");'
);

// handleUpdateCaseType
content = content.replace(
    '            showSuccess("Tipo de caso atualizado.");',
    '            logEvent(`O tipo do caso foi alterado para: ${newType}`);\n            showSuccess("Tipo de caso atualizado.");'
);

// handleSaveMainCard
content = content.replace(
    '            showSuccess("Card atualizado com sucesso.");',
    '            logEvent("Informações gerais do card foram atualizadas.");\n            showSuccess("Card atualizado com sucesso.");'
);

// handleAddSubtask
content = content.replace(
    '        setPendingSubtasks(next);',
    '        setPendingSubtasks(next);\n        logEvent("Nova subtarefa rascunho adicionada ao planejamento.");'
);

// handleDeleteSubtask
content = content.replace(
    '        const next = [...pendingSubtasks];\n        next.splice(idx, 1);\n        setPendingSubtasks(next);',
    '        const next = [...pendingSubtasks];\n        const deletedTitle = next[idx]?.title || "Sem título";\n        next.splice(idx, 1);\n        setPendingSubtasks(next);\n        logEvent(`Subtarefa rascunho removida: ${deletedTitle}`);'
);

fs.writeFileSync('src/pages/OperacaoM30Case.tsx', content);
