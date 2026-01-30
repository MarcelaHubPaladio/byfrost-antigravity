import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { showError, showSuccess } from "@/utils/toast";
import { Check, Clock, MapPin, RefreshCw, Search, Tags, UsersRound } from "lucide-react";

type CaseRow = {
  id: string;
  journey_id: string | null;
  customer_id?: string | null;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_vendor_id: string | null;
  vendors?: { display_name: string | null; phone_e164: string | null } | null;
  journeys?: { key: string | null; name: string | null; is_crm?: boolean; default_state_machine_json?: any } | null;
  meta_json?: any;
};

type JourneyOpt = {
  id: string;
  key: string;
  name: string;
  is_crm?: boolean;
  default_state_machine_json?: any;
};

type CaseTagRow = { case_id: string; tag: string };

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function titleizeState(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getMetaPhone(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  const direct =
    meta.customer_phone ??
    meta.customerPhone ??
    meta.phone ??
    meta.whatsapp ??
    meta.to_phone ??
    meta.toPhone ??
    null;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

export default function Crm() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const crmJourneysQ = useQuery({
    queryKey: ["tenant_crm_journeys_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,is_crm,default_state_machine_json)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .limit(300);
      if (error) throw error;

      const opts: JourneyOpt[] = (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean)
        .filter((j: any) => Boolean(j.is_crm))
        .map((j: any) => ({
          id: j.id,
          key: j.key,
          name: j.name,
          is_crm: true,
          default_state_machine_json: j.default_state_machine_json ?? {},
        }));

      opts.sort((a, b) => a.name.localeCompare(b.name));
      return opts;
    },
  });

  // Sem seletor: pegamos o primeiro fluxo CRM habilitado.
  const selectedJourney = useMemo(() => {
    const list = crmJourneysQ.data ?? [];
    if (!list.length) return null;
    const key = selectedKey || list[0].key;
    return list.find((j) => j.key === key) ?? list[0];
  }, [crmJourneysQ.data, selectedKey]);

  useEffect(() => {
    if (!activeTenantId) return;
    if (!crmJourneysQ.data?.length) return;
    if (!selectedKey) setSelectedKey(crmJourneysQ.data[0].key);
  }, [activeTenantId, crmJourneysQ.data, selectedKey]);

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [selectedJourney]);

  const casesQ = useQuery({
    queryKey: ["crm_cases_by_tenant", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,title,status,state,created_at,updated_at,assigned_vendor_id,vendors:vendors!cases_assigned_vendor_id_fkey(display_name,phone_e164),journeys:journeys!cases_journey_id_fkey(key,name,is_crm,default_state_machine_json),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(800);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const journeyRows = useMemo(() => {
    const rows = casesQ.data ?? [];
    const key = selectedJourney?.key ?? "";
    if (!key) return [] as CaseRow[];

    return rows.filter((r) => {
      const keyFromJoin = r.journeys?.key ?? null;
      const keyFromMeta = (r.meta_json as any)?.journey_key ?? null;
      if (keyFromJoin && keyFromJoin === key) return true;
      if (keyFromMeta && keyFromMeta === key) return true;
      return false;
    });
  }, [casesQ.data, selectedJourney?.key]);

  const customerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of journeyRows) {
      const cid = String((r as any).customer_id ?? "");
      if (cid && cid.length > 10) ids.add(cid);
    }
    return Array.from(ids);
  }, [journeyRows]);

  const customersQ = useQuery({
    queryKey: ["crm_customers_by_ids", activeTenantId, customerIds.join(",")],
    enabled: Boolean(activeTenantId && customerIds.length),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,phone_e164,name,email")
        .eq("tenant_id", activeTenantId!)
        .in("id", customerIds)
        .is("deleted_at", null)
        .limit(500);
      if (error) throw error;
      const m = new Map<string, any>();
      for (const c of data ?? []) m.set((c as any).id, c);
      return m;
    },
  });

  const caseIdsForLookup = useMemo(() => journeyRows.map((r) => r.id), [journeyRows]);

  const casePhoneQ = useQuery({
    queryKey: ["crm_case_phone_fallback", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIdsForLookup)
        .in("key", ["whatsapp", "phone", "customer_phone"])
        .limit(3000);
      if (error) throw error;

      const priority = new Map<string, number>([
        ["whatsapp", 1],
        ["customer_phone", 2],
        ["phone", 3],
      ]);

      const best = new Map<string, { p: number; v: string }>();
      for (const r of data ?? []) {
        const cid = String((r as any).case_id ?? "");
        const k = String((r as any).key ?? "");
        const v = String((r as any).value_text ?? "").trim();
        if (!cid || !v) continue;
        const p = priority.get(k) ?? 999;
        const cur = best.get(cid);
        if (!cur || p < cur.p) best.set(cid, { p, v });
      }

      const out = new Map<string, string>();
      for (const [cid, { v }] of best.entries()) out.set(cid, v);
      return out;
    },
  });

  const tagsQ = useQuery({
    queryKey: ["crm_case_tags", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_tags")
        .select("case_id,tag")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIdsForLookup)
        .limit(4000);
      if (error) throw error;
      return (data ?? []) as any as CaseTagRow[];
    },
  });

  const tagsByCase = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of tagsQ.data ?? []) {
      const cid = String((r as any).case_id ?? "");
      const t = String((r as any).tag ?? "").trim();
      if (!cid || !t) continue;
      const cur = m.get(cid) ?? [];
      if (!cur.includes(t)) cur.push(t);
      m.set(cid, cur);
    }
    return m;
  }, [tagsQ.data]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const arr of tagsByCase.values()) for (const t of arr) s.add(t);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [tagsByCase]);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const tagSel = selectedTags;

    return journeyRows.filter((r) => {
      if (tagSel.length) {
        const tags = tagsByCase.get(r.id) ?? [];
        // AND: precisa conter todas
        if (!tagSel.every((t) => tags.includes(t))) return false;
      }

      if (!qq) return true;

      const cust = customersQ.data?.get(String((r as any).customer_id ?? "")) ?? null;
      const metaPhone = getMetaPhone(r.meta_json);
      const fieldPhone = casePhoneQ.data?.get(r.id) ?? null;
      const t = `${r.title ?? ""} ${(r.vendors?.display_name ?? "")} ${(r.vendors?.phone_e164 ?? "")} ${cust?.name ?? ""} ${cust?.phone_e164 ?? ""} ${cust?.email ?? ""} ${metaPhone ?? ""} ${fieldPhone ?? ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [journeyRows, q, selectedTags, customersQ.data, casePhoneQ.data, tagsByCase]);

  const pendQ = useQuery({
    queryKey: ["crm_pendencies_open", activeTenantId, filteredRows.map((c) => c.id).join(",")],
    enabled: Boolean(activeTenantId && filteredRows.length),
    refetchInterval: 9000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const ids = filteredRows.map((c) => c.id);
      const { data, error } = await supabase
        .from("pendencies")
        .select("case_id,type,status")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", ids)
        .eq("status", "open");
      if (error) throw error;

      const byCase = new Map<string, { open: number; need_location: boolean }>();
      for (const p of data ?? []) {
        const cur = byCase.get((p as any).case_id) ?? { open: 0, need_location: false };
        cur.open += 1;
        if ((p as any).type === "need_location") cur.need_location = true;
        byCase.set((p as any).case_id, cur);
      }
      return byCase;
    },
  });

  const columns = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));
    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));

    const all = [...baseStates, ...(extras.length ? ["__other__"] : [])];

    return all.map((st) => {
      const items =
        st === "__other__"
          ? filteredRows.filter((r) => !known.has(r.state))
          : filteredRows.filter((r) => r.state === st);
      return {
        key: st,
        label: st === "__other__" ? "Outros" : titleizeState(st),
        items,
      };
    });
  }, [filteredRows, states]);

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId) return;
    if (movingCaseId) return;
    setMovingCaseId(caseId);

    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState })
        .eq("tenant_id", activeTenantId)
        .eq("id", caseId);
      if (error) throw error;

      showSuccess(`Movido para ${titleizeState(nextState)}.`);
      await qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao mover: ${e?.message ?? "erro"}`);
    } finally {
      setMovingCaseId(null);
    }
  };

  const refresh = () => {
    crmJourneysQ.refetch();
    casesQ.refetch();
    customersQ.refetch();
    casePhoneQ.refetch();
    tagsQ.refetch();
    pendQ.refetch();
  };

  const visibleTags = useMemo(() => {
    const qq = tagQuery.trim().toLowerCase();
    const base = allTags;
    if (!qq) return base;
    return base.filter((t) => t.toLowerCase().includes(qq));
  }, [allTags, tagQuery]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-3 shadow-sm backdrop-blur md:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por cliente, telefone, email, vendedor…"
                className="h-11 rounded-2xl pl-10"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" className="h-11 rounded-2xl">
                  <Tags className="mr-2 h-4 w-4" /> Tags
                  {selectedTags.length ? (
                    <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {selectedTags.length}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] rounded-2xl border-slate-200 bg-white p-2">
                <Command className="rounded-2xl border border-slate-200">
                  <CommandInput
                    value={tagQuery}
                    onValueChange={setTagQuery}
                    placeholder="Filtrar tags…"
                    className="h-11"
                  />
                  <CommandList className="max-h-[240px]">
                    <CommandEmpty>Nenhuma tag</CommandEmpty>
                    <CommandGroup heading="Tags">
                      {visibleTags.map((t) => {
                        const checked = selectedTags.includes(t);
                        return (
                          <CommandItem
                            key={t}
                            value={t}
                            onSelect={() => {
                              setSelectedTags((prev) =>
                                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                              );
                            }}
                            className={cn(
                              "rounded-xl",
                              checked ? "bg-[hsl(var(--byfrost-accent)/0.10)]" : ""
                            )}
                          >
                            <div
                              className={cn(
                                "mr-2 grid h-5 w-5 place-items-center rounded-md border",
                                checked
                                  ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent))] text-white"
                                  : "border-slate-200 bg-white"
                              )}
                            >
                              {checked ? <Check className="h-3.5 w-3.5" /> : null}
                            </div>
                            <span className="truncate text-sm font-medium">{t}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 flex-1 rounded-2xl"
                    onClick={() => {
                      setSelectedTags([]);
                      setTagQuery("");
                    }}
                    disabled={!selectedTags.length}
                  >
                    Limpar
                  </Button>
                  <Button type="button" variant="secondary" className="h-9 rounded-2xl" onClick={refresh}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button type="button" variant="secondary" className="h-11 rounded-2xl" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
          </div>

          {crmJourneysQ.data?.length === 0 && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Não há nenhuma jornada marcada como CRM habilitada para este tenant.
            </div>
          )}

          {selectedJourney?.key && (
            <div className="mt-3 overflow-x-auto pb-1">
              <div className="flex min-w-[980px] gap-4">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="w-[320px] flex-shrink-0"
                    onDragOver={(e) => {
                      if (col.key === "__other__") return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (col.key === "__other__") return;
                      const cid = e.dataTransfer.getData("text/caseId");
                      if (!cid) return;
                      if (movingCaseId) return;
                      updateCaseState(cid, col.key);
                    }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                      <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {col.items.length}
                      </div>
                    </div>

                    <div className="mt-2 space-y-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 p-2">
                      {col.items.map((c) => {
                        const pend = pendQ.data?.get(c.id);
                        const age = minutesAgo(c.updated_at);
                        const isMoving = movingCaseId === c.id;
                        const cust = customersQ.data?.get(String((c as any).customer_id ?? "")) ?? null;

                        const titlePrimary =
                          cust?.name ??
                          casePhoneQ.data?.get(c.id) ??
                          getMetaPhone((c as any).meta_json) ??
                          cust?.phone_e164 ??
                          c.title ??
                          "Caso";

                        return (
                          <Link
                            key={c.id}
                            to={`/app/cases/${c.id}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/caseId", c.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            className={cn(
                              "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                              "border-slate-200 hover:border-slate-300",
                              "cursor-grab active:cursor-grabbing",
                              isMoving ? "opacity-60" : ""
                            )}
                            title="Arraste para mudar de etapa"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">{titlePrimary}</div>
                                <div className="mt-1 truncate text-xs text-slate-500">
                                  <span className="inline-flex items-center gap-1">
                                    <UsersRound className="h-3.5 w-3.5" />
                                    {(c.vendors?.display_name ?? "Vendedor") +
                                      (c.vendors?.phone_e164 ? ` • ${c.vendors.phone_e164}` : "")}
                                  </span>
                                </div>
                              </div>
                              {pend?.open ? (
                                <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                                  {pend.open} pend.
                                </Badge>
                              ) : (
                                <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                  ok
                                </Badge>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                {age} min
                              </div>
                              {pend?.need_location && (
                                <div className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                                  <MapPin className="h-3.5 w-3.5" />
                                  localização
                                </div>
                              )}
                            </div>
                          </Link>
                        );
                      })}

                      {col.items.length === 0 && (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/40 p-4 text-xs text-slate-500">
                          Solte um card aqui para mover.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {casesQ.isError && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro ao carregar casos: {(casesQ.error as any)?.message ?? ""}
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}