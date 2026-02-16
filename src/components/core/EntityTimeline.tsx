import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CoreEntityEventRow = {
  id: string;
  tenant_id: string;
  entity_id: string;
  event_type: string;
  before: any;
  after: any;
  actor_user_id: string | null;
  created_at: string;
};

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function EntityTimeline({ tenantId, entityId }: { tenantId: string; entityId: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<CoreEntityEventRow | null>(null);

  const q = useQuery({
    queryKey: ["core_entity_events", tenantId, entityId],
    enabled: Boolean(tenantId && entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entity_events")
        .select("id,tenant_id,entity_id,event_type,before,after,actor_user_id,created_at")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CoreEntityEventRow[];
    },
    staleTime: 5_000,
  });

  const rows = q.data ?? [];

  const summary = useMemo(() => {
    if (q.isLoading) return "Carregando…";
    return `${rows.length} evento(s)`;
  }, [q.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">{summary}</div>

      <div className="divide-y rounded-2xl border bg-white">
        {q.isLoading ? (
          <div className="p-4 text-sm text-slate-600">Carregando timeline…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">Sem eventos.</div>
        ) : (
          rows.map((ev) => (
            <div key={ev.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={cn("font-semibold")}> 
                    {ev.event_type}
                  </Badge>
                  <span className="text-xs text-slate-500">{formatTs(ev.created_at)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  actor: {ev.actor_user_id ?? "system"}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActive(ev);
                  setOpen(true);
                }}
              >
                Ver
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Evento</DialogTitle>
          </DialogHeader>
          {active ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{active.event_type}</Badge>
                <span className="text-xs text-slate-600">{formatTs(active.created_at)}</span>
                <span className="text-xs text-slate-600">actor: {active.actor_user_id ?? "system"}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-700">before</div>
                  <pre className="max-h-[45vh] overflow-auto text-xs text-slate-800">
                    {JSON.stringify(active.before, null, 2)}
                  </pre>
                </div>
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-700">after</div>
                  <pre className="max-h-[45vh] overflow-auto text-xs text-slate-800">
                    {JSON.stringify(active.after, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
