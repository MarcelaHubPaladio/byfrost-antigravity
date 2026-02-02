import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Columns3 } from "lucide-react";
import { ContentKanban } from "@/components/content/ContentKanban";
import { ContentCalendar } from "@/components/content/ContentCalendar";

export default function Content() {
  const { activeTenantId } = useTenant();
  const [tab, setTab] = useState<string>("kanban");

  const metaEnabledQ = useQuery({
    queryKey: ["meta_content_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("config_json, journeys!inner(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "meta_content")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as any)?.config_json?.meta_content_enabled === true);
    },
  });

  const enabled = Boolean(metaEnabledQ.data);

  const badge = useMemo(() => {
    if (!activeTenantId) return null;
    if (metaEnabledQ.isLoading) return { label: "verificando…", tone: "bg-slate-100 text-slate-700" };
    if (!enabled) return { label: "desabilitado", tone: "bg-amber-100 text-amber-900" };
    return { label: "ativo", tone: "bg-emerald-100 text-emerald-900" };
  }, [activeTenantId, metaEnabledQ.isLoading, enabled]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Conteúdo</h2>
                {badge ? (
                  <Badge className={`rounded-full border-0 hover:bg-inherit ${badge.tone}`}>{badge.label}</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Produção + scheduler oficial do fluxo <span className="font-semibold">meta_content</span>.
              </p>
            </div>
          </div>

          {!enabled && !metaEnabledQ.isLoading ? (
            <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              A jornada <span className="font-semibold">meta_content</span> está desabilitada para este tenant.
              <div className="mt-1 text-xs text-amber-900/80">
                Ative em Admin → Jornadas → selecione Meta Content → <span className="font-mono">meta_content_enabled</span>.
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="rounded-2xl bg-white/70 p-1">
                  <TabsTrigger value="kanban" className="rounded-xl">
                    <Columns3 className="mr-2 h-4 w-4" /> Kanban
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="rounded-xl">
                    <CalendarDays className="mr-2 h-4 w-4" /> Calendário
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="kanban" className="mt-4">
                  <ContentKanban />
                </TabsContent>

                <TabsContent value="calendar" className="mt-4">
                  <ContentCalendar />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
