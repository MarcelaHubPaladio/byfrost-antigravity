import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";

interface ConnectCSGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
}

export function ConnectCSGroupDialog({ open, onOpenChange, tenantId }: ConnectCSGroupDialogProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Form State
  const [waInstanceId, setWaInstanceId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [manualGroupJid, setManualGroupJid] = useState("");
  const [groupName, setGroupName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [commitmentId, setCommitmentId] = useState("");
  const [promptContext, setPromptContext] = useState("");

  // Queries
  const instancesQ = useQuery({
    queryKey: ["beeia_instances", tenantId],
    enabled: open && Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (error) throw error;
      return data || [];
    }
  });

  const contactsQ = useQuery({
    queryKey: ["wa_contacts_groups", tenantId],
    enabled: open && Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_contacts")
        .select("id, phone_e164, name")
        .eq("tenant_id", tenantId)
        .or("phone_e164.ilike.%@g.us,phone_e164.ilike.%-group")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    }
  });

  const customersQ = useQuery({
    queryKey: ["customers", tenantId],
    enabled: open && Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, commercial_commitments!commercial_commitments_customer_fk!inner(id)")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "party")
        .is("deleted_at", null)
        .is("commercial_commitments.deleted_at", null)
        .order("display_name");
      if (error) throw error;
      
      // Deduplicate in case of multiple contracts
      const uniqueData = Array.from(new Map(data?.map(item => [item.id, item])).values());
      return uniqueData || [];
    }
  });

  const commitmentsQ = useQuery({
    queryKey: ["commitments_for_customer", tenantId, customerId],
    enabled: open && Boolean(tenantId) && Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id, commitment_type, status")
        .eq("tenant_id", tenantId)
        .eq("customer_entity_id", customerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const handleSave = async () => {
    const finalGroupJid = selectedGroup === "custom" ? manualGroupJid : selectedGroup;
    if (!waInstanceId || !finalGroupJid || !customerId || !commitmentId) {
      showError("Preencha os campos obrigatórios (Instância, Grupo, Cliente e Contrato).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        wa_instance_id: waInstanceId,
        group_jid: finalGroupJid.trim(),
        group_name: groupName.trim() || null,
        customer_entity_id: customerId,
        commitment_id: commitmentId,
        prompt_context: promptContext.trim() || null,
        beeia_enabled: true
      };

      const { error } = await supabase.from("beeia_cs_groups").insert(payload);
      if (error) {
        if (error.code === '23505') {
          showError("Este grupo já está cadastrado nesta instância.");
        } else {
          throw error;
        }
      } else {
        showSuccess("Grupo CS configurado com sucesso!");
        qc.invalidateQueries({ queryKey: ["beeia_cs_groups", tenantId] });
        onOpenChange(false);
        // Reset
        setWaInstanceId("");
        setSelectedGroup("");
        setManualGroupJid("");
        setGroupName("");
        setCustomerId("");
        setCommitmentId("");
        setPromptContext("");
      }
    } catch (err: any) {
      console.error(err);
      showError("Erro ao salvar configuração.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar Grupo CS</DialogTitle>
          <DialogDescription>
            Configure um grupo de WhatsApp para que a BeeIA atue com o contexto de Sucesso do Cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="grid gap-2">
            <Label>Instância do WhatsApp *</Label>
            <Select value={waInstanceId} onValueChange={setWaInstanceId} disabled={instancesQ.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância..." />
              </SelectTrigger>
              <SelectContent>
                {instancesQ.data?.map(inst => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Grupo do WhatsApp *</Label>
            {contactsQ.isLoading ? (
              <div className="h-10 border rounded-md flex items-center px-3 text-sm text-slate-500">
                Carregando grupos da base...
              </div>
            ) : (
              <Select 
                value={selectedGroup} 
                onValueChange={(val) => {
                  setSelectedGroup(val);
                  if (val !== "custom") {
                    const found = contactsQ.data?.find(c => c.phone_e164 === val);
                    if (found && found.name) {
                      setGroupName(found.name);
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um grupo da base..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom" className="font-bold text-indigo-600">
                    + Digitar ID Manualmente
                  </SelectItem>
                  {contactsQ.data?.map(c => (
                    <SelectItem key={c.id} value={c.phone_e164}>
                      {c.name || "Grupo Sem Nome"} ({c.phone_e164})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedGroup === "custom" && (
            <div className="grid gap-2 animate-in fade-in zoom-in-95">
              <Label>JID do Grupo (Manual) *</Label>
              <Input 
                placeholder="Ex: 120363@g.us" 
                value={manualGroupJid} 
                onChange={e => setManualGroupJid(e.target.value)} 
              />
              <span className="text-[10px] text-slate-500">
                Cole o ID exato do grupo. Geralmente termina em @g.us
              </span>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Nome do Grupo (Opcional)</Label>
            <Input 
              placeholder="Ex: CS - Cliente XPTO" 
              value={groupName} 
              onChange={e => setGroupName(e.target.value)} 
            />
          </div>

          <div className="grid gap-2">
            <Label>Entidade (Cliente) *</Label>
            <Select value={customerId} onValueChange={setCustomerId} disabled={customersQ.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente..." />
              </SelectTrigger>
              <SelectContent>
                {customersQ.data?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {customerId && (
            <div className="grid gap-2">
              <Label>Operação M30 (Contrato) *</Label>
              <Select value={commitmentId} onValueChange={setCommitmentId} disabled={commitmentsQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o contrato..." />
                </SelectTrigger>
                <SelectContent>
                  {commitmentsQ.data?.length === 0 && (
                    <SelectItem value="empty" disabled>Nenhum contrato ativo encontrado</SelectItem>
                  )}
                  {commitmentsQ.data?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.commitment_type} - {c.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Contexto Específico (Prompt CS)</Label>
            <Textarea 
              placeholder="Instruções extras para a BeeIA neste grupo..." 
              value={promptContext} 
              onChange={e => setPromptContext(e.target.value)} 
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar Configuração"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
