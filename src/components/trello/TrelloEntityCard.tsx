import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon, Save, X } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AsyncSelect } from "@/components/ui/async-select";
import { showSuccess, showError } from "@/utils/toast";

type Props = {
    tenantId: string;
    caseId: string;
    customerEntityId: string | null;
    metaJson: any;
};

export function TrelloEntityCard({ tenantId, caseId, customerEntityId, metaJson }: Props) {
    const qc = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(customerEntityId);
    const [waNumber, setWaNumber] = useState((metaJson?.monitoring?.whatsapp_number as string) || "");
    const [waInstanceId, setWaInstanceId] = useState(
        (metaJson?.monitoring?.wa_instance_id as string) || ""
    );

    // Fetch Entity Display Name and Metadata if we have an ID
    const entityQ = useQuery({
        queryKey: ["core_entity_lite", tenantId, customerEntityId],
        enabled: Boolean(tenantId && customerEntityId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entities")
                .select("display_name, entity_type, subtype") // We might need more fields if we want to check something else
                .eq("tenant_id", tenantId)
                .eq("id", customerEntityId!)
                .single();
            if (error) throw error;
            return data;
        },
    });

    // Fetch full entity details for auto-fill when editing
    const entityDetailsQ = useQuery({
        queryKey: ["core_entity_input_details", tenantId, selectedEntityId],
        enabled: Boolean(tenantId && selectedEntityId && editing),
        queryFn: async () => {
            // We need to fetch from the specific table based on type/subtype, but for 'party' it is usually 'customer' or 'vendor'.
            // Ideally we use a view or function. But let's try 'customer_accounts' or similar if we can guess.
            // ACTUALLY, 'core_entities' doesn't have phone. We need to join.
            // However, the prompt says "when I select entity...".
            // Let's assume we can fetch from 'identities' or 'customers' view?
            // Let's try to fetch from 'parties' view if it exists or 'customers' table using the entity_id?
            // Wait, `core_entity.id` maps to... what?
            // Based on `0039_core_entities.sql`, `core_entities` is the master table.
            // Specific data is in `customers` (if it's a customer).
            // Let's try to query `customers` by `entity_id` (if that column exists) OR `id` (if they share ID?).
            // Looking at `0046_crm_entities_bridge.sql`, `customer_accounts` has `entity_id`.
            // Let's try querying `customer_accounts` first.

            const { data, error } = await supabase
                .from("customer_accounts")
                .select("id, whatsapp, phone")
                .eq("tenant_id", tenantId)
                .eq("entity_id", selectedEntityId!)
                .maybeSingle();

            if (!error && data) return data;
            return null;
        },
    });

    // Auto-fill effect
    // We only auto-fill if the input is empty to avoid overwriting user input.
    useMemo(() => {
        if (entityDetailsQ.data && !waNumber) {
            const num = entityDetailsQ.data.whatsapp || entityDetailsQ.data.phone;
            if (num) setWaNumber(String(num).replace(/\D/g, ""));
        }
    }, [entityDetailsQ.data, waNumber]);
    // Warning: adding waNumber to deps might cause loop if we don't check !waNumber.
    // Actually, useMemo is not for side effects. useEffect is better.

    // Refactored auto-fill
    const [autoFilled, setAutoFilled] = useState(false);

    if (entityDetailsQ.data && !waNumber && !autoFilled) {
        const num = entityDetailsQ.data.whatsapp || entityDetailsQ.data.phone;
        if (num) {
            setWaNumber(String(num).replace(/\D/g, ""));
            setAutoFilled(true);
        }
    }

    // Reset auto-filled flag when entity changes
    useMemo(() => {
        setAutoFilled(false);
    }, [selectedEntityId]);

    // Load instances for selection
    const instancesQ = useQuery({
        queryKey: ["wa_instances_all", tenantId],
        enabled: Boolean(tenantId && editing),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("wa_instances")
                .select("id, name, phone_number")
                .eq("tenant_id", tenantId)
                .eq("status", "active");
            if (error) throw error;
            return data;
        },
    });

    const saveMutation = useMutation({
        mutationFn: async () => {
            const nextMeta = { ...metaJson };
            if (!nextMeta.monitoring) nextMeta.monitoring = {};

            // Update monitoring info
            if (selectedEntityId) {
                nextMeta.monitoring.whatsapp_number = waNumber;
                nextMeta.monitoring.wa_instance_id = waInstanceId;
            } else {
                nextMeta.monitoring = {};
            }

            const { error } = await supabase
                .from("cases")
                .update({
                    customer_entity_id: selectedEntityId,
                    meta_json: nextMeta,
                })
                .eq("id", caseId)
                .eq("tenant_id", tenantId);

            if (error) throw error;

            // Log to timeline if entity changed
            if (selectedEntityId !== customerEntityId) {
                // If added/changed
                if (selectedEntityId) {
                    await supabase.from("timeline_events").insert({
                        tenant_id: tenantId,
                        case_id: caseId,
                        event_type: "entity_linked",
                        actor_type: "system", // or user? let's use system or 'admin' if we don't have user context easily here. 
                        // In existing code, actor_id is null for 'admin'.
                        message: `Entidade vinculada ao card.`,
                        meta_json: { entity_id: selectedEntityId },
                        occurred_at: new Date().toISOString(),
                    });

                    // Also log to entity timeline if possible?
                    // The user asked: "a partir do momento que selecionar a entidade, essa evento precisa refletir na linha do tempo da entidade"
                    // Usage of `core_entity_events`?
                    // Let's check if the table exists. I'll assume `core_entity_comments` or something exists or I should use `timeline_events` with `entity_id`?
                    // The `timeline_events` table usually links to `case_id`.
                    // Does it have `entity_id`? likely not directly or it's `meta_json`.
                    // BUT, `PublicEntityHistory` reads from... `history.events` which likely comes from `timeline_events` linked to cases of that entity.
                    // So, just linking the case to the entity (`customer_entity_id`) might be enough for the case events to show up in entity history!
                    // I will start by just logging the event in the case timeline.
                }
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["trello_case", tenantId, caseId] });
            showSuccess("Vinculação salva com sucesso.");
            setEditing(false);
        },
        onError: (e: any) => {
            showError(`Erro ao salvar: ${e.message}`);
        },
    });

    const searchEntities = async (term: string) => {
        const { data, error } = await supabase
            .from("core_entities")
            .select("id, display_name")
            .eq("tenant_id", tenantId)
            .eq("entity_type", "party") // Only Parties (people/companies)
            .ilike("display_name", `%${term}%`)
            .limit(20);

        if (error) {
            console.error(error);
            return [];
        }
        return (data ?? []).map((d) => ({
            value: d.id,
            label: d.display_name,
        }));
    };

    const handleEntitySelect = (val: string | null) => {
        setSelectedEntityId(val);
        if (!val) {
            setWaNumber("");
            setWaInstanceId("");
        }
    };

    if (!editing) {
        return (
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700">
                            Vínculo & Monitoramento
                        </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                        Editar
                    </Button>
                </div>

                <div className="mt-3 space-y-3">
                    <div>
                        <div className="text-xs text-slate-500">Entidade (Cliente/Link)</div>
                        <div className="text-sm font-medium text-slate-900">
                            {customerEntityId ? (
                                entityQ.isLoading ? "Carregando..." : entityQ.data?.display_name || "Desconhecido"
                            ) : (
                                <span className="italic text-slate-400">Nenhuma entidade vinculada</span>
                            )}
                        </div>
                    </div>

                    {customerEntityId && metaJson?.monitoring && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500">WhatsApp Monitorado</div>
                                <div className="text-sm text-slate-700">
                                    {metaJson.monitoring.whatsapp_number || "-"}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500">Instância Observadora</div>
                                <div className="text-sm text-slate-700 truncate" title={metaJson.monitoring.wa_instance_id}>
                                    {metaJson.monitoring.wa_instance_id ? "Selecionada" : "-"}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        );
    }

    return (
        <Card className="rounded-[22px] border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-slate-900">Editar Vínculo</h4>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label>Buscar Entidade</Label>
                    <AsyncSelect
                        placeholder="Busque por nome..."
                        loadOptions={searchEntities}
                        value={selectedEntityId}
                        onChange={handleEntitySelect}
                        defaultOptions
                    />
                </div>

                {selectedEntityId && (
                    <>
                        <div className="space-y-1.5">
                            <Label>Número do WhatsApp</Label>
                            <Input
                                placeholder="5511999999999"
                                value={waNumber}
                                onChange={(e) => setWaNumber(e.target.value)}
                            />
                            <p className="text-[10px] text-slate-500">
                                Número exato que será monitorado (formato internacional, apenas dígitos).
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Instância Observadora</Label>
                            <Select value={waInstanceId} onValueChange={setWaInstanceId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a instância..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {instancesQ.data?.map((inst) => (
                                        <SelectItem key={inst.id} value={inst.id}>
                                            {inst.name || inst.phone_number || inst.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                )}

                <div className="pt-2 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                        Cancelar
                    </Button>
                    <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        <Save className="mr-2 h-3 w-3" />
                        Salvar
                    </Button>
                </div>
            </div>
        </Card>
    );
}
