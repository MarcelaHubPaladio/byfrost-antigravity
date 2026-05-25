import React, { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess } from "@/utils/toast";
import { Search, Upload, Download, Pencil, X } from "lucide-react";
import { CategoryType, CATEGORY_LABELS, parseCategoryCsv, ParsedCategory } from "@/lib/financial-utils";

type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType;
};

export function CategoriesTab() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const categoriesQ = useQuery({
    queryKey: ["financial_categories", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("id, name, type")
        .eq("tenant_id", activeTenantId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  // --------------------------
  // Category creation
  // --------------------------
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<CategoryType>("variable");

  const createCategoryM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const name = newCatName.trim();
      if (!name) throw new Error("Informe o nome da categoria");

      const { data, error } = await supabase
        .from("financial_categories")
        .insert({ tenant_id: activeTenantId, name, type: newCatType })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    onSuccess: async () => {
      showSuccess("Categoria criada.");
      setNewCatName("");
      setNewCatType("variable");
      setCatDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Falha ao criar categoria");
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        showError("Já existe uma categoria com esse nome.");
      } else {
        showError(msg);
      }
    },
  });

  // --------------------------
  // Category Deletion / Remapping
  // --------------------------
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryRow | null>(null);
  const [remappingTargetId, setRemappingTargetId] = useState<string | null>(null);

  const deleteCategoryWithRemapM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId || !categoryToDelete || !remappingTargetId) {
        throw new Error("Dados insuficientes para exclusão.");
      }
      if (categoryToDelete.id === remappingTargetId) {
        throw new Error("A categoria de destino deve ser diferente da atual.");
      }

      // 1. Update all transactions to target category
      const { error: txErr } = await supabase
        .from("financial_transactions")
        .update({ category_id: remappingTargetId })
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);
      if (txErr) throw txErr;

      // 2. Update payables
      const { error: payErr } = await supabase
        .from("financial_payables")
        .update({ category_id: remappingTargetId })
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);
      if (payErr) throw payErr;

      // 3. Update receivables
      const { error: recErr } = await supabase
        .from("financial_receivables")
        .update({ category_id: remappingTargetId })
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);
      if (recErr) throw recErr;

      // 4. Delete classification rules
      await supabase
        .from("classification_rules")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);

      // 5. Delete the category
      const { error: delErr } = await supabase
        .from("financial_categories")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", categoryToDelete.id);
      if (delErr) throw delErr;
    },
    onSuccess: async () => {
      showSuccess(`Categoria "${categoryToDelete?.name}" removida. Lançamentos, contas a pagar e receber foram movidos.`);
      setCategoryToDelete(null);
      setRemappingTargetId(null);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_payables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao remover categoria"),
  });

  // --------------------------
  // Category type editing
  // --------------------------
  const [editTypesOpen, setEditTypesOpen] = useState(false);
  const [editTypesFilter, setEditTypesFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const filteredCategories = useMemo(() => {
    const q = editTypesFilter.trim().toLowerCase();
    const rows = categoriesQ.data ?? [];
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoriesQ.data, editTypesFilter]);

  const mainFilteredCategories = useMemo(() => {
    const q = catFilter.trim().toLowerCase();
    const rows = categoriesQ.data ?? [];
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoriesQ.data, catFilter]);

  const updateCategoryTypeM = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: CategoryType }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase
        .from("financial_categories")
        .update({ type })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
      showSuccess("Tipo atualizado.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar tipo"),
  });

  // --------------------------
  // Category import (CSV)
  // --------------------------
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDefaultType, setImportDefaultType] = useState<CategoryType>("variable");
  const [importPreview, setImportPreview] = useState<ParsedCategory[]>([]);

  const importCategoriesM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      if (!importFile) throw new Error("Selecione um arquivo CSV");

      const text = await importFile.text();
      const parsed = parseCategoryCsv(text);
      if (parsed.length === 0) throw new Error("Nenhuma categoria encontrada no CSV");

      const rows = parsed.map((r) => ({
        tenant_id: activeTenantId,
        name: r.name,
        type: r.type ?? importDefaultType,
      }));

      const { data, error } = await supabase
        .from("financial_categories")
        .upsert(rows as any, { onConflict: "tenant_id,name", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;

      return {
        total: parsed.length,
        inserted: (data ?? []).length,
      };
    },
    onSuccess: async (res) => {
      showSuccess(`Importação concluída. ${res.inserted} novas / ${res.total} no CSV.`);
      setImportFile(null);
      setImportPreview([]);
      setImportDefaultType("variable");
      setImportDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao importar categorias"),
  });

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Categorias</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Crie/importa categorias para classificar lançamentos e treinar regras automáticas.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" className="h-9 rounded-2xl">
            <a href="/templates/categorias_com_tipo.csv" download>
              <Download className="mr-2 h-4 w-4" />
              Modelo CSV
            </a>
          </Button>

          <Dialog open={editTypesOpen} onOpenChange={setEditTypesOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="h-9 rounded-2xl" disabled={!activeTenantId}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar tipos
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Editar tipo das categorias</DialogTitle>
                <DialogDescription>
                  Depois da importação, ajuste o tipo (receita/custo/fixo/variável/outro). As alterações são salvas na hora.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Buscar</Label>
                  <Input
                    className="mt-1 rounded-2xl"
                    value={editTypesFilter}
                    onChange={(e) => setEditTypesFilter(e.target.value)}
                    placeholder="Ex: impostos, marketing, salários…"
                  />
                </div>

                <ScrollArea className="h-[55vh] rounded-2xl border border-slate-200 dark:border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="w-[220px]">Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(filteredCategories ?? []).slice(0, 1000).map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">{c.name}</TableCell>
                          <TableCell>
                            <Select
                              value={c.type}
                              onValueChange={(v) =>
                                updateCategoryTypeM.mutate({ id: c.id, type: v as CategoryType })
                              }
                            >
                              <SelectTrigger className="h-9 rounded-2xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(["revenue", "cost", "fixed", "variable", "investment", "financing", "other"] as CategoryType[]).map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {CATEGORY_LABELS[t]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}

                      {!categoriesQ.isLoading && !(categoriesQ.data ?? []).length ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-slate-600 dark:text-slate-400">
                            Nenhuma categoria ainda.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {(filteredCategories ?? []).length > 1000 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Mostrando 1000 de {(filteredCategories ?? []).length}. Use a busca para refinar.
                  </div>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setEditTypesOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={importDialogOpen}
            onOpenChange={(v) => {
              setImportDialogOpen(v);
              if (!v) {
                setImportFile(null);
                setImportPreview([]);
                setImportDefaultType("variable");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="secondary" className="h-9 rounded-2xl" disabled={!activeTenantId}>
                <Upload className="mr-2 h-4 w-4" />
                Importar CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Importar categorias (CSV)</DialogTitle>
                <DialogDescription>
                  Você pode usar 1 coluna (Categoria) ou 2 colunas (Categoria;Tipo). Se o Tipo estiver vazio, usamos o tipo padrão.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Tipo padrão (fallback)</Label>
                  <Select value={importDefaultType} onValueChange={(v) => setImportDefaultType(v as CategoryType)}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["revenue", "cost", "fixed", "variable", "investment", "financing", "other"] as CategoryType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {CATEGORY_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Valores aceitos em "Tipo": revenue/cost/fixed/variable/other (ou receita/custo/fixo/variável/outro).
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Arquivo CSV</Label>
                  <Input
                    className="mt-1 rounded-2xl"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      setImportFile(f);
                      if (!f) {
                        setImportPreview([]);
                        return;
                      }
                      try {
                        const text = await f.text();
                        const parsed = parseCategoryCsv(text);
                        setImportPreview(parsed);
                      } catch {
                        setImportPreview([]);
                      }
                    }}
                  />
                  {importPreview.length ? (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      {importPreview.length} categorias detectadas. Ex.:{" "}
                      {importPreview
                        .slice(0, 3)
                        .map((r) => `${r.name}${r.type ? ` (${r.type})` : ""}`)
                        .join(", ")}
                      {importPreview.length > 3 ? "…" : ""}
                    </div>
                  ) : null}
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setImportDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="h-10 rounded-2xl"
                  disabled={!activeTenantId || importCategoriesM.isPending || !importFile}
                  onClick={() => importCategoriesM.mutate()}
                >
                  {importCategoriesM.isPending ? "Importando…" : "Importar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 rounded-2xl" disabled={!activeTenantId}>
                Nova categoria
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
                <DialogDescription>
                  Dica: use nomes curtos (ex.: "Marketing", "Combustível", "Recebíveis").
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input
                    className="mt-1 rounded-2xl"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Ex: Marketing"
                  />
                </div>

                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={newCatType} onValueChange={(v) => setNewCatType(v as CategoryType)}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["revenue", "cost", "fixed", "variable", "investment", "financing", "other"] as CategoryType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {CATEGORY_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={() => setCatDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="h-10 rounded-2xl"
                  onClick={() => createCategoryM.mutate()}
                  disabled={createCategoryM.isPending || !activeTenantId}
                >
                  {createCategoryM.isPending ? "Salvando…" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9 rounded-2xl h-9"
            placeholder="Buscar categorias..."
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(mainFilteredCategories ?? []).map((c) => (
          <div
            key={c.id}
            className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-1.5 py-1 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all"
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-[10px] text-slate-400 font-normal uppercase tracking-tight">{CATEGORY_LABELS[c.type]}</span>
            
            <Dialog>
              <DialogTrigger asChild>
                <button
                  onClick={() => {
                    setCategoryToDelete(c);
                    setRemappingTargetId(null);
                  }}
                  className="h-5 w-5 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                  <DialogTitle>Excluir categoria</DialogTitle>
                  <DialogDescription>
                    Para manter o histórico, você deve transferir os lançamentos dessa categoria para outra.
                  </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                  <Label className="text-xs">Nova categoria para os lançamentos</Label>
                  <Select
                    value={remappingTargetId || undefined}
                    onValueChange={setRemappingTargetId}
                  >
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue placeholder="Selecione a categoria de destino..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(categoriesQ.data ?? [])
                        .filter((cat) => cat.id !== categoryToDelete?.id)
                        .map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter>
                  <Button variant="secondary" className="rounded-2xl" onClick={() => setCategoryToDelete(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    className="rounded-2xl"
                    disabled={!remappingTargetId || deleteCategoryWithRemapM.isPending}
                    onClick={() => deleteCategoryWithRemapM.mutate()}
                  >
                    {deleteCategoryWithRemapM.isPending ? "Excluindo..." : "Excluir e Transferir"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ))}
        {!categoriesQ.isLoading && !(categoriesQ.data ?? []).length ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">Nenhuma categoria ainda.</div>
        ) : null}
      </div>
    </div>
    </Card>
  );
}
