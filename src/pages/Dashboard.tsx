import { useMemo, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showError, showSuccess } from "@/utils/toast";
import {
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  ShieldAlert,
  Plus,
  LayoutList,
  Columns2,
  Download,
} from "lucide-react";
import { NewSalesOrderDialog } from "@/components/case/NewSalesOrderDialog";
import { NewTrelloCardDialog } from "@/components/trello/NewTrelloCardDialog";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types"

const DASHBOARD_VIEW_MODE_KEY_PREFIX = "dashboard_view_mode_v1:";

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
  is_chat?: boolean;
  vendors?: { display_name: string | null; phone_e164: string | null } | null;
  // Nem sempre existe FK/relacionamento exposto; então mantemos também meta_json.
  journeys?: { key: string | null; name: string | null; is_crm?: boolean } | null;
  meta_json?: any;
};

type JourneyOpt = {
  id: string;
  key: string;
  name: string;
  is_crm?: boolean;
  default_state_machine_json?: any;
};

type DebugRpc = {
  tenant_id: string;
  journey_key: string;
  journey_ids: string[];
  cases_total: number;
  by_status: Array<{ status: string; qty: number }>;
  latest: Array<{
    id: string;
    status: string;
    state: string;
    journey_id: string | null;
    meta_journey_key: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

type ReadRow = { case_id: string; last_seen_at: string };

type WaMsgLite = { case_id: string | null; occurred_at: string; from_phone: string | null };

type WaInstanceRow = { id: string; phone_number: string | null };

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

export default function Dashboard() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const { journeyKey } = useParams<{ journeyKey?: string }>();
  const qc = useQueryClient();

  const [refreshingToken, setRefreshingToken] = useState(false);
  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [newSalesOrderOpen, setNewSalesOrderOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Filtros jornada Auditoria
  const [instanceFilterId, setInstanceFilterId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

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

  // Back-compat: /app?journey=<uuid> -> /app/j/<journeys.key>
  const legacyJourneyId = useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    const id = sp.get("journey");
    return id && id.length > 10 ? id : null;
  }, [loc.search]);

  const journeyQ = useQuery({
    queryKey: ["tenant_journeys_enabled", activeTenantId],
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

      // IMPORTANT: /app não deve listar jornadas CRM.
      const opts: JourneyOpt[] = (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean)
        .filter((j: any) => !j.is_crm)
        .map((j: any) => ({
          id: j.id,
          key: j.key,
          name: j.name,
          is_crm: false,
          default_state_machine_json: j.default_state_machine_json ?? {},
        }));

      opts.sort((a, b) => a.name.localeCompare(b.name));
      return opts;
    },
  });

  const selectedKey = journeyKey ?? "";

  const selectedJourney = useMemo(() => {
    if (!selectedKey) return null;
    return (journeyQ.data ?? []).find((j) => j.key === selectedKey) ?? null;
  }, [journeyQ.data, selectedKey]);

  const isSalesOrderJourney = selectedKey === "sales_order";
  const isTrelloJourney = selectedKey === "trello";

  const isCrm = Boolean(selectedJourney?.is_crm);

  // List view (only implemented for this journey right now)
  const canChooseListView = selectedKey === "ff_flow_20260129200457";
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  useEffect(() => {
    if (!selectedKey) return;

    // Default mode
    const defaultMode: "kanban" | "list" = selectedKey === "ff_flow_20260129200457" ? "list" : "kanban";

    try {
      const saved = localStorage.getItem(DASHBOARD_VIEW_MODE_KEY_PREFIX + selectedKey);
      if (saved === "kanban" || saved === "list") setViewMode(saved);
      else setViewMode(defaultMode);
    } catch {
      setViewMode(defaultMode);
    }
  }, [selectedKey]);

  const effectiveViewMode: "kanban" | "list" = canChooseListView ? viewMode : "kanban";

  const setAndPersistViewMode = (next: "kanban" | "list") => {
    setViewMode(next);
    try {
      if (selectedKey) localStorage.setItem(DASHBOARD_VIEW_MODE_KEY_PREFIX + selectedKey, next);
    } catch {
      // ignore
    }
  };

  const exportConversationsCsv = async () => {
    if (!activeTenantId) return;
    if (exportingCsv) return;

    const rowsToExport = journeyRows; // export all cases in this journey (ignores search filter)
    const caseIds = rowsToExport.map((r) => r.id);

    if (caseIds.length === 0) {
      showError("Nenhum caso para exportar.");
      return;
    }

    setExportingCsv(true);
    try {
      const msgs: Array<{
        case_id: string | null;
        occurred_at: string;
        direction: "inbound" | "outbound";
        from_phone: string | null;
        to_phone: string | null;
        type: string;
        body_text: string | null;
        media_url: string | null;
      }> = [];

      // Chunk caseIds to avoid very large IN lists.
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
        msgs.push(...((data ?? []) as any));
      }

      const msgsByCase = new Map<string, typeof msgs>();
      for (const m of msgs) {
        const cid = String((m as any).case_id ?? "");
        if (!cid) continue;
        const arr = msgsByCase.get(cid) ?? [];
        arr.push(m);
        msgsByCase.set(cid, arr);
      }

      const caseById = new Map<string, CaseRow>();
      for (const r of rowsToExport) caseById.set(r.id, r);

      const headers = ["nome", "numero", "case_id", "conversa"]; // conversa inclui timestamps
      const out: string[] = [];
      out.push(headers.map(csvCell).join(","));

      for (const cid of caseIds) {
        const c = caseById.get(cid);
        if (!c) continue;

        const cust = isCrm ? customersQ.data?.get(String((c as any).customer_id ?? "")) : null;

        const name =
          (isCrm
            ? (cust?.name ??
              casePhoneQ.data?.get(c.id) ??
              getMetaPhone((c as any).meta_json) ??
              cust?.phone_e164 ??
              c.title ??
              "Caso")
            : c.title ?? "Caso") ?? "Caso";

        const phone =
          (isCrm
            ? (cust?.phone_e164 ?? casePhoneQ.data?.get(c.id) ?? getMetaPhone((c as any).meta_json) ?? "")
            : (getMetaPhone((c as any).meta_json) ?? "")) ?? "";

        const transcript = (msgsByCase.get(cid) ?? [])
          .map((m) => {
            const ts = new Date(m.occurred_at).toISOString();
            const dir = m.direction;
            const body = (m.body_text ?? "").trim();
            const media = m.media_url ? ` ${m.media_url}` : "";
            const fallback = `[${m.type}]${media}`;
            return `${ts} ${dir}: ${body || fallback}`;
          })
          .join("\n");

        out.push([name, phone, cid, transcript].map(csvCell).join(","));
      }

      const csv = out.join("\n");
      const fname = `conversas_${selectedKey || "journey"}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadTextFile(fname, csv, "text/csv;charset=utf-8");
      showSuccess("CSV exportado.");
    } catch (e: any) {
      showError(`Falha ao exportar CSV: ${e?.message ?? "erro"}`);
    } finally {
      setExportingCsv(false);
    }
  };

  const pickFirstJourney = () => {
    const first = journeyQ.data?.[0];
    if (!first?.key) return;
    nav(`/app/j/${encodeURIComponent(first.key)}`, { replace: true });
  };

  useEffect(() => {
    if (!activeTenantId) return;
    if (!journeyQ.data?.length) return;

    // 1) Se veio um ?journey antigo (uuid), tenta mapear para key
    if (!journeyKey && legacyJourneyId) {
      const match = (journeyQ.data ?? []).find((j) => j.id === legacyJourneyId);
      if (match?.key) {
        nav(`/app/j/${encodeURIComponent(match.key)}`, { replace: true });
        return;
      }
    }

    // 2) Se não tem journeyKey na rota, manda para a primeira
    if (!journeyKey) {
      pickFirstJourney();
      return;
    }

    // 3) Se a key não existe mais (ex: após reset), volta para a primeira
    if (journeyKey && !selectedJourney) {
      pickFirstJourney();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, journeyQ.data, journeyKey, legacyJourneyId]);

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [selectedJourney]);

  // Para debug e confiabilidade pós-reset:
  // - buscamos os casos do tenant (respeita RLS)
  // - filtramos por key (preferência: journeys.key; fallback: meta_json.journey_key)
  const casesQ = useQuery({
    queryKey: ["cases_by_tenant", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // NOTE: "cases" possui mais de uma FK para "vendors"; precisamos desambiguar o embed.
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,title,status,state,created_at,updated_at,assigned_vendor_id,is_chat,vendors:vendors!cases_assigned_vendor_id_fkey(display_name,phone_e164),journeys:journeys!cases_journey_id_fkey(key,name,is_crm),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  // 1) Base: casos desta jornada (sem busca)
  const journeyRows = useMemo(() => {
    const rows = casesQ.data ?? [];
    if (!selectedKey) return [] as CaseRow[];

    return rows.filter((r) => {
      const keyFromJoin = r.journeys?.key ?? null;
      const keyFromMeta = (r.meta_json as any)?.journey_key ?? null;

      if (keyFromJoin && keyFromJoin === selectedKey) return true;
      if (keyFromMeta && keyFromMeta === selectedKey) return true;

      // fallback adicional por journey_id quando a jornada selecionada foi encontrada
      if (selectedJourney?.id && r.journey_id && r.journey_id === selectedJourney.id) return true;

      return false;
    });
  }, [casesQ.data, selectedKey, selectedJourney?.id]);

  // 2) Clientes (somente CRM)
  const customerIds = useMemo(() => {
    if (!isCrm) return [] as string[];
    const ids = new Set<string>();
    for (const r of journeyRows) {
      const cid = String((r as any).customer_id ?? "");
      if (cid && cid.length > 10) ids.add(cid);
    }
    return Array.from(ids);
  }, [journeyRows, isCrm]);

  const customersQ = useQuery({
    queryKey: ["customers_by_ids", activeTenantId, customerIds.join(",")],
    enabled: Boolean(activeTenantId && isCrm && customerIds.length),
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

  const caseIdsForLookup = useMemo(() => {
    if (!isCrm) return [] as string[];
    return journeyRows.map((r) => r.id);
  }, [journeyRows, isCrm]);

  const casePhoneQ = useQuery({
    queryKey: ["crm_case_phone_fallback", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && isCrm && caseIdsForLookup.length),
    staleTime: 20_000,
    queryFn: async () => {
      // Best-effort: tenta pegar um número relacionado ao case na criação (ex: case_fields.phone)
      const { data, error } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        // NOTE: case_fields não tem tenant_id; o RLS já valida via cases
        .in("case_id", caseIdsForLookup)
        .in("key", ["whatsapp", "phone", "customer_phone"])
        .limit(2000);
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

  // 3) Busca + Filtros Extras (Instância e Data)
  const filteredRows = useMemo(() => {
    let base = journeyRows;

    // Filtro de Instância
    if (instanceFilterId !== "all") {
      base = base.filter((r) => {
        // Cases table does not have instance_id directly sometimes, but it might be in meta_json.
        // However, wa_messages (recent inbound) is linked to instance.
        // For audit, if a case was opened by an instance, we should ideally know which one.
        const instId = (r.meta_json as any)?.instance_id || (r.meta_json as any)?.wa_instance_id;
        return instId === instanceFilterId;
      });
    }

    // Filtro de Datas
    if (startDate) {
      const start = new Date(startDate).getTime();
      base = base.filter((r) => new Date(r.created_at).getTime() >= start);
    }
    if (endDate) {
      // End date normally inclusive of the day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const endMs = end.getTime();
      base = base.filter((r) => new Date(r.created_at).getTime() <= endMs);
    }

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter((r) => {
      const cust = isCrm ? customersQ.data?.get(String((r as any).customer_id ?? "")) : null;
      const metaPhone = getMetaPhone(r.meta_json);
      const fieldPhone = isCrm ? casePhoneQ.data?.get(r.id) : null;

      const t = `${r.title ?? ""} ${(r.vendors?.display_name ?? "")} ${(r.vendors?.phone_e164 ?? "")} ${cust?.name ?? ""} ${cust?.phone_e164 ?? ""} ${cust?.email ?? ""} ${metaPhone ?? ""} ${fieldPhone ?? ""}`.toLowerCase();

      // Busca por número exata ou parcial sem formatação
      const cleanQ = qq.replace(/\D/g, "");
      if (cleanQ && (
        (metaPhone || "").replace(/\D/g, "").includes(cleanQ) ||
        (fieldPhone || "").replace(/\D/g, "").includes(cleanQ) ||
        (cust?.phone_e164 || "").replace(/\D/g, "").includes(cleanQ)
      )) return true;

      return t.includes(qq);
    });
  }, [journeyRows, q, isCrm, customersQ.data, casePhoneQ.data, instanceFilterId, startDate, endDate]);

  const visibleCaseIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);

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
    queryKey: ["case_last_inbound", activeTenantId, visibleCaseIds.join(",")],
    enabled: Boolean(activeTenantId && visibleCaseIds.length),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,from_phone")
        .eq("tenant_id", activeTenantId!)
        .eq("direction", "inbound")
        .in("case_id", visibleCaseIds)
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
      if (instPhone && samePhoneLoose(instPhone, (row as any).from_phone)) continue;
      if (!m.has(cid)) m.set(cid, row.occurred_at);
    }
    return m;
  }, [lastInboundQ.data, instanceQ.data?.phone_number]);

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

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRows) {
      const k = String(r.status ?? "");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  // Diagnóstico "verdade do banco" (SECURITY DEFINER) — detecta casos mesmo quando o front não enxerga via RLS.
  const debugRpcQ = useQuery({
    queryKey: ["debug_cases_for_tenant_journey", activeTenantId, selectedKey],
    enabled: Boolean(activeTenantId && selectedKey),
    refetchInterval: 7000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("debug_cases_for_tenant_journey", {
        p_tenant_id: activeTenantId!,
        p_journey_key: selectedKey,
      });
      if (error) throw error;
      return data as any as DebugRpc;
    },
  });

  // Diagnóstico do lado do banco: como o Postgres está vendo seu JWT?
  const rlsDiagQ = useQuery({
    queryKey: ["rls_diag", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [claimsRes, superRes, panelRes] = await Promise.all([
        supabase.rpc("jwt_claims"),
        supabase.rpc("is_super_admin"),
        supabase.rpc("is_panel_user", { p_tenant_id: activeTenantId! }),
      ]);

      return {
        jwtClaims: claimsRes.error ? null : (claimsRes.data as any),
        jwtClaimsError: claimsRes.error ? claimsRes.error.message : null,
        isSuperAdminDb: superRes.error ? null : (superRes.data as any),
        isSuperAdminDbError: superRes.error ? superRes.error.message : null,
        isPanelUserDb: panelRes.error ? null : (panelRes.data as any),
        isPanelUserDbError: panelRes.error ? panelRes.error.message : null,
      };
    },
  });

  const pendQ = useQuery({
    queryKey: ["pendencies_open", activeTenantId, filteredRows.map((c) => c.id).join(",")],
    enabled: Boolean(activeTenantId && filteredRows.length),
    refetchInterval: 7000,
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

  const listStateOptions = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));
    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));
    const all = Array.from(new Set([...baseStates, ...extras].filter(Boolean)));

    return all.map((st) => ({
      value: st,
      label: getStateLabel(selectedJourney as any, st) || titleizeState(st),
    }));
  }, [states, filteredRows, selectedJourney]);

  const listRows = useMemo(() => {
    const sortCases = (a: CaseRow, b: CaseRow) => {
      const au = unreadByCase.has(a.id);
      const bu = unreadByCase.has(b.id);
      if (au !== bu) return au ? -1 : 1;

      const at = lastInboundAtByCase.get(a.id) ?? a.updated_at;
      const bt = lastInboundAtByCase.get(b.id) ?? b.updated_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    };

    return [...filteredRows].sort(sortCases);
  }, [filteredRows, unreadByCase, lastInboundAtByCase]);

  const shouldShowInvalidJourneyBanner =
    Boolean(journeyKey) && Boolean(journeyQ.data?.length) && !selectedJourney;

  const tokenLooksSuperAdminUi = Boolean(
    (user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin
  );

  const mismatch =
    selectedKey && debugRpcQ.data && debugRpcQ.data.cases_total > 0 && filteredRows.length === 0;

  const refreshToken = async () => {
    setRefreshingToken(true);
    try {
      await supabase.auth.refreshSession();
      await Promise.all([
        journeyQ.refetch(),
        casesQ.refetch(),
        pendQ.refetch(),
        debugRpcQ.refetch(),
        rlsDiagQ.refetch(),
      ]);
    } finally {
      setRefreshingToken(false);
    }
  };

  const { transitionState, updating: updatingCaseState } = useJourneyTransition();

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId) return;
    if (movingCaseId) return;
    if (updatingCaseState) return;

    // Find current state
    const currentCase = filteredRows.find(c => c.id === caseId);
    if (!currentCase) return;
    const oldState = currentCase.state;
    if (oldState === nextState) return;

    setMovingCaseId(caseId);

    try {
      // Pass journeyConfig from selectedJourney (or from row if needed, but Dashboard assumes single journey context usually)
      const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;

      await transitionState(caseId, oldState, nextState, journeyConfig);

      // Invalidation handled by hook, but Dashboard might need specific invalidations?
      // Hook invalidates: case, timeline, cases_by_tenant, crm_cases_by_tenant.
      // Dashboard uses: cases_by_tenant. So we are good.
    } catch (e: any) {
      // Toast already shown
    } finally {
      setMovingCaseId(null);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Casos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Agora a jornada faz parte da rota: <span className="font-medium">/app/j/&lt;slug&gt;</span>.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="hidden items-center gap-2 md:flex">
                <div className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-2 text-xs font-medium text-[hsl(var(--byfrost-accent))]">
                  <Sparkles className="mr-1 inline h-4 w-4" /> explicabilidade ativa
                </div>
              </div>

              {isSalesOrderJourney && activeTenantId && selectedJourney?.id ? (
                <Button
                  className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                  onClick={() => setNewSalesOrderOpen(true)}
                  title="Criar novo pedido (manual ou OCR)"
                >
                  <Plus className="mr-2 h-4 w-4" /> Novo pedido
                </Button>
              ) : null}

              {isTrelloJourney && activeTenantId && selectedJourney?.id ? (
                <NewTrelloCardDialog tenantId={activeTenantId} journeyId={selectedJourney.id} />
              ) : null}

              {canChooseListView ? (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-1 shadow-sm">
                  <Button
                    type="button"
                    variant={effectiveViewMode === "list" ? "default" : "secondary"}
                    className={cn(
                      "h-9 rounded-2xl",
                      effectiveViewMode === "list"
                        ? "bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                        : ""
                    )}
                    onClick={() => setAndPersistViewMode("list")}
                    title="Visualização em lista"
                  >
                    <LayoutList className="mr-2 h-4 w-4" /> Lista
                  </Button>
                  <Button
                    type="button"
                    variant={effectiveViewMode === "kanban" ? "default" : "secondary"}
                    className={cn(
                      "h-9 rounded-2xl",
                      effectiveViewMode === "kanban"
                        ? "bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                        : ""
                    )}
                    onClick={() => setAndPersistViewMode("kanban")}
                    title="Visualização em colunas (kanban)"
                  >
                    <Columns2 className="mr-2 h-4 w-4" /> Kanban
                  </Button>
                </div>
              ) : null}

              {selectedKey ? (
                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={exportConversationsCsv}
                  disabled={exportingCsv}
                  title="Exporta as conversas (WhatsApp) dos casos desta jornada"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {exportingCsv ? "Exportando…" : "Exportar conversas (CSV)"}
                </Button>
              ) : null}

              <Button
                variant="secondary"
                className="h-10 rounded-2xl"
                onClick={() => {
                  journeyQ.refetch();
                  casesQ.refetch();
                  pendQ.refetch();
                  debugRpcQ.refetch();
                  rlsDiagQ.refetch();
                  lastInboundQ.refetch();
                  readsQ.refetch();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
              </Button>

              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-700">Jornada</div>
                    <select
                      value={selectedKey}
                      onChange={(e) => {
                        const nextKey = e.target.value;
                        if (!nextKey) return;
                        nav(`/app/j/${encodeURIComponent(nextKey)}`);
                      }}
                      className="mt-1 h-9 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    >
                      {(journeyQ.data ?? []).length === 0 ? (
                        <option value="">(nenhuma jornada habilitada)</option>
                      ) : (
                        (journeyQ.data ?? []).map((j) => (
                          <option key={j.key} value={j.key}>
                            {j.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <Button
                    variant="secondary"
                    className="h-9 rounded-2xl"
                    onClick={pickFirstJourney}
                    disabled={!journeyQ.data?.length}
                    title="Voltar para o fluxo principal"
                  >
                    Principal
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {isSalesOrderJourney && activeTenantId && selectedJourney?.id ? (
            <NewSalesOrderDialog
              open={newSalesOrderOpen}
              onOpenChange={setNewSalesOrderOpen}
              tenantId={activeTenantId}
              journeyId={selectedJourney.id}
            />
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="relative flex-1">
              <div className="mb-1 text-[11px] font-semibold text-slate-700">Busca rápida</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Título, telefone, vendedor…"
                  className="h-11 rounded-2xl pl-10"
                />
              </div>
            </div>

            {selectedKey === "ff_flow_20260129200457" && (
              <>
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-slate-700">Instância</div>
                  <select
                    value={instanceFilterId}
                    onChange={(e) => setInstanceFilterId(e.target.value)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  >
                    <option value="all">Todas as instâncias</option>
                    {(allInstancesQ.data ?? []).map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} ({inst.phone_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-slate-700">Data Inicial</div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-slate-700">Data Final</div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  />
                </div>
              </>
            )}

            <div className="hidden rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm md:block">
              Arraste para mudar de etapa.
            </div>
          </div>

          {shouldShowInvalidJourneyBanner && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              O slug <span className="font-semibold">{journeyKey}</span> não existe (ou foi resetado). Vou te levar
              para o fluxo principal.
            </div>
          )}

          {mismatch && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <div className="min-w-0">
                  O banco diz que existem <span className="font-semibold">{debugRpcQ.data!.cases_total}</span> case(s)
                  nesse fluxo, mas a UI não está enxergando.
                  <div className="mt-1 text-xs text-amber-900/80">
                    Isso é quase sempre <span className="font-semibold">RLS (policies)</span> + token sem o claim
                    certo.
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={refreshToken}
                  disabled={refreshingToken}
                >
                  {refreshingToken ? "Atualizando token…" : "Atualizar token (RLS)"}
                </Button>
                <div className="text-xs text-amber-900/80">
                  user.app_metadata: {tokenLooksSuperAdminUi ? "super-admin" : "(sem super-admin)"}
                  {rlsDiagQ.data?.isSuperAdminDbError
                    ? ` • db.is_super_admin erro: ${rlsDiagQ.data.isSuperAdminDbError}`
                    : typeof rlsDiagQ.data?.isSuperAdminDb === "boolean"
                      ? ` • db.is_super_admin: ${rlsDiagQ.data.isSuperAdminDb ? "true" : "false"}`
                      : ""}
                  {rlsDiagQ.data?.isPanelUserDbError
                    ? ` • db.is_panel_user erro: ${rlsDiagQ.data.isPanelUserDbError}`
                    : typeof rlsDiagQ.data?.isPanelUserDb === "boolean"
                      ? ` • db.is_panel_user: ${rlsDiagQ.data.isPanelUserDb ? "true" : "false"}`
                      : ""}
                </div>
              </div>

              {debugRpcQ.data?.latest?.length ? (
                <div className="mt-3 text-xs text-amber-900/80">
                  Últimos cases no fluxo (do banco):
                  <div className="mt-1 flex flex-wrap gap-2">
                    {debugRpcQ.data.latest.slice(0, 5).map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full border border-amber-200 bg-white/70 px-2 py-1 font-medium"
                        title={`${c.status} • ${c.state}`}
                      >
                        {c.id.slice(0, 8)}…
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!selectedKey && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Habilite ao menos uma jornada no Admin.
            </div>
          )}

          {selectedKey && (
            <div className="mt-4 overflow-x-auto pb-1">
              {effectiveViewMode === "list" ? (
                <div className="min-w-[980px]">
                  <div className="rounded-[24px] border border-slate-200 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[34%]">Caso</TableHead>
                          <TableHead className="w-[18%]">Vendedor</TableHead>
                          <TableHead className="w-[20%]">Etapa</TableHead>
                          <TableHead className="w-[10%]">Pendências</TableHead>
                          <TableHead className="w-[10%]">Atualizado</TableHead>
                          <TableHead className="w-[8%]">Status</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {listRows.map((c) => {
                          const pend = pendQ.data?.get(c.id);
                          const unread = unreadByCase.has(c.id);
                          const ageMin = minutesAgo(c.updated_at);
                          const cust = isCrm ? customersQ.data?.get(String((c as any).customer_id ?? "")) : null;

                          const titlePrimary =
                            isCrm
                              ? (cust?.name ??
                                casePhoneQ.data?.get(c.id) ??
                                getMetaPhone((c as any).meta_json) ??
                                cust?.phone_e164 ??
                                c.title ??
                                "Caso")
                              : c.title ?? "Caso";

                          return (
                            <TableRow key={c.id} className="hover:bg-slate-50/70">
                              <TableCell className="py-3">
                                <div className="flex items-start gap-3">
                                  <div className="pt-1">
                                    {unread ? (
                                      <span
                                        className="block h-2.5 w-2.5 rounded-full bg-rose-600 ring-4 ring-rose-100"
                                        title="Mensagem nova"
                                        aria-label="Mensagem nova"
                                      />
                                    ) : (
                                      <span className="block h-2.5 w-2.5 rounded-full bg-slate-200" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <Link
                                      to={`/cases/${c.id}`}
                                      className="block truncate text-sm font-semibold text-slate-900 hover:underline"
                                      title={titlePrimary}
                                    >
                                      {titlePrimary}
                                    </Link>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                      <span className="font-mono">{c.id.slice(0, 8)}…</span>
                                      {pend?.need_location ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                                          <MapPin className="h-3.5 w-3.5" /> localização
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="py-3">
                                <div className="text-sm text-slate-800">
                                  {c.vendors?.display_name ?? "—"}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {c.vendors?.phone_e164 ?? ""}
                                </div>
                              </TableCell>

                              <TableCell className="py-3">
                                <select
                                  value={c.state}
                                  onChange={(e) => updateCaseState(c.id, e.target.value)}
                                  disabled={Boolean(movingCaseId)}
                                  className={cn(
                                    "h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none",
                                    "focus:border-[hsl(var(--byfrost-accent)/0.45)]",
                                    movingCaseId === c.id ? "opacity-60" : ""
                                  )}
                                >
                                  {listStateOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </TableCell>

                              <TableCell className="py-3">
                                {pend?.open ? (
                                  <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                                    {pend.open}
                                  </Badge>
                                ) : (
                                  <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                    0
                                  </Badge>
                                )}
                              </TableCell>

                              <TableCell className="py-3">
                                <div className="inline-flex items-center gap-1 text-xs text-slate-600">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  {ageMin} min
                                </div>
                              </TableCell>

                              <TableCell className="py-3">
                                <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                                  {c.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {listRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-600">
                              Nenhum caso encontrado.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    Dica: use a busca acima para filtrar. Para abrir, clique no nome do caso.
                  </div>
                </div>
              ) : (
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

                      <div
                        className={cn(
                          "mt-2 space-y-3 rounded-[24px] p-2",
                          col.key !== "__other__" ? "bg-slate-50/60 border border-dashed border-slate-200" : ""
                        )}
                      >
                        {col.items.map((c) => {
                          const pend = pendQ.data?.get(c.id);
                          const age = minutesAgo(c.updated_at);
                          const isMoving = movingCaseId === c.id;
                          const unread = unreadByCase.has(c.id);
                          const cust = isCrm ? customersQ.data?.get(String((c as any).customer_id ?? "")) : null;

                          // Para CRM: o título do card vira o nome do cliente; se não tiver,
                          // usa o WhatsApp relacionado ao case no ato de criação (case_fields/meta_json).
                          const titlePrimary =
                            isCrm
                              ? (cust?.name ??
                                casePhoneQ.data?.get(c.id) ??
                                getMetaPhone((c as any).meta_json) ??
                                cust?.phone_e164 ??
                                c.title ??
                                "Caso")
                              : c.title ?? "Caso";

                          return (
                            <Link
                              key={c.id}
                              to={`/cases/${c.id}`}
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
                                    {(c.vendors?.display_name ?? "Vendedor") +
                                      (c.vendors?.phone_e164 ? ` • ${c.vendors.phone_e164}` : "")}
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
                            {col.key !== "__other__" ? "Solte um card aqui para mover." : "Sem cards aqui."}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {casesQ.isError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro ao carregar casos: {(casesQ.error as any)?.message ?? ""}
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}