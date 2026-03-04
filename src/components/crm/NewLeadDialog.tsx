import { useMemo, useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, UserPlus2 } from "lucide-react";

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

function getUserDisplayNameFromAuthUser(user: any) {
  const md = user?.user_metadata ?? {};
  const full = (md.full_name as string | undefined) ?? null;
  const first = (md.first_name as string | undefined) ?? null;
  const last = (md.last_name as string | undefined) ?? null;
  const composed = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (composed) return composed;
  const email = (user?.email as string | undefined) ?? "";
  return email ? email.split("@")[0] : "Usuário";
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

  const [entityHandling, setEntityHandling] = useState<"none" | "create" | "link">("none");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchEntity, setSearchEntity] = useState("");
  const [openEntity, setOpenEntity] = useState(false);
  const [debouncedSearchEntity, setDebouncedSearchEntity] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchEntity(searchEntity), 300);
    return () => clearTimeout(t);
  }, [searchEntity]);

  const entitiesQ = useQuery({
    queryKey: ["crm_parties_search", tenantId, debouncedSearchEntity],
    enabled: Boolean(tenantId && entityHandling === "link"),
    queryFn: async () => {
      let q = supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", tenantId)
        .in("entity_type", ["party", "tenant"])
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(20);

      if (debouncedSearchEntity) {
        q = q.ilike("display_name", `%${debouncedSearchEntity}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const firstState = useMemo(() => {
    const st = (journey.default_state_machine_json?.states ?? []) as any[];
    const first = Array.isArray(st) && st.length ? String(st[0]) : "capturing";
    return first || "capturing";
  }, [journey.default_state_machine_json]);

  const reset = () => {
    setName("");
    setWhatsapp("+55");
    setEmail("");
    setEntityHandling("none");
    setSelectedEntityId(null);
    setSearchEntity("");
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
      let ownerUserId: string | null = actorUserId;

      if (ownerUserId) {
        const { data: profile } = await supabase
          .from("users_profile")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", ownerUserId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!profile) ownerUserId = null;
      }

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
      let finalEntityId: string | null = null;

      if (entityHandling === "link" && selectedEntityId) {
        finalEntityId = selectedEntityId;
      } else if (entityHandling === "create") {
        const entityRes = await supabase.from("core_entities").insert({
          tenant_id: tenantId,
          entity_type: "party",
          subtype: "cliente",
          display_name: displayName,
          status: "active",
          metadata: {
            source: "crm_manual",
            whatsapp: phoneE164.replace(/\D/g, ""),
            email: emailNorm
          }
        }).select("id").single();
        if (entityRes.error) throw entityRes.error;
        finalEntityId = (entityRes.data as any).id;
      }

      if (existing?.id) {
        customerId = String(existing.id);
        const { error: updErr } = await supabase
          .from("customer_accounts")
          .update({
            name: displayName,
            email: emailNorm,
            deleted_at: null,
            assigned_user_id: ownerUserId,
            entity_id: finalEntityId ?? (existing as any).entity_id,
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
            assigned_user_id: ownerUserId,
            entity_id: finalEntityId,
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
          created_by_channel: "panel",
          assigned_user_id: ownerUserId,
          title: displayName,
          is_chat: false,
          state: firstState,
          meta_json: {
            lead_source: "panel_manual",
            journey_key: journey.key,
            lead_name: displayName,
            lead_email: emailNorm,
            owner_user_id: ownerUserId,
            owner_source: "panel_manual_creator",
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
        meta_json: { source: "panel_manual", owner_user_id: ownerUserId },
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

      <DialogContent className="w-[95vw] max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden rounded-[22px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
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

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Label className="text-xs mb-2 block font-semibold">Vínculo de Entidade</Label>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  type="button"
                  variant={entityHandling === "none" ? "default" : "outline"}
                  className="rounded-xl h-8 text-[11px]"
                  onClick={() => setEntityHandling("none")}
                >
                  Não vincular
                </Button>
                <Button
                  type="button"
                  variant={entityHandling === "create" ? "default" : "outline"}
                  className="rounded-xl h-8 text-[11px]"
                  onClick={() => setEntityHandling("create")}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Criar entidade
                </Button>
                <Button
                  type="button"
                  variant={entityHandling === "link" ? "default" : "outline"}
                  className="rounded-xl h-8 text-[11px]"
                  onClick={() => setEntityHandling("link")}
                >
                  Relacionar existente
                </Button>
              </div>

              {entityHandling === "link" && (
                <Popover open={openEntity} onOpenChange={setOpenEntity}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openEntity}
                      className="flex h-11 w-full justify-between items-center rounded-2xl border-slate-200 px-3 py-2 font-normal text-slate-900 bg-white"
                    >
                      <div className="truncate text-sm">
                        {selectedEntityId
                          ? entitiesQ.data?.find(e => e.id === selectedEntityId)?.display_name || "Entidade selecionada"
                          : <span className="text-slate-500">Selecione uma entidade...</span>}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] rounded-2xl p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar entidade..."
                        value={searchEntity}
                        onValueChange={setSearchEntity}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="p-3 text-sm text-slate-500">
                            Nenhuma entidade encontrada.
                          </div>
                        </CommandEmpty>
                        {entitiesQ.data?.map((ent) => (
                          <CommandItem
                            key={ent.id}
                            value={ent.id}
                            onSelect={() => {
                              setSelectedEntityId(ent.id);
                              setOpenEntity(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selectedEntityId === ent.id ? "opacity-100" : "opacity-0")} />
                            {ent.display_name}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full sm:w-auto rounded-2xl"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 w-full sm:w-auto rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
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