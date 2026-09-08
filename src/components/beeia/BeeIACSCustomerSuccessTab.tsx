import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Users, BrainCircuit, Settings } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";
import { ConnectCSGroupDialog } from "./ConnectCSGroupDialog";
import { EditCSGroupDialog } from "./EditCSGroupDialog";
import { Badge } from "@/components/ui/badge";

export function BeeIACSCustomerSuccessTab({ activeTenantId }: { activeTenantId: string }) {
  const qc = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<any>(null);

  const groupsQ = useQuery({
    queryKey: ["beeia_cs_groups", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beeia_cs_groups")
        .select(`
          id,
          tenant_id,
          group_jid,
          group_name,
          beeia_enabled,
          prompt_context,
          commitment_id,
          wa_instance:wa_instances(name),
          customer:core_entities!beeia_cs_groups_customer_entity_id_fkey(display_name),
          commitment:commercial_commitments(commitment_type, status)
        `)
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  const toggleGroupBeeIA = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("beeia_cs_groups")
        .update({ beeia_enabled: enabled })
        .eq("id", id);
      if (error) throw error;
      showSuccess(`BeeIA ${enabled ? 'ativada' : 'desativada'} neste grupo.`);
      qc.invalidateQueries({ queryKey: ["beeia_cs_groups", activeTenantId] });
    } catch (err) {
      console.error(err);
      showError("Erro ao alterar status da IA no grupo.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-6 rounded-[22px] border border-slate-200/80 dark:border-slate-800 shadow-xs relative">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            Grupos de Sucesso do Cliente
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Configure grupos de WhatsApp atrelados a um contrato e cliente. A BeeIA puxará automaticamente o contexto da operação (ciclo, metas, tarefas) para responder às dúvidas dos clientes de forma qualificada.
          </p>
        </div>
        <Button onClick={() => setConnectOpen(true)} className="rounded-xl shadow-sm h-10 w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Conectar Grupo CS
        </Button>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <Table>
          <TableHeader className="bg-slate-50/50 dark:bg-slate-800/50">
            <TableRow className="border-b border-slate-200 dark:border-slate-800">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Grupo</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Instância</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cliente & Contrato</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status IA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
                  </div>
                </TableCell>
              </TableRow>
            ) : groupsQ.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <Users className="mb-2 h-8 w-8 opacity-20" />
                    <p className="text-sm">Nenhum grupo de CS configurado.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              groupsQ.data?.map((g: any) => (
                <TableRow key={g.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/50">
                  <TableCell>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {g.group_name || "Grupo Sem Nome"}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{g.group_jid}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px] text-slate-500 rounded-md">
                      {g.wa_instance?.name || "Desconhecida"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {g.customer?.display_name || "Desconhecido"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {g.commitment?.commitment_type} - {g.commitment?.status}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={g.beeia_enabled}
                          onCheckedChange={(val) => toggleGroupBeeIA(g.id, val)}
                          className="data-[state=checked]:bg-indigo-500"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[50px]">
                          {g.beeia_enabled ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                        onClick={() => setEditGroup(g)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConnectCSGroupDialog 
        open={connectOpen} 
        onOpenChange={setConnectOpen} 
        tenantId={activeTenantId} 
      />

      <EditCSGroupDialog
        open={!!editGroup}
        onOpenChange={(open) => !open && setEditGroup(null)}
        group={editGroup}
      />
    </div>
  );
}
