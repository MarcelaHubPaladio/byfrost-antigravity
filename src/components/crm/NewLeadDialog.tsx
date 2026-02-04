import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { UserPlus2 } from "lucide-react";

type JourneyInfo = {
  id: string;
  key: string;
  name: string;
  default_state_machine_json?: any;
};

function digitsOnly(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizeWhatsappOrThrow(raw: string) {
  const digits = digitsOnly(raw);
  if (!digits) throw new Error("Informe um WhatsApp válido.");

  // Se vier só DDD+numero (10/11), assume Brasil
  let d = digits;
  if ((d.length === 10 || d.length === 11) && !d.startsWith("55")) d = `55${d}`;

  if (d.length < 10) throw new Error("WhatsApp inválido (poucos dígitos).");
  if (d.length > 15) throw new Error("WhatsApp inválido (muitos dígitos).");

  return `+${d}`;
}

export function NewLeadDialog({
  tenantId,
  journey,
  actorUserId,
  className,
}: {
  tenantId: string;
  journey: JourneyInfo;
  actorUserId: string | null;
  className?: string;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("+55");
  const [email, setEmail] = useState("");

  const firstState = useMemo(() => {
    const st = (journey.default_state_machine_json?.states ?? []) as any[];
    const first = Array.isArray(st) && st.length ? String(st[0]) : "capturing";
    return first || "capturing";
  }, [journey.default_state_machine_json]);

  const reset = () => {
    setName("");
    setWhatsapp("+55");
    setEmail("");
  };

  const createLead = async () => {
    if (!tenantId || !journey?.id) return;

    const displayName = name.trim();
    if (!displayName) {
      showError("Informe o nome.");
      return;
    }

    setSaving(true);
    try {
      const phoneE164 = normalizeWhatsappOrThrow(whatsapp);
      const emailNorm = email.trim().toLowerCase() || null;

      // 1) Customer (lookup by exact phone)
      const { data: existing, error: selErr } = await supabase
        .from("customer_accounts")
        .select("id,deleted_at")
        .eq("tenant_id", tenantId)
        .eq("phone_e164", phoneE164)
        .limit(1)
        .maybeSingle();
      if (selErr) throw selErr;

      let customerId: string;

      if (existing?.id) {
        customerId = String(existing.id);
        const { error: updErr } = await supabase
          .from("customer_accounts")
          .update({
            name: displayName,
            email: emailNorm,
            deleted_at: null,
            meta_json: { lead_source: "panel_manual" },
          } as any)
          .eq("tenant_id", tenantId)
          .eq("id", customerId);
        if (updErr) throw updErr;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("customer_accounts")
          .insert({
            tenant_id: tenantId,
            phone_e164: phoneE164,
            name: displayName,
            email: emailNorm,
            assigned_vendor_id: null,
            meta_json: { lead_source: "panel_manual" },
          } as any)
          .select("id")
          .single();
        if (insErr) throw insErr;
        customerId = String((ins as any).id);
      }

      // 2) Case (lead)
      const { data: c, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journey.id,
          customer_id: customerId,
          title: displayName,
          is_chat: false,
          state: firstState,
          meta_json: {
            lead_source: "panel_manual",
            journey_key: journey.key,
            lead_name: displayName,
            lead_email: emailNorm,
            lead_whatsapp_e164: phoneE164,
          },
        } as any)
        .select("id")
        .single();
      if (cErr) throw cErr;

      const caseId = String((c as any).id);

      // Audit
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "lead_created",
        actor_type: "admin",
        actor_id: actorUserId,
        message: "Lead criado manualmente no CRM.",
        meta_json: { source: "panel_manual" },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Lead criado.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", tenantId] }),
      ]);

      setOpen(false);
      reset();

      nav(`/crm/cases/${encodeURIComponent(caseId)}`);
    } catch (e: any) {
      showError(`Falha ao criar lead: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          className={cn(
            "h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]",
            className
          )}
        >
          <UserPlus2 className="mr-2 h-4 w-4" /> Novo lead
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-[560px] rounded-[22px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo lead</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Cria um lead no CRM em <span className="font-medium">{journey.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="Ex: Maria Souza"
              />
            </div>

            <div>
              <Label className="text-xs">WhatsApp</Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="+5511999999999"
              />
              <div className="mt-1 text-[11px] text-slate-500">Aceita com ou sem +55 (DDDs BR).</div>
            </div>

            <div>
              <Label className="text-xs">E-mail (opcional)</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="maria@empresa.com"
              />
            </div>

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                onClick={createLead}
                disabled={saving || !name.trim()}
              >
                {saving ? "Criando…" : "Criar lead"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
