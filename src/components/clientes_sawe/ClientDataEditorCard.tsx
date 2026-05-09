import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
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
import { Save, Loader2, User, CreditCard, Calendar, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type FieldRow = {
  key: string;
  value_text: string | null;
};

export function ClientDataEditorCard({
  caseId,
  fields,
}: {
  caseId: string;
  fields: FieldRow[] | undefined;
}) {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => {
    const get = (key: string) => fields?.find((f) => f.key === key)?.value_text || "";
    return {
      name: get("name"),
      cpf: get("cpf"),
      email: get("email"),
      whatsapp: get("whatsapp"),
      payment_method: get("payment_method"),
      plan_id: get("plan_id"),
      due_date: get("due_date"),
    };
  }, [fields]);

  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const { data: plans } = useQuery({
    queryKey: ["subscription_plans", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id, total_value, customer:core_entities(display_name)")
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_type", "subscription")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
  });

  const save = async () => {
    if (!caseId || !activeTenantId) return;
    setSaving(true);
    try {
      const payload = Object.entries(draft)
        .map(([key, val]) => ({
          case_id: caseId,
          key,
          value_text: val || null,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel",
        }));

      const { error } = await supabase.from("case_fields").upsert(payload, {
        onConflict: "case_id,key",
      });
      if (error) throw error;

      // Update case title if name changed
      if (draft.name !== initial.name) {
        await supabase.from("cases").update({ title: draft.name }).eq("id", caseId);
      }

      // Track changes in timeline
      const changedKeys = Object.keys(draft).filter(k => (draft as any)[k] !== (initial as any)[k]);
      if (changedKeys.length > 0) {
        await supabase.from("timeline_events").insert({
          tenant_id: activeTenantId,
          case_id: caseId,
          event_type: "case_fields_updated",
          actor_type: "admin",
          actor_id: user?.id ?? null,
          message: `Campos do cliente atualizados: ${changedKeys.join(", ")}.`,
          meta_json: { changed_keys: changedKeys },
          occurred_at: new Date().toISOString(),
        });
      }

      showSuccess("Dados salvos com sucesso");
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case_fields", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
    } catch (err: any) {
      showError(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initial);

  return (
    <Card className="rounded-[32px] border-none bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Dados do Cliente</h3>
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Informações Cadastrais e Faturamento</p>
          </div>
        </div>
        <Button
          onClick={save}
          disabled={saving || !hasChanges}
          className="h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
          SALVAR ALTERAÇÕES
        </Button>
      </div>

      <div className="grid gap-8">
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome Completo</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CPF</Label>
            <Input
              value={draft.cpf}
              onChange={(e) => setDraft((p) => ({ ...p, cpf: e.target.value }))}
              className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">E-mail</Label>
            <Input
              value={draft.email}
              onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">WhatsApp</Label>
            <Input
              value={draft.whatsapp}
              onChange={(e) => setDraft((p) => ({ ...p, whatsapp: e.target.value }))}
              className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold"
            />
          </div>
        </div>

        <Separator className="bg-slate-100" />

        <div className="grid sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1 ml-1">
              <CreditCard className="h-3 w-3 text-slate-400" />
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Forma de Pagamento</Label>
            </div>
            <Select
              value={draft.payment_method}
              onValueChange={(val) => setDraft((p) => ({ ...p, payment_method: val }))}
            >
              <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold">
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

          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1 ml-1">
              <Package className="h-3 w-3 text-slate-400" />
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plano</Label>
            </div>
            <Select
              value={draft.plan_id}
              onValueChange={(val) => setDraft((p) => ({ ...p, plan_id: val }))}
            >
              <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold">
                <SelectValue placeholder="Selecione o plano..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {plans?.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.customer?.display_name || "Assinatura"} - R$ {plan.total_value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1 ml-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dia de Vencimento</Label>
            </div>
            <Input
              type="number"
              min="1"
              max="31"
              value={draft.due_date}
              onChange={(e) => setDraft((p) => ({ ...p, due_date: e.target.value }))}
              className="h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all font-semibold"
              placeholder="Ex: 10"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
