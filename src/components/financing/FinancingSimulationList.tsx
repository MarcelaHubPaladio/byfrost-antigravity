import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Trash2, FileDown, Search, Plus, Building2, TrendingUp, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBRL } from "./useSimulationEngine";

type Simulation = {
  id: string;
  reference_number: string;
  status: "draft" | "finalized" | "archived";
  created_at: string;
  client_snapshot_json: Record<string, any>;
  simulation_params_json: Record<string, any>;
  results_json: Record<string, any>;
  entity_id: string | null;
  notes: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  finalized: "Finalizada",
  archived: "Arquivada",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  finalized: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
};

interface Props {
  onNew: () => void;
  onEdit: (sim: Simulation) => void;
  onView: (sim: Simulation) => void;
}

export function FinancingSimulationList({ onNew, onEdit, onView }: Props) {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const simsQ = useQuery({
    queryKey: ["financing_simulations", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financing_simulations")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Simulation[];
    },
  });

  const deleteSim = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase
        .from("financing_simulations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deletingId);
      if (error) throw error;
      showSuccess("Simulação excluída.");
      setDeletingId(null);
      await qc.invalidateQueries({ queryKey: ["financing_simulations", activeTenantId] });
    } catch (e: any) {
      showError(`Falha: ${e?.message ?? "erro"}`);
    }
  };

  const sims = simsQ.data ?? [];
  const filtered = sims.filter((s) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const name = (s.client_snapshot_json?.name ?? "").toLowerCase();
    const cpf = (s.client_snapshot_json?.cpf ?? "").toLowerCase();
    const ref = (s.reference_number ?? "").toLowerCase();
    const bank = (s.simulation_params_json?.bank_name ?? "").toLowerCase();
    return name.includes(q) || cpf.includes(q) || ref.includes(q) || bank.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, CPF, ref., banco…"
            className="h-10 rounded-2xl pl-9"
          />
        </div>
        <Button
          onClick={onNew}
          className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.9)]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova Simulação
        </Button>
      </div>

      {simsQ.isLoading && (
        <div className="text-center py-10 text-sm text-slate-500">Carregando simulações…</div>
      )}

      {!simsQ.isLoading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">Nenhuma simulação encontrada</p>
          <p className="text-xs text-slate-400">Clique em "Nova Simulação" para criar a primeira proposta.</p>
          <Button onClick={onNew} className="mt-4 h-9 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nova Simulação
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((s) => {
          const clientName = s.client_snapshot_json?.name ?? "Cliente não identificado";
          const bankName = s.simulation_params_json?.bank_name ?? "—";
          const propVal = s.simulation_params_json?.property_value;
          const loanVal = s.simulation_params_json?.loan_value ?? s.results_json?.loanValue;
          const termMonths = s.simulation_params_json?.term_months;
          const pricePayment = s.results_json?.price?.monthly_payment ?? s.results_json?.price?.monthlyPayment;
          const sacFirst = s.results_json?.sac?.first_payment ?? s.results_json?.sac?.firstPayment;

          return (
            <div
              key={s.id}
              className="group rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm transition hover:border-[hsl(var(--byfrost-accent)/0.3)] hover:shadow-md"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{clientName}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_COLOR[s.status])}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span className="font-mono text-[11px]">#{s.reference_number}</span>
                      <span>{bankName}</span>
                      {propVal && <span>Imóvel: <span className="font-semibold text-slate-700">{fmtBRL(propVal)}</span></span>}
                      {loanVal && <span>Financ.: <span className="font-semibold text-slate-700">{fmtBRL(loanVal)}</span></span>}
                      {termMonths && <span>{termMonths} meses</span>}
                    </div>
                    {(pricePayment || sacFirst) && (
                      <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
                        {pricePayment && <span>Price: <span className="font-semibold text-emerald-700">{fmtBRL(pricePayment)}/mês</span></span>}
                        {sacFirst && <span>SAC 1ª: <span className="font-semibold text-blue-700">{fmtBRL(sacFirst)}/mês</span></span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 mr-2">
                    <Calendar className="h-3 w-3" />
                    {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  <button
                    onClick={() => onView(s)}
                    className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    title="Ver simulação"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeletingId(s.id)}
                    className="rounded-xl p-2 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={Boolean(deletingId)} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir simulação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A simulação será permanentemente removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-2xl bg-rose-600 hover:bg-rose-700" onClick={deleteSim}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
