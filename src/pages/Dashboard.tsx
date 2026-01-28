import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Sparkles } from "lucide-react";

type CaseRow = {
  id: string;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_vendor_id: string | null;
  vendors?: { display_name: string | null; phone_e164: string | null } | null;
};

const columns = [
  { key: "queue", label: "Fila", states: ["new", "awaiting_ocr", "awaiting_location"] },
  { key: "in_progress", label: "Em andamento", states: ["pending_vendor"] },
  { key: "review", label: "Revisão", states: ["ready_for_review"] },
  { key: "done", label: "Confirmados", states: ["confirmed", "in_separation", "in_route", "delivered", "finalized"] },
];

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

export default function Dashboard() {
  const { activeTenantId } = useTenant();

  const casesQ = useQuery({
    queryKey: ["cases", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,title,status,state,created_at,updated_at,assigned_vendor_id,vendors(display_name,phone_e164)")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const pendQ = useQuery({
    queryKey: ["pendencies_open", activeTenantId, casesQ.data?.map((c) => c.id).join(",")],
    enabled: Boolean(activeTenantId && casesQ.data?.length),
    queryFn: async () => {
      const ids = (casesQ.data ?? []).map((c) => c.id);
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

  const rows = casesQ.data ?? [];

  const grouped = columns.map((col) => ({
    ...col,
    items: rows.filter((c) => col.states.includes(c.state)),
  }));

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Casos (MVP)</h2>
              <p className="mt-1 text-sm text-slate-600">
                Board por estados. A IA apenas sugere e pede informações — mudanças de status e aprovações são
                humanas.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <div className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-2 text-xs font-medium text-[hsl(var(--byfrost-accent))]">
                <Sparkles className="mr-1 inline h-4 w-4" /> explicabilidade ativa
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto pb-1">
            <div className="flex min-w-[950px] gap-4">
              {grouped.map((col) => (
                <div key={col.key} className="w-[320px] flex-shrink-0">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                    <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {col.items.length}
                    </div>
                  </div>

                  <div className="mt-2 space-y-3">
                    {col.items.map((c) => {
                      const pend = pendQ.data?.get(c.id);
                      const age = minutesAgo(c.updated_at);
                      return (
                        <Link
                          key={c.id}
                          to={`/app/cases/${c.id}`}
                          className={cn(
                            "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                            "border-slate-200 hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {c.title ?? "Caso"}
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">
                                {(c.vendors?.display_name ?? "Vendedor") +
                                  (c.vendors?.phone_e164 ? ` • ${c.vendors.phone_e164}` : "")}
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
                        Sem cards aqui.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

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
