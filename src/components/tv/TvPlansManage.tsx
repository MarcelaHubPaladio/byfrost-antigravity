import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function TvPlansManage({ tenantId }: { tenantId: string }) {
    const qc = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDuration, setNewDuration] = useState("15");

    const plansQ = useQuery({
        queryKey: ["tv_plans", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_plans")
                .select("*")
                .eq("tenant_id", tenantId)
                .is("deleted_at", null)
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const handleAdd = async () => {
        if (!newName.trim() || !newDuration) return;
        setLoading(true);
        try {
            const dur = parseInt(newDuration, 10);
            if (isNaN(dur) || dur < 1) throw new Error("Duração inválida");

            const { error } = await supabase
                .from("tv_plans")
                .insert({
                    tenant_id: tenantId,
                    name: newName.trim(),
                    video_duration_seconds: dur
                });
            if (error) throw error;
            showSuccess("Plano adicionado");
            setNewName("");
            setNewDuration("15");
            qc.invalidateQueries({ queryKey: ["tv_plans", tenantId] });
        } catch (e: any) {
            showError(e?.message ?? "Erro ao adicionar");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir este plano?")) return;
        try {
            const { error } = await supabase
                .from("tv_plans")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("tenant_id", tenantId);
            if (error) throw error;
            showSuccess("Plano excluído");
            qc.invalidateQueries({ queryKey: ["tv_plans", tenantId] });
        } catch (e: any) {
            showError(e?.message ?? "Erro ao deletar");
        }
    };

    return (
        <Card className="rounded-2xl border-slate-200 p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">Planos de Mídia</h3>
                    <p className="mt-1 text-xs text-slate-500">Cadastre os planos que as entidades podem assinar.</p>
                </div>
                <div className="flex w-full max-w-md items-center gap-2">
                    <Input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nome (ex: Premium)"
                        className="rounded-xl flex-1"
                    />
                    <Input
                        type="number"
                        value={newDuration}
                        onChange={e => setNewDuration(e.target.value)}
                        placeholder="Segundos (ex: 15)"
                        className="rounded-xl w-[100px] shrink-0"
                        title="Duração em segundos"
                    />
                    <Button onClick={handleAdd} disabled={loading || !newName.trim()} className="rounded-xl shrink-0">
                        <Plus className="mr-2 h-4 w-4" />
                        Salvar
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead className="font-semibold text-slate-900">Nome do Plano</TableHead>
                            <TableHead className="font-semibold text-slate-900">Duração do Vídeo</TableHead>
                            <TableHead className="font-semibold text-slate-900">Status</TableHead>
                            <TableHead className="w-[100px] text-right font-semibold text-slate-900">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {plansQ.isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">Carregando...</TableCell>
                            </TableRow>
                        ) : plansQ.data?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">Nenhum plano cadastrado.</TableCell>
                            </TableRow>
                        ) : (
                            plansQ.data?.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-semibold">{p.name}</TableCell>
                                    <TableCell>{p.video_duration_seconds}s</TableCell>
                                    <TableCell>
                                        {p.is_active ? (
                                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Ativo</span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-800">Inativo</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
