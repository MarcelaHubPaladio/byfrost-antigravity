import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2 } from "lucide-react";

export function NewClientDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (caseId: string) => void;
}) {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    email: "",
    whatsapp: "",
    payment_method: "",
    plan_id: "",
    due_date: "",
  });

  const { data: plans } = useQuery({
    queryKey: ["subscription_plans", activeTenantId],
    enabled: !!activeTenantId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, metadata")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: journey } = useQuery({
    queryKey: ["journey_sawe", activeTenantId],
    enabled: !!activeTenantId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id")
        .eq("key", "clientes_sawe")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const handleCreate = async () => {
    if (!activeTenantId || !journey?.id) {
      showError("Jornada não configurada.");
      return;
    }
    if (!formData.name) {
      showError("Nome é obrigatório.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create client as core_entity
      const { data: customerEntity, error: entityErr } = await supabase
        .from("core_entities")
        .insert({
          tenant_id: activeTenantId,
          entity_type: "party",
          subtype: "customer",
          display_name: formData.name,
          metadata: {
            email: formData.email || null,
            whatsapp: formData.whatsapp || null,
            cpf: formData.cpf || null,
          }
        })
        .select()
        .single();
      if (entityErr) throw entityErr;

      // 2. Create active subscription commercial_commitment
      let commitmentId: string | null = null;
      if (formData.plan_id && customerEntity) {
        const { data: comm, error: commErr } = await supabase
          .from("commercial_commitments")
          .insert({
            tenant_id: activeTenantId,
            commitment_type: "subscription",
            customer_entity_id: customerEntity.id,
            status: "active",
            total_value: null,
          })
          .select("id")
          .single();
        if (commErr) throw commErr;
        commitmentId = comm.id;

        // Create commitment item
        const { error: itemErr } = await supabase
          .from("commitment_items")
          .insert({
            tenant_id: activeTenantId,
            commitment_id: commitmentId,
            offering_entity_id: formData.plan_id,
            quantity: 1,
            requires_fulfillment: true,
            metadata: {},
          });
        if (itemErr) throw itemErr;

        // Invoke commitment orchestrator to generate deliverables based on templates
        try {
          await supabase.functions.invoke("commitment-orchestrator", {
            body: { commitment_id: commitmentId },
          });
        } catch (orchErr) {
          console.error("Falha ao orquestrar entregáveis:", orchErr);
        }
      }

      // 3. Create Case linked to customer entity and commitment
      const { data: newCase, error: caseErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: activeTenantId,
          journey_id: journey.id,
          title: formData.name,
          state: "new",
          customer_entity_id: customerEntity.id,
          meta_json: {
            journey_key: "clientes_sawe",
            created_via: "new_client_dialog",
            entity_id: customerEntity.id,
            commitment_id: commitmentId,
          },
        })
        .select()
        .single();

      if (caseErr) throw caseErr;

      // 4. Save Fields
      const fieldRows = [
        { key: "name", value_text: formData.name },
        { key: "cpf", value_text: formData.cpf },
        { key: "email", value_text: formData.email },
        { key: "whatsapp", value_text: formData.whatsapp },
        { key: "payment_method", value_text: formData.payment_method },
        { key: "plan_id", value_text: formData.plan_id },
        { key: "due_date", value_text: formData.due_date },
      ]
        .filter((f) => !!f.value_text)
        .map((f) => ({
          case_id: newCase.id,
          key: f.key,
          value_text: f.value_text,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel",
        }));

      if (fieldRows.length > 0) {
        const { error: fieldErr } = await supabase
          .from("case_fields")
          .insert(fieldRows);
        if (fieldErr) throw fieldErr;
      }

      // 5. Initial Timeline Event
      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        case_id: newCase.id,
        event_type: "case_created",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: `Cliente "${formData.name}" cadastrado na jornada SAWE com o plano selecionado.`,
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Cliente cadastrado com sucesso!");
      onOpenChange(false);
      if (onSuccess) onSuccess(newCase.id);
      qc.invalidateQueries({ queryKey: ["cases_sawe"] });
    } catch (err: any) {
      showError(err.message || "Erro ao cadastrar cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[32px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight">NOVO CLIENTE SAWE</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider opacity-60">Nome Completo</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ex: João da Silva"
              className="rounded-2xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cpf" className="text-xs font-bold uppercase tracking-wider opacity-60">CPF</Label>
              <Input
                id="cpf"
                value={formData.cpf}
                onChange={(e) => setFormData((p) => ({ ...p, cpf: e.target.value }))}
                placeholder="000.000.000-00"
                className="rounded-2xl"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="whatsapp" className="text-xs font-bold uppercase tracking-wider opacity-60">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={formData.whatsapp}
                onChange={(e) => setFormData((p) => ({ ...p, whatsapp: e.target.value }))}
                placeholder="(00) 00000-0000"
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider opacity-60">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
              placeholder="joao@email.com"
              className="rounded-2xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Forma de Pagamento</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(val) => setFormData((p) => ({ ...p, payment_method: val }))}
              >
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao_recorrente">Cartão Crédito Recorrente</SelectItem>
                  <SelectItem value="cartao_parcelado">Cartão Crédito Parcelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Vencimento (Dia)</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={formData.due_date}
                onChange={(e) => setFormData((p) => ({ ...p, due_date: e.target.value }))}
                placeholder="Ex: 10"
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Selecionar Plano (Assinatura)</Label>
            <Select
              value={formData.plan_id}
              onValueChange={(val) => setFormData((p) => ({ ...p, plan_id: val }))}
            >
              <SelectTrigger className="rounded-2xl">
                <SelectValue placeholder="Selecione um plano..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {plans?.map((plan) => {
                  const price = plan.metadata?.price || plan.metadata?.value || plan.metadata?.total_value;
                  return (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.display_name} {price ? `- R$ ${price}` : ""}
                    </SelectItem>
                  );
                })}
                {plans?.length === 0 && (
                  <SelectItem value="none" disabled>Nenhum plano disponível</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest"
          >
            {loading ? <Loader2 className="animate-spin" /> : "CADASTRAR CLIENTE"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
