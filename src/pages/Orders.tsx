import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search, 
  Plus, 
  Package, 
  Calendar, 
  Users2, 
  Download, 
  FileText, 
  RefreshCw,
  Clock,
  Check,
  XCircle,
  TrendingUp,
  CreditCard,
  MapPin,
  Filter,
  Eye,
  BarChart2,
  LayoutList,
  Columns2,
  ChevronRight,
  DollarSign,
  GripVertical
} from "lucide-react";

import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, startOfMonth, endOfMonth, isWithinInterval, isSameDay, startOfDay, endOfDay, parse, parseISO, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { NewSalesOrderDialog } from "@/components/case/NewSalesOrderDialog";
import { ImportOrdersDialog } from "@/components/case/ImportOrdersDialog";
import { Link, useNavigate } from "react-router-dom";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StateMachine } from "@/lib/journeys/types"
import { GlobalJourneyLogsDialog } from "@/components/case/GlobalJourneyLogsDialog";
import { checkTransitionBlocks } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { showError, showSuccess } from "@/utils/toast";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";

type CaseRow = {
  id: string;
  journey_id: string;
  customer_id: string | null;
  title: string;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  assigned_vendor_id: string | null;
  is_chat?: boolean;
  users_profile?: { display_name: string | null; email: string | null } | null;
  journeys?: { key: string | null; name: string | null; is_crm?: boolean } | null;
  assigned_vendor?: { display_name: string | null } | null;
  meta_json?: any;
};

type JourneyOpt = {
  id: string;
  key: string;
  name: string;
  is_crm: boolean;
  default_state_machine_json: StateMachine;
};

const STAGE_LABELS: Record<string, string> = {
  "new": "Pedido",
  "em_anlise": "Análise",
  "projeto": "Projeto",
  "faturado": "Faturado",
  "in_separation": "Em Separação",
  "in_route": "Em Rota",
  "delivered": "Expedição",
  "finalized": "Concluído",
  "cancelled": "Cancelado",
  // Mapeamentos de compatibilidade para dados antigos
  "NEW": "Pedido",
  "PROJETO": "Projeto",
  "IN_ROUTE": "Em Rota",
  "DELIVERED": "Expedição",
  "FINALIZED": "Concluído",
  "CANCELLED": "Cancelado",
  "CANCELADO": "Cancelado",
  "IN_PRODUCTION": "Em Produção",
  "IN_ANALYSIS": "Análise",
  "APPROVED": "Aprovado"
};

const SALES_ORDER_STAGES = [
  "new", 
  "em_anlise", 
  "projeto", 
  "faturado", 
  "in_separation", 
  "in_route", 
  "delivered", 
  "finalized"
];

const getStageLabel = (s: string) => {
  if (!s) return "";
  return STAGE_LABELS[s] || STAGE_LABELS[s.toLowerCase()] || STAGE_LABELS[s.toUpperCase()] || s;
};

function isStateMatch(rowState: string, targetState: string) {
  const s = (rowState || "").toLowerCase();
  const t = (targetState || "").toLowerCase();
  
  // Agrupamentos lógicos
  if (t === "cancelled") {
    return s === "cancelled" || s === "cancelado";
  }
  if (t === "new") return s === "new" || s === "pedido";
  if (t === "em_anlise") return s === "em_anlise" || s === "análise" || s === "analise";
  if (t === "delivered") return s === "delivered" || s === "expedição" || s === "entregue";
  if (t === "finalized") return s === "finalized" || s === "concluído" || s === "finalizado";
  
  return s === t;
}

const ORDERS_FILTERS_V2_KEY = "orders_filters_v2";

function normalizeBillingStatus(raw: string): string {
  const s = String(raw ?? "Pendente").trim();
  const low = s.toLowerCase();
  if (low === "pago" || low.includes("faturado")) return "Faturado";
  if (low.includes("cancel")) return "Cancelado";
  if (low.includes("parcial")) return "Faturado Parcial";
  if (low.includes("banco") || low.includes("aguardando") || low === "pendente") return "Pendente";
  return s;
}

const billingStatusOptions = ["Pendente", "Faturado", "Faturado Parcial", "Cancelado"];
const allBillingStatusOptions = ["Pendente", "Faturado", "Faturado Parcial", "Cancelado", "Pago", "Aguardando Banco"];

