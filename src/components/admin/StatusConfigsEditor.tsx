import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { StatusConfig, TaskConfig } from "@/lib/journeys/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip } from "lucide-react";

interface Props {
    tenantId: string;
    states: string[];
    statusConfigsJson: string;
    onChange: (json: string) => void;
}

export function StatusConfigsEditor({ tenantId, states, statusConfigsJson, onChange }: Props) {
    const [selectedState, setSelectedState] = useState<string>(states[0] ?? "");

    // users are fetched from tenant_users view
    const usersQ = useQuery({
        queryKey: ["tenant_users", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenant_users")
                .select("user_id, email, display_name")
                .eq("tenant_id", tenantId)
                .order("email", { ascending: true });
            if (error) throw error;
            return data ?? [];
        },
    });

    // case fields autocomplete
    const caseFieldsQ = useQuery({
        queryKey: ["case_fields_suggestions", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            // Ideally an RPC to get distinct keys, but for now we fetch recent case_fields and distinct them
            const { data, error } = await supabase
                .from("case_fields")
                .select("key")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false })
                .limit(500);
            if (error) throw error;
            const unique = Array.from(new Set(data.map(d => d.key)));
            return unique.sort();
        },
    });

    const configs = useMemo(() => {
        try {
            return JSON.parse(statusConfigsJson) as Record<string, StatusConfig>;
        } catch {
            return {};
        }
    }, [statusConfigsJson]);

    const updateConfig = (stateKey: string, patch: Partial<StatusConfig>) => {
        const nextConfigs = { ...configs };
        const current = nextConfigs[stateKey] || {};
        nextConfigs[stateKey] = { ...current, ...patch };

        // clean empty configs
        if (Object.keys(nextConfigs[stateKey]).length === 0) {
            delete nextConfigs[stateKey];
        }

        onChange(JSON.stringify(nextConfigs, null, 2));
    };

    const currentStateConfig = configs[selectedState] || {};
    const currentTasks = currentStateConfig.mandatory_tasks || [];
    const currentFields = currentStateConfig.required_case_fields || [];

    const [newTaskDesc, setNewTaskDesc] = useState("");
    const [newTaskRequired, setNewTaskRequired] = useState(true);
    const [newTaskRequireAttachment, setNewTaskRequireAttachment] = useState(false);
    const [newFieldName, setNewFieldName] = useState("");

    const addTask = () => {
        if (!newTaskDesc.trim()) return;
        const newTask: TaskConfig = {
            id: "task_" + Math.random().toString(36).substr(2, 9),
            description: newTaskDesc.trim(),
            required: newTaskRequired,
            require_attachment: newTaskRequireAttachment,
        };
        updateConfig(selectedState, { mandatory_tasks: [...currentTasks, newTask] });
        setNewTaskDesc("");
        setNewTaskRequireAttachment(false);
    };

    const removeTask = (taskId: string) => {
        updateConfig(selectedState, { mandatory_tasks: currentTasks.filter(t => t.id !== taskId) });
    };

    const addField = () => {
        if (!newFieldName.trim()) return;
        const clean = newFieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
        if (currentFields.includes(clean)) return;
        updateConfig(selectedState, { required_case_fields: [...currentFields, clean] });
        setNewFieldName("");
    };

    const removeField = (fieldName: string) => {
        updateConfig(selectedState, { required_case_fields: currentFields.filter(f => f !== fieldName) });
    };

    return (
        <div className="grid gap-4">
            {states.length > 0 ? (
                <ToggleGroup
                    type="single"
                    value={selectedState}
                    onValueChange={(v) => { if (v) setSelectedState(v); }}
                    className="flex-wrap justify-start gap-2"
                >
                    {states.map(s => (
                        <ToggleGroupItem
                            key={s}
                            value={s}
                            className="rounded-full px-4 text-xs data-[state=on]:bg-indigo-100 data-[state=on]:text-indigo-900"
                        >
                            {s}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            ) : (
                <div className="text-xs text-slate-500">Nenhum estado configurado na jornada.</div>
            )}

            {selectedState && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-5">
                    <div>
                        <Label className="text-xs font-semibold text-slate-900">Responsável Padrão</Label>
                        <div className="mt-1 text-[11px] text-slate-500">Ao entrar neste status, atribua o caso automaticamente para:</div>

                        <Select
                            value={currentStateConfig.responsible_id || "none"}
                            onValueChange={(v) => updateConfig(selectedState, { responsible_id: v === "none" ? undefined : v })}
                        >
                            <SelectTrigger className="mt-2 h-9 w-full sm:w-[300px] rounded-xl bg-white text-xs">
                                <SelectValue placeholder="Nenhum" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                                <SelectItem value="none">Nenhum</SelectItem>
                                {(usersQ.data ?? []).map((u) => (
                                    <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.email}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div>
                        <Label className="text-xs font-semibold text-slate-900">Campos Obrigatórios (Case/Fields)</Label>
                        <div className="mt-1 text-[11px] text-slate-500">
                            Impeça transições se os campos extraídos abaixo não estiverem preenchidos (ex: telefone, cep).
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {currentFields.map(f => (
                                <div key={f} className="flex flex-row items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 shadow-sm">
                                    <span className="text-xs font-medium text-orange-900">{f}</span>
                                    <button onClick={() => removeField(f)} className="text-orange-500 hover:text-orange-700">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            <div className="relative">
                                <Input
                                    value={newFieldName}
                                    onChange={e => setNewFieldName(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addField()}
                                    placeholder="Ex: telefone"
                                    className="h-9 w-[200px] rounded-xl bg-white text-xs"
                                    list="case-fields-suggestions"
                                />
                                <datalist id="case-fields-suggestions">
                                    {(caseFieldsQ.data ?? []).filter(f => !currentFields.includes(f)).map(f => (
                                        <option key={f} value={f} />
                                    ))}
                                </datalist>
                            </div>
                            <Button onClick={addField} variant="secondary" className="h-9 rounded-xl text-xs"><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar campo</Button>
                        </div>
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div>
                        <Label className="text-xs font-semibold text-slate-900">Tarefas & Pendências</Label>
                        <div className="mt-1 text-[11px] text-slate-500">
                            Crie pendências automaticamente que exigem resposta humana antes de avançar para o próximo status. As tarefas obrigatórias trancam a jornada neste status.
                        </div>

                        <div className="mt-3 space-y-2">
                            {currentTasks.map(t => (
                                <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                    <div>
                                        <div className="text-xs font-medium text-slate-900">{t.description}</div>
                                        <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase text-slate-500">
                                            {t.required ? "Pendente Obrigatória" : "Opcional"}
                                            {t.require_attachment && (
                                                <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                                                    <Paperclip className="h-3 w-3" /> Anexo exigido
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => removeTask(t.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            ))}
                            {currentTasks.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 p-3 text-xs text-slate-500">Nenhuma tarefa.</div>
                            )}
                        </div>

                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                            <Input
                                value={newTaskDesc}
                                onChange={e => setNewTaskDesc(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && addTask()}
                                placeholder="Ex: Conferir documento da empresa"
                                className="h-9 flex-1 rounded-xl bg-white text-xs"
                            />
                            <div className="flex items-center gap-4 border-l border-indigo-200 pl-4">
                                <div className="flex items-center gap-2">
                                    <Switch checked={newTaskRequired} onCheckedChange={setNewTaskRequired} />
                                    <span className="text-[11px] text-indigo-900 font-medium">Obrigatória</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch checked={newTaskRequireAttachment} onCheckedChange={setNewTaskRequireAttachment} />
                                    <span className="text-[11px] text-indigo-900 font-medium flex items-center gap-1">
                                        <Paperclip className="h-3 w-3" /> Exigir Anexo
                                    </span>
                                </div>
                            </div>
                            <Button onClick={addTask} className="h-9 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs">
                                <Plus className="mr-1 h-4 w-4" /> Adicionar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
