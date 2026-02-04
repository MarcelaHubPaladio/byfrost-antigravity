import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { GitFork, RefreshCw, Search, UserRoundPlus, UsersRound } from "lucide-react";

type OrgNodeRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  parent_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  deleted_at: string | null;
};

function roleTone(role: string) {
  const r = (role || "").toLowerCase();
  if (r === "admin") return "indigo";
  if (r === "manager") return "emerald";
  if (r === "supervisor") return "amber";
  if (r === "leader") return "sky";
  if (r === "vendor") return "violet";
  return "slate";
}

function roleLabel(role: string) {
  const r = (role || "").toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "manager") return "Gerente";
  if (r === "supervisor") return "Supervisor";
  if (r === "leader") return "Líder";
  if (r === "vendor") return "Vendedor";
  return role || "—";
}

function userLabel(u: UserRow) {
  const name = (u.display_name ?? "").trim();
  if (name) return name;
  const email = (u.email ?? "").trim();
  if (email) return email;
  return `${u.user_id.slice(0, 8)}…`;
}

function initials(name: string) {
  const s = (name ?? "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "U";
}

export function OrgChartPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["admin_org_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id,tenant_id,role,display_name,phone_e164,email,deleted_at")
        .eq("tenant_id", activeTenantId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const nodesQ = useQuery({
    queryKey: ["admin_org_nodes", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_nodes")
        .select("id,tenant_id,user_id,parent_user_id,created_at,updated_at")
        .eq("tenant_id", activeTenantId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as OrgNodeRow[];
    },
  });

  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of usersQ.data ?? []) m.set(u.user_id, u);
    return m;
  }, [usersQ.data]);

  const nodeByUserId = useMemo(() => {
    const m = new Map<string, OrgNodeRow>();
    for (const n of nodesQ.data ?? []) m.set(n.user_id, n);
    return m;
  }, [nodesQ.data]);

  const filteredUsers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = usersQ.data ?? [];
    if (!qq) return base;
    return base.filter((u) => {
      const t = `${userLabel(u)} ${(u.email ?? "")} ${(u.phone_e164 ?? "")} ${(u.role ?? "")}`.toLowerCase();
      return t.includes(qq);
    });
  }, [usersQ.data, q]);

  const tree = useMemo(() => {
    const children = new Map<string, string[]>();
    const roots: string[] = [];

    const setForParent = (pid: string, child: string) => {
      const cur = children.get(pid) ?? [];
      cur.push(child);
      children.set(pid, cur);
    };

    for (const n of nodesQ.data ?? []) {
      const pid = n.parent_user_id;
      if (pid) setForParent(pid, n.user_id);
    }

    const allUsersInTree = new Set((nodesQ.data ?? []).map((n) => n.user_id));

    for (const n of nodesQ.data ?? []) {
      const pid = n.parent_user_id;
      const parentExists = pid ? allUsersInTree.has(pid) : true;
      if (!pid || !parentExists) roots.push(n.user_id);
    }

    const sortByName = (ids: string[]) => {
      ids.sort((a, b) => {
        const ua = usersById.get(a);
        const ub = usersById.get(b);
        return userLabel(ua as any).localeCompare(userLabel(ub as any));
      });
    };

    sortByName(roots);
    for (const [k, v] of children.entries()) sortByName(v);

    return { roots, children };
  }, [nodesQ.data, usersById]);

  const unplaced = useMemo(() => {
    const placed = new Set((nodesQ.data ?? []).map((n) => n.user_id));
    return (filteredUsers ?? []).filter((u) => !placed.has(u.user_id) && !u.deleted_at);
  }, [filteredUsers, nodesQ.data]);

  const selected = selectedUserId ? usersById.get(selectedUserId) ?? null : null;
  const selectedNode = selectedUserId ? nodeByUserId.get(selectedUserId) ?? null : null;

  const descendantsOf = (rootUserId: string) => {
    const out = new Set<string>();
    const stack = [rootUserId];
    while (stack.length) {
      const cur = stack.pop()!;
      const kids = tree.children.get(cur) ?? [];
      for (const k of kids) {
        if (out.has(k)) continue;
        out.add(k);
        stack.push(k);
      }
    }
    return out;
  };

  const updateParent = async (userId: string, parentUserId: string | null) => {
    if (!activeTenantId) return;
    const node = nodeByUserId.get(userId);
    if (!node) return;

    setSavingUserId(userId);
    try {
      if (parentUserId === userId) throw new Error("Um usuário não pode ser gestor dele mesmo.");

      // Evita ciclos simples pelo client
      const desc = descendantsOf(userId);
      if (parentUserId && desc.has(parentUserId)) {
        throw new Error("Ciclo detectado: você não pode colocar um subordinado como gestor.");
      }

      const { error } = await supabase
        .from("org_nodes")
        .update({ parent_user_id: parentUserId })
        .eq("tenant_id", activeTenantId)
        .eq("id", node.id);
      if (error) throw error;

      showSuccess("Organograma atualizado.");
      await qc.invalidateQueries({ queryKey: ["admin_org_nodes", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar organograma: ${e?.message ?? "erro"}`);
    } finally {
      setSavingUserId(null);
    }
  };

  const addToOrg = async (userId: string) => {
    if (!activeTenantId) return;
    setSavingUserId(userId);
    try {
      const { error } = await supabase.from("org_nodes").insert({
        tenant_id: activeTenantId,
        user_id: userId,
        parent_user_id: null,
      });
      if (error) throw error;

      showSuccess("Usuário adicionado ao organograma.");
      setSelectedUserId(userId);
      await qc.invalidateQueries({ queryKey: ["admin_org_nodes", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao adicionar ao organograma: ${e?.message ?? "erro"}`);
    } finally {
      setSavingUserId(null);
    }
  };

  const removeFromOrg = async (userId: string) => {
    if (!activeTenantId) return;
    const node = nodeByUserId.get(userId);
    if (!node) return;

    setSavingUserId(userId);
    try {
      const { error } = await supabase
        .from("org_nodes")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", node.id);
      if (error) throw error;

      showSuccess("Usuário removido do organograma.");
      if (selectedUserId === userId) setSelectedUserId(null);
      await qc.invalidateQueries({ queryKey: ["admin_org_nodes", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao remover: ${e?.message ?? "erro"}`);
    } finally {
      setSavingUserId(null);
    }
  };

  const renderNode = (userId: string, depth: number) => {
    const u = usersById.get(userId);
    const n = nodeByUserId.get(userId);
    if (!u || !n) return null;

    const tone = roleTone(u.role);
    const selected = selectedUserId === userId;

    const badgeCls =
      tone === "indigo"
        ? "bg-indigo-100 text-indigo-900"
        : tone === "emerald"
          ? "bg-emerald-100 text-emerald-900"
          : tone === "amber"
            ? "bg-amber-100 text-amber-900"
            : tone === "sky"
              ? "bg-sky-100 text-sky-900"
              : tone === "violet"
                ? "bg-violet-100 text-violet-900"
                : "bg-slate-100 text-slate-700";

    const kids = tree.children.get(userId) ?? [];

    return (
      <div key={userId} className={cn("grid gap-2", depth ? "pl-4" : "")}> 
        <div className={cn("relative", depth ? "pl-4" : "")}> 
          {depth ? (
            <div className="absolute left-1 top-0 h-full w-px bg-slate-200" aria-hidden />
          ) : null}

          <button
            type="button"
            onClick={() => setSelectedUserId(userId)}
            className={cn(
              "group w-full rounded-[18px] border p-3 text-left shadow-sm transition",
              selected
                ? "border-[hsl(var(--byfrost-accent)/0.55)] bg-[hsl(var(--byfrost-accent)/0.08)]"
                : "border-slate-200 bg-white hover:bg-slate-50"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                  selected ? "bg-white/70" : "bg-slate-100"
                )}>
                  <span className="text-xs font-semibold text-slate-700">{initials(userLabel(u))}</span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{userLabel(u)}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {u.phone_e164 ? u.phone_e164 : u.email ? u.email : `id ${u.user_id.slice(0, 8)}…`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={cn("rounded-full border-0", badgeCls)}>
                  {roleLabel(u.role)}
                </Badge>
                {kids.length ? (
                  <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">
                    {kids.length}
                  </Badge>
                ) : null}
              </div>
            </div>
          </button>
        </div>

        {kids.length ? (
          <div className="grid gap-2">
            {kids.map((k) => renderNode(k, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar o organograma.
      </div>
    );
  }

  const managerOptions = (usersQ.data ?? [])
    .filter((u) => !u.deleted_at)
    .sort((a, b) => userLabel(a).localeCompare(userLabel(b)));

  const invalidParents = selectedUserId ? descendantsOf(selectedUserId) : new Set<string>();

  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <GitFork className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Organograma (hierarquia por usuário)</div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                A cascata do CRM pode usar este organograma para determinar quem vê/atua sobre os leads.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="rounded-full border-0 bg-slate-100 text-slate-800 hover:bg-slate-100">org_nodes</Badge>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-2xl"
              onClick={() => {
                usersQ.refetch();
                nodesQ.refetch();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar usuário por nome, cargo, email ou telefone…"
                className="h-11 rounded-2xl pl-10"
              />
            </div>

            <div className="mt-3 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="text-[11px] font-semibold text-slate-700">Árvore</div>
                <div className="text-[11px] text-slate-500">
                  {tree.roots.length} raiz(es) • {(nodesQ.data ?? []).length} nó(s)
                </div>
              </div>

              <ScrollArea className="h-[420px]">
                <div className="p-3">
                  {tree.roots.length ? (
                    <div className="grid gap-2">
                      {tree.roots.map((rid) => renderNode(rid, 0))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                      Nenhum nó no organograma ainda.
                      <div className="mt-1 text-xs text-slate-500">
                        Adicione usuários na lista "Sem posição" e defina gestores.
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="mt-3 overflow-hidden rounded-[18px] border border-slate-200 bg-white">
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-slate-700">Sem posição</div>
                <div className="text-[11px] text-slate-500">{unplaced.length}</div>
              </div>
              <div className="max-h-[260px] overflow-auto divide-y divide-slate-200">
                {unplaced.map((u) => {
                  const isSaving = savingUserId === u.user_id;
                  return (
                    <div key={u.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{userLabel(u)}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">
                          {roleLabel(u.role)} • {u.phone_e164 || u.email || `id ${u.user_id.slice(0, 8)}…`}
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => addToOrg(u.user_id)}
                        disabled={isSaving}
                        className="h-9 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-3 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                      >
                        <UserRoundPlus className="mr-2 h-4 w-4" /> Adicionar
                      </Button>
                    </div>
                  );
                })}

                {unplaced.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">
                    Todos os usuários filtrados já estão no organograma.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-5">
            <div className="rounded-[18px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <UsersRound className="h-4 w-4 text-slate-500" /> Detalhes
                </div>
                <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">editor</Badge>
              </div>

              {!selected ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Selecione um usuário na árvore para editar o gestor.
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white">
                        <span className="text-xs font-semibold text-slate-700">{initials(userLabel(selected))}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{userLabel(selected)}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">
                          {roleLabel(selected.role)} • {selected.phone_e164 || selected.email || `id ${selected.user_id.slice(0, 8)}…`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {!selectedNode ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Este usuário ainda não está no organograma.
                      <div className="mt-2">
                        <Button
                          type="button"
                          onClick={() => addToOrg(selected.user_id)}
                          disabled={savingUserId === selected.user_id}
                          className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                        >
                          <UserRoundPlus className="mr-2 h-4 w-4" /> Adicionar ao organograma
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs font-semibold text-slate-700">Gestor direto</div>
                        <Select
                          value={selectedNode.parent_user_id ?? "__none__"}
                          onValueChange={(v) => {
                            const next = v === "__none__" ? null : v;
                            updateParent(selected.user_id, next);
                          }}
                          disabled={savingUserId === selected.user_id}
                        >
                          <SelectTrigger className={cn("mt-1 h-11 rounded-2xl bg-white", savingUserId === selected.user_id ? "opacity-70" : "")}>
                            <SelectValue placeholder="(sem gestor)" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl">
                            <SelectItem value="__none__" className="rounded-xl">
                              (sem gestor)
                            </SelectItem>
                            {managerOptions
                              .filter((u) => u.user_id !== selected.user_id)
                              .filter((u) => !invalidParents.has(u.user_id))
                              .map((u) => (
                                <SelectItem key={u.user_id} value={u.user_id} className="rounded-xl">
                                  {userLabel(u)} • {roleLabel(u.role)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <div className="mt-2 text-[11px] text-slate-500">
                          Dica: evite colocar um vendedor acima de um gerente; a cascata do CRM segue a árvore.
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-900">Atenção:</span> remover o usuário do organograma pode reduzir
                          visibilidade em cascata.
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                          onClick={() => removeFromOrg(selected.user_id)}
                          disabled={savingUserId === selected.user_id}
                        >
                          Remover
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                Importante: para que um <span className="font-medium">vendedor</span> apareça como dono de lead, ele ainda precisa existir em
                <span className="font-medium"> vendors</span> (mapeamento por <span className="font-medium">phone_e164</span>). O organograma define
                <span className="font-medium"> quem vê</span> e <span className="font-medium">quem pode atribuir</span> dentro da árvore.
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
