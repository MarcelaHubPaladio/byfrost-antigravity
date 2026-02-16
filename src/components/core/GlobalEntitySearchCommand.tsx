import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type EntityRow = {
  id: string;
  entity_type: string;
  subtype: string | null;
  display_name: string;
  status: string | null;
};

export function GlobalEntitySearchCommand() {
  const nav = useNavigate();
  const { activeTenantId } = useTenant();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      const meta = e.metaKey || e.ctrlKey;
      if (meta && isK) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const searchQ = useQuery({
    queryKey: ["global_entity_search", activeTenantId, q],
    enabled: Boolean(open && activeTenantId && q.trim().length >= 2),
    queryFn: async () => {
      const term = q.trim();
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,entity_type,subtype,display_name,status")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .ilike("display_name", `%${term}%`)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as EntityRow[];
    },
    staleTime: 5_000,
  });

  const items = searchQ.data ?? [];

  const hint = useMemo(() => {
    return "Ctrl+K para buscar entidades";
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
        title={hint}
      >
        <span className="text-slate-500">Buscar entidade…</span>
        <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buscar entidades</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Digite pelo menos 2 caracteres…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
              {q.trim().length < 2 ? (
                <div className="p-4 text-sm text-slate-600">Digite para pesquisar.</div>
              ) : searchQ.isLoading ? (
                <div className="p-4 text-sm text-slate-600">Buscando…</div>
              ) : items.length === 0 ? (
                <div className="p-4 text-sm text-slate-600">Nenhuma entidade encontrada.</div>
              ) : (
                <div className="divide-y">
                  {items.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setQ("");
                        nav(`/app/entities/${e.id}`);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{e.display_name}</div>
                          <div className="text-xs text-slate-600">
                            {e.entity_type}
                            {e.subtype ? ` • ${e.subtype}` : ""}
                            {e.status ? ` • ${e.status}` : ""}
                          </div>
                        </div>
                        <Badge variant="secondary">{e.entity_type}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
