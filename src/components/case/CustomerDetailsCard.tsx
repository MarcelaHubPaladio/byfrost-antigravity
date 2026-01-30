import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Phone, UserRound } from "lucide-react";

type CustomerRow = {
  id: string;
  tenant_id: string;
  phone_e164: string;
  name: string | null;
  email: string | null;
};

function digitsOnly(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function waLinkFromE164(phone: string) {
  const d = digitsOnly(phone);
  return d ? `https://wa.me/${d}` : null;
}

export function CustomerDetailsCard(props: {
  tenantId: string;
  caseId: string;
  customerId: string | null;
  onCustomerLinked?: (customerId: string) => void;
  className?: string;
}) {
  const { tenantId, caseId, customerId, onCustomerLinked, className } = props;
  const qc = useQueryClient();

  const customerQ = useQuery({
    queryKey: ["customer_account", tenantId, customerId],
    enabled: Boolean(tenantId && customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,tenant_id,phone_e164,name,email")
        .eq("tenant_id", tenantId)
        .eq("id", customerId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerRow | null;
    },
  });

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = customerQ.data;
    if (!c) return;
    setPhone(c.phone_e164 ?? "");
    setName(c.name ?? "");
    setEmail(c.email ?? "");
  }, [customerQ.data]);

  const link = useMemo(() => (phone ? waLinkFromE164(phone) : null), [phone]);

  const save = async () => {
    const p = phone.trim();
    if (!p) {
      showError("WhatsApp é obrigatório (use formato +55…).");
      return;
    }

    setSaving(true);
    try {
      if (customerId) {
        const { error } = await supabase
          .from("customer_accounts")
          .update({ phone_e164: p, name: name.trim() || null, email: email.trim() || null })
          .eq("tenant_id", tenantId)
          .eq("id", customerId);
        if (error) throw error;
        showSuccess("Cliente atualizado.");
      } else {
        const { data: created, error: insErr } = await supabase
          .from("customer_accounts")
          .insert({
            tenant_id: tenantId,
            phone_e164: p,
            name: name.trim() || null,
            email: email.trim() || null,
            meta_json: {},
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        const newId = (created as any)?.id as string | undefined;
        if (!newId) throw new Error("Falha ao criar customer_accounts");

        const { error: linkErr } = await supabase
          .from("cases")
          .update({ customer_id: newId })
          .eq("tenant_id", tenantId)
          .eq("id", caseId);
        if (linkErr) throw linkErr;

        onCustomerLinked?.(newId);
        showSuccess("Cliente vinculado ao case.");
      }

      await qc.invalidateQueries({ queryKey: ["customer_account", tenantId, customerId] });
      await qc.invalidateQueries({ queryKey: ["case", tenantId, caseId] });
    } catch (e: any) {
      showError(`Falha ao salvar cliente: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-[22px] border border-slate-200 bg-white p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserRound className="h-4 w-4 text-slate-500" /> Cliente
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Nome, email e WhatsApp vinculados ao case (CRM).
          </div>
        </div>

        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white"
            title="Abrir conversa no WhatsApp"
          >
            <Phone className="h-4 w-4" /> Abrir
          </a>
        ) : null}
      </div>

      {customerQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          Erro ao carregar cliente: {(customerQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <div>
          <Label className="text-xs">WhatsApp (E.164)</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+5511999999999"
            className="mt-1 h-10 rounded-2xl"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Maria"
              className="mt-1 h-10 rounded-2xl"
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@empresa.com"
              className="mt-1 h-10 rounded-2xl"
            />
          </div>
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
        >
          {saving ? "Salvando…" : "Salvar cliente"}
        </Button>

        <div className="text-[11px] text-slate-500">
          Dica: o WhatsApp deve estar no formato internacional (ex.: <span className="font-mono">+55…</span>).
        </div>
      </div>
    </div>
  );
}
