const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30Case.tsx', 'utf-8');

// Fix 1: Timeline Events
content = content.replace(/entity_id: caseData\.customer_entity_id \|\| null,\s*journey_id: caseData\.journey_id \|\| null,/g, '');

// Fix 2: Subtask handleSave Race Condition
const subtaskSaveOld = `            const { error: updateError } = await supabase.from("cases").update({
                meta_json: { ...caseMeta, pending_subtasks: currentSubtasks }
            }).eq("id", caseId);`;

const subtaskSaveNew = `            // Pega os dados mais recentes do banco pra evitar race condition
            const { data: latestCase } = await supabase.from("cases").select("meta_json").eq("id", caseId).single();
            const latestMeta = latestCase?.meta_json as any || caseMeta;
            
            const { error: updateError } = await supabase.from("cases").update({
                meta_json: { ...latestMeta, pending_subtasks: currentSubtasks }
            }).eq("id", caseId);`;
content = content.replace(subtaskSaveOld, subtaskSaveNew);

// Fix 3: handleSaveMainCard Race Condition
const mainSaveOld = `            const { error } = await supabase
                .from("cases")
                .update({ 
                    title: mainTitle, 
                    summary_text: mainSummary,
                    meta_json: {
                        ...(caseQ.data.meta_json as any),
                        video_url: videoUrl,
                        important_links: importantLinks,
                        script_raw: mainScript
                    },
                    updated_at: new Date().toISOString()
                })
                .eq("id", id);`;

const mainSaveNew = `            const { data: latestCase } = await supabase.from("cases").select("meta_json").eq("id", id).single();
            const latestMeta = latestCase?.meta_json as any || caseQ.data.meta_json;

            const { error } = await supabase
                .from("cases")
                .update({ 
                    title: mainTitle, 
                    summary_text: mainSummary,
                    meta_json: {
                        ...latestMeta,
                        video_url: videoUrl,
                        important_links: importantLinks,
                        script_raw: mainScript
                    },
                    updated_at: new Date().toISOString()
                })
                .eq("id", id);`;
content = content.replace(mainSaveOld, mainSaveNew);

fs.writeFileSync('src/pages/OperacaoM30Case.tsx', content);
