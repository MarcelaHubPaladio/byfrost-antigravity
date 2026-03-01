import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Target } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function GoalsCenter() {
    const { activeTenantId } = useTenant();
    const queryClient = useQueryClient();
    const [isJobModalOpen, setIsJobModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState<any>(null);
    const [jobName, setJobName] = useState("");
    const [jobDesc, setJobDesc] = useState("");

    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

    const jobsQuery = useQuery({
        queryKey: ["tenant_job_titles", activeTenantId],
        queryFn: async () => {
            if (!activeTenantId) return [];
            const { data, error } = await supabase
                .from("tenant_job_titles")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId,
    });

    const saveJob = async () => {
        if (!jobName.trim()) return;
        try {
            if (editingJob) {
                const { error } = await supabase
                    .from("tenant_job_titles")
                    .update({ name: jobName, description: jobDesc })
                    .eq("id", editingJob.id);
                if (error) throw error;
                showSuccess("Cargo atualizado!");
            } else {
                const { error } = await supabase
                    .from("tenant_job_titles")
                    .insert({ tenant_id: activeTenantId, name: jobName, description: jobDesc });
                if (error) throw error;
                showSuccess("Cargo criado!");
            }
            setIsJobModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["tenant_job_titles"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const deleteJob = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este cargo?")) return;
        try {
            const { error } = await supabase.from("tenant_job_titles").delete().eq("id", id);
            if (error) throw error;
            showSuccess("Cargo excluído!");
            queryClient.invalidateQueries({ queryKey: ["tenant_job_titles"] });
            if (selectedJobId === id) setSelectedJobId(null);
        } catch (e: any) {
            showError(e.message);
        }
    };

    return (
        <RequireAuth>
            <AppShell>
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Target className="w-6 h-6 text-indigo-600" />
                            Central de Metas
                        </h1>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="border bg-white rounded-lg p-4 shadow-sm h-full max-h-[70vh] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="font-semibold text-lg">Cargos</h2>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setEditingJob(null);
                                        setJobName("");
                                        setJobDesc("");
                                        setIsJobModalOpen(true);
                                    }}
                                >
                                    <Plus className="w-4 h-4 mr-1" /> Novo
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2">
                                {jobsQuery.data?.map((job) => (
                                    <div
                                        key={job.id}
                                        onClick={() => setSelectedJobId(job.id)}
                                        className={`p-3 rounded-md cursor-pointer border flex justify-between items-center transition-colors ${selectedJobId === job.id
                                                ? "border-indigo-600 bg-indigo-50"
                                                : "hover:bg-slate-50 border-slate-200"
                                            }`}
                                    >
                                        <div>
                                            <div className="font-medium text-sm text-slate-800">{job.name}</div>
                                            <div className="text-xs text-slate-500 truncate mt-0.5">{job.description}</div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingJob(job);
                                                    setJobName(job.name);
                                                    setJobDesc(job.description || "");
                                                    setIsJobModalOpen(true);
                                                }}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-red-600"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteJob(job.id);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {jobsQuery.data?.length === 0 && (
                                    <div className="text-sm text-center text-slate-500 py-4">
                                        Nenhum cargo cadastrado.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-2 border bg-white rounded-lg p-4 shadow-sm max-h-[70vh] flex flex-col">
                            {selectedJobId ? (
                                <TemplatesEditor jobId={selectedJobId} />
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                    <Target className="w-12 h-12 mb-2 opacity-50" />
                                    <p>Selecione um cargo para configurar os templates de metas.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <Dialog open={isJobModalOpen} onOpenChange={setIsJobModalOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingJob ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Nome</label>
                                    <Input value={jobName} onChange={(e) => setJobName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Descrição</label>
                                    <Input value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsJobModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button onClick={saveJob}>Salvar</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </AppShell>
        </RequireAuth>
    );
}

function TemplatesEditor({ jobId }: { jobId: string }) {
    const { activeTenantId } = useTenant();
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTpl, setEditingTpl] = useState<any>(null);

    const [name, setName] = useState("");
    const [metricKey, setMetricKey] = useState("");
    const [targetValue, setTargetValue] = useState("");
    const [frequency, setFrequency] = useState("monthly");

    const tplQuery = useQuery({
        queryKey: ["goal_templates", activeTenantId, jobId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("job_title_id", jobId)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: !!jobId,
    });

    const saveTpl = async () => {
        if (!name.trim() || !metricKey.trim() || !targetValue) return;
        try {
            if (editingTpl) {
                const { error } = await supabase
                    .from("goal_templates")
                    .update({
                        name,
                        metric_key: metricKey,
                        target_value: Number(targetValue),
                        frequency,
                    })
                    .eq("id", editingTpl.id);
                if (error) throw error;
                showSuccess("Template atualizado!");
            } else {
                const { error } = await supabase.from("goal_templates").insert({
                    tenant_id: activeTenantId,
                    job_title_id: jobId,
                    name,
                    metric_key: metricKey,
                    target_value: Number(targetValue),
                    frequency,
                });
                if (error) throw error;
                showSuccess("Template criado!");
            }
            setIsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["goal_templates"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const deleteTpl = async (id: string) => {
        if (!confirm("Excluir este template? Isso não afetará metas de usuários já criadas baseado nele.")) return;
        try {
            const { error } = await supabase.from("goal_templates").delete().eq("id", id);
            if (error) throw error;
            showSuccess("Template excluído!");
            queryClient.invalidateQueries({ queryKey: ["goal_templates"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                    <h2 className="font-semibold text-lg">Templates de Metas</h2>
                    <p className="text-sm text-slate-500">Defina o que é esperado padrão para este cargo.</p>
                </div>
                <Button
                    onClick={() => {
                        setEditingTpl(null);
                        setName("");
                        setMetricKey("");
                        setTargetValue("");
                        setFrequency("monthly");
                        setIsModalOpen(true);
                    }}
                >
                    <Plus className="w-4 h-4 mr-1" /> Adicionar Meta
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
                {tplQuery.data?.map((tpl) => (
                    <div key={tpl.id} className="p-4 rounded-lg border flex justify-between items-center">
                        <div>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="text-sm text-slate-600 mt-1 flex gap-4">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">Chave: {tpl.metric_key}</span>
                                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">Alvo: {tpl.target_value}</span>
                                <span className="text-slate-500 text-xs mt-1">{tpl.frequency === 'monthly' ? 'Mensal' : tpl.frequency === 'weekly' ? 'Semanal' : 'Diário'}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setEditingTpl(tpl);
                                    setName(tpl.name);
                                    setMetricKey(tpl.metric_key);
                                    setTargetValue(String(tpl.target_value));
                                    setFrequency(tpl.frequency);
                                    setIsModalOpen(true);
                                }}
                            >
                                Editar
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => deleteTpl(tpl.id)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}
                {tplQuery.data?.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        Nenhum template cadastrado para este cargo.
                    </div>
                )}
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTpl ? "Editar Meta" : "Nova Meta do Cargo"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome / Descritivo</label>
                            <Input
                                placeholder="Ex: Vender 20 itens"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Chave da Métrica (Sistema)</label>
                            <Input
                                placeholder="Ex: vendas_realizadas"
                                value={metricKey}
                                onChange={(e) => setMetricKey(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">Esta chave conecta com jornadas e eventos (ex: bater o ponto, concluir tarefa).</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Alvo Numérico</label>
                                <Input
                                    type="number"
                                    placeholder="Ex: 20"
                                    value={targetValue}
                                    onChange={(e) => setTargetValue(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Frequência</label>
                                <select
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={frequency}
                                    onChange={(e) => setFrequency(e.target.value)}
                                >
                                    <option value="daily">Diário</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensal</option>
                                    <option value="yearly">Anual</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={saveTpl}>Salvar</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
