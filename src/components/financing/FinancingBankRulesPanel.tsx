import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Building2, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type BankRule = {
  id: string;
  bank_name: string;
  bank_code: string;
  base_rate_pct: number;
  rate_rules_json: any[];
  tac_json: Record<string, any>;
  min_loan_value: number | null;
  max_loan_value: number | null;
  max_term_months: number | null;
  is_active: boolean;
};

const DEFAULT_BANK_RULES = [
  {
    bank_name: "Caixa Econômica Federal",
    bank_code: "CEF",
    base_rate_pct: 10.99,
    rate_rules_json: [
      { label: "Servidor Público", condition: "is_public_servant", rate_bonus_pct: -0.5 },
      { label: "FGTS > 3 anos",    condition: "fgts_years_gt_3",  rate_bonus_pct: -0.25 },
      { label: "Idade > 50",       condition: "age_gte_51",       rate_bonus_pct: 0.3 },
    ],
    tac_json: { fixed: 3500, min_down_pct: 20 },
    max_term_months: 420,
  },
  {
    bank_name: "Bradesco",
    bank_code: "BRA",
    base_rate_pct: 11.49,
    rate_rules_json: [
      { label: "Servidor Público", condition: "is_public_servant", rate_bonus_pct: -0.3 },
      { label: "FGTS > 3 anos",    condition: "fgts_years_gt_3",  rate_bonus_pct: -0.2 },
    ],
    tac_json: { fixed: 3800, min_down_pct: 20 },
    max_term_months: 360,
  },
  {
    bank_name: "Itaú Unibanco",
    bank_code: "ITA",
    base_rate_pct: 11.29,
    rate_rules_json: [
      { label: "Servidor Público", condition: "is_public_servant", rate_bonus_pct: -0.4 },
      { label: "Idade < 30",       condition: "age_lt_30",        rate_bonus_pct: -0.1 },
    ],
    tac_json: { fixed: 3600, min_down_pct: 20 },
    max_term_months: 360,
  },
  {
    bank_name: "Santander",
    bank_code: "SAN",
    base_rate_pct: 11.69,
    rate_rules_json: [
      { label: "FGTS > 3 anos",    condition: "fgts_years_gt_3",  rate_bonus_pct: -0.3 },
      { label: "Servidor Público", condition: "is_public_servant", rate_bonus_pct: -0.35 },
    ],
    tac_json: { fixed: 4200, min_down_pct: 20 },
    max_term_months: 360,
  },
];

const CONDITION_LABELS: Record<string, string> = {
  is_public_servant: "Servidor Público",
  fgts_years_gt_3: "FGTS > 3 anos",
  age_lt_30: "Idade < 30 anos",
  age_gte_51: "Idade ≥ 51 anos",
  has_minor_children: "Tem filhos menores",
};

