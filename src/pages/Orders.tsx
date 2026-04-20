import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { titleizeState } from "@/lib/utils";
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
import {
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Plus,
  LayoutList,
  Columns2,
  Download,
  Package,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight,
  TrendingUp,
  CreditCard,
  DollarSign,
  Briefcase,
  Users2,
  Calendar as CalendarIcon,
  Check,
  XCircle
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parse, isSameDay, parseISO, isWithinInterval, startOfDay, endOfDay, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NewSalesOrderDialog } from "@/components/case/NewSalesOrderDialog";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StateMachine } from "@/lib/journeys/types"
import { GlobalJourneyLogsDialog } from "@/components/case/GlobalJourneyLogsDialog";
import { checkTransitionBlocks } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { ImportOrdersDialog } from "@/components/case/ImportOrdersDialog";

const ORDERS_VIEW_MODE_KEY = "orders_view_mode_v1";
const SALES_ORDER_KEY = "sales_order";

type CaseRow = {
  id: string;
  journey_id: string | null;
  customer_id?: string | null;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  is_chat?: boolean;
  users_profile?: { display_name: string | null; email: string | null } | null;
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
}

const formatMoneyBRL = (v: number) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
};

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
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

export default function Orders() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const nav = useNavigate();
  const { prefs } = useTheme();

  const [q, setQ] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date | undefined }>({ 
    from: startOfMonth(new Date()), 
    to: endOfMonth(new Date()) 
  });
  const [selectedSellerId, setSelectedSellerId] = useState<string>("all");
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<string>>(new Set());
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    nextStateName: string;
    reasons: any[];
  }>({ open: false, nextStateName: "", reasons: [] });
  const [newSalesOrderOpen, setNewSalesOrderOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  useEffect(() => {
    const saved = localStorage.getItem(ORDERS_VIEW_MODE_KEY);
    if (saved === "kanban" || saved === "list") setViewMode(saved);
  }, []);

  const setAndPersistViewMode = (next: "kanban" | "list") => {
    setViewMode(next);
    localStorage.setItem(ORDERS_VIEW_MODE_KEY, next);
  };

  const journeyQ = useQuery({
    queryKey: ["tenant_orders_journey", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select(`
          journey_id, 
          journeys!inner(id,key,name,is_crm,default_state_machine_json)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.key", SALES_ORDER_KEY)
        .eq("enabled", true)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;

      const j = (data as any).journeys;
      return {
        id: j.id,
        key: j.key,
        name: j.name,
        is_crm: Boolean(j.is_crm),
        default_state_machine_json: j.default_state_machine_json ?? {},
      } as JourneyOpt;
    },
  });

  const selectedJourney = journeyQ.data;

  const casesQ = useQuery({
    queryKey: ["cases_orders", activeTenantId],
    enabled: Boolean(activeTenantId && selectedJourney),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile!fk_cases_users_profile(display_name,email),journeys:journeys!cases_journey_id_fkey(key,name,is_crm),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("updated_at", { ascending: false })
        .limit(5000);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const journeyRows = casesQ.data ?? [];

  const customerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of journeyRows) {
      const cid = String((r as any).customer_id ?? "");
      if (cid && cid.length > 10) ids.add(cid);
    }
    return Array.from(ids);
  }, [journeyRows]);

  const customersQ = useQuery({
    queryKey: ["customers_orders", activeTenantId, customerIds.length, customerIds[0], dateRange.from.getTime(), dateRange.to?.getTime()],
    enabled: Boolean(activeTenantId && customerIds.length),
    queryFn: async () => {
      const CHUNK_SIZE = 20;
      const chunks: string[][] = [];
      for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
        chunks.push(customerIds.slice(i, i + CHUNK_SIZE));
      }

      const allCustomers: any[] = [];
      await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("customer_accounts")
          .select("id,phone_e164,name,email")
          .eq("tenant_id", activeTenantId!)
          .in("id", chunk)
          .is("deleted_at", null);
        if (error) throw error;
        if (data) allCustomers.push(...data);
      }));

      const m = new Map<string, any>();
      for (const c of allCustomers) m.set((c as any).id, c);
      return m;
    },
  });
  
  const usersQ = useQuery({
    queryKey: ["tenant_users_profiles", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
  });

  const parseSafeDate = (input: string | null | undefined, fallback: string | Date): Date => {
    if (!input) return new Date(fallback);
    let s = String(input ?? "").trim().replace(/\s/g, "");
    if (!s || s === "undefined" || s === "null") return new Date(fallback);

    // 0. Try YYYY-MM-DD (ISO)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = parseISO(s);
      if (!isNaN(d.getTime())) return d;
    }

    // Handle double slashes
    s = s.replace(/\/\/+/g, "/");

    // 1. Try DD/MM/YYYY or DD/MM/YY (standard or with separators like . -)
    const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (slashMatch) {
      let [_, d, m, y] = slashMatch;
      if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // 2. Try typo DD/MMYYYY (like 31/032026)
    const typoMatch1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(\d{4})$/);
    if (typoMatch1) {
      const [_, d, m, y] = typoMatch1;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // 3. Try typo DDMMYYYY (like 31032026)
    const typoMatch2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (typoMatch2) {
      const [_, d, m, y] = typoMatch2;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // 2. Try parse with date-fns for standard formats
    try {
      const d = parse(s, "dd/MM/yyyy", new Date());
      if (!isNaN(d.getTime())) return d;
    } catch {}

    // 3. Fallback to native Date constructor
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
    } catch {}

    return new Date(fallback);
  };

  const caseIdsForLookup = useMemo(() => {
    const ids = journeyRows.map((r) => r.id).filter(id => typeof id === "string" && id.length > 30);
    return Array.from(new Set(ids));
  }, [journeyRows]);

  const caseDataQ = useQuery({
    queryKey: ["orders_case_fields_extended", activeTenantId, journeyRows.length, journeyRows[0]?.id, dateRange.from.getTime(), dateRange.to?.getTime()],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    queryFn: async () => {
      const CHUNK_SIZE = 10;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIdsForLookup.length; i += CHUNK_SIZE) {
        chunks.push(caseIdsForLookup.slice(i, i + CHUNK_SIZE));
      }

      const allFields: any[] = [];
      const allItems: any[] = [];

      await Promise.all(chunks.map(async (chunk) => {
        const [fRes, iRes] = await Promise.all([
          supabase
            .from("case_fields")
            .select("case_id,key,value_text")
            .in("case_id", chunk)
            .in("key", ["whatsapp", "phone", "customer_phone", "sale_date_text", "billing_status", "total_value_raw", "obs", "payment_method", "city"])
            .limit(1000),
          supabase
            .from("case_items")
            .select("case_id,total")
            .in("case_id", chunk)
        ]);

        if (fRes.error) throw fRes.error;
        if (iRes.error) throw iRes.error;

        if (fRes.data) allFields.push(...fRes.data);
        if (iRes.data) allItems.push(...iRes.data);
      }));

      const fieldMap = new Map<string, any>();
      for (const r of allFields) {
        const cid = r.case_id;
        if (!fieldMap.has(cid)) fieldMap.set(cid, {});
        fieldMap.get(cid)[r.key] = r.value_text;
      }

      const totalsMap = new Map<string, number>();
      const itemCountsMap = new Map<string, number>();
      for (const itm of allItems) {
        const cid = itm.case_id;
        const val = Number(itm.total ?? 0);
        totalsMap.set(cid, (totalsMap.get(cid) ?? 0) + val);
        itemCountsMap.set(cid, (itemCountsMap.get(cid) ?? 0) + 1);
      }

      return { fields: fieldMap, totals: totalsMap, itemCounts: itemCountsMap };
    },
  });

  const updateBillingStatus = async (caseId: string, status: string) => {
    try {
      const { error } = await supabase
        .from("case_fields")
        .upsert({
          case_id: caseId,
          key: "billing_status",
          value_text: status,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel"
        }, { onConflict: "case_id,key" });

      if (error) throw error;
      showSuccess(`Status de pagamento: ${status}`);
      caseDataQ.refetch();
    } catch (e: any) {
      showError(`Falha ao atualizar status: ${e.message}`);
    }
  };

  const filteredRows = useMemo(() => {
    let rows = journeyRows;

    // Filter by seller
    if (selectedSellerId !== "all") {
      rows = rows.filter(r => r.assigned_user_id === selectedSellerId);
    }

    // Filter by Date Range
    rows = rows.filter(r => {
      const f = caseDataQ.data?.fields.get(r.id);
      const saleDateText = f?.sale_date_text;
      
      const d = parseSafeDate(saleDateText, r.created_at);
      
      if (!dateRange.from) return true;
      const start = startOfDay(dateRange.from);
      const end = endOfDay(dateRange.to || dateRange.from);
      
      return isWithinInterval(d, { start, end });
    });

    if (selectedPaymentMethods.size > 0) {
      rows = rows.filter(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        return selectedPaymentMethods.has(String(f?.payment_method ?? "").trim());
      });
    }

    if (selectedCities.size > 0) {
      rows = rows.filter(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        return selectedCities.has(String(f?.city ?? "").trim());
      });
    }

    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((r) => {
        const cust = customersQ.data?.get(r.customer_id!);
        const extId = r.meta_json?.external_id || "";
        const f = caseDataQ.data?.fields.get(r.id);
        const phones = `${f?.whatsapp ?? ""} ${f?.phone ?? ""} ${f?.customer_phone ?? ""}`;
        const text = `${r.title} ${r.users_profile?.display_name} ${cust?.name} ${cust?.phone_e164} ${phones} ${extId}`.toLowerCase();
        return text.includes(qq);
      });
    }

    return rows;
  }, [journeyRows, q, dateRange, selectedSellerId, selectedPaymentMethods, selectedCities, customersQ.data, caseDataQ.data]);

  const paymentOptions = useMemo(() => {
    const opts = new Set<string>();
    caseDataQ.data?.fields.forEach(f => {
      if (f.payment_method) opts.add(String(f.payment_method).trim());
    });
    return Array.from(opts).filter(Boolean).sort();
  }, [caseDataQ.data]);

  const cityOptions = useMemo(() => {
    const opts = new Set<string>();
    caseDataQ.data?.fields.forEach(f => {
      if (f.city) opts.add(String(f.city).trim());
    });
    return Array.from(opts).filter(Boolean).sort();
  }, [caseDataQ.data]);

  const stats = useMemo(() => {
    let totalValue = 0;
    let pendingValue = 0;
    let invoicedValue = 0;
    let canceledValue = 0;
    let invoicedCount = 0;

    filteredRows.forEach(r => {
      const val = caseDataQ.data?.totals.get(r.id) ?? 0;
      const f = caseDataQ.data?.fields.get(r.id);
      const billingStatus = (f?.billing_status ?? "Pendente").toLowerCase();

      totalValue += val;
      if (billingStatus.includes("pago") || billingStatus.includes("faturado")) {
        invoicedValue += val;
        invoicedCount++;
      } else if (billingStatus.includes("canc")) {
        canceledValue += val;
      } else {
        pendingValue += val;
      }
    });

    const avgTicket = invoicedCount > 0 ? invoicedValue / invoicedCount : 0;

    const invoicedPct = totalValue > 0 ? (invoicedValue / totalValue) * 100 : 0;
    const pendingPct = totalValue > 0 ? (pendingValue / totalValue) * 100 : 0;
    const canceledPct = totalValue > 0 ? (canceledValue / totalValue) * 100 : 0;

    return { totalValue, pendingValue, invoicedValue, canceledValue, avgTicket, invoicedPct, pendingPct, canceledPct };
  }, [filteredRows, caseDataQ.data]);

  const chartData = useMemo(() => {
    const start = startOfDay(dateRange.from || new Date());
    const end = endOfDay(dateRange.to || dateRange.from || new Date());
    const days = eachDayOfInterval({ start, end });

    return days.map(d => {
      let dailyTotal = 0;
      filteredRows.forEach(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        const saleDateText = f?.sale_date_text;
        const saleDate = parseSafeDate(saleDateText, r.created_at);

        if (isSameDay(saleDate, d)) {
          dailyTotal += caseDataQ.data?.totals.get(r.id) ?? 0;
        }
      });

      return {
        day: format(d, "dd"),
        total: dailyTotal,
      };
    });
  }, [filteredRows, dateRange, caseDataQ.data]);

  const pendQ = useQuery({
    queryKey: ["orders_pendencies", activeTenantId, filteredRows.length, filteredRows[0]?.id, dateRange.from.getTime(), dateRange.to?.getTime()],
    enabled: Boolean(activeTenantId && filteredRows.length),
    queryFn: async () => {
      const ids = Array.from(new Set(filteredRows.map((c) => c.id).filter(id => typeof id === "string" && id.length > 30)));
      const CHUNK_SIZE = 10;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        chunks.push(ids.slice(i, i + CHUNK_SIZE));
      }

      const allPendencies: any[] = [];
      await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("pendencies")
          .select("case_id,type,status")
          .in("case_id", chunk)
          .eq("status", "open");
        if (error) throw error;
        if (data) allPendencies.push(...data);
      }));

      const byCase = new Map<string, { open: number; need_location: boolean }>();
      for (const p of allPendencies) {
        const cid = (p as any).case_id;
        const cur = byCase.get(cid) ?? { open: 0, need_location: false };
        cur.open++;
        if ((p as any).type === "need_location") cur.need_location = true;
        byCase.set(cid, cur);
      }
      return byCase;
    },
  });

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    return Array.from(new Set(st.map(s => String(s)).filter(Boolean)));
  }, [selectedJourney]);

  const columns = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));
    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));
    const all = [...baseStates, ...(extras.length ? ["__other__"] : [])];

    return all.map((st) => {
      const items = filteredRows.filter(r => st === "__other__" ? !known.has(r.state) : r.state === st)
        .sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return {
        key: st,
        label: st === "__other__" ? "Outros" : getStateLabel(selectedJourney as any, st),
        items,
      };
    });
  }, [filteredRows, states, selectedJourney]);

  const { transitionState, updating: updatingCaseState } = useJourneyTransition();

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId || movingCaseId || updatingCaseState) return;
    const currentCase = filteredRows.find(c => c.id === caseId);
    if (!currentCase || currentCase.state === nextState) return;

    setMovingCaseId(caseId);
    try {
      const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;
      const blocks = await checkTransitionBlocks(supabase, activeTenantId, caseId, currentCase.state, nextState, journeyConfig);
      if (blocks.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons: blocks });
        return;
      }
      await transitionState(caseId, currentCase.state, nextState, journeyConfig);
    } finally {
      setMovingCaseId(null);
    }
  };

  const exportOrdersCsv = async () => {
    if (!activeTenantId || exportingCsv || filteredRows.length === 0) return;
    setExportingCsv(true);
    try {
      const headers = [
        "id", "id_externo", "data_venda", "cliente_nome", "cliente_whatsapp", 
        "cliente_email", "cliente_cpf_cnpj", "cliente_endereco", "cliente_cidade", 
        "vendedor_email", "pagamento_condicoes", "forma_pagamento", "valor_sinal", 
        "vencimento", "status_faturamento", "item_codigo", "item_descricao", 
        "item_qtd", "item_valor_unit", "item_desconto_pct", "obs"
      ];
      
      const csvRows = [headers.map(csvCell).join(",")];
      
      // We need item-level data, which we have in caseDataQ.data
      // But we need the detailed items for each case.
      // Since caseDataQ only gets totals, we might need a more detailed fetch for items if we want per-item export.
      // However, the import supports multiple items per case by repeating rows.
      // Let's fetch all items for the filtered cases.
      
      const filteredCaseIds = filteredRows.map(r => r.id);
      const { data: allItems, error: itemsErr } = await supabase
        .from("case_items")
        .select("*")
        .in("case_id", filteredCaseIds);
      
      if (itemsErr) throw itemsErr;
      
      const itemsByCase = new Map<string, any[]>();
      (allItems ?? []).forEach(it => {
        const arr = itemsByCase.get(it.case_id) ?? [];
        arr.push(it);
        itemsByCase.set(it.case_id, arr);
      });

      filteredRows.forEach(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        const cust = customersQ.data?.get(r.customer_id!);
        const items = itemsByCase.get(r.id) ?? [{}]; // At least one row even if no items
        
        items.forEach(it => {
          const row = [
            r.id,
            r.meta_json?.external_id ?? "",
            f?.sale_date_text ?? format(new Date(r.created_at), "yyyy-MM-dd"),
            cust?.name ?? r.title ?? "",
            cust?.phone_e164 ?? f?.whatsapp ?? f?.phone ?? "",
            cust?.email ?? f?.email ?? "",
            f?.cpf ?? "",
            f?.address ?? "",
            f?.city ?? "",
            r.users_profile?.email ?? "",
            f?.payment_terms ?? "",
            f?.payment_method ?? "",
            f?.payment_signal_value_raw ?? "",
            f?.payment_due_date_text ?? "",
            f?.billing_status ?? "Pendente",
            it.code ?? "",
            it.description ?? "",
            it.qty ?? "",
            it.price ?? "",
            it.discount_percent ?? "",
            f?.obs ?? ""
          ];
          csvRows.push(row.map(csvCell).join(","));
        });
      });
      
      downloadTextFile(`pedidos_export_${format(new Date(), "yyyy-MM-dd")}.csv`, csvRows.join("\n"), "text/csv");
      showSuccess(`${filteredRows.length} pedidos exportados.`);
    } catch (e: any) {
      showError(`Falha na exportação: ${e.message}`);
    } finally {
      setExportingCsv(false);
    }
  };

  if (journeyQ.isError || (!journeyQ.isLoading && !journeyQ.data)) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white/40 rounded-[32px] border border-slate-200 backdrop-blur m-4">
          <div className="h-16 w-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
            <Package className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Módulo de Pedidos não habilitado</h2>
          <p className="text-slate-500 mt-2 max-w-sm">
            A jornada de <span className="font-semibold">Venda (sales_order)</span> não foi encontrada ou não está habilitada para este tenant.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-2xl">
            <Link to="/app">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-100 text-blue-600">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Pedidos</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-slate-600">Gestão dedicada de pedidos e processos internos.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Vendedor Filter */}
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-1.5 h-10 min-w-[180px]">
                <Users2 className="ml-2 h-4 w-4 text-slate-400" />
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none flex-1 pr-2"
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                >
                  <option value="all">Vendedor: Todos</option>
                  {(usersQ.data ?? []).map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.display_name || u.email}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Forma de Pagamento Multi-Select */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 min-w-[180px] justify-start hover:bg-white hover:border-blue-400 transition-all shadow-sm gap-2",
                      selectedPaymentMethods.size > 0 && "border-blue-400 bg-blue-50 text-blue-700"
                    )}
                  >
                    <CreditCard className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {selectedPaymentMethods.size === 0
                      ? "Pagamento: Todos"
                      : selectedPaymentMethods.size === 1
                      ? Array.from(selectedPaymentMethods)[0]
                      : `${selectedPaymentMethods.size} formas selecionadas`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] rounded-2xl shadow-xl border-slate-200 p-2" align="start">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Forma de Pagamento</p>
                    {selectedPaymentMethods.size > 0 && (
                      <button onClick={() => setSelectedPaymentMethods(new Set())} className="text-[10px] text-blue-600 font-bold hover:underline">Limpar</button>
                    )}
                  </div>
                  <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                    {paymentOptions.map((opt) => (
                      <label key={opt} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          className="accent-blue-600 h-3.5 w-3.5"
                          checked={selectedPaymentMethods.has(opt)}
                          onChange={() => {
                            const next = new Set(selectedPaymentMethods);
                            next.has(opt) ? next.delete(opt) : next.add(opt);
                            setSelectedPaymentMethods(next);
                          }}
                        />
                        <span className="text-xs font-semibold text-slate-700 truncate">{opt}</span>
                      </label>
                    ))}
                    {paymentOptions.length === 0 && (
                      <p className="text-xs text-slate-400 px-2 py-2">Nenhuma opção encontrada</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Cidade Multi-Select */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 min-w-[160px] justify-start hover:bg-white hover:border-blue-400 transition-all shadow-sm gap-2",
                      selectedCities.size > 0 && "border-blue-400 bg-blue-50 text-blue-700"
                    )}
                  >
                    <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {selectedCities.size === 0
                      ? "Cidade: Todas"
                      : selectedCities.size === 1
                      ? Array.from(selectedCities)[0]
                      : `${selectedCities.size} cidades`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] rounded-2xl shadow-xl border-slate-200 p-2" align="start">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cidade</p>
                    {selectedCities.size > 0 && (
                      <button onClick={() => setSelectedCities(new Set())} className="text-[10px] text-blue-600 font-bold hover:underline">Limpar</button>
                    )}
                  </div>
                  <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                    {cityOptions.map((opt) => (
                      <label key={opt} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          className="accent-blue-600 h-3.5 w-3.5"
                          checked={selectedCities.has(opt)}
                          onChange={() => {
                            const next = new Set(selectedCities);
                            next.has(opt) ? next.delete(opt) : next.add(opt);
                            setSelectedCities(next);
                          }}
                        />
                        <span className="text-xs font-semibold text-slate-700 truncate">{opt}</span>
                      </label>
                    ))}
                    {cityOptions.length === 0 && (
                      <p className="text-xs text-slate-400 px-2 py-2">Nenhuma opção encontrada</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 justify-start text-left font-normal rounded-2xl border-slate-200 bg-white/70 min-w-[240px] hover:bg-white hover:border-blue-400 transition-all shadow-sm",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <span className="text-[12px] font-bold text-slate-700">
                          {format(dateRange.from, "dd/MM/yyyy")} - {format(dateRange.to, "dd/MM/yyyy")}
                        </span>
                      ) : (
                        <span className="text-[12px] font-bold text-slate-700">{format(dateRange.from, "dd/MM/yyyy")}</span>
                      )
                    ) : (
                      <span className="text-[12px]">Selecionar período</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-[28px] shadow-2xl border-slate-200 overflow-hidden flex flex-col md:flex-row" align="start">
                  {/* Presets Side Bar */}
                  <div className="w-full md:w-[180px] border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50 p-3 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 mb-2">Períodos</p>
                    {[
                      { label: "Hoje", range: { from: startOfDay(new Date()), to: endOfDay(new Date()) } },
                      { label: "Ontem", range: { from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) } },
                      { label: "Últimos 7 dias", range: { from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) } },
                      { label: "Este Mês", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
                      { label: "Mês Passado", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
                      { label: "Últimos 3 meses", range: { from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) } },
                    ].map((p) => (
                      <button
                        key={p.label}
                        onClick={() => setDateRange(p.range)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-white hover:shadow-sm",
                          dateRange?.from?.getTime() === p.range.from.getTime() && dateRange?.to?.getTime() === p.range.to.getTime()
                            ? "bg-blue-600 text-white shadow-md hover:bg-blue-600"
                            : "text-slate-600 hover:text-blue-600"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-2">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(range: any) => setDateRange(range)}
                      numberOfMonths={2}
                      locale={ptBR}
                      captionLayout="dropdown"
                      fromYear={2020}
                      toYear={2030}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden lg:block" />

              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-10 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => setNewSalesOrderOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Novo pedido
                </Button>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-1">
                  <Button
                    variant={viewMode === "list" ? "default" : "secondary"}
                    className="h-8 rounded-xl px-3"
                    onClick={() => setAndPersistViewMode("list")}
                  >
                    <LayoutList className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "kanban" ? "default" : "secondary"}
                    className="h-8 rounded-xl px-3"
                    onClick={() => setAndPersistViewMode("kanban")}
                  >
                    <Columns2 className="h-4 w-4" />
                  </Button>
                </div>

                <Button variant="secondary" className="h-10 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 border-none shadow-sm" onClick={exportOrdersCsv} disabled={exportingCsv}>
                  <Download className="mr-2 h-4 w-4" /> Exportar ({filteredRows.length})
                </Button>

                <ImportOrdersDialog
                  tenantId={activeTenantId!}
                  journey={selectedJourney!}
                  actorUserId={user?.id || null}
                />

                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => casesQ.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* 1. Total Pedidos */}
            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                  <Package className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Total Pedidos</span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-slate-200 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Referente ao mês selecionado</div>
            </div>

            {/* 2. Faturado */}
            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
                    <Check className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Faturado</span>
                </div>
                {!caseDataQ.isLoading && (
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    {stats.invoicedPct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-xl font-black text-emerald-600">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-emerald-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.invoicedValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Valor efetivamente recebido</div>
            </div>

            {/* 3. Pendente */}
            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
                    <Clock className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Pendente</span>
                </div>
                {!caseDataQ.isLoading && (
                  <span className="text-[10px] font-black text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded-lg border border-amber-200">
                    {stats.pendingPct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-xl font-black text-amber-600">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-amber-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.pendingValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Pagamento não confirmado</div>
            </div>

            {/* 4. Total Cancelado */}
            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
                    <XCircle className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Cancelado</span>
                </div>
                {!caseDataQ.isLoading && (
                  <span className="text-[10px] font-black text-rose-700 bg-rose-100/50 px-2 py-0.5 rounded-lg border border-rose-200">
                    {stats.canceledPct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-xl font-black text-rose-600">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-rose-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.canceledValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Pedidos com status cancelado</div>
            </div>

            {/* 5. Ticket Médio */}
            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Ticket Médio</span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-indigo-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.avgTicket)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Valor por venda faturada</div>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-100 bg-white/40 p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desempenho Diário</h4>
                  <h3 className="text-sm font-bold text-slate-800">Vendas no Mês</h3>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Total Faturado: <span className="text-emerald-600 ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.invoicedValue)}</span>
              </div>
            </div>
            
            <div className="h-[200px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por cliente, vendedor ou telefone..."
                className="h-11 rounded-2xl pl-10"
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto pb-4">
            {viewMode === "kanban" ? (
              <div className="flex gap-4 min-w-max">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="w-[300px] flex-shrink-0"
                    onDragOver={(e) => col.key !== "__other__" && e.preventDefault()}
                    onDrop={(e) => {
                      const cid = e.dataTransfer.getData("text/caseId");
                      if (cid) updateCaseState(cid, col.key);
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between px-2">
                      <span className="text-sm font-bold text-slate-700">{col.label}</span>
                      <Badge variant="secondary" className="rounded-full">{col.items.length}</Badge>
                    </div>
                    <div className="min-h-[500px] rounded-[24px] bg-slate-50/50 p-2 border border-dashed border-slate-200">
                      {col.items.map((c) => {
                        const cust = customersQ.data?.get(c.customer_id!);
                        const title = cust?.name || c.title || "Pedido";
                        return (
                          <Link
                            key={c.id}
                            to={`/app/orders/${c.id}`}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/caseId", c.id)}
                            className="mb-3 block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold text-slate-900 truncate flex-1">{title}</div>
                              <Badge variant="outline" className="text-[9px] h-4 px-1 font-bold text-blue-600 border-blue-100 flex-shrink-0">
                                #{c.meta_json?.external_id || c.id.slice(0, 8)}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{c.users_profile?.display_name || "Sem dono"}</div>
                            <div className="mt-3 flex items-center justify-between">
                              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="h-3 w-3" /> {minutesAgo(c.updated_at)}m
                              </div>
                              {pendQ.data?.get(c.id)?.open ? (
                                <Badge className="bg-amber-100 text-amber-700 border-0">{pendQ.data.get(c.id)!.open} pend.</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0">OK</Badge>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Atualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link to={`/app/orders/${c.id}`} className="font-semibold hover:underline">
                              {customersQ.data?.get(c.customer_id!)?.name || c.title || "Pedido"}
                            </Link>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 font-bold text-blue-600 border-blue-100">
                                #{c.meta_json?.external_id || c.id.slice(0, 8)}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={caseDataQ.data?.fields.get(c.id)?.obs}>
                            {caseDataQ.data?.fields.get(c.id)?.obs || c.id.slice(0, 8)}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold whitespace-nowrap">
                          {formatMoneyBRL(caseDataQ.data?.totals.get(c.id) || 0)}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          <Badge variant="secondary" className="rounded-lg h-5 min-w-[20px] justify-center">
                            {caseDataQ.data?.itemCounts.get(c.id) || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[120px]" title={c.users_profile?.display_name || ""}>
                          {c.users_profile?.display_name || "—"}
                        </TableCell>
                        <TableCell>
                          <select
                            value={c.state}
                            onChange={(e) => updateCaseState(c.id, e.target.value)}
                            className="text-[11px] font-bold border rounded-xl p-1.5 bg-slate-50 border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            {states.map(s => <option key={s} value={s}>{getStateLabel(selectedJourney as any, s)}</option>)}
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            value={caseDataQ.data?.fields.get(c.id)?.billing_status || "Pendente"}
                            onChange={(e) => updateBillingStatus(c.id, e.target.value)}
                            className={cn(
                              "text-[10px] font-black uppercase tracking-tighter border rounded-xl p-1.5 outline-none focus:ring-2 transition-all",
                              (() => {
                                const s = (caseDataQ.data?.fields.get(c.id)?.billing_status || "Pendente").toLowerCase();
                                if (s.includes("pago") || s.includes("fat")) return "bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-500/20";
                                if (s.includes("can")) return "bg-rose-50 text-rose-700 border-rose-200 focus:ring-rose-500/20";
                                return "bg-amber-50 text-amber-700 border-amber-200 focus:ring-amber-500/20";
                              })()
                            )}
                          >
                            <option value="Pendente">Pendente</option>
                            <option value="Aguardando Banco">Aguardando Banco</option>
                            <option value="Pago">Pago</option>
                            <option value="Faturado">Faturado</option>
                            <option value="Cancelado">Cancelado</option>
                          </select>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] font-normal uppercase">{c.status}</Badge></TableCell>
                        <TableCell className="text-[10px] text-slate-500 whitespace-nowrap">{minutesAgo(c.updated_at)} min atrás</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <NewSalesOrderDialog
            open={newSalesOrderOpen}
            onOpenChange={setNewSalesOrderOpen}
            tenantId={activeTenantId!}
            journeyId={selectedJourney?.id!}
          />

          <TransitionBlockDialog
            open={transitionBlock.open}
            onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })}
            nextStateName={transitionBlock.nextStateName}
            blocks={transitionBlock.reasons}
          />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
