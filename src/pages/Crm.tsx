import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
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
import { Check, Clock, Download, MapPin, RefreshCw, Search, Tags, UsersRound } from "lucide-react";
import { ImportLeadsDialog } from "@/components/crm/ImportLeadsDialog";
import { NewLeadDialog } from "@/components/crm/NewLeadDialog";
import { getStateLabel } from "@/lib/journeyLabels";

type CaseRow = {
  id: string;
  journey_id: string | null;
  customer_id?: string | null;
  customer_entity_id?: string | null;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  is_chat?: boolean;
  users_profile?: { display_name: string | null; email: string | null } | null;
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

type ReadRow = { case_id: string; last_seen_at: string };

type WaMsgLite = { case_id: string | null; occurred_at: string; from_phone: string | null };

type WaInstanceRow = { id: string; phone_number: string | null };

type UserOpt = { user_id: string; email: string | null; display_name: string | null };

type CustomerLite = {
  id: string;
  phone_e164: string;
  name: string | null;
  email: string | null;
  entity_id?: string | null;
};

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

function digitsTail(s: string | null | undefined, tail = 11) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > tail ? d.slice(-tail) : d;
}

function samePhoneLoose(a: string | null | undefined, b: string | null | undefined) {
  const da = digitsTail(a);
  const db = digitsTail(b);
  if (!da || !db) return false;
  if (Math.min(da.length, db.length) < 10) return false;
  return da === db;
}