export function FinancingBankRulesPanel() {
  const { activeTenantId, isSuperAdmin } = useTenant();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankRule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [fBankName, setFBankName] = useState("");
  const [fBankCode, setFBankCode] = useState("");
  const [fBaseRate, setFBaseRate] = useState("");
  const [fTac, setFTac] = useState("");
  const [fMinDownPct, setFMinDownPct] = useState("20");
  const [fMaxTerm, setFMaxTerm] = useState("360");
  const [fMinLoan, setFMinLoan] = useState("");
  const [fMaxLoan, setFMaxLoan] = useState("");
  const [fRules, setFRules] = useState<Array<{ condition: string; rate_bonus_pct: string }>>([]);

  const banksQ = useQuery({
    queryKey: ["financing_bank_rules", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financing_bank_rules")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("bank_name");
      if (error) throw error;
      return (data ?? []) as BankRule[];
    },
  });

  const openCreate = () => {
    setEditingBank(null);
    setFBankName(""); setFBankCode(""); setFBaseRate(""); setFTac("3500");
    setFMinDownPct("20"); setFMaxTerm("360"); setFMinLoan(""); setFMaxLoan(""); setFRules([]);
    setDialogOpen(true);
  };

  const openEdit = (b: BankRule) => {
    setEditingBank(b);
    setFBankName(b.bank_name);
    setFBankCode(b.bank_code);
    setFBaseRate(String(b.base_rate_pct));
    setFTac(String(b.tac_json?.fixed ?? ""));
    setFMinDownPct(String(b.tac_json?.min_down_pct ?? 20));
    setFMaxTerm(String(b.max_term_months ?? 360));
    setFMinLoan(String(b.min_loan_value ?? ""));
    setFMaxLoan(String(b.max_loan_value ?? ""));
    setFRules((b.rate_rules_json ?? []).map((r: any) => ({
      condition: r.condition,
      rate_bonus_pct: String(r.rate_bonus_pct),
    })));
    setDialogOpen(true);
  };

  const addRule = () => {
    setFRules((prev) => [...prev, { condition: "is_public_servant", rate_bonus_pct: "-0.3" }]);
  };

  const removeRule = (i: number) => setFRules((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!activeTenantId || !fBankName.trim() || !fBankCode.trim() || !fBaseRate) return;
    setSaving(true);
    try {
      const minDownPct = parseFloat(fMinDownPct) || 20;
      const payload = {
        tenant_id: activeTenantId,
        bank_name: fBankName.trim(),
        bank_code: fBankCode.trim().toUpperCase(),
        base_rate_pct: parseFloat(fBaseRate),
        tac_json: { fixed: parseFloat(fTac) || 0, min_down_pct: minDownPct },
        max_term_months: parseInt(fMaxTerm) || 360,
        min_loan_value: fMinLoan ? parseFloat(fMinLoan) : null,
        max_loan_value: fMaxLoan ? parseFloat(fMaxLoan) : null,
        rate_rules_json: fRules.map((r) => ({
          label: CONDITION_LABELS[r.condition] ?? r.condition,
          condition: r.condition,
          rate_bonus_pct: parseFloat(r.rate_bonus_pct) || 0,
        })),
      };

      if (editingBank) {
        const { error } = await supabase
          .from("financing_bank_rules")
          .update(payload)
          .eq("id", editingBank.id);
        if (error) throw error;
        showSuccess("Banco atualizado.");
      } else {
        const { error } = await supabase.from("financing_bank_rules").insert(payload);
        if (error) throw error;
        showSuccess("Banco criado.");
      }
      setDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financing_bank_rules", activeTenantId] });
    } catch (e: any) {
      showError(`Falha: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: BankRule) => {
    try {
      const { error } = await supabase
        .from("financing_bank_rules")
        .update({ is_active: !b.is_active })
        .eq("id", b.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["financing_bank_rules", activeTenantId] });
    } catch (e: any) {
      showError(`Falha: ${e?.message ?? "erro"}`);
    }
  };

  const deleteBank = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase
        .from("financing_bank_rules")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deletingId);
      if (error) throw error;
      showSuccess("Banco removido.");
      setDeletingId(null);
      await qc.invalidateQueries({ queryKey: ["financing_bank_rules", activeTenantId] });
    } catch (e: any) {
      showError(`Falha: ${e?.message ?? "erro"}`);
    }
  };

  const seedDefaults = async () => {
    if (!activeTenantId) return;
    setSaving(true);
    try {
      const rows = DEFAULT_BANK_RULES.map((b) => ({ ...b, tenant_id: activeTenantId }));
      const { error } = await supabase.from("financing_bank_rules").insert(rows);
      if (error) throw error;
      showSuccess("Bancos padrão criados com sucesso!");
      await qc.invalidateQueries({ queryKey: ["financing_bank_rules", activeTenantId] });
    } catch (e: any) {
      showError(`Falha: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const banks = banksQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Regras de Bancos</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure taxas base e regras de desconto por perfil do cliente.
          </p>
        </div>
        <div className="flex gap-2">
          {banks.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-2xl text-xs"
              onClick={seedDefaults}
              disabled={saving}
            >
              Criar bancos padrão
            </Button>
          )}
          <Button
            size="sm"
            className="h-9 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white text-xs hover:bg-[hsl(var(--byfrost-accent)/0.9)]"
            onClick={openCreate}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo banco
          </Button>
        </div>
      </div>

      {banksQ.isLoading && (
        <div className="text-center py-8 text-sm text-slate-500">Carregando...</div>
      )}

      {banks.length === 0 && !banksQ.isLoading && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Building2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Nenhum banco configurado.</p>
          <p className="text-xs text-slate-400">Crie um banco ou use os padrões (CEF, Bradesco, Itaú, Santander).</p>
        </div>
      )}

      <div className="space-y-2">
        {banks.map((b) => {
          const expanded = expandedId === b.id;
          return (
            <div
              key={b.id}
              className={cn(
                "rounded-2xl border bg-white/70 transition-all",
                b.is_active ? "border-slate-200" : "border-slate-100 opacity-60"
              )}
            >
              <div
                className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
                onClick={() => setExpandedId(expanded ? null : b.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--byfrost-accent)/0.10)] text-xs font-bold text-[hsl(var(--byfrost-accent))]">
                    {b.bank_code}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{b.bank_name}</div>
                    <div className="text-xs text-slate-500">
                      Taxa base: <span className="font-semibold text-slate-700">{b.base_rate_pct}% a.a.</span>
                      {" · "}TAC: <span className="font-semibold text-slate-700">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(b.tac_json?.fixed ?? 0)}
                      </span>
                      {" · "}Entrada mín.:{" "}<span className="font-semibold text-slate-700">{b.tac_json?.min_down_pct ?? 20}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={b.is_active ? "default" : "secondary"} className="rounded-full text-[11px]">
                    {b.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(b); }}
                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingId(b.id); }}
                    className="rounded-xl p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </div>

              {expanded && (
                <div className="border-t border-slate-100 px-4 pb-3 pt-2">
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">Regras de desconto/acréscimo na taxa</div>
                  {(b.rate_rules_json ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhuma regra configurada.</p>
                  ) : (
                    <div className="space-y-1">
                      {b.rate_rules_json.map((r: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className={cn(
                            "inline-flex h-5 min-w-[44px] items-center justify-center rounded-full px-1.5 font-bold",
                            r.rate_bonus_pct < 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          )}>
                            {r.rate_bonus_pct > 0 ? "+" : ""}{r.rate_bonus_pct}%
                          </span>
                          <span className="text-slate-600">{r.label ?? r.condition}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-slate-500">
                    <div>Prazo máx: <span className="font-semibold text-slate-700">{b.max_term_months ?? "—"} meses</span></div>
                    {b.min_loan_value && <div>Mín: <span className="font-semibold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(b.min_loan_value)}</span></div>}
                    {b.max_loan_value && <div>Máx: <span className="font-semibold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(b.max_loan_value)}</span></div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[28px] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBank ? "Editar banco" : "Novo banco"}</DialogTitle>
            <DialogDescription>Configure taxas e regras de desconto.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Nome do banco</Label>
                <Input value={fBankName} onChange={(e) => setFBankName(e.target.value)} className="mt-1 rounded-2xl" placeholder="Caixa Econômica Federal" />
              </div>
              <div>
                <Label className="text-xs">Código (sigla)</Label>
                <Input value={fBankCode} onChange={(e) => setFBankCode(e.target.value)} className="mt-1 rounded-2xl uppercase" placeholder="CEF" maxLength={6} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Taxa base (% a.a.)</Label>
                <Input value={fBaseRate} onChange={(e) => setFBaseRate(e.target.value)} type="number" step="0.01" className="mt-1 rounded-2xl" placeholder="10.99" />
              </div>
              <div>
                <Label className="text-xs">Entrada mínima (%)</Label>
                <div className="relative">
                  <Input value={fMinDownPct} onChange={(e) => setFMinDownPct(e.target.value)} type="number" step="1" min="0" max="100" className="mt-1 rounded-2xl" placeholder="20" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 mt-0.5">% do imóvel</span>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">TAC (R$)</Label>
                <Input value={fTac} onChange={(e) => setFTac(e.target.value)} type="number" step="0.01" className="mt-1 rounded-2xl" placeholder="3500" />
              </div>
              <div>
                <Label className="text-xs">Prazo máx (meses)</Label>
                <Input value={fMaxTerm} onChange={(e) => setFMaxTerm(e.target.value)} type="number" className="mt-1 rounded-2xl" placeholder="360" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Valor mínimo (R$)</Label>
                <Input value={fMinLoan} onChange={(e) => setFMinLoan(e.target.value)} type="number" className="mt-1 rounded-2xl" placeholder="Opcional" />
              </div>
              <div>
                <Label className="text-xs">Valor máximo (R$)</Label>
                <Input value={fMaxLoan} onChange={(e) => setFMaxLoan(e.target.value)} type="number" className="mt-1 rounded-2xl" placeholder="Opcional" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">Regras de desconto/acréscimo na taxa</Label>
                <button type="button" onClick={addRule} className="text-[11px] font-semibold text-[hsl(var(--byfrost-accent))] hover:underline">
                  + Adicionar regra
                </button>
              </div>
              <div className="space-y-2">
                {fRules.map((r, i) => {
                  const numVal = parseFloat(r.rate_bonus_pct) || 0;
                  const isNegative = numVal <= 0 && r.rate_bonus_pct !== "";
                  // Toggle sign: if currently negative, flip to positive and vice versa
                  const toggleSign = () => {
                    const abs = Math.abs(parseFloat(r.rate_bonus_pct) || 0.3);
                    const newVal = isNegative ? String(abs) : String(-abs);
                    setFRules((prev) => prev.map((x, idx) => idx === i ? { ...x, rate_bonus_pct: newVal } : x));
                  };
                  return (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={r.condition}
                        onChange={(e) => setFRules((prev) => prev.map((x, idx) => idx === i ? { ...x, condition: e.target.value } : x))}
                        className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                      >
                        {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {/* Sign toggle */}
                      <button
                        type="button"
                        onClick={toggleSign}
                        title={isNegative ? "Desconto (clique para virar acréscimo)" : "Acréscimo (clique para virar desconto)"}
                        className={cn(
                          "h-10 w-10 flex-shrink-0 rounded-2xl text-xs font-bold border transition-colors",
                          isNegative
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                            : "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100"
                        )}
                      >
                        {isNegative ? "−" : "+"}
                      </button>
                      {/* Absolute value */}
                      <div className="relative w-24">
                        <Input
                          value={Math.abs(parseFloat(r.rate_bonus_pct) || 0) || ""}
                          onChange={(e) => {
                            const abs = Math.abs(parseFloat(e.target.value) || 0);
                            const signed = isNegative ? -abs : abs;
                            setFRules((prev) => prev.map((x, idx) => idx === i ? { ...x, rate_bonus_pct: String(signed) } : x));
                          }}
                          className="rounded-2xl pr-7"
                          placeholder="0.3"
                          type="number"
                          step="0.05"
                          min="0"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
                      </div>
                      <button type="button" onClick={() => removeRule(i)} className="rounded-xl p-2 text-rose-400 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                {fRules.length === 0 && (
                  <p className="text-xs text-slate-400">Nenhuma regra. Clique em "+ Adicionar regra" para inserir condições de desconto.</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-2xl" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              className="rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.9)]"
              onClick={save}
              disabled={saving || !fBankName.trim() || !fBankCode.trim() || !fBaseRate}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={Boolean(deletingId)} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banco?</AlertDialogTitle>
            <AlertDialogDescription>
              Simulações existentes não serão afetadas, mas o banco não estará disponível para novas simulações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-2xl bg-rose-600 hover:bg-rose-700" onClick={deleteBank}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
