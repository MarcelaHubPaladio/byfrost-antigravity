import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2 } from "lucide-react";

export function TvTimelineManage({ tenantId }: { tenantId: string }) {
    const qc = useQueryClient();
    const [selectedPoint, setSelectedPoint] = useState<string>("all");

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

    const timelinesQ = useQuery({
        queryKey: ["tv_timelines", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_timelines")
                .select("*, tv_points(name)")
                .eq("tenant_id", tenantId)
                .is("deleted_at", null);
            if (error) throw error;
            return data;
        },
    });

    const handleInitTimeline = async (pointId: string) => {
        try {
            const { error } = await supabase
                .from("tv_timelines")
                .insert({
                    tenant_id: tenantId,
                    tv_point_id: pointId,
                    mode: "automatic",
                    is_active: true
                });
            if (error) throw error;
            showSuccess("Timeline iniciada");
            qc.invalidateQueries({ queryKey: ["tv_timelines"] });
        } catch (e: any) {
            showError("Erro ao iniciar a timeline. Tente novamente.");
        }
    };

    const handleToggleMode = async (timelineId: string, currentMode: string) => {
        try {
            const newMode = currentMode === "automatic" ? "manual" : "automatic";
            const { error } = await supabase
                .from("tv_timelines")
                .update({ mode: newMode })
                .eq("id", timelineId);
            if (error) throw error;
            showSuccess(`Modo alterado para ${newMode}`);
            qc.invalidateQueries({ queryKey: ["tv_timelines"] });
        } catch (e: any) {
            showError("Erro ao alterar modo");
        }
    };

    return (
        <Card className="rounded-2xl border-slate-200 p-6">
            <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">Linhas do Tempo (Timelines)</h3>
                    <p className="mt-1 text-xs text-slate-500">
                        Associe os pontos de TV com o comportamento da fila de reprodução.
                    </p>
                </div>
                <div className="w-full md:w-64">
                    <Select value={selectedPoint} onValueChange={setSelectedPoint}>
                        <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Filtrar por ponto" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os pontos</SelectItem>
                            {pointsQ.data?.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead className="font-semibold text-slate-900">Ponto de TV</TableHead>
                            <TableHead className="font-semibold text-slate-900">Status da Timeline</TableHead>
                            <TableHead className="font-semibold text-slate-900">Modo</TableHead>
                            <TableHead className="text-right font-semibold text-slate-900">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pointsQ.isLoading || timelinesQ.isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-slate-500">Carregando...</TableCell>
                            </TableRow>
                        ) : pointsQ.data?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-slate-500">Cadastre um Ponto de TV primeiro.</TableCell>
                            </TableRow>
                        ) : (
                            pointsQ.data?.filter(p => selectedPoint === "all" || p.id === selectedPoint).map(point => {
                                const timeline = timelinesQ.data?.find(t => t.tv_point_id === point.id);

                                if (!timeline) {
                                    return (
                                        <TableRow key={point.id}>
                                            <TableCell className="font-semibold">{point.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-slate-500">Sem Timeline</Badge>
                                            </TableCell>
                                            <TableCell>—</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleInitTimeline(point.id)}>
                                                    Criar Timeline
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }

                                return (
                                    <TableRow key={point.id}>
                                        <TableCell className="font-semibold">{point.name}</TableCell>
                                        <TableCell>
                                            {timeline.is_active ? (
                                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-transparent">Ativa</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-slate-500">Inativa</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {timeline.mode === 'automatic' ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-sm font-medium">Automático</span>
                                                    <span className="text-xs text-slate-500">Toca de forma aleatória ou redonda</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-sm font-medium">Manual</span>
                                                    <span className="text-xs text-slate-500">Segue a ordem manual configurada</span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="rounded-xl text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                                onClick={() => handleToggleMode(timeline.id, timeline.mode)}
                                            >
                                                Alternar Modo
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
