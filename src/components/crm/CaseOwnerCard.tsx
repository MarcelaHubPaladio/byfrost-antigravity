import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";

type UserRow = {
  user_id: string;
  tenant_id: string;
  email: string | null;
  display_name: string | null;
  deleted_at: string | null;
};

function isPresenceManagerRole(role: string | null | undefined) {
  return ["admin", "manager", "supervisor", "leader"].includes(String(role ?? "").toLowerCase());
}

function labelForUser(u: { display_name: string | null; email: string | null }) {
  const name = (u.display_name ?? "").trim();
  if (name) return u.email ? `${name} • ${u.email}` : name;
  return u.email ?? "(Sem nome)";
}

export function CaseOwnerCard(props: {
  tenantId: string;
  caseId: string;
  assignedUserId: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useSession();
  const { activeTenant, isSuperAdmin } = useTenant();

  const [selected, setSelected] = useState<string>(props.assignedUserId ?? "__unassigned__");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(props.assignedUserId ?? "__unassigned__");
  }, [props.assignedUserId]);

  const profileQ = useQuery({
    queryKey: ["crm_me_profile", props.tenantId, user?.id],
    enabled: Boolean(props.tenantId && user?.id),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("role")
        .eq("tenant_id", props.tenantId)
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });

  // Fetch all users in the tenant
  const usersQ = useQuery({
    queryKey: ["crm_users", props.tenantId],
    enabled: Boolean(props.tenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id,tenant_id,email,display_name,deleted_at")
        .eq("tenant_id", props.tenantId)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const userById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of usersQ.data ?? []) m.set(u.user_id, u);
    return m;
  }, [usersQ.data]);

  const myRole = String(profileQ.data?.role ?? activeTenant?.role ?? "");

  const currentOwner = props.assignedUserId ? userById.get(props.assignedUserId) ?? null : null;

  const canSetUnassigned = isSuperAdmin || isPresenceManagerRole(myRole);

  const optionRows = useMemo(() => {
    const all = (usersQ.data ?? []).map((u) => ({
      user_id: u.user_id,
      email: u.email,
      display_name: u.display_name,
    }));
    all.sort((a, b) => labelForUser(a).localeCompare(labelForUser(b)));
    return all;
  }, [usersQ.data]);

  const saveOwner = async () => {
    if (!props.tenantId || !props.caseId) return;

    const nextUserId = selected === "__unassigned__" ? null : selected;
    if (nextUserId === props.assignedUserId) return;

    setSaving(true);
    try {
      const prevUserId = props.assignedUserId;
      const prevLabel = prevUserId
        ? labelForUser(userById.get(prevUserId) ?? { email: "(desconhecido)", display_name: null })
        : "(sem dono)";
      const nextLabel = nextUserId
        ? labelForUser(userById.get(nextUserId) ?? { email: "(desconhecido)", display_name: null })
        : "(sem dono)";

      const { error } = await supabase
        .from("cases")
        .update({ assigned_user_id: nextUserId })
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId);
      if (error) throw error;

      const { error: tlErr } = await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        event_type: "lead_owner_changed",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: `Dono do lead alterado: ${prevLabel} → ${nextLabel}`,
        meta_json: {
          from_user_id: prevUserId,
          to_user_id: nextUserId,
          actor_user_id: user?.id ?? null,
          actor_role: myRole,
        },
        occurred_at: new Date().toISOString(),
      });
      if (tlErr) throw tlErr;

      showSuccess("Dono do lead atualizado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", props.tenantId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao alterar dono do lead: ${e?.message ?? "erro"}`);
      setSelected(props.assignedUserId ?? "__unassigned__");
    } finally {
      setSaving(false);
    }
  };

  const title = isPresenceManagerRole(myRole) || isSuperAdmin ? "Atribuir / reatribuir lead" : "Atribuição (limitada)";

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "grid h-9 w-9 place-items-center rounded-2xl",
              isPresenceManagerRole(myRole) || isSuperAdmin
                ? "bg-indigo-50 text-indigo-700"
                : "bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]"
            )}
          >
            {isPresenceManagerRole(myRole) || isSuperAdmin ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <UserRoundCog className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Dono do lead</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{title}</div>
          </div>
        </div>

        <Badge className="rounded-full border-0 bg-slate-100 text-slate-800 hover:bg-slate-100">cases</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="text-xs font-semibold text-slate-700">Atual</div>
          <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <UsersRound className="h-4 w-4 text-slate-400" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {currentOwner ? labelForUser(currentOwner) : "(sem dono)"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">A permissão é validada no banco (organograma/cascata).</div>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-end">
          <Button
            type="button"
            onClick={saveOwner}
            disabled={saving || usersQ.isLoading || profileQ.isLoading}
            className={cn(
              "h-11 rounded-2xl px-4 text-white",
              "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            )}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>

        <div className="sm:col-span-2">
          <div className="text-xs font-semibold text-slate-700">Novo dono</div>
          <Select
            value={selected}
            onValueChange={setSelected}
            disabled={saving || usersQ.isLoading || profileQ.isLoading}
          >
            <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white">
              <SelectValue placeholder="Selecionar usuário…" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {canSetUnassigned && (
                <SelectItem value="__unassigned__" className="rounded-xl">
                  (sem dono)
                </SelectItem>
              )}
              {optionRows.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id} className="rounded-xl">
                  {labelForUser(u)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {usersQ.isError ? (
            <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-900">
              Erro ao carregar lista de atribuição: {(usersQ.error as any)?.message ?? ""}
            </div>
          ) : null}

          <div className="mt-2 text-[11px] text-slate-500">
            Se você estiver no organograma (Admin → Organograma), a lista segue sua subárvore. Caso contrário, usa a hierarquia
            de vendedores (legado).
          </div>
        </div>
      </div>
    </Card>
  );
}