export default function Crm() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [userQuery, setUserQuery] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [instanceFilterId, setInstanceFilterId] = useState<string>("all");
  const [exportingCsv, setExportingCsv] = useState(false);

  const allInstancesQ = useQuery({
    queryKey: ["wa_instances_all", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id,name,phone_number")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; phone_number: string | null }>;
    },
  });

  const instanceQ = useQuery({
    queryKey: ["wa_instance_active_first", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const data = allInstancesQ.data?.[0] ?? null;
      return data as WaInstanceRow | null;
    },
  });

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

  const usersQ = useQuery({
    queryKey: ["crm_assignable_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      const rows = (data ?? []) as UserOpt[];
      rows.sort((a, b) => {
        const al = String(a.display_name ?? a.email ?? a.user_id).toLowerCase();
        const bl = String(b.display_name ?? b.email ?? b.user_id).toLowerCase();
        return al.localeCompare(bl);
      });
      return rows;
    },
  });

  const showUserFilter = useMemo(() => {
    return (usersQ.data?.length ?? 0) > 1;
  }, [usersQ.data?.length]);

  const visibleUsers = useMemo(() => {
    const qq = userQuery.trim().toLowerCase();
    const base = usersQ.data ?? [];
    if (!qq) return base;
    return base.filter((v) => {
      const label = `${v.display_name ?? ""} ${v.email ?? ""}`.toLowerCase();
      return label.includes(qq);
    });
  }, [usersQ.data, userQuery]);

  useEffect(() => {
    const allowed = new Set((usersQ.data ?? []).map((v) => v.user_id));
    setSelectedUserIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [usersQ.data]);

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
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,customer_entity_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile!fk_cases_users_profile(display_name,email),journeys:journeys!cases_journey_id_fkey(key,name,is_crm,default_state_machine_json),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .eq("is_chat", false)
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
      for (const c of data ?? []) {
        if (c.id) {
          m.set(String(c.id), c);
        }
      }
      return m;
    },
  });

  const caseIdsForLookup = useMemo(() => {
    return journeyRows.map((r) => r.id).filter(Boolean);
  }, [journeyRows]);

  const casePhoneQ = useQuery({
    queryKey: ["crm_case_phone_fallback", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        // NOTE: case_fields não tem tenant_id; o RLS já valida via cases
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

  const readsQ = useQuery({
    queryKey: ["case_message_reads", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_message_reads")
        .select("case_id,last_seen_at")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any as ReadRow[];
    },
  });

  const lastInboundQ = useQuery({
    queryKey: ["crm_case_last_inbound", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,from_phone,instance_id")
        .eq("tenant_id", activeTenantId!)
        .eq("direction", "inbound")
        .in("case_id", caseIdsForLookup)
        .order("occurred_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any as WaMsgLite[];
    },
  });

  const readByCase = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of readsQ.data ?? []) m.set(r.case_id, r.last_seen_at);
    return m;
  }, [readsQ.data]);

  const lastInboundAtByCase = useMemo(() => {
    const m = new Map<string, string>();
    const instPhone = instanceQ.data?.phone_number ?? null;

    for (const row of lastInboundQ.data ?? []) {
      const cid = String((row as any).case_id ?? "");
      if (!cid) continue;
      // Hygiene: ignore misclassified inbound that were actually sent by our instance number.
      if (instPhone && samePhoneLoose(instPhone, (row as any).from_phone)) continue;

      if (!m.has(cid)) m.set(cid, row.occurred_at);
    }
    return m;
  }, [lastInboundQ.data, instanceQ.data?.phone_number]);

  const instanceIdByCase = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of lastInboundQ.data ?? []) {
      const cid = String((row as any).case_id ?? "");
      const iid = String((row as any).instance_id ?? "");
      if (cid && iid && !m.has(cid)) m.set(cid, iid);
    }
    return m;
  }, [lastInboundQ.data]);

  const unreadByCase = useMemo(() => {
    const s = new Set<string>();
    for (const [cid, lastInboundAt] of lastInboundAtByCase.entries()) {
      const seenAt = readByCase.get(cid) ?? null;
      if (!seenAt) {
        s.add(cid);
        continue;
      }
      if (new Date(lastInboundAt).getTime() > new Date(seenAt).getTime()) s.add(cid);
    }
    return s;
  }, [lastInboundAtByCase, readByCase]);

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
    const userSel = selectedUserIds;

    return journeyRows.filter((r) => {
      // Filtro de Instância
      if (instanceFilterId !== "all") {
        const meta = r.meta_json as any;
        const metaInstId = meta?.instance_id || meta?.wa_instance_id || meta?.monitoring?.wa_instance_id || meta?.monitoring?.instance_id;
        const msgInstId = instanceIdByCase.get(r.id);

        if (metaInstId !== instanceFilterId && msgInstId !== instanceFilterId) return false;
      }

      if (userSel.length) {
        const uid = r.assigned_user_id;
        if (!uid || !userSel.includes(uid)) return false;
      }

      if (tagSel.length) {
        const tags = tagsByCase.get(r.id) ?? [];
        // AND: precisa conter todas
        if (!tagSel.every((t) => tags.includes(t))) return false;
      }

      if (!qq) return true;

      const cust = customersQ.data?.get(String((r as any).customer_id ?? "")) ?? null;
      const metaPhone = getMetaPhone(r.meta_json);
      const fieldPhone = casePhoneQ.data?.get(r.id) ?? null;
      const t = `${r.title ?? ""} ${(r.users_profile?.display_name ?? "")} ${(r.users_profile?.email ?? "")} ${cust?.name ?? ""} ${cust?.phone_e164 ?? ""} ${cust?.email ?? ""} ${metaPhone ?? ""} ${fieldPhone ?? ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [journeyRows, q, selectedTags, selectedUserIds, instanceFilterId, instanceIdByCase, customersQ.data, casePhoneQ.data, tagsByCase]);

  function csvCell(v: any) {
    const s = String(v ?? "");
    const escaped = s.replace(/\"/g, '""');
    if (/[\n\r",]/.test(escaped)) return `"${escaped}"`;
    return escaped;
  }

  function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const exportConversationsCsv = async () => {
    if (!activeTenantId) return;
    if (exportingCsv) return;

    const rowsToExport = filteredRows;
    const caseIds = rowsToExport.map((r) => r.id);

    if (caseIds.length === 0) {
      showError("Nenhum caso para exportar.");
      return;
    }

    setExportingCsv(true);
    try {
      const msgs: any[] = [];
      const chunkSize = 50;
      for (let i = 0; i < caseIds.length; i += chunkSize) {
        const chunk = caseIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("wa_messages")
          .select("case_id,occurred_at,direction,from_phone,to_phone,type,body_text,media_url")
          .eq("tenant_id", activeTenantId)
          .in("case_id", chunk)
          .order("occurred_at", { ascending: true })
          .limit(10000);
        if (error) throw error;
        msgs.push(...(data ?? []));
      }

      const msgsByCase = new Map<string, any[]>();
      for (const m of msgs) {
        const cid = String(m.case_id ?? "");
        if (!cid) continue;
        const arr = msgsByCase.get(cid) ?? [];
        arr.push(m);
        msgsByCase.set(cid, arr);
      }

      const headers = ["nome", "numero", "case_id", "conversa"];
      const out: string[] = [headers.map(csvCell).join(",")];

      const casePhoneMap = casePhoneQ.data || new Map();
      const customersMap = customersQ.data || new Map();

      for (const c of rowsToExport) {
        const cust = customersMap.get(String((c as any).customer_id ?? ""));
        const name = cust?.name || c.title || "Caso";
        const phone = cust?.phone_e164 || casePhoneMap.get(c.id) || getMetaPhone(c.meta_json) || "";

        const transcript = (msgsByCase.get(c.id) ?? [])
          .map((m) => {
            const ts = new Date(m.occurred_at).toISOString();
            const body = (m.body_text ?? "").trim() || `[${m.type}]${m.media_url ? " " + m.media_url : ""}`;
            return `${ts} ${m.direction}: ${body}`;
          })
          .join("\n");

        out.push([name, phone, c.id, transcript].map(csvCell).join(","));
      }

      const csv = out.join("\n");
      const fname = `crm_conversas_${selectedJourney?.key || "export"}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadTextFile(fname, csv, "text/csv;charset=utf-8");
      showSuccess("CSV exportado.");
    } catch (e: any) {
      showError(`Falha ao exportar: ${e.message}`);
    } finally {
      setExportingCsv(false);
    }
  };

  const pendQ = useQuery({
    queryKey: ["crm_pendencies_open", activeTenantId, filteredRows.map((c) => c.id).join(",")],
    enabled: Boolean(activeTenantId && filteredRows.length),
    refetchInterval: 25_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const ids = filteredRows.map((c) => c.id);
      const { data, error } = await supabase
        .from("pendencies")
        .select("case_id,type,status")
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

    const sortCases = (a: CaseRow, b: CaseRow) => {
      const au = unreadByCase.has(a.id);
      const bu = unreadByCase.has(b.id);
      if (au !== bu) return au ? -1 : 1;

      const at = lastInboundAtByCase.get(a.id) ?? a.updated_at;
      const bt = lastInboundAtByCase.get(b.id) ?? b.updated_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    };

    return all.map((st) => {
      const itemsRaw =
        st === "__other__"
          ? filteredRows.filter((r) => !known.has(r.state))
          : filteredRows.filter((r) => r.state === st);

      const items = [...itemsRaw].sort(sortCases);

      return {
        key: st,
        label: st === "__other__" ? "Outros" : getStateLabel(selectedJourney as any, st),
        items,
      };
    });
  }, [filteredRows, states, unreadByCase, lastInboundAtByCase, selectedJourney]);

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

      showSuccess(`Movido para ${getStateLabel(selectedJourney as any, nextState)}.`);
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
    lastInboundQ.refetch();
    readsQ.refetch();
    usersQ.refetch();
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
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por cliente, telefone…"
                className="h-11 w-full rounded-2xl pl-10"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showUserFilter && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" className="h-11 rounded-2xl">
                      <UsersRound className="mr-2 h-4 w-4" /> Usuários
                      {selectedUserIds.length ? (
                        <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {selectedUserIds.length}
                        </span>
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[340px] rounded-2xl border-slate-200 bg-white p-2">
                    <Command className="rounded-2xl border border-slate-200">
                      <CommandInput
                        value={userQuery}
                        onValueChange={setUserQuery}
                        placeholder="Filtrar responsáveis…"
                        className="h-11"
                      />
                      <CommandList className="max-h-[260px]">
                        <CommandEmpty>Nenhum responsável</CommandEmpty>
                        <CommandGroup heading="Responsáveis">
                          {visibleUsers.map((v) => {
                            const checked = selectedUserIds.includes(v.user_id);
                            const label = v.display_name?.trim() || v.email?.trim() || "Responsável";
                            return (
                              <CommandItem
                                key={v.user_id}
                                value={`${label} ${v.email ?? ""}`}
                                onSelect={() => {
                                  setSelectedUserIds((prev) =>
                                    prev.includes(v.user_id)
                                      ? prev.filter((x) => x !== v.user_id)
                                      : [...prev, v.user_id]
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
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900">{label}</div>
                                  <div className="truncate text-[11px] text-slate-500">{v.email ?? ""}</div>
                                </div>
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
                          setSelectedUserIds([]);
                          setUserQuery("");
                        }}
                        disabled={!selectedUserIds.length}
                      >
                        Limpar
                      </Button>
                      <Button type="button" variant="secondary" className="h-9 rounded-2xl" onClick={refresh}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

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
                              onSelect={() => {
                                setSelectedTags((prev) =>
                                  prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                                );
                              }}
                              className={cn("rounded-xl", checked ? "bg-[hsl(var(--byfrost-accent)/0.10)]" : "")}
                            >
                              <div className={cn("mr-2 grid h-5 w-5 place-items-center rounded-md border", checked ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent))] text-white" : "border-slate-200 bg-white")}>
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

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="h-11 rounded-2xl">
                    <MapPin className="mr-2 h-4 w-4" /> Instância
                    {instanceFilterId !== "all" && (
                      <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">1</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[320px] rounded-2xl border-slate-200 bg-white p-2">
                  <Command className="rounded-2xl border border-slate-200">
                    <CommandInput placeholder="Filtrar instâncias…" className="h-11" />
                    <CommandList className="max-h-[240px]">
                      <CommandEmpty>Nenhuma instância encontrada</CommandEmpty>
                      <CommandGroup heading="Instâncias do WhatsApp">
                        <CommandItem
                          onSelect={() => setInstanceFilterId("all")}
                          className={cn("rounded-xl", instanceFilterId === "all" ? "bg-[hsl(var(--byfrost-accent)/0.10)]" : "")}
                        >
                          <div className={cn("mr-2 grid h-5 w-5 place-items-center rounded-md border", instanceFilterId === "all" ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent))] text-white" : "border-slate-200 bg-white")}>
                            {instanceFilterId === "all" ? <Check className="h-3.5 w-3.5" /> : null}
                          </div>
                          <span className="truncate text-sm font-medium">Todas as Instâncias</span>
                        </CommandItem>
                        {(allInstancesQ.data ?? []).map((inst) => {
                          const checked = instanceFilterId === inst.id;
                          return (
                            <CommandItem
                              key={inst.id}
                              onSelect={() => setInstanceFilterId(inst.id)}
                              className={cn("rounded-xl", checked ? "bg-[hsl(var(--byfrost-accent)/0.10)]" : "")}
                            >
                              <div className={cn("mr-2 grid h-5 w-5 place-items-center rounded-md border", checked ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent))] text-white" : "border-slate-200 bg-white")}>
                                {checked ? <Check className="h-3.5 w-3.5" /> : null}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="truncate text-sm font-bold">{inst.name}</span>
                                <span className="truncate text-[10px] text-slate-500">{inst.phone_number || "Sem número"}</span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Button
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={exportConversationsCsv}
                disabled={exportingCsv}
              >
                {exportingCsv ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exportar
              </Button>

              {activeTenantId && selectedJourney ? (
                <NewLeadDialog tenantId={activeTenantId} journey={selectedJourney as any} actorUserId={user?.id ?? null} />
              ) : null}

              {activeTenantId && selectedJourney ? (
                <ImportLeadsDialog tenantId={activeTenantId} journey={selectedJourney as any} actorUserId={user?.id ?? null} />
              ) : null}

              <Button type="button" variant="secondary" className="h-11 flex-1 sm:flex-none justify-center rounded-2xl" onClick={refresh}>
                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>

          {crmJourneysQ.data?.length === 0 && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Não há nenhuma jornada marcada como CRM habilitada para este tenant.
            </div>
          )}

          {selectedJourney?.key && (
            <div className="mt-4 overflow-x-auto pb-4 snap-x snap-mandatory">
              <div className="flex w-max gap-4 px-1">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="w-[85vw] max-w-[320px] snap-center shrink-0 sm:w-[320px]"
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
                        const custId = String((c as any).customer_id || "");
                        const cust = custId ? customersQ.data?.get(custId) ?? null : null;
                        const casePhone = c.id ? casePhoneQ.data?.get(c.id) ?? null : null;
                        const unread = unreadByCase.has(c.id);

                        const titlePrimary =
                          cust?.name ??
                          casePhone ??
                          getMetaPhone((c as any).meta_json) ??
                          cust?.phone_e164 ??
                          c.title ??
                          "Caso";

                        return (
                          <Link
                            key={c.id}
                            to={`/crm/cases/${c.id}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/caseId", c.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            className={cn(
                              "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                              unread ? "border-rose-200 hover:border-rose-300" : "border-slate-200 hover:border-slate-300",
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
                                    {(c.users_profile?.display_name ?? "Responsável") +
                                      (c.users_profile?.email ? ` • ${c.users_profile.email}` : "")}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-2">
                                {unread ? (
                                  <span
                                    className="h-2.5 w-2.5 rounded-full bg-rose-600 ring-4 ring-rose-100"
                                    title="Mensagem nova"
                                    aria-label="Mensagem nova"
                                  />
                                ) : null}

                                {(c as any)?.meta_json?.lead_source === "csv_import" ? (
                                  <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                                    importado
                                  </Badge>
                                ) : null}

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