export default function Orders() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const caseId = active.id as string;
    const nextState = over.id as string;

    const caseRow = journeyRows.find(c => c.id === caseId);
    if (caseRow && (caseRow.state || "").toUpperCase() !== (nextState || "").toUpperCase()) {
      updateState(caseId, nextState);
    }
  };

  const [q, setQ] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState<string>(() => {
    const saved = localStorage.getItem(ORDERS_FILTERS_V2_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.sellerId || "all";
      } catch (e) {
        return "all";
      }
    }
    return "all";
  });

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date | undefined }>(() => {
    const saved = localStorage.getItem(ORDERS_FILTERS_V2_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.dateRange?.from) {
          return {
            from: new Date(parsed.dateRange.from),
            to: parsed.dateRange.to ? new Date(parsed.dateRange.to) : undefined
          };
        }
      } catch (e) {}
    }
    return { from: startOfMonth(new Date()), to: endOfMonth(new Date()) };
  });

  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<string>>(new Set());
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<Set<string>>(new Set());
  
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => {
    return (localStorage.getItem("orders_view_mode") as any) || "kanban";
  });
  const [showStats, setShowStats] = useState(() => {
    return localStorage.getItem("orders_show_stats") !== "false";
  });
  
  const [partialPaidOpen, setPartialPaidOpen] = useState(false);
  const [partialPaidCaseId, setPartialPaidCaseId] = useState<string | null>(null);
  const [partialPaidValue, setPartialPaidValue] = useState("");

  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    caseId: string;
    nextState: string;
    nextStateName: string;
    reasons: any[];
  }>({
    open: false,
    caseId: "",
    nextState: "",
    nextStateName: "",
    reasons: [],
  });

  const setAndPersistViewMode = (mode: "kanban" | "list") => {
    setViewMode(mode);
    localStorage.setItem("orders_view_mode", mode);
  };

  useEffect(() => {
    const filters = {
      sellerId: selectedSellerId,
      dateRange: {
        from: dateRange.from?.toISOString(),
        to: dateRange.to?.toISOString()
      }
    };
    localStorage.setItem(ORDERS_FILTERS_V2_KEY, JSON.stringify(filters));
  }, [selectedSellerId, dateRange]);

  // Force fresh build - query cleaned v5
  const journeyQ = useQuery({
    queryKey: ["journey_orders", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      console.log("[DEBUG v5] Starting journey fetch for key 'sales_order'...");
      const { data, error } = await supabase
        .from("journeys")
        .select("id,key,name,is_crm")
        .eq("key", "sales_order")
        .single();
      if (error) {
        console.error("[DEBUG v5] Journey fetch error:", error);
        throw error;
      }
      console.log("[DEBUG v5] Journey fetch success:", data);
      const j = data as any;
      return {
        id: j.id,
        key: j.key,
        name: j.name,
        is_crm: Boolean(j.is_crm),
        default_state_machine_json: {},
      } as JourneyOpt;
    },
  });

  const selectedJourney = journeyQ.data;

  const casesQ = useQuery({
    queryKey: ["cases_orders", activeTenantId, selectedJourney?.id],
    enabled: Boolean(activeTenantId && selectedJourney),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,title,status,state,created_at,updated_at,assigned_user_id,assigned_vendor_id,is_chat,users_profile:users_profile!fk_cases_users_profile(display_name,email),assigned_vendor:vendors!cases_assigned_vendor_id_fkey(display_name),journeys:journeys!cases_journey_id_fkey(key,name,is_crm),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const journeyRows = casesQ.data ?? [];

  const usersQ = useQuery({
    queryKey: ["tenant_users_profiles", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email, meta_json")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const vendorsQ = useQuery({
    queryKey: ["vendors_for_filter", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, display_name, phone_e164")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const inventoryQ = useQuery({
    queryKey: ["inventory_for_filter", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const formatRelativeUpdate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isSameDay(d, new Date())) return "Hoje";
    return format(d, "dd/MM", { locale: ptBR });
  };

  const parseSafeDate = (input: string | null | undefined, fallback: string | Date): Date => {
    if (!input) return new Date(fallback);
    let s = String(input ?? "").trim().replace(/\s/g, "");
    if (!s || s === "undefined" || s === "null") return new Date(fallback);

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = parseISO(s);
      if (!isNaN(d.getTime())) return d;
    }

    s = s.replace(/\/\/+/g, "/");

    const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (slashMatch) {
      let [_, d, m, y] = slashMatch;
      if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    const typoMatch1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(\d{4})$/);
    if (typoMatch1) {
      const [_, d, m, y] = typoMatch1;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    const typoMatch2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (typoMatch2) {
      const [_, d, m, y] = typoMatch2;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    try {
      const d = parse(s, "dd/MM/yyyy", new Date());
      if (!isNaN(d.getTime())) return d;
    } catch {}

    return new Date(fallback);
  };

  const caseIdsForLookup = useMemo(() => journeyRows.map(r => r.id), [journeyRows]);

  const caseDataQ = useQuery({
    queryKey: ["orders_case_fields_extended", activeTenantId, journeyRows.length, journeyRows[0]?.id, dateRange.from.getTime(), dateRange.to?.getTime()],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    queryFn: async () => {
      const CHUNK_SIZE = 100;
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
            .in("key", ["whatsapp", "phone", "customer_phone", "sale_date_text", "billing_status", "partial_paid_value", "total_value_raw", "obs", "payment_method", "city"])
            .limit(1000),
          supabase
            .from("case_items")
            .select("case_id,total,offering_entity_id")
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
      const inventoryIdsMap = new Map<string, Set<string>>();
      for (const itm of allItems) {
        const cid = itm.case_id;
        const val = Number(itm.total || 0);
        totalsMap.set(cid, (totalsMap.get(cid) || 0) + val);
        itemCountsMap.set(cid, (itemCountsMap.get(cid) || 0) + 1);
        
        const invId = itm.offering_entity_id;
        if (invId) {
          if (!inventoryIdsMap.has(cid)) inventoryIdsMap.set(cid, new Set());
          inventoryIdsMap.get(cid)!.add(invId);
        }
      }

      return { fields: fieldMap, totals: totalsMap, itemCounts: itemCountsMap, inventory: inventoryIdsMap };
    },
  });

  const updateBillingStatus = async (caseId: string, status: string) => {
    if (status === "Faturado Parcial") {
      const currentVal = caseDataQ.data?.fields.get(caseId)?.partial_paid_value || "";
      setPartialPaidValue(currentVal);
      setPartialPaidCaseId(caseId);
      setPartialPaidOpen(true);
      return;
    }

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
      casesQ.refetch();
    } catch (e: any) {
      showError(`Falha ao atualizar status: ${e.message}`);
    }
  };

  const savePartialPaidValue = async () => {
    if (!partialPaidCaseId) return;
    try {
      const { error: err1 } = await supabase
        .from("case_fields")
        .upsert({
          case_id: partialPaidCaseId,
          key: "billing_status",
          value_text: "Faturado Parcial",
          confidence: 1,
          source: "admin",
          last_updated_by: "panel"
        }, { onConflict: "case_id,key" });

      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from("case_fields")
        .upsert({
          case_id: partialPaidCaseId,
          key: "partial_paid_value",
          value_text: partialPaidValue,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel"
        }, { onConflict: "case_id,key" });

      if (err2) throw err2;

      showSuccess("Valor de pagamento parcial salvo");
      setPartialPaidOpen(false);
      caseDataQ.refetch();
    } catch (e: any) {
      showError(`Falha ao salvar valor: ${e.message}`);
    }
  };

  const customersQ = useQuery({
    queryKey: ["orders_customers", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, metadata")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "customer");
      if (error) throw error;
      const m = new Map<string, { name: string; phone_e164: string }>();
      (data ?? []).forEach(d => {
        m.set(d.id, { 
          name: d.display_name || "Sem Nome", 
          phone_e164: d.metadata?.phone_e164 || "" 
        });
      });
      return m;
    },
  });

  const filteredRows = useMemo(() => {
    let rows = journeyRows;
    const qq = q.trim().toLowerCase();

    // Filter by seller
    if (selectedSellerId !== "all") {
      const selectedVendor = vendorsQ.data?.find(v => v.id === selectedSellerId);
      const sellerName = selectedVendor?.display_name?.toLowerCase();

      rows = rows.filter(r => {
        if (r.assigned_vendor_id === selectedSellerId) return true;
        if (r.assigned_user_id === selectedSellerId) return true;
        if (sellerName) {
          const rowUserName = r.users_profile?.display_name?.toLowerCase();
          const rowVendorName = r.assigned_vendor?.display_name?.toLowerCase();
          if (rowUserName === sellerName || rowVendorName === sellerName) return true;
        }
        return false;
      });
    }

    if (!qq) {
      rows = rows.filter(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        if (caseDataQ.isLoading && !f) return true;

        const saleDateText = f?.sale_date_text;
        const d = parseSafeDate(saleDateText, r.created_at);
        
        if (!dateRange.from) return true;
        const start = startOfDay(dateRange.from);
        const end = endOfDay(dateRange.to || dateRange.from);
        
        return isWithinInterval(d, { start, end });
      });
    }

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

    if (selectedInventoryIds.size > 0) {
      rows = rows.filter(r => {
        const orderInvIds = caseDataQ.data?.inventory.get(r.id);
        if (!orderInvIds) return false;
        return Array.from(selectedInventoryIds).some(id => orderInvIds.has(id));
      });
    }

    if (qq) {
      rows = rows.filter((r) => {
        const cust = customersQ.data?.get(r.customer_id!);
        const extId = r.meta_json?.external_id || "";
        const f = caseDataQ.data?.fields.get(r.id);
        const phones = `${f?.whatsapp ?? ""} ${f?.phone ?? ""} ${f?.customer_phone ?? ""}`;
        const text = `${r.id} ${r.title} ${r.users_profile?.display_name} ${cust?.name} ${cust?.phone_e164} ${phones} ${extId}`.toLowerCase();
        return text.includes(qq);
      });
    }

    return rows;
  }, [journeyRows, q, dateRange, selectedSellerId, selectedPaymentMethods, selectedCities, selectedInventoryIds, caseDataQ.data, caseDataQ.isLoading, vendorsQ.data]);

  const paymentOptions = useMemo(() => {
    const opts = new Set<string>();
    for (const r of journeyRows) {
      const f = caseDataQ.data?.fields.get(r.id);
      const val = String(f?.payment_method ?? "").trim();
      if (val) opts.add(val);
    }
    const list = Array.from(opts);
    list.sort();
    return list;
  }, [journeyRows, caseDataQ.data]);

  const cityOptions = useMemo(() => {
    const opts = new Set<string>();
    for (const r of journeyRows) {
      const f = caseDataQ.data?.fields.get(r.id);
      const val = String(f?.city ?? "").trim();
      if (val) opts.add(val);
    }
    const list = Array.from(opts);
    list.sort();
    return list;
  }, [journeyRows, caseDataQ.data]);

  const stats = useMemo(() => {
    let totalValue = 0;
    let invoicedValue = 0;
    let pendingValue = 0;
    let cancelledValue = 0;

    filteredRows.forEach(r => {
      const f = caseDataQ.data?.fields.get(r.id);
      const billingStatus = normalizeBillingStatus(f?.billing_status || "Pendente").toLowerCase();
      const caseTotal = caseDataQ.data?.totals.get(r.id) || 0;
      const partialVal = Number(f?.partial_paid_value || 0);

      totalValue += caseTotal;

      if (billingStatus.includes("pago") || billingStatus.includes("faturado")) {
        invoicedValue += caseTotal;
      } else if (billingStatus.includes("cancel")) {
        cancelledValue += caseTotal;
      } else if (billingStatus.includes("parcial")) {
        invoicedValue += partialVal;
        pendingValue += (caseTotal - partialVal);
      } else {
        pendingValue += caseTotal;
      }
    });

    const invoicedPct = totalValue > 0 ? (invoicedValue / totalValue) * 100 : 0;
    const pendingPct = totalValue > 0 ? (pendingValue / totalValue) * 100 : 0;
    const cancelledPct = totalValue > 0 ? (cancelledValue / totalValue) * 100 : 0;
    const avgTicket = filteredRows.length > 0 ? totalValue / filteredRows.length : 0;

    return { totalValue, invoicedValue, pendingValue, cancelledValue, invoicedPct, pendingPct, cancelledPct, avgTicket };
  }, [filteredRows, caseDataQ.data]);

  const chartData = useMemo(() => {
    if (!dateRange.from) return [];
    const daysInMonth: { day: string; value: number }[] = [];
    const start = startOfMonth(dateRange.from);
    const end = endOfMonth(dateRange.to || dateRange.from);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      daysInMonth.push({ day: format(d, "dd"), value: 0 });
    }

    filteredRows.forEach(r => {
      const f = caseDataQ.data?.fields.get(r.id);
      const billStatus = normalizeBillingStatus(f?.billing_status || "Pendente").toLowerCase();
      
      if (billStatus.includes("pago") || billStatus.includes("faturado") || billStatus.includes("parcial")) {
        const saleDateText = f?.sale_date_text;
        const d = parseSafeDate(saleDateText, r.created_at);
        
        if (isWithinInterval(d, { start, end })) {
          const dayLabel = format(d, "dd");
          const idx = daysInMonth.findIndex(x => x.day === dayLabel);
          if (idx >= 0) {
            const caseTotal = caseDataQ.data?.totals.get(r.id) || 0;
            const partialVal = Number(f?.partial_paid_value || 0);
            
            if (billStatus.includes("parcial")) {
              daysInMonth[idx].value += partialVal;
            } else {
              daysInMonth[idx].value += caseTotal;
            }
          }
        }
      }
    });

    return daysInMonth;
  }, [filteredRows, dateRange, caseDataQ.data]);


  const exportOrdersCsv = async () => {
    setExportingCsv(true);
    try {
      const headers = ["ID", "Título", "Cliente", "Vendedor", "Responsável", "Etapa", "Status Pagamento", "Total", "Data"];
      const rows = filteredRows.map(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        const cust = customersQ.data?.get(r.customer_id!);
        return [
          r.id,
          r.title,
          cust?.name || "—",
          r.assigned_vendor?.display_name || "—",
          r.users_profile?.display_name || "—",
          r.state,
          f?.billing_status || "Pendente",
          caseDataQ.data?.totals.get(r.id) || 0,
          r.created_at
        ];
      });
      const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `pedidos_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExportingCsv(false);
    }
  };

  const exportOrdersPdf = async () => {
    setExportingPdf(true);
    window.print();
    setExportingPdf(false);
  };

  const workflowProgress = useMemo(() => {
    const activeRows = filteredRows.filter(r => !isStateMatch(r.state, "cancelled"));
    if (activeRows.length === 0) return { pct: 0, completed: 0, total: 0 };
    const completed = activeRows.filter(r => isStateMatch(r.state, "finalized")).length;
    return {
      pct: (completed / activeRows.length) * 100,
      completed,
      total: activeRows.length
    };
  }, [filteredRows]);

  const states = useMemo(() => {
    const configStates = selectedJourney?.default_state_machine_json?.states || [];
    if (configStates.length > 0) return configStates;
    
    // Default stages for Sales Order if config is missing
    return SALES_ORDER_STAGES;
  }, [selectedJourney]);

  const updateState = async (caseId: string, nextState: string) => {
    const caseRow = journeyRows.find(c => c.id === caseId);
    if (!caseRow || !selectedJourney) return;

    const currentState = caseRow.state;
    const sm = selectedJourney.default_state_machine_json;
    const blocks = checkTransitionBlocks(sm, currentState, nextState, {});

    if (blocks.length > 0) {
      const stateObj = (sm as any).states_config?.[nextState];
      setTransitionBlock({
        open: true,
        caseId,
        nextState,
        nextStateName: stateObj?.label || nextState,
        reasons: blocks,
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState, updated_at: new Date().toISOString() })
        .eq("id", caseId);

      if (error) throw error;
      showSuccess(`Etapa atualizada para: ${nextState}`);
      casesQ.refetch();
    } catch (e: any) {
      showError(`Falha ao atualizar etapa: ${e.message}`);
    }
  };

  if (!activeTenantId) return null;

  return (
    <RequireAuth>
      <AppShell>
        <div className="flex flex-col gap-6 p-4 md:p-8">
          {/* Header & Controls */}
          <div className="relative z-10 space-y-6 no-print">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Pedidos</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-slate-600">Gestão dedicada de pedidos e processos internos.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <NewSalesOrderDialog 
                  tenantId={activeTenantId} 
                  onSuccess={() => casesQ.refetch()} 
                />

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

                <Button
                  type="button"
                  variant={showStats ? "secondary" : "outline"}
                  className={cn("h-10 rounded-2xl w-10 p-0", !showStats && "bg-blue-50 border-blue-200 text-blue-600")}
                  onClick={() => {
                    const next = !showStats;
                    setShowStats(next);
                    localStorage.setItem("orders_show_stats", String(next));
                  }}
                  title={showStats ? "Esconder indicadores" : "Mostrar indicadores"}
                >
                  {showStats ? <BarChart2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-2xl w-10 p-0"
                  onClick={() => {
                    casesQ.refetch();
                    caseDataQ.refetch();
                    vendorsQ.refetch();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>

                <Button variant="secondary" className="h-10 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 border-none shadow-sm" onClick={exportOrdersCsv} disabled={exportingCsv}>
                  <Download className="mr-2 h-4 w-4" /> CSV ({filteredRows.length})
                </Button>

                <Button variant="secondary" className="h-10 rounded-2xl bg-rose-600 text-white hover:bg-rose-700 border-none shadow-sm" onClick={exportOrdersPdf} disabled={exportingPdf}>
                  <FileText className="mr-2 h-4 w-4" /> PDF ({filteredRows.length})
                </Button>

                <ImportOrdersDialog
                  tenantId={activeTenantId!}
                  journey={selectedJourney!}
                  actorUserId={user?.id || null}
                />
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
                  {(vendorsQ.data ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.display_name || v.phone_e164}
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
                      : `${selectedPaymentMethods.size} selecionados`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] rounded-2xl p-2 shadow-xl border-slate-200" align="start">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pagamento</p>
                    {selectedPaymentMethods.size > 0 && (
                      <button onClick={() => setSelectedPaymentMethods(new Set())} className="text-[10px] text-blue-600 font-bold hover:underline">Limpar</button>
                    )}
                  </div>
                  <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                    {paymentOptions.map((opt) => (
                      <label key={opt} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          className="accent-blue-600 h-3.5 w-3.5 rounded"
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
                  </div>
                </PopoverContent>
              </Popover>

              {/* Cidade Multi-Select */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 min-w-[150px] justify-start hover:bg-white transition-all shadow-sm gap-2",
                      selectedCities.size > 0 && "border-blue-400 bg-blue-50 text-blue-700"
                    )}
                  >
                    <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {selectedCities.size === 0 ? "Cidade: Todas" : `${selectedCities.size} cidades`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] rounded-2xl p-2 shadow-xl border-slate-200" align="start">
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
                          className="accent-blue-600 h-3.5 w-3.5 rounded"
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
                  </div>
                </PopoverContent>
              </Popover>

              {/* Inventário Multi-Select */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 min-w-[150px] justify-start hover:bg-white transition-all shadow-sm gap-2",
                      selectedInventoryIds.size > 0 && "border-blue-400 bg-blue-50 text-blue-700"
                    )}
                  >
                    <Package className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {selectedInventoryIds.size === 0 ? "Inventário: Todos" : `${selectedInventoryIds.size} itens`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] rounded-2xl p-2 shadow-xl border-slate-200" align="start">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Produtos</p>
                    {selectedInventoryIds.size > 0 && (
                      <button onClick={() => setSelectedInventoryIds(new Set())} className="text-[10px] text-blue-600 font-bold hover:underline">Limpar</button>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                    {(inventoryQ.data ?? []).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          className="accent-blue-600 h-3.5 w-3.5 rounded"
                          checked={selectedInventoryIds.has(opt.id)}
                          onChange={() => {
                            const next = new Set(selectedInventoryIds);
                            next.has(opt.id) ? next.delete(opt.id) : next.add(opt.id);
                            setSelectedInventoryIds(next);
                          }}
                        />
                        <span className="text-xs font-semibold text-slate-700 truncate">{opt.display_name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Data Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 transition-all shadow-sm"
                  >
                    <Calendar className="mr-2 h-4 w-4 text-slate-400" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd/MM/yyyy")} - {format(dateRange.to, "dd/MM/yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "dd/MM/yyyy")
                      )
                    ) : (
                      "Período"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-3xl border-slate-200 shadow-2xl overflow-hidden" align="end">
                  <div className="flex flex-col md:flex-row bg-white">
                    <div className="w-full md:w-44 border-b md:border-b-0 md:border-r border-slate-100 p-3 flex flex-col gap-1 bg-slate-50/50">
                      {[
                        { label: "Hoje", get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
                        { label: "Ontem", get: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
                        { label: "Últimos 7 dias", get: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
                        { label: "Últimos 30 dias", get: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
                        { label: "Mês Atual", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
                        { label: "Mês Passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
                        { label: "Todo Período", get: () => ({ from: undefined, to: undefined }) },
                      ].map((btn) => (
                        <Button
                          key={btn.label}
                          variant="ghost"
                          className="h-9 justify-start rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white hover:text-blue-600 transition-all"
                          onClick={() => setDateRange(btn.get())}
                        >
                          {btn.label}
                        </Button>
                      ))}
                    </div>
                    <div className="p-2">
                      <CalendarComponent
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange.from}
                        selected={{ from: dateRange.from, to: dateRange.to }}
                        onSelect={(range: any) => range && setDateRange({ from: range.from, to: range.to })}
                        numberOfMonths={2}
                        locale={ptBR}
                        className="rounded-2xl"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Workflow Progress Bar */}
          <div className="no-print">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                  Progresso da Jornada
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-black text-slate-900">{workflowProgress.pct.toFixed(0)}%</span>
                <span className="text-[10px] font-bold text-slate-400">
                  ({workflowProgress.completed}/{workflowProgress.total} Concluídos)
                </span>
              </div>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 transition-all duration-700 ease-out shadow-lg"
                style={{ width: `${workflowProgress.pct}%` }}
              />
            </div>
          </div>

          {showStats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 no-print">
              {/* 1. Total Pedidos */}
              <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
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
              <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
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
              <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
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

              {/* 4. Cancelado */}
              <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
                      <XCircle className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Cancelado</span>
                  </div>
                  {!caseDataQ.isLoading && (
                    <span className="text-[10px] font-black text-rose-700 bg-rose-100/50 px-2 py-0.5 rounded-lg border border-rose-200">
                      {stats.cancelledPct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-xl font-black text-rose-600">
                  {caseDataQ.isLoading ? (
                    <div className="h-7 w-24 bg-rose-100/50 animate-pulse rounded-lg" />
                  ) : (
                    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.cancelledValue)
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Pedidos com status cancelado</div>
              </div>

              {/* 5. Ticket Médio */}
              <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center gap-3 text-slate-500 mb-3">
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Ticket Médio</span>
                </div>
                <div className="text-xl font-black text-indigo-600">
                  {caseDataQ.isLoading ? (
                    <div className="h-7 w-24 bg-indigo-100/50 animate-pulse rounded-lg" />
                  ) : (
                    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.avgTicket)
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Valor por venda faturada</div>
              </div>
            </div>
          )}

          {showStats && (
            <Card className="rounded-[32px] border-slate-100 bg-white p-6 shadow-sm no-print">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desempenho Diário</p>
                    <p className="text-sm font-bold text-slate-900">Vendas no Mês</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Faturado</p>
                  <p className="text-sm font-black text-emerald-600">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.invoicedValue)}
                  </p>
                </div>
              </div>

              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      interval={0}
                    />
                    <YAxis hide />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-xl">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Dia {payload[0].payload.day}</p>
                              <p className="text-sm font-black text-blue-600">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(payload[0].value as number)}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#2563eb" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorValue)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Search bar */}
          <div className="relative no-print">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente, vendedor ou telefone..."
              className="h-14 rounded-[22px] border-slate-100 bg-white pl-12 text-sm shadow-sm transition-all focus:ring-blue-500"
            />
          </div>

          {/* List or Kanban View */}
          <div className="min-h-[400px]">
            {viewMode === "list" ? (
              <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pedido</TableHead>
                      <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</TableHead>
                      <TableHead className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Itens</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Etapa</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pagamento</TableHead>
                      <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Atualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((c) => {
                      const total = caseDataQ.data?.totals.get(c.id) || 0;
                      const items = caseDataQ.data?.itemCounts.get(c.id) || 0;
                      const f = caseDataQ.data?.fields.get(c.id);
                      const billingStatus = f?.billing_status || "Pendente";
                      const partialVal = Number(f?.partial_paid_value || 0);

                      return (
                        <TableRow key={c.id} className="group cursor-pointer hover:bg-slate-50/80 transition-colors" onClick={() => navigate(`/app/orders/${c.id}`)}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900 uppercase">
                                  {customersQ.data instanceof Map ? (customersQ.data.get(c.customer_id!)?.name || c.title || "Pedido") : (c.title || "Pedido")}
                                </span>
                                <Badge variant="secondary" className="rounded-md bg-blue-50 text-[10px] font-black text-blue-600 border-none">
                                  #{c.id.slice(0, 8)}
                                </Badge>
                              </div>
                              {c.meta_json?.external_id && (
                                <span className="text-[10px] font-medium text-slate-400">Origem: {c.meta_json.external_id}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-sm font-black text-slate-900">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
                              </span>
                              {billingStatus === "Faturado Parcial" && (
                                <span className="text-[10px] font-bold text-emerald-600">
                                  Pago: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(partialVal)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="rounded-full border-slate-200 px-2.5 font-bold text-slate-600">
                              {items}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm truncate max-w-[120px]" title={c.assigned_vendor?.display_name || ""}>
                            {c.assigned_vendor?.display_name || "—"}
                          </TableCell>
                          <TableCell className="text-[11px] font-bold text-slate-700 truncate max-w-[120px]" title={c.users_profile?.display_name || ""}>
                            {c.users_profile?.display_name || "—"}
                          </TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Select value={c.state?.toLowerCase()} onValueChange={(val) => updateState(c.id, val)}>
                                <SelectTrigger className="h-8 w-[130px] rounded-xl text-[10px] font-black uppercase bg-white border-slate-200">
                                  <SelectValue placeholder={getStageLabel(c.state?.toLowerCase())} />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                                  {states.map((s) => (
                                    <SelectItem key={s} value={s} className="text-[10px] font-black uppercase rounded-xl">
                                      {getStageLabel(s)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Select value={billingStatus} onValueChange={(val) => updateBillingStatus(c.id, val)}>
                                <SelectTrigger 
                                  className={cn(
                                    "h-8 w-[140px] rounded-xl text-[10px] font-black uppercase border-none",
                                    billingStatus === "Pago" ? "bg-emerald-100 text-emerald-700" :
                                    billingStatus === "Faturado Parcial" ? "bg-blue-100 text-blue-700" :
                                    billingStatus === "Cancelado" ? "bg-rose-100 text-rose-700" :
                                    billingStatus === "Aguardando Banco" ? "bg-amber-100 text-amber-700" :
                                    "bg-amber-100 text-amber-700"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                                  {allBillingStatusOptions.map((opt) => (
                                    <SelectItem key={opt} value={opt} className="text-[10px] font-black uppercase rounded-xl">
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-[11px] font-medium text-slate-500">
                            {formatRelativeUpdate(c.updated_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragEnd={onDragEnd}
              >
                <div className="overflow-x-auto pb-4 no-scrollbar">
                  <div className="flex gap-6 min-w-max px-2">
                    {states.map((state) => {
                      const stateRows = filteredRows.filter(r => isStateMatch(r.state, state));
                      const stateTotal = stateRows.reduce((acc, r) => acc + (caseDataQ.data?.totals.get(r.id) || 0), 0);

                      return (
                        <div key={state} className="flex flex-col gap-4 w-[320px] shrink-0">
                          <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-slate-900 text-white border-none rounded-md px-2 py-0.5 text-[10px] font-black uppercase">
                                {getStageLabel(state)}
                              </Badge>
                              <span className="text-[11px] font-bold text-slate-400">{stateRows.length}</span>
                            </div>
                            <span className="text-[11px] font-black text-slate-900">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stateTotal)}
                            </span>
                          </div>
                          
                          <SortableContext items={stateRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                            <div 
                              id={state}
                              className="flex flex-col gap-3 min-h-[500px] rounded-[32px] bg-slate-50/50 p-2 border border-dashed border-slate-200 transition-colors"
                            >
                              {stateRows.map(c => (
                                <SortableOrderCard 
                                  key={c.id} 
                                  c={c} 
                                  customersQ={customersQ} 
                                  caseDataQ={caseDataQ} 
                                  navigate={navigate} 
                                  formatRelativeUpdate={formatRelativeUpdate} 
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </DndContext>
            )}
          </div>

          <TransitionBlockDialog
            open={transitionBlock.open}
            onOpenChange={(open) => setTransitionBlock(prev => ({ ...prev, open }))}
            caseId={transitionBlock.caseId}
            nextState={transitionBlock.nextState}
            nextStateName={transitionBlock.nextStateName}
            blocks={transitionBlock.reasons}
          />

          <Dialog open={partialPaidOpen} onOpenChange={setPartialPaidOpen}>
            <DialogContent className="rounded-[32px]">
              <DialogHeader>
                <DialogTitle>Valor do Faturamento Parcial</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <p className="text-xs text-slate-500 font-medium">
                  Insira o valor que já foi pago para este pedido. Este valor será refletido nos totais do dashboard.
                </p>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                  <Input
                    value={partialPaidValue}
                    onChange={(e) => setPartialPaidValue(e.target.value)}
                    placeholder="0,00"
                    className="pl-10 h-12 rounded-2xl border-blue-100 bg-blue-50/30 focus:ring-blue-500"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPartialPaidOpen(false)} className="rounded-2xl">Cancelar</Button>
                <Button onClick={savePartialPaidValue} className="rounded-2xl bg-blue-600 hover:bg-blue-700">Salvar Valor</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function SortableOrderCard({ c, customersQ, caseDataQ, navigate, formatRelativeUpdate }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: c.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const total = caseDataQ.data?.totals.get(c.id) || 0;
  const f = caseDataQ.data?.fields.get(c.id);
  const billingStatus = f?.billing_status || "Pendente";

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group cursor-pointer rounded-3xl border-slate-100 p-4 shadow-sm transition-all hover:shadow-md hover:border-blue-200 bg-white touch-none",
        isDragging && "shadow-2xl ring-2 ring-blue-500/20"
      )}
      onClick={(e) => {
        // Only navigate if not dragging
        if (!isDragging) navigate(`/app/orders/${c.id}`);
      }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-black text-slate-900 uppercase line-clamp-1">
            {customersQ.data instanceof Map ? (customersQ.data.get(c.customer_id!)?.name || c.title || "Pedido") : (c.title || "Pedido")}
          </span>
          <span className="text-[10px] font-bold text-slate-400">#{c.id.slice(0, 8)}</span>
        </div>
        <div className={cn(
          "rounded-lg px-2 py-1 text-[8px] font-black uppercase",
          billingStatus === "Pago" || billingStatus === "Faturado" ? "bg-emerald-100 text-emerald-700" :
          billingStatus === "Faturado Parcial" ? "bg-blue-100 text-blue-700" :
          billingStatus === "Cancelado" ? "bg-rose-100 text-rose-700" :
          "bg-amber-100 text-amber-700"
        )}>
          {billingStatus}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-base font-black text-slate-900">
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="rounded-full border-slate-100 text-[10px] font-bold text-slate-500">
            {caseDataQ.data?.itemCounts.get(c.id) || 0} itens
          </Badge>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-50 pt-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1" title="Vendedor Comercial">
            <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-100 text-[7px] font-black text-blue-700">V</div>
            <span className="text-[10px] font-medium text-slate-500 truncate max-w-[80px]">
              {c.assigned_vendor?.display_name || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Responsável Atual">
            <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-purple-100 text-[7px] font-black text-purple-700">R</div>
            <span className="text-[10px] font-bold text-slate-700 truncate max-w-[80px]">
              {c.users_profile?.display_name?.split(" ")[0] || "—"}
            </span>
          </div>
        </div>
        <span className="text-[9px] font-bold text-slate-400">
          {formatRelativeUpdate(c.updated_at)}
        </span>
      </div>
    </Card>
  );
}
