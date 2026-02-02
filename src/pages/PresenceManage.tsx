import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatYmdInTimeZone, titleizeCaseState, titleizePunchType, type PresencePunchType } from "@/lib/presence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess } from "@/utils/toast";
import { GeofenceMapPicker } from "@/components/presence/GeofenceMapPicker";
import { PunchAdjustDialog, type PunchAdjustMode } from "@/components/presence/PunchAdjustDialog";
import {
  CalendarDays,
  ClipboardCheck,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

type PresenceCaseRow = {
  id: string;
  state: string;
  status: string;
  case_date: string | null;
  entity_id: string | null;
  meta_json: any;
  updated_at: string;
};

type PunchLite = {
  id: string;
  case_id: string;
  timestamp: string;
  type: PresencePunchType;
  within_radius: boolean;
  status: string;
  latitude: number | null;
  longitude: number | null;
  distance_from_location: number | null;
};

type PendLite = {
  id: string;
  case_id: string;
  type: string;
  required: boolean;
  status: string;
};

type PresenceLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type PresencePolicy = {
  id: string;
  location_id: string;
  radius_meters: number;
  lateness_tolerance_minutes: number;
  break_required: boolean;
  allow_outside_radius: boolean;
};

type EmployeeRow = {
  user_id: string;
  role: string;
  display_name: string | null;
  email: string | null;
  deleted_at: string | null;
};

type EmployeePresenceConfig = {
  employee_id: string;
  scheduled_start_hhmm: string | null;
  planned_minutes: number | null;
  notes: string | null;
};

type BankLedgerRow = {
  id: string;
  employee_id: string;
  minutes_delta: number;
  balance_after: number;
  source: string;
  created_at: string;
};

type PunchAdjustmentRow = {
  id: string;
  punch_id: string | null;
  type: PresencePunchType;
  action: "INSERT" | "UPDATE";
  from_timestamp: string | null;
  to_timestamp: string;
  note: string;
  adjusted_by: string;
  created_at: string;
};

function shortId(id: string | null | undefined) {
  const s = String(id ?? "");
  if (!s) return "—";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

function isPresenceManager(role: string | null | undefined) {
  return ["admin", "manager", "supervisor", "leader"].includes(String(role ?? "").toLowerCase());
}

function fmtMinutes(mins: number | null | undefined) {
  const m = Number(mins ?? 0);
  const sign = m < 0 ? "-" : "+";
  const abs = Math.abs(m);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function fmtBalance(mins: number | null | undefined) {
  const m = Number(mins ?? 0);
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const presenceStates = [
  "AGUARDANDO_ENTRADA",
  "EM_EXPEDIENTE",
  "EM_INTERVALO",
  "AGUARDANDO_SAIDA",
  "PENDENTE_JUSTIFICATIVA",
  "PENDENTE_APROVACAO",
  "AJUSTADO",
  "FECHADO",
] as const;

function ColumnHeader({
  icon: Icon,
  title,
  count,
  tone,
}: {
  icon: any;
  title: string;
  count: number;
  tone: "neutral" | "warn" | "ok" | "closed";
}) {
  const toneCls =
    tone === "warn"
      ? "bg-amber-100 text-amber-900"
      : tone === "ok"
        ? "bg-emerald-100 text-emerald-900"
        : tone === "closed"
          ? "bg-slate-200 text-slate-700"
          : "bg-slate-100 text-slate-900";

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", toneCls)}>
          <Icon className="h-4 w-4" />
          {title}
        </div>
      </div>
      <div className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
        {count}
      </div>
    </div>
  );
}

function CaseCard({
  c,
  lastPunch,
  openRequired,
  openAny,
  onOpen,
}: {
  c: PresenceCaseRow;
  lastPunch: PunchLite | null;
  openRequired: number;
  openAny: number;
  onOpen: () => void;
}) {
  const label =
    (c.meta_json?.presence?.employee_label as string | undefined) ??
    (c.meta_json?.presence?.employeeLabel as string | undefined) ??
    null;

  const within = lastPunch?.within_radius;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full text-left rounded-[22px] border bg-white p-3 shadow-sm transition",
        "border-slate-200 hover:border-slate-300 hover:shadow",
        openRequired ? "ring-1 ring-amber-200" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-slate-400" />
            <div className="truncate text-sm font-semibold text-slate-900">
              {label ? label : shortId(c.entity_id)}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            Estado: <span className="font-semibold text-slate-800">{titleizeCaseState(c.state)}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {openAny > 0 ? (
            <Badge className={cn("rounded-full border-0", openRequired ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800")}>
              {openRequired ? `${openRequired} crítica(s)` : `${openAny} pend.`}
            </Badge>
          ) : (
            <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900">ok</Badge>
          )}
          {typeof within === "boolean" && (
            <div className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span className={cn("h-2 w-2 rounded-full", within ? "bg-emerald-600" : "bg-amber-600")} />
              {within ? "no raio" : "fora"}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-700">Última batida</div>
          <div className="mt-0.5 truncate text-xs text-slate-700">
            {lastPunch ? titleizePunchType(lastPunch.type) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-slate-500">Horário</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-800">
            {lastPunch ? new Date(lastPunch.timestamp).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PresenceManage() {
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();

  const manager = isSuperAdmin || isPresenceManager(activeTenant?.role);

  const presenceCfgQ = useQuery({
    queryKey: ["presence_cfg", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id,config_json,journeys!inner(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "presence")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const presenceEnabled = Boolean((presenceCfgQ.data as any)?.config_json?.flags?.presence_enabled === true);
  const timeZone = String((presenceCfgQ.data as any)?.config_json?.presence?.time_zone ?? "America/Sao_Paulo");

  const today = useMemo(() => formatYmdInTimeZone(timeZone), [timeZone]);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const casesQ = useQuery({
    queryKey: ["presence_manage_cases", activeTenantId, selectedDate, presenceEnabled],
    enabled: Boolean(activeTenantId && presenceEnabled),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,state,status,case_date,entity_id,meta_json,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_type", "PRESENCE_DAY")
        .eq("case_date", selectedDate)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as any as PresenceCaseRow[];
    },
  });

  const caseIds = useMemo(() => (casesQ.data ?? []).map((c) => c.id), [casesQ.data]);

  const punchesQ = useQuery({
    queryKey: ["presence_manage_punches", activeTenantId, selectedDate, caseIds.join(",")],
    enabled: Boolean(activeTenantId && presenceEnabled && caseIds.length),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_punches")
        .select("id,case_id,timestamp,type,within_radius,status,latitude,longitude,distance_from_location")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .order("timestamp", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any as PunchLite[];
    },
  });

  const pendQ = useQuery({
    queryKey: ["presence_manage_pend", activeTenantId, selectedDate, caseIds.join(",")],
    enabled: Boolean(activeTenantId && presenceEnabled && caseIds.length),
    refetchInterval: 10_000,
    queryFn: async () => {
      // pendencies table doesn't always have tenant_id; use case join RLS.
      const { data, error } = await supabase
        .from("pendencies")
        .select("id,case_id,type,required,status")
        .in("case_id", caseIds)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any as PendLite[];
    },
  });

  const lastPunchByCase = useMemo(() => {
    const m = new Map<string, PunchLite>();
    for (const p of punchesQ.data ?? []) {
      if (!m.has(p.case_id)) m.set(p.case_id, p);
    }
    return m;
  }, [punchesQ.data]);

  const pendStatsByCase = useMemo(() => {
    const m = new Map<string, { openAny: number; openRequired: number }>();
    for (const p of pendQ.data ?? []) {
      const cur = m.get(p.case_id) ?? { openAny: 0, openRequired: 0 };
      if (p.status === "open") {
        cur.openAny += 1;
        if (p.required) cur.openRequired += 1;
      }
      m.set(p.case_id, cur);
    }
    return m;
  }, [pendQ.data]);

  const employeesQ = useQuery({
    queryKey: ["presence_manage_employees", activeTenantId, manager],
    enabled: Boolean(activeTenantId && manager),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id,role,display_name,email,deleted_at")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(800);
      if (error) throw error;
      return (data ?? []) as any as EmployeeRow[];
    },
  });

  const employeeIds = useMemo(() => (employeesQ.data ?? []).map((e) => e.user_id), [employeesQ.data]);

  const empCfgQ = useQuery({
    queryKey: ["presence_manage_employee_cfg", activeTenantId, employeeIds.join(",")],
    enabled: Boolean(activeTenantId && manager && employeeIds.length),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presence_employee_configs")
        .select("employee_id,scheduled_start_hhmm,planned_minutes,notes")
        .eq("tenant_id", activeTenantId!)
        .in("employee_id", employeeIds)
        .limit(1200);
      if (error) throw error;
      return (data ?? []) as any as EmployeePresenceConfig[];
    },
  });

  const empCfgByEmployee = useMemo(() => {
    const m = new Map<string, EmployeePresenceConfig>();
    for (const r of empCfgQ.data ?? []) m.set(r.employee_id, r);
    return m;
  }, [empCfgQ.data]);

  const bankLedgerQ = useQuery({
    queryKey: ["presence_manage_bank_ledger", activeTenantId],
    enabled: Boolean(activeTenantId && manager),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_hour_ledger")
        .select("id,employee_id,minutes_delta,balance_after,source,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any as BankLedgerRow[];
    },
  });

  const bankBalanceByEmployee = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of bankLedgerQ.data ?? []) {
      if (!m.has(r.employee_id)) m.set(r.employee_id, r.balance_after);
    }
    return m;
  }, [bankLedgerQ.data]);

  const buckets = useMemo(() => {
    const out = {
      critical: [] as PresenceCaseRow[],
      awaiting_justification: [] as PresenceCaseRow[],
      awaiting_approval: [] as PresenceCaseRow[],
      ok: [] as PresenceCaseRow[],
      closed: [] as PresenceCaseRow[],
    };

    for (const c of casesQ.data ?? []) {
      const st = String(c.state ?? "");
      const isClosed = st === "FECHADO" || String(c.status) === "closed";
      const pend = pendStatsByCase.get(c.id) ?? { openAny: 0, openRequired: 0 };

      if (isClosed) out.closed.push(c);
      else if (st === "PENDENTE_JUSTIFICATIVA") out.awaiting_justification.push(c);
      else if (st === "PENDENTE_APROVACAO") out.awaiting_approval.push(c);
      else if (pend.openRequired > 0) out.critical.push(c);
      else out.ok.push(c);
    }

    return out;
  }, [casesQ.data, pendStatsByCase]);

  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const openCase = useMemo(() => (casesQ.data ?? []).find((c) => c.id === openCaseId) ?? null, [casesQ.data, openCaseId]);

  const [punchDialogOpen, setPunchDialogOpen] = useState(false);
  const [punchDialogMode, setPunchDialogMode] = useState<PunchAdjustMode | null>(null);

  const caseDetailQ = useQuery({
    queryKey: ["presence_manage_case_detail", activeTenantId, openCaseId, openCase?.entity_id],
    enabled: Boolean(activeTenantId && openCaseId && presenceEnabled),
    queryFn: async () => {
      const employeeId = String(openCase?.entity_id ?? "");

      const [timelineRes, punchesRes, pendRes, ledgerRes, adjRes] = await Promise.all([
        supabase
          .from("timeline_events")
          .select("id,occurred_at,event_type,message,meta_json")
          .eq("tenant_id", activeTenantId!)
          .eq("case_id", openCaseId!)
          .order("occurred_at", { ascending: true })
          .limit(500),
        supabase
          .from("time_punches")
          .select("id,timestamp,type,within_radius,status,latitude,longitude,accuracy_meters,distance_from_location,source")
          .eq("tenant_id", activeTenantId!)
          .eq("case_id", openCaseId!)
          .order("timestamp", { ascending: true })
          .limit(200),
        supabase
          .from("pendencies")
          .select("id,type,question_text,required,status,answered_text,created_at")
          .eq("case_id", openCaseId!)
          .order("created_at", { ascending: true })
          .limit(500),
        employeeId
          ? supabase
              .from("bank_hour_ledger")
              .select("id,case_id,employee_id,minutes_delta,balance_after,source,created_at")
              .eq("tenant_id", activeTenantId!)
              .eq("employee_id", employeeId)
              .order("created_at", { ascending: false })
              .limit(80)
          : (Promise.resolve({ data: [], error: null }) as any),
        supabase
          .from("time_punch_adjustments")
          .select("id,punch_id,type,action,from_timestamp,to_timestamp,note,adjusted_by,created_at")
          .eq("tenant_id", activeTenantId!)
          .eq("case_id", openCaseId!)
          .order("created_at", { ascending: false })
          .limit(400),
      ]);

      if (timelineRes.error) throw timelineRes.error;
      if (punchesRes.error) throw punchesRes.error;
      if (pendRes.error) throw pendRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      if (adjRes.error) throw adjRes.error;

      return {
        timeline: timelineRes.data ?? [],
        punches: punchesRes.data ?? [],
        pendencies: pendRes.data ?? [],
        bankLedger: ledgerRes.data ?? [],
        adjustments: (adjRes.data ?? []) as any as PunchAdjustmentRow[],
      };
    },
  });

  const adjustmentsByPunch = useMemo(() => {
    const m = new Map<string, PunchAdjustmentRow[]>();
    for (const a of caseDetailQ.data?.adjustments ?? []) {
      if (!a.punch_id) continue;
      const cur = m.get(a.punch_id) ?? [];
      cur.push(a);
      m.set(a.punch_id, cur);
    }
    return m;
  }, [caseDetailQ.data?.adjustments]);

  const hasLedgerForOpenCase = useMemo(() => {
    return Boolean((caseDetailQ.data?.bankLedger ?? []).some((r: any) => String(r.case_id) === String(openCaseId)));
  }, [caseDetailQ.data?.bankLedger, openCaseId]);

  const openPunchDialogForEdit = (p: any) => {
    if (!openCaseId) return;
    setPunchDialogMode({ mode: "edit", punchId: String(p.id), type: p.type as PresencePunchType, timestampIso: String(p.timestamp) });
    setPunchDialogOpen(true);
  };

  const openPunchDialogForAdd = (type: PresencePunchType) => {
    setPunchDialogMode({ mode: "add", type });
    setPunchDialogOpen(true);
  };

  const submitPunchAdjust = async ({ mode, timestampIso, note }: { mode: PunchAdjustMode; timestampIso: string; note: string }) => {
    if (!activeTenantId || !openCaseId) return;
    if (!manager) {
      showError("Apenas gestores podem ajustar batidas.");
      return;
    }

    try {
      if (mode.mode === "edit") {
        const { data, error } = await supabase.rpc("presence_adjust_time_punch", {
          p_punch_id: mode.punchId,
          p_new_timestamp: timestampIso,
          p_note: note,
        });
        if (error) throw error;
        if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Falha ao ajustar batida");
        showSuccess("Batida ajustada.");
      } else {
        const { data, error } = await supabase.rpc("presence_admin_add_time_punch", {
          p_case_id: openCaseId,
          p_type: mode.type,
          p_timestamp: timestampIso,
          p_note: note,
        });
        if (error) throw error;
        if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Falha ao adicionar batida");
        showSuccess("Batida adicionada.");
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_manage_cases", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["presence_manage_punches", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["presence_manage_case_detail", activeTenantId, openCaseId] }),
        qc.invalidateQueries({ queryKey: ["presence_manage_bank_ledger", activeTenantId] }),
      ]);
    } catch (e: any) {
      const msg = String(e?.message ?? "Falha ao ajustar batida");
      if (msg.includes("note_required")) {
        showError("Nota é obrigatória para ajustes manuais.");
      } else {
        showError(msg);
      }
      throw e;
    }
  };

  // --- Policy/location config (basic) ---
  const configQ = useQuery({
    queryKey: ["presence_manage_geofence", activeTenantId],
    enabled: Boolean(activeTenantId && presenceEnabled && manager),
    queryFn: async () => {
      const [locRes, polRes] = await Promise.all([
        supabase
          .from("presence_locations")
          .select("id,name,latitude,longitude")
          .eq("tenant_id", activeTenantId!)
          .order("created_at", { ascending: true })
          .limit(50),
        supabase
          .from("presence_policies")
          .select("id,location_id,radius_meters,lateness_tolerance_minutes,break_required,allow_outside_radius")
          .eq("tenant_id", activeTenantId!)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (locRes.error) throw locRes.error;
      if (polRes.error) throw polRes.error;

      return {
        locations: (locRes.data ?? []) as any as PresenceLocation[],
        policy: (polRes.data ?? null) as any as PresencePolicy | null,
      };
    },
  });

  const [newLocName, setNewLocName] = useState("");
  const [newLocLat, setNewLocLat] = useState("");
  const [newLocLng, setNewLocLng] = useState("");

  const [policyDraft, setPolicyDraft] = useState<{ location_id: string; radius_meters: string; lateness_tolerance_minutes: string; break_required: boolean; allow_outside_radius: boolean } | null>(null);

  const policyEffective = useMemo(() => {
    const policy = configQ.data?.policy ?? null;
    const locs = configQ.data?.locations ?? [];
    const base = {
      location_id: policy?.location_id ?? (locs[0]?.id ?? ""),
      radius_meters: String(policy?.radius_meters ?? 100),
      lateness_tolerance_minutes: String(policy?.lateness_tolerance_minutes ?? 10),
      break_required: policy?.break_required ?? true,
      allow_outside_radius: policy?.allow_outside_radius ?? true,
    };
    return policyDraft ?? base;
  }, [configQ.data?.policy, configQ.data?.locations, policyDraft]);

  const selectedLocation = useMemo(() => {
    const locs = configQ.data?.locations ?? [];
    return locs.find((l) => l.id === policyEffective.location_id) ?? locs[0] ?? null;
  }, [configQ.data?.locations, policyEffective.location_id]);

  const [mapPin, setMapPin] = useState<{ lat: number; lng: number }>(() => ({
    lat: -23.55052, // SP default
    lng: -46.633308,
  }));

  // Keep map centered on selected location unless the user is already picking a new pin.
  useEffect(() => {
    if (selectedLocation && (!newLocLat || !newLocLng)) {
      setMapPin({ lat: selectedLocation.latitude, lng: selectedLocation.longitude });
      setNewLocLat(selectedLocation.latitude.toFixed(6));
      setNewLocLng(selectedLocation.longitude.toFixed(6));
    }
    // Intentionally do not depend on newLocLat/newLocLng to avoid overriding user's manual edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation?.id]);

  const applyMapPinToInputs = (p: { lat: number; lng: number }) => {
    setMapPin(p);
    setNewLocLat(p.lat.toFixed(6));
    setNewLocLng(p.lng.toFixed(6));
  };

  const savePolicy = async () => {
    if (!activeTenantId || !manager) return;
    if (!policyEffective.location_id) {
      showError("Selecione um local (location_id). ");
      return;
    }

    try {
      const payload = {
        tenant_id: activeTenantId,
        location_id: policyEffective.location_id,
        radius_meters: Math.max(1, Number(policyEffective.radius_meters) || 100),
        lateness_tolerance_minutes: Math.max(0, Number(policyEffective.lateness_tolerance_minutes) || 10),
        break_required: Boolean(policyEffective.break_required),
        allow_outside_radius: Boolean(policyEffective.allow_outside_radius),
      };

      if (configQ.data?.policy?.id) {
        const { error } = await supabase
          .from("presence_policies")
          .update(payload)
          .eq("tenant_id", activeTenantId)
          .eq("id", configQ.data.policy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("presence_policies").insert(payload);
        if (error) throw error;
      }

      showSuccess("Política de presença salva.");
      setPolicyDraft(null);
      await qc.invalidateQueries({ queryKey: ["presence_manage_geofence", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Falha ao salvar política");
    }
  };

  const addLocation = async () => {
    if (!activeTenantId || !manager) return;
    const name = newLocName.trim();
    const lat = Number(newLocLat);
    const lng = Number(newLocLng);
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      showError("Informe nome, latitude e longitude válidos.");
      return;
    }

    try {
      const { error } = await supabase.from("presence_locations").insert({
        tenant_id: activeTenantId,
        name,
        latitude: lat,
        longitude: lng,
      });
      if (error) throw error;
      showSuccess("Local criado.");
      setNewLocName("");
      setNewLocLat("");
      setNewLocLng("");
      await qc.invalidateQueries({ queryKey: ["presence_manage_geofence", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Falha ao criar local");
    }
  };

  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");

  const closeDay = async () => {
    if (!activeTenantId || !openCaseId) return;
    if (!manager) {
      showError("Apenas gestores podem fechar o dia.");
      return;
    }

    setClosing(true);
    try {
      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-close-day";
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId: activeTenantId, caseId: openCaseId, note: closeNote }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Falha ao fechar (${res.status})`);
      }

      showSuccess(json?.result?.ok ? "Dia fechado." : "Fechamento bloqueado; ficou pendente.");
      setCloseNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_manage_cases", activeTenantId, selectedDate, presenceEnabled] }),
        qc.invalidateQueries({ queryKey: ["presence_manage_case_detail", activeTenantId, openCaseId] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao fechar dia");
    } finally {
      setClosing(false);
    }
  };

  const [manualState, setManualState] = useState<string>("AGUARDANDO_ENTRADA");
  const [manualNote, setManualNote] = useState<string>("");

  useEffect(() => {
    if (openCase?.state) setManualState(String(openCase.state));
  }, [openCase?.state]);

  const applyManualState = async () => {
    if (!activeTenantId || !openCaseId || !openCase) return;
    if (!manager) {
      showError("Apenas administradores/gestores podem corrigir etapa.");
      return;
    }

    const next = String(manualState);
    if (!presenceStates.includes(next as any)) {
      showError("Estado inválido.");
      return;
    }

    try {
      const nextStatus = next === "FECHADO" ? "closed" : "open";

      const { error: updErr } = await supabase
        .from("cases")
        .update({ state: next, status: nextStatus })
        .eq("tenant_id", activeTenantId)
        .eq("id", openCaseId);
      if (updErr) throw updErr;

      const { error: tlErr } = await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        case_id: openCaseId,
        event_type: "presence_state_manual_override",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: `Etapa ajustada manualmente: ${titleizeCaseState(String(openCase.state))} → ${titleizeCaseState(next)}`,
        meta_json: {
          from: String(openCase.state),
          to: next,
          note: manualNote || null,
        },
        occurred_at: new Date().toISOString(),
      });
      if (tlErr) throw tlErr;

      showSuccess("Etapa atualizada.");
      setManualNote("");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_manage_cases", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["presence_manage_case_detail", activeTenantId, openCaseId] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao atualizar etapa");
    }
  };

  const upsertEmployeeCfg = async (employeeId: string, patch: Partial<EmployeePresenceConfig>) => {
    if (!activeTenantId || !manager) return;

    const scheduled = (patch.scheduled_start_hhmm ?? null) as any;
    const planned = patch.planned_minutes === undefined ? undefined : patch.planned_minutes;

    try {
      const payload = {
        tenant_id: activeTenantId,
        employee_id: employeeId,
        scheduled_start_hhmm: scheduled,
        planned_minutes: planned ?? null,
        notes: (patch.notes ?? null) as any,
      };

      const { error } = await supabase.from("presence_employee_configs").upsert(payload as any, {
        onConflict: "tenant_id,employee_id",
      });
      if (error) throw error;

      showSuccess("Jornada salva.");
      await qc.invalidateQueries({ queryKey: ["presence_manage_employee_cfg", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Falha ao salvar jornada");
    }
  };

  const columns = [
    {
      key: "critical",
      title: "Pendências críticas",
      icon: ShieldAlert,
      tone: "warn" as const,
      list: buckets.critical,
    },
    {
      key: "awaiting_justification",
      title: "Aguardando justificativa",
      icon: XCircle,
      tone: "warn" as const,
      list: buckets.awaiting_justification,
    },
    {
      key: "awaiting_approval",
      title: "Aguardando aprovação",
      icon: ClipboardCheck,
      tone: "neutral" as const,
      list: buckets.awaiting_approval,
    },
    {
      key: "ok",
      title: "OK",
      icon: Sparkles,
      tone: "ok" as const,
      list: buckets.ok,
    },
    {
      key: "closed",
      title: "Fechados",
      icon: Clock3,
      tone: "closed" as const,
      list: buckets.closed,
    },
  ];

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.presence_manage">
        <AppShell>
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--byfrost-accent))]">
                  <ClipboardCheck className="h-4 w-4" />
                  Presença • Gestão
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">Kanban</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {activeTenant?.slug ?? "—"} • fuso: <span className="font-medium">{timeZone}</span>
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-9 w-[170px] rounded-xl border-0 bg-transparent px-1 text-sm"
                  />
                </div>

                {manager && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="secondary" className="h-11 rounded-2xl">
                        Jornadas
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-full sm:max-w-[620px]">
                      <SheetHeader>
                        <SheetTitle>Jornada por colaborador</SheetTitle>
                      </SheetHeader>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                        Configure <span className="font-semibold">início planejado</span> (HH:MM) e
                        <span className="font-semibold"> minutos planejados</span> (ex.: 480 = 8h). Se vazio, usa o padrão do tenant.
                      </div>

                      <ScrollArea className="mt-4 h-[70vh] pr-3">
                        <div className="space-y-2">
                          {(employeesQ.data ?? []).map((e) => {
                            const cfg = empCfgByEmployee.get(e.user_id);
                            const balance = bankBalanceByEmployee.get(e.user_id);

                            return (
                              <div key={e.user_id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900">
                                      {e.display_name || (e.email ? e.email.split("@")[0] : shortId(e.user_id))}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-600">
                                      {e.email ?? "—"} • role: <span className="font-semibold">{e.role}</span>
                                    </div>
                                  </div>

                                  <Badge className="rounded-full border-0 bg-slate-100 text-slate-800">
                                    Banco: <span className="ml-1 font-semibold">{fmtBalance(balance)}</span>
                                  </Badge>
                                </div>

                                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                  <div>
                                    <div className="text-[11px] font-semibold text-slate-700">Início (HH:MM)</div>
                                    <Input
                                      defaultValue={cfg?.scheduled_start_hhmm ?? ""}
                                      onBlur={(ev) =>
                                        upsertEmployeeCfg(e.user_id, {
                                          scheduled_start_hhmm: ev.target.value.trim() || null,
                                          planned_minutes: cfg?.planned_minutes ?? null,
                                          notes: cfg?.notes ?? null,
                                        })
                                      }
                                      placeholder="08:00"
                                      className="mt-1 h-10 rounded-2xl"
                                    />
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-semibold text-slate-700">Minutos planejados</div>
                                    <Input
                                      type="number"
                                      defaultValue={cfg?.planned_minutes ?? ""}
                                      onBlur={(ev) =>
                                        upsertEmployeeCfg(e.user_id, {
                                          scheduled_start_hhmm: cfg?.scheduled_start_hhmm ?? null,
                                          planned_minutes: ev.target.value.trim() ? Number(ev.target.value) : null,
                                          notes: cfg?.notes ?? null,
                                        })
                                      }
                                      placeholder="480"
                                      className="mt-1 h-10 rounded-2xl"
                                    />
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-semibold text-slate-700">Nota</div>
                                    <Input
                                      defaultValue={cfg?.notes ?? ""}
                                      onBlur={(ev) =>
                                        upsertEmployeeCfg(e.user_id, {
                                          scheduled_start_hhmm: cfg?.scheduled_start_hhmm ?? null,
                                          planned_minutes: cfg?.planned_minutes ?? null,
                                          notes: ev.target.value.trim() || null,
                                        })
                                      }
                                      placeholder="Opcional"
                                      className="mt-1 h-10 rounded-2xl"
                                    />
                                  </div>
                                </div>

                                <div className="mt-2 text-[11px] text-slate-500">
                                  Último saldo: {balance == null ? "—" : fmtBalance(balance)} • variação do dia será lançada ao fechar.
                                </div>
                              </div>
                            );
                          })}

                          {!employeesQ.data?.length && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                              Nenhum colaborador encontrado.
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </SheetContent>
                  </Sheet>
                )}

                {manager && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="secondary" className="h-11 rounded-2xl">
                        Configurar geofence
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-full sm:max-w-[520px]">
                      <SheetHeader>
                        <SheetTitle>Geofence / Política</SheetTitle>
                      </SheetHeader>

                      <div className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-semibold text-slate-900">Locais</div>
                          <div className="mt-2 space-y-2">
                            {(configQ.data?.locations ?? []).map((l) => (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => {
                                  setPolicyDraft((prev) => ({ ...(prev ?? policyEffective), location_id: l.id }));
                                  // Move map to this place (and if not editing a new place, refresh the inputs)
                                  setMapPin({ lat: l.latitude, lng: l.longitude });
                                  if (!newLocLat && !newLocLng) {
                                    setNewLocLat(l.latitude.toFixed(6));
                                    setNewLocLng(l.longitude.toFixed(6));
                                  }
                                }}
                                className={cn(
                                  "w-full rounded-2xl border px-3 py-2 text-left",
                                  policyEffective.location_id === l.id
                                    ? "border-[hsl(var(--byfrost-accent)/0.45)] bg-white"
                                    : "border-slate-200 bg-white/60 hover:bg-white"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900">{l.name}</div>
                                    <div className="mt-0.5 truncate text-[11px] text-slate-600">
                                      {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                                    </div>
                                  </div>
                                  <MapPin className="h-4 w-4 text-slate-400" />
                                </div>
                              </button>
                            ))}
                            {!configQ.data?.locations?.length && (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                                Nenhum local cadastrado.
                              </div>
                            )}
                          </div>

                          <div className="mt-3">
                            <GeofenceMapPicker
                              value={mapPin}
                              onChange={applyMapPinToInputs}
                              radiusMeters={Math.max(1, Number(policyEffective.radius_meters) || 100)}
                            />
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Input
                              value={newLocName}
                              onChange={(e) => setNewLocName(e.target.value)}
                              placeholder="Nome"
                              className="rounded-2xl bg-white"
                            />
                            <Input
                              value={newLocLat}
                              onChange={(e) => setNewLocLat(e.target.value)}
                              placeholder="Lat (clique no mapa)"
                              className="rounded-2xl bg-white"
                            />
                            <Input
                              value={newLocLng}
                              onChange={(e) => setNewLocLng(e.target.value)}
                              placeholder="Lng (clique no mapa)"
                              className="rounded-2xl bg-white"
                            />
                          </div>
                          <Button onClick={addLocation} className="mt-2 h-10 w-full rounded-2xl">
                            Adicionar local
                          </Button>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold text-slate-900">Política</div>
                          <div className="mt-3 grid gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[11px] font-semibold text-slate-700">Raio (m)</div>
                                <Input
                                  value={policyEffective.radius_meters}
                                  onChange={(e) =>
                                    setPolicyDraft((prev) => ({ ...(prev ?? policyEffective), radius_meters: e.target.value }))
                                  }
                                  className="mt-1 rounded-2xl"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold text-slate-700">Tolerância (min)</div>
                                <Input
                                  value={policyEffective.lateness_tolerance_minutes}
                                  onChange={(e) =>
                                    setPolicyDraft((prev) => ({ ...(prev ?? policyEffective), lateness_tolerance_minutes: e.target.value }))
                                  }
                                  className="mt-1 rounded-2xl"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPolicyDraft((prev) => ({
                                    ...(prev ?? policyEffective),
                                    break_required: !Boolean((prev ?? policyEffective).break_required),
                                  }))
                                }
                                className={cn(
                                  "rounded-2xl border px-3 py-2 text-left",
                                  policyEffective.break_required
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-slate-200 bg-slate-50"
                                )}
                              >
                                <div className="text-xs font-semibold text-slate-900">Intervalo obrigatório</div>
                                <div className="mt-0.5 text-[11px] text-slate-600">
                                  {policyEffective.break_required ? "sim" : "não"}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setPolicyDraft((prev) => ({
                                    ...(prev ?? policyEffective),
                                    allow_outside_radius: !Boolean((prev ?? policyEffective).allow_outside_radius),
                                  }))
                                }
                                className={cn(
                                  "rounded-2xl border px-3 py-2 text-left",
                                  policyEffective.allow_outside_radius
                                    ? "border-slate-200 bg-slate-50"
                                    : "border-rose-200 bg-rose-50"
                                )}
                              >
                                <div className="text-xs font-semibold text-slate-900">Permitir fora do raio</div>
                                <div className="mt-0.5 text-[11px] text-slate-600">
                                  {policyEffective.allow_outside_radius ? "sim (com exceção)" : "não"}
                                </div>
                              </button>
                            </div>

                            <Button
                              onClick={savePolicy}
                              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                            >
                              Salvar política
                            </Button>
                            <div className="text-[11px] text-slate-500">
                              Observação: o sistema <span className="font-semibold">nunca bloqueia</span> a batida fora do raio.
                            </div>
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
            </div>

            {!presenceEnabled && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Presença não está habilitada para este tenant (flag <span className="font-mono">presence_enabled</span>).
              </div>
            )}

            <div className="mt-5 overflow-x-auto">
              <div className="flex min-w-[980px] gap-4 pb-1">
                {columns.map((col) => (
                  <div key={col.key} className="w-[320px] shrink-0">
                    <ColumnHeader icon={col.icon} title={col.title} count={col.list.length} tone={col.tone} />
                    <div className="mt-3 space-y-3">
                      {col.list.map((c) => {
                        const lastPunch = lastPunchByCase.get(c.id) ?? null;
                        const pend = pendStatsByCase.get(c.id) ?? { openAny: 0, openRequired: 0 };
                        return (
                          <Sheet key={c.id} open={openCaseId === c.id} onOpenChange={(v) => setOpenCaseId(v ? c.id : null)}>
                            <SheetTrigger asChild>
                              <div>
                                <CaseCard
                                  c={c}
                                  lastPunch={lastPunch}
                                  openAny={pend.openAny}
                                  openRequired={pend.openRequired}
                                  onOpen={() => setOpenCaseId(c.id)}
                                />
                              </div>
                            </SheetTrigger>
                            <SheetContent className="w-full sm:max-w-[720px]">
                              <SheetHeader>
                                <SheetTitle>Presença do dia</SheetTitle>
                              </SheetHeader>

                              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-slate-900">
                                    {(c.meta_json?.presence?.employee_label as string | undefined) ?? shortId(c.entity_id)}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="rounded-full border-0 bg-white text-slate-800 ring-1 ring-slate-200">
                                      {titleizeCaseState(c.state)}
                                    </Badge>
                                    {manager && (
                                      <Badge className="rounded-full border-0 bg-slate-100 text-slate-800">
                                        Banco: <span className="ml-1 font-semibold">{fmtBalance(bankBalanceByEmployee.get(String(c.entity_id)))}</span>
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-600">case_id: {c.id}</div>
                              </div>

                              {manager && (
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-slate-900">Correção manual (admin)</div>
                                  <div className="mt-2 grid gap-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <div className="text-[11px] font-semibold text-slate-700">Etapa</div>
                                        <select
                                          value={manualState}
                                          onChange={(e) => setManualState(e.target.value)}
                                          className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                                        >
                                          {presenceStates.map((s) => (
                                            <option key={s} value={s}>
                                              {titleizeCaseState(s)}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <div className="text-[11px] font-semibold text-slate-700">Observação</div>
                                        <Input
                                          value={manualNote}
                                          onChange={(e) => setManualNote(e.target.value)}
                                          placeholder="Motivo da correção"
                                          className="mt-1 h-10 rounded-2xl"
                                        />
                                      </div>
                                    </div>
                                    <Button onClick={applyManualState} className="h-11 rounded-2xl">
                                      Aplicar correção
                                    </Button>
                                    <div className="text-[11px] text-slate-500">
                                      Isso registra um evento na timeline. Se você escolher <span className="font-semibold">Fechado</span>, as validações do sistema ainda podem mover para pendências.
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-semibold text-slate-900">Batidas</div>
                                    {manager && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          // default: try ENTRY first
                                          const has = new Set((caseDetailQ.data?.punches ?? []).map((p: any) => String(p.type)));
                                          const firstMissing = (["ENTRY", "BREAK_START", "BREAK_END", "EXIT"] as PresencePunchType[]).find(
                                            (t) => !has.has(t)
                                          );
                                          openPunchDialogForAdd(firstMissing ?? "ENTRY");
                                        }}
                                        className="h-9 rounded-2xl"
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Adicionar
                                      </Button>
                                    )}
                                  </div>

                                  <div className="mt-2 space-y-2">
                                    {(caseDetailQ.data?.punches ?? []).map((p: any) => {
                                      const adjs = adjustmentsByPunch.get(String(p.id)) ?? [];
                                      const lastAdj = adjs[0] ?? null;

                                      return (
                                        <div
                                          key={p.id}
                                          className={cn(
                                            "rounded-2xl border bg-slate-50 px-3 py-2",
                                            adjs.length ? "border-[hsl(var(--byfrost-accent)/0.35)]" : "border-slate-200"
                                          )}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <div className="text-sm font-semibold text-slate-900">{titleizePunchType(p.type)}</div>
                                                {adjs.length > 0 && (
                                                  <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                                                    ajustado ({adjs.length})
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="mt-0.5 text-[11px] text-slate-600">
                                                {new Date(p.timestamp).toLocaleTimeString()} • {p.source} • {p.status}
                                              </div>
                                              {lastAdj && (
                                                <div className="mt-2 rounded-2xl bg-white px-3 py-2 text-[11px] text-slate-700 ring-1 ring-slate-200">
                                                  <div className="font-semibold text-slate-800">
                                                    Último ajuste: {new Date(lastAdj.created_at).toLocaleString()}
                                                  </div>
                                                  <div className="mt-0.5 text-slate-700">{lastAdj.note}</div>
                                                </div>
                                              )}
                                            </div>

                                            <div className="flex flex-col items-end gap-2">
                                              <div className="text-right text-[11px] text-slate-600">
                                                {typeof p.distance_from_location === "number" ? `${Math.round(p.distance_from_location)}m` : "—"}
                                              </div>

                                              {manager && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => openPunchDialogForEdit(p)}
                                                  className="h-9 rounded-2xl border border-slate-200 bg-white/70"
                                                >
                                                  <Pencil className="mr-2 h-4 w-4" />
                                                  Ajustar
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {!caseDetailQ.data?.punches?.length && (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                                        Sem batidas.
                                      </div>
                                    )}
                                  </div>

                                  {manager && (
                                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                                      <div className="text-[11px] font-semibold text-slate-800">Adicionar rápido</div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {(["ENTRY", "BREAK_START", "BREAK_END", "EXIT"] as PresencePunchType[]).map((t) => {
                                          const already = (caseDetailQ.data?.punches ?? []).some((p: any) => String(p.type) === t);
                                          return (
                                            <Button
                                              key={t}
                                              size="sm"
                                              variant={already ? "secondary" : "default"}
                                              disabled={already}
                                              onClick={() => openPunchDialogForAdd(t)}
                                              className={cn(
                                                "h-9 rounded-2xl",
                                                already
                                                  ? "opacity-60"
                                                  : "bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                                              )}
                                            >
                                              {titleizePunchType(t)}
                                            </Button>
                                          );
                                        })}
                                      </div>
                                      <div className="mt-2 text-[11px] text-slate-500">
                                        Para qualquer adição/ajuste, uma <span className="font-semibold">nota é obrigatória</span> e fica registrada no histórico.
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-slate-900">Banco de horas</div>
                                  <div className="mt-2 space-y-2">
                                    {(caseDetailQ.data?.bankLedger ?? []).slice(0, 8).map((r: any) => (
                                      <div key={r.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-slate-900">{fmtMinutes(r.minutes_delta)}</div>
                                          <div className="mt-0.5 text-[11px] text-slate-600">
                                            {new Date(r.created_at).toLocaleString()} • {r.source}
                                          </div>
                                        </div>
                                        <div className="text-right text-[11px] font-semibold text-slate-800">
                                          saldo {fmtBalance(r.balance_after)}
                                        </div>
                                      </div>
                                    ))}
                                    {!caseDetailQ.data?.bankLedger?.length && (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                                        Sem lançamentos ainda. O lançamento automático ocorre ao fechar o dia.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-slate-900">Timeline</div>
                                  <div className="text-[11px] text-slate-500">{caseDetailQ.data?.timeline?.length ?? 0}</div>
                                </div>
                                <ScrollArea className="mt-2 h-[220px]">
                                  <div className="space-y-2 pr-3">
                                    {(caseDetailQ.data?.timeline ?? []).map((t: any) => (
                                      <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-[11px] font-semibold text-slate-800">{t.event_type}</div>
                                          <div className="text-[11px] text-slate-500">
                                            {new Date(t.occurred_at).toLocaleTimeString()}
                                          </div>
                                        </div>
                                        {t.message && <div className="mt-1 text-sm text-slate-800">{t.message}</div>}
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-900">Ações humanas</div>
                                    <div className="mt-0.5 text-[11px] text-slate-600">
                                      Somente gestores podem fechar. Ajustes/saldo não são automáticos.
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Textarea
                                      value={closeNote}
                                      onChange={(e) => setCloseNote(e.target.value)}
                                      className="min-h-[40px] w-[280px] rounded-2xl bg-white"
                                      placeholder="Nota (opcional)"
                                    />
                                    <Button
                                      onClick={closeDay}
                                      disabled={closing || !manager || c.state === "FECHADO"}
                                      className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                                    >
                                      {closing ? "Fechando…" : "Fechar dia"}
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <PunchAdjustDialog
                                open={punchDialogOpen}
                                onOpenChange={setPunchDialogOpen}
                                mode={punchDialogMode}
                                caseDate={String(c.case_date ?? selectedDate)}
                                hasLedgerForCase={hasLedgerForOpenCase}
                                onSubmit={submitPunchAdjust}
                              />
                            </SheetContent>
                          </Sheet>
                        );
                      })}

                      {!col.list.length && (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                          Nenhum case aqui.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(casesQ.isError || punchesQ.isError || pendQ.isError) && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                Erro ao carregar: {(casesQ.error as any)?.message ?? (punchesQ.error as any)?.message ?? (pendQ.error as any)?.message ?? ""}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold">Dica:</span> para WhatsApp clocking, habilite a flag <span className="font-mono">presence_allow_whatsapp_clocking</span> na config da jornada.
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}