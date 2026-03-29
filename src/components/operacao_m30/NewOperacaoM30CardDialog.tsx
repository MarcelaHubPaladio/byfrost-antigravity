import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Plus, UserRound } from "lucide-react";
import { normalizeRichTextHtmlOrNull, RichTextEditor } from "@/components/RichTextEditor";
import { FileText, Building2 } from "lucide-react";

type UserRow = { user_id: string; email: string | null; display_name: string | null };

function labelForUser(u: UserRow) {
  const name = (u.display_name ?? "").trim();
  if (name) return u.email ? `${name} • ${u.email}` : name;
  return u.email ?? "(Sem nome)";
}

function parseDateInput(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function NewOperacaoM30CardDialog(props: { tenantId: string; journeyId: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("__unassigned__");
  const [entityId, setEntityId] = useState<string>("__unassigned__");
  const [commitmentId, setCommitmentId] = useState<string>("__unassigned__");
  const [creating, setCreating] = useState(false);

  const usersQ = useQuery({
    queryKey: ["m30_users_hierarchy", props.tenantId, user?.id],
    enabled: Boolean(open && props.tenantId && user?.id),
    staleTime: 30_000,
    queryFn: async () => {
      // 1. Get current user's role
      const { data: meProfile } = await supabase
        .from("users_profile")
        .select("role")
        .eq("tenant_id", props.tenantId)
        .eq("user_id", user!.id)
        .single();

      const isAdmin = meProfile?.role === "admin";

      // 2. Fetch all profiles in tenant (RLS allows it now)
      const { data: allUsers, error: usersErr } = await supabase
        .from("users_profile")
        .select("user_id,email,display_name")
        .eq("tenant_id", props.tenantId)
        .is("deleted_at", null)
        .limit(1000);

      if (usersErr) throw usersErr;
      const list = (allUsers ?? []) as UserRow[];

      if (isAdmin) {
        list.sort((a, b) => labelForUser(a).localeCompare(labelForUser(b)));
        return list;
      }

      // 3. For non-admins, filter by hierarchy
      const { data: subordinateIds, error: rpcErr } = await supabase
        .rpc("get_subordinates", { p_tenant_id: props.tenantId, p_user_id: user!.id });

      if (rpcErr) {
        // Fallback: if RPC fails just show themselves
        console.warn("[trello] Failed to fetch subordinates", rpcErr);
        return list.filter(u => u.user_id === user!.id);
      }

      const subSet = new Set(subordinateIds as string[]);
      const filtered = list.filter(u => u.user_id === user!.id || subSet.has(u.user_id));

      filtered.sort((a, b) => labelForUser(a).localeCompare(labelForUser(b)));
      return filtered;
    },
  });

  const entitiesQ = useQuery({
    queryKey: ["m30_creation_entities", props.tenantId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", props.tenantId)
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const commitmentsQ = useQuery({
    queryKey: ["m30_creation_commitments", props.tenantId, entityId],
    enabled: open && entityId !== "__unassigned__",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id, title, status")
        .eq("tenant_id", props.tenantId)
        .eq("customer_entity_id", entityId)
        .is("deleted_at", null)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dueAtIso = useMemo(() => parseDateInput(dueDate), [dueDate]);

  const create = async () => {
    const t = title.trim();
    if (!t) return;

    setCreating(true);
    try {
      const assigned_user_id = responsibleId === "__unassigned__" ? null : responsibleId;
      const final_entity_id = entityId === "__unassigned__" ? null : entityId;
      const final_commitment_id = commitmentId === "__unassigned__" ? null : commitmentId;

      let deliverableId: string | null = null;
      let entityName: string | null = null;

      if (final_entity_id) {
        entityName = entitiesQ.data?.find(e => e.id === final_entity_id)?.display_name ?? null;
      }

      // Se houver contrato, criamos um entregável 'Extra Escopo'
      if (final_commitment_id && final_entity_id) {
        const { data: del, error: delErr } = await supabase
          .from("deliverables")
          .insert({
            tenant_id: props.tenantId,
            commitment_id: final_commitment_id,
            entity_id: final_entity_id,
            name: `(Extra Escopo) ${t}`,
            status: "pending",
          })
          .select("id")
          .single();
        
        if (delErr) {
          console.warn("[m30] Falha ao criar deliverable automático", delErr);
        } else {
          deliverableId = del.id;
        }
      }

      const basePayload: any = {
        tenant_id: props.tenantId,
        journey_id: props.journeyId,
        case_type: "TRELLO",
        is_chat: false,
        created_by_channel: "panel",
        title: t,
        summary_text: normalizeRichTextHtmlOrNull(descriptionHtml),
        state: "BACKLOG",
        customer_entity_id: final_entity_id,
        deliverable_id: deliverableId,
        ...(assigned_user_id ? { assigned_user_id } : {}),
        meta_json: {
          due_at: dueAtIso,
          entity_id: final_entity_id,
          customer_entity_name: entityName,
          commitment_id: final_commitment_id,
        },
      };

      const tryPayloads: any[] = [
        basePayload,
        { ...basePayload, status: "open" },
        { ...basePayload, status: "OPEN" },
      ];

      let ins: any = null;
      let lastErr: any = null;

      for (const payload of tryPayloads) {
        const res = await supabase.from("cases").insert(payload).select("id").single();
        if (!res.error) {
          ins = res.data;
          lastErr = null;
          break;
        }
        lastErr = res.error;

        // Se não for problema de status, não faz sentido tentar outras variações.
        const msg = String(res.error.message ?? "");
        const details = String((res.error as any).details ?? "");
        const hint = String((res.error as any).hint ?? "");
        const combined = `${msg} ${details} ${hint}`.toLowerCase();
        if (!combined.includes("cases_status_check") && !combined.includes("status")) break;
      }

      if (lastErr) throw lastErr;

      const caseId = String((ins as any)?.id ?? "");
      if (!caseId) throw new Error("Falha ao criar case (id vazio)");

      await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: caseId,
        event_type: "card_created",
        actor_type: "admin",
        actor_id: null,
        message: `Card criado: ${t}`,
        meta_json: { kind: "trello", assigned_user_id },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Card criado.");
      setOpen(false);
      setTitle("");
      setDescriptionHtml("");
      setDueDate("");
      setResponsibleId("__unassigned__");
      setEntityId("__unassigned__");
      setCommitmentId("__unassigned__");
    } catch (e: any) {
      const parts = [
        e?.message ? String(e.message) : null,
        e?.details ? `details: ${String(e.details)}` : null,
        e?.hint ? `hint: ${String(e.hint)}` : null,
        e?.code ? `code: ${String(e.code)}` : null,
      ].filter(Boolean);

      // Ajuda a debugar diferenças de constraint entre ambientes.
      console.error("[m30] Falha ao criar card", e);

      showError(`Falha ao criar card: ${parts.join(" | ") || "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className={cn(
            "h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
          title="Criar novo card"
        >
          <Plus className="mr-2 h-4 w-4" /> Novo card
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-[720px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo card</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Crie um card na jornada Operação M30.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="Ex: Ajustar criativos do cliente"
              />
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <div className="mt-1">
                <RichTextEditor
                  value={descriptionHtml}
                  onChange={setDescriptionHtml}
                  placeholder="Contexto / links / critérios de aceite…"
                  minHeightClassName="min-h-[140px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prazo (opcional)</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 h-11 rounded-2xl"
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-slate-500" />
                  <Label className="text-xs">Responsável</Label>
                </div>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white text-xs truncate">
                    <SelectValue placeholder="Selecionar…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="__unassigned__" className="rounded-xl">(sem responsável)</SelectItem>
                    {(usersQ.data ?? []).map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id} className="rounded-xl">
                        {labelForUser(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <Label className="text-xs text-indigo-700 font-semibold">Vincular Cliente</Label>
                </div>
                <Select value={entityId} onValueChange={(v) => {
                  setEntityId(v);
                  setCommitmentId("__unassigned__");
                }}>
                  <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white text-xs">
                    <SelectValue placeholder="Escolher cliente…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="__unassigned__" className="rounded-xl">(nenhum)</SelectItem>
                    {(entitiesQ.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id} className="rounded-xl">
                        {e.display_name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <Label className="text-xs text-blue-700 font-semibold">Vincular Contrato</Label>
                </div>
                <Select 
                  value={commitmentId} 
                  onValueChange={setCommitmentId}
                  disabled={entityId === "__unassigned__"}
                >
                  <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white text-xs">
                    <SelectValue placeholder={entityId === "__unassigned__" ? "Selecione cliente primeiro" : "Escolher contrato…"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="__unassigned__" className="rounded-xl">(nenhum)</SelectItem>
                    {(commitmentsQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id} className="rounded-xl">
                        {c.title || "Contrato sem título"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {entityId !== "__unassigned__" && (commitmentsQ.data ?? []).length === 0 && !commitmentsQ.isLoading && (
                  <p className="mt-1 text-[10px] text-slate-500">Nenhum contrato ativo para este cliente.</p>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={() => setOpen(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={create}
                disabled={creating || !title.trim()}
                className={cn(
                  "h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                )}
              >
                {creating ? "Criando…" : "Criar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}