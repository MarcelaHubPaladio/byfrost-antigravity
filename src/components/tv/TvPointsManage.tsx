import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function TvPointsManage({ tenantId }: { tenantId: string }) {
    const qc = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");

    const pointsQ = useQuery({
        queryKey: ["tv_points", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_points")
                .select("*")
                .eq("tenant_id", tenantId)
                .is("deleted_at", null)
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from("tv_points")
                .insert({ tenant_id: tenantId, name: newName.trim() });
            if (error) throw error;
            showSuccess("Ponto de TV adicionado");
            setNewName("");
            qc.invalidateQueries({ queryKey: ["tv_points", tenantId] });
        } catch (e: any) {
            showError(e?.message ?? "Erro ao adicionar");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir este ponto de TV?")) return;
        try {
            const { error } = await supabase
                .from("tv_points")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("tenant_id", tenantId);
            if (error) throw error;
            showSuccess("Ponto de TV excluído");
            qc.invalidateQueries({ queryKey: ["tv_points", tenantId] });
        } catch (e: any) {
            showError(e?.message ?? "Erro ao deletar");
        }
    };

    return (
        <Card className="rounded-2xl border-slate-200 p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">Pontos de TV</h3>
                    <p className="mt-1 text-xs text-slate-500">Crie os pontos físicos onde as TVs ficarão (ex: Recepção, Refeitório).</p>
                </div>
                <div className="flex w-full max-w-sm items-center gap-2">
                    <Input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nome do novo ponto"
                        className="rounded-xl"
                        onKeyDown={e => e.key === "Enter" && handleAdd()}
                    />
                    <Button onClick={handleAdd} disabled={loading || !newName.trim()} className="rounded-xl shrink-0">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead className="w-[30%] font-semibold text-slate-900">Nome do Ponto</TableHead>
                            <TableHead className="font-semibold text-slate-900">Link do Player</TableHead>
                            <TableHead className="w-[100px] text-right font-semibold text-slate-900">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pointsQ.isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-sm text-slate-500 py-6">Carregando...</TableCell>
                            </TableRow>
                        ) : pointsQ.data?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-sm text-slate-500 py-6">Nenhum ponto cadastrado.</TableCell>
                            </TableRow>
                        ) : (
                            pointsQ.data?.map(p => {
                                const url = `${window.location.origin}/tv/${p.id}`;
                                return (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-semibold">{p.name}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 truncate max-w-[200px] lg:max-w-none">
                                                    {url}
                                                </code>
                                                <a href={url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600 transition" title="Abrir player">
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
