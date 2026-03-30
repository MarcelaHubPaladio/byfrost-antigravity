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
import { Plus, UserRound, PackageCheck } from "lucide-react";
import { normalizeRichTextHtmlOrNull, RichTextEditor } from "@/components/RichTextEditor";
import { Switch } from "@/components/ui/switch";

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

export function NewMktTechaCardDialog(props: { tenantId: string; journeyId: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("__unassigned__");
  const [creating, setCreating] = useState(false);
  const [caseType, setCaseType] = useState<string>("planejamento");
  const [priority, setPriority] = useState(false);

  const usersQ = useQuery({
    queryKey: ["mkt_techa_users_hierarchy", props.tenantId, user?.id],
    enabled: Boolean(open && props.tenantId && user?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const { data: meProfile } = await supabase
        .from("users_profile")
        .select("role")
        .eq("tenant_id", props.tenantId)
        .eq("user_id", user!.id)
        .single();

      const isAdmin = meProfile?.role === "admin";

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

      const { data: subordinateIds, error: rpcErr } = await supabase
        .rpc("get_subordinates", { p_tenant_id: props.tenantId, p_user_id: user!.id });

      if (rpcErr) {
        return list.filter(u => u.user_id === user!.id);
      }

      const subSet = new Set(subordinateIds as string[]);
      const filtered = list.filter(u => u.user_id === user!.id || subSet.has(u.user_id));

      filtered.sort((a, b) => labelForUser(a).localeCompare(labelForUser(b)));
      return filtered;
    },
  });

  const dueAtIso = useMemo(() => parseDateInput(dueDate), [dueDate]);

  const create = async () => {
    const t = title.trim();
    if (!t) return;

    setCreating(true);
    try {
      const assigned_user_id = responsibleId === "__unassigned__" ? null : responsibleId;

      const payload: any = {
        tenant_id: props.tenantId,
        journey_id: props.journeyId,
        case_type: caseType,
        is_chat: false,
        created_by_channel: "panel",
        title: t,
        summary_text: normalizeRichTextHtmlOrNull(descriptionHtml),
        state: "BACKLOG",
        assigned_user_id,
        meta_json: {
          due_at: dueAtIso,
          priority,
          journey_key: "mkt-super-techa"
        },
      };

      const { error: insErr } = await supabase.from("cases").insert(payload);
      if (insErr) throw insErr;

      showSuccess("Card criado.");
      setOpen(false);
      setTitle("");
      setDescriptionHtml("");
      setDueDate("");
      setResponsibleId("__unassigned__");
      setPriority(false);
    } catch (e: any) {
      showError(`Falha ao criar card: ${e.message || "erro"}`);
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
            <DialogTitle className="text-base font-semibold text-slate-900">Novo card - MKT Técha</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Crie um card na jornada MKT Técha.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="Ex: Pauta de vídeo semanal"
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
                  <PackageCheck className="h-4 w-4 text-slate-500" />
                  <Label className="text-xs text-indigo-700 font-semibold">Tipo de Caso</Label>
                </div>
                  <Select value={caseType} onValueChange={setCaseType}>
                  <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white text-xs">
                    <SelectValue placeholder="Escolher tipo…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="planejamento" className="rounded-xl">Planejamento</SelectItem>
                    <SelectItem value="trafego_pago" className="rounded-xl">Tráfego Pago</SelectItem>
                    <SelectItem value="arte_estatica" className="rounded-xl">Arte Estática</SelectItem>
                    <SelectItem value="gravacao" className="rounded-xl">Gravação</SelectItem>
                    <SelectItem value="relatorio" className="rounded-xl">Relatório</SelectItem>
                    <SelectItem value="edicao" className="rounded-xl">Edição</SelectItem>
                    <SelectItem value="validacao" className="rounded-xl">Validação</SelectItem>
                    <SelectItem value="aprovacao" className="rounded-xl">Aprovação</SelectItem>
                    <SelectItem value="calendario" className="rounded-xl">Calendário</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-slate-500" />
                  <Label className="text-xs text-rose-700 font-bold uppercase">Priorizar Card</Label>
                </div>
                <div className="mt-1 flex items-center justify-between h-11 px-4 rounded-2xl border border-dotted border-slate-300 bg-slate-50/50">
                  <span className="text-[10px] text-slate-500 font-medium">Destacar com borda vermelha</span>
                  <Switch 
                    id="dialog-priority-techa"
                    checked={priority}
                    onCheckedChange={setPriority}
                  />
                </div>
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
