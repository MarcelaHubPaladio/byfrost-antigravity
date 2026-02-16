import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Phone, UserRound, Mail, Link2, ExternalLink } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";

type CustomerRow = {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  phone_e164: string;
  name: string | null;
  email: string | null;
  deleted_at: string | null;
};

function normalizePhoneLoose(v: string) {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export function CaseCustomerCard(props: {
  tenantId: string;
  caseId: string;
  customerId: string | null;
  assignedVendorId: string | null;
  suggestedPhone?: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);

  const customerQ = useQuery({
    queryKey: ["customer_account", props.tenantId, props.customerId],
    enabled: Boolean(props.tenantId && props.customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,tenant_id,entity_id,phone_e164,name,email,deleted_at")
        .eq("tenant_id", props.tenantId)
        .eq("id", props.customerId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerRow | null;
    },
  });

  const initialDraft = useMemo(() => {
    const c = customerQ.data;
    return {
      phone: c?.phone_e164 ?? normalizePhoneLoose(props.suggestedPhone ?? ""),
      name: c?.name ?? "",
      email: c?.email ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQ.data?.id, props.suggestedPhone]);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setPhone(initialDraft.phone);
    setName(initialDraft.name);
    setEmail(initialDraft.email);
  }, [initialDraft.phone, initialDraft.name, initialDraft.email]);

  const logTimeline = async (message: string, meta_json: any = {}) => {
    await supabase.from("timeline_events").insert({
      tenant_id: props.tenantId,
      case_id: props.caseId,
      event_type: "customer_updated",
      actor_type: "admin",
      actor_id: user?.id ?? null,
      message,
      meta_json,
      occurred_at: new Date().toISOString(),
    });
  };

  const save = async () => {
    const p = normalizePhoneLoose(phone);
    if (!p) {
      showError("Informe o WhatsApp do cliente (ex: +5541999999999). ");
      return;
    }

    setSaving(true);
    try {
      // 1) Se já existe customer_id, só atualiza.
      if (props.customerId) {
        const { error } = await supabase
          .from("customer_accounts")
          .update({
            phone_e164: p,
            name: name.trim() || null,
            email: email.trim() || null,
          })
          .eq("tenant_id", props.tenantId)
          .eq("id", props.customerId);
        if (error) throw error;

        await logTimeline("Dados do cliente atualizados.", {
          action: "updated",
          customer_id: props.customerId,
          phone_e164: p,
          name: name.trim() || null,
          email: email.trim() || null,
        });

        showSuccess("Cliente atualizado.");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["customer_account", props.tenantId, props.customerId] }),
          qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
          qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
        ]);
        return;
      }

      // 2) Se não existe, tenta reutilizar por telefone.
      const { data: existing, error: findErr } = await supabase
        .from("customer_accounts")
        .select("id")
        .eq("tenant_id", props.tenantId)
        .eq("phone_e164", p)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (findErr) throw findErr;

      const createdNew = !existing?.id;

      const idToLink = existing?.id
        ? (existing.id as string)
        : (
            await (async () => {
              const { data: created, error: createErr } = await supabase
                .from("customer_accounts")
                .insert({
                  tenant_id: props.tenantId,
                  phone_e164: p,
                  name: name.trim() || null,
                  email: email.trim() || null,
                  assigned_vendor_id: props.assignedVendorId,
                  meta_json: {},
                })
                .select("id")
                .single();
              if (createErr) throw createErr;
              return created.id as string;
            })()
          );

      // 3) Vincula no case
      const { error: linkErr } = await supabase
        .from("cases")
        .update({ customer_id: idToLink })
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId);
      if (linkErr) throw linkErr;

      await logTimeline(createdNew ? "Cliente criado e vinculado ao case." : "Cliente vinculado ao case.", {
        action: createdNew ? "created_and_linked" : "linked",
        customer_id: idToLink,
        phone_e164: p,
      });

      showSuccess(existing?.id ? "Cliente vinculado ao case." : "Cliente criado e vinculado ao case.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["customer_account", props.tenantId, idToLink] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao salvar cliente: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const entityId = customerQ.data?.entity_id ?? null;

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Cliente</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                {props.customerId ? (
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" /> vinculado
                  </span>
                ) : (
                  "não vinculado"
                )}

                {entityId ? (
                  <Link
                    to={`/app/entities/${encodeURIComponent(entityId)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                    title="Abrir entidade"
                  >
                    entidade <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className={cn(
            "h-10 rounded-2xl px-4 text-white",
            "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      {customerQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar cliente: {(customerQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Label className="text-xs">WhatsApp</Label>
          <div className="relative mt-1">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 rounded-2xl pl-10"
              placeholder="+5541999999999"
            />
          </div>
        </div>

        <div className="sm:col-span-1">
          <Label className="text-xs">Nome</Label>
          <div className="relative mt-1">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-2xl pl-10"
              placeholder="Ex: Maria Souza"
            />
          </div>
        </div>

        <div className="sm:col-span-1">
          <Label className="text-xs">Email</Label>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-2xl pl-10"
              placeholder="email@exemplo.com"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        Dica: ao salvar, o cliente do CRM também fica sincronizado com o módulo Entidades (core_entities).
      </div>
    </Card>
  );
}