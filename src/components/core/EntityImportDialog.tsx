import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess } from "@/utils/toast";
import { Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type EntityImportDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantId: string;
};

type ParsedEntityRow = {
    display_name: string;
    source_type_raw: string;
    entity_type: "party" | "offering";
    subtype: string | null;
};

function stripOuterQuotes(s: string) {
    const t = String(s ?? "").trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1).trim();
    }
    return t;
}

function splitCsvLine(line: string, delimiter: "," | ";") {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }

        if (!inQuotes && ch === delimiter) {
            out.push(cur.trim());
            cur = "";
            continue;
        }

        cur += ch;
    }

    out.push(cur.trim());
    return out.map(stripOuterQuotes);
}

function mapTypeAndSubtype(rawType: string): { entity_type: "party" | "offering"; subtype: string | null } {
    const t = String(rawType ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    // Parties
    if (["cliente", "customer", "paciente", "aluno"].includes(t)) {
        return { entity_type: "party", subtype: "customer" };
    }
    if (["fornecedor", "supplier", "vendor"].includes(t)) {
        return { entity_type: "party", subtype: "supplier" };
    }
    if (["colaborador", "funcionario", "employee", "partner", "socio"].includes(t)) {
        return { entity_type: "party", subtype: "collaborator" };
    }

    // Offerings
    if (["produto", "product", "item"].includes(t)) {
        return { entity_type: "offering", subtype: "product" };
    }
    if (["servico", "service"].includes(t)) {
        return { entity_type: "offering", subtype: "service" };
    }
    if (["plano", "assinatura", "subscription", "plan"].includes(t)) {
        return { entity_type: "offering", subtype: "subscription" };
    }

    // Fallback defaults
    if (t.includes("produto") || t.includes("servico")) {
        return { entity_type: "offering", subtype: null };
    }

    return { entity_type: "party", subtype: null }; // Default to generic party
}

function parseEntityCsv(text: string, defaultType: "party" | "offering"): ParsedEntityRow[] {
    const raw = String(text ?? "");
    const lines = raw
        .replace(/^\uFEFF/, "") // remove BOM
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    if (!lines.length) return [];

    const header = lines[0];
    const headerLower = header.toLowerCase();

    const delimiter: "," | ";" | null = header.includes(";") ? ";" : header.includes(",") ? "," : null;

    if (!delimiter) {
        // Single column list (Names only)
        const out: ParsedEntityRow[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = stripOuterQuotes(lines[i]);
            const lower = line.toLowerCase();
            if (i === 0 && ["nome", "name", "entidade", "entidades"].includes(lower)) continue;
            if (!line) continue;
            out.push({ display_name: line, source_type_raw: "", entity_type: defaultType, subtype: null });
        }
        return out;
    }

    // Multi-column
    const headerCells = splitCsvLine(header, delimiter).map((c) => c.toLowerCase());
    const nameIdx = headerCells.findIndex((c) => ["nome", "name", "entidade", "cliente", "fornecedor"].includes(c));
    const typeIdx = headerCells.findIndex((c) => ["tipo", "type", "categoria"].includes(c));

    const rows: ParsedEntityRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i], delimiter);
        const name = String(cells[nameIdx >= 0 ? nameIdx : 0] ?? "").trim();
        if (!name) continue;

        const typeRaw = String(cells[typeIdx >= 0 ? typeIdx : 1] ?? "").trim();

        let mapped = mapTypeAndSubtype(typeRaw);

        // If type wasn't provided or mapping failed, use fallback
        if (!typeRaw) {
            mapped = { entity_type: defaultType, subtype: null };
        }

        rows.push({
            display_name: name,
            source_type_raw: typeRaw,
            entity_type: mapped.entity_type,
            subtype: mapped.subtype
        });
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const deduped: ParsedEntityRow[] = [];
    for (const r of rows) {
        const key = r.display_name.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(r);
        }
    }

    return deduped;
}

export function EntityImportDialog({ open, onOpenChange, tenantId }: EntityImportDialogProps) {
    const qc = useQueryClient();
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importDefaultType, setImportDefaultType] = useState<"party" | "offering">("party");
    const [importPreview, setImportPreview] = useState<ParsedEntityRow[]>([]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setImportFile(null);
            setImportPreview([]);
            return;
        }
        setImportFile(file);
        const text = await file.text();
        const parsed = parseEntityCsv(text, importDefaultType);
        setImportPreview(parsed);
    };

    const handleDefaultTypeChange = async (val: "party" | "offering") => {
        setImportDefaultType(val);
        if (importFile) {
            const text = await importFile.text();
            const parsed = parseEntityCsv(text, val);
            setImportPreview(parsed);
        }
    }

    const importM = useMutation({
        mutationFn: async () => {
            if (!tenantId) throw new Error("Tenant inválido");
            if (!importFile) throw new Error("Selecione um arquivo CSV");

            const text = await importFile.text();
            const parsed = parseEntityCsv(text, importDefaultType);
            if (!parsed.length) throw new Error("Nenhum registro válido encontrado no CSV");

            const rows = parsed.map((p) => ({
                tenant_id: tenantId,
                display_name: p.display_name,
                entity_type: p.entity_type,
                subtype: p.subtype,
                status: "active",
            }));

            // Upsert: matching on tenant_id + display_name is not natively unique in schema
            // Since core_entities does not have a unique constraint on (tenant_id, display_name) by default,
            // we'll do an insert. Let's filter out ones that already exist ideally, but insert is safer than failing.

            // Let's implement an insert that ignores if duplicate logic exists, or just insert.
            // Easiest is to insert all right now as user might have same name people contextually.

            const { data, error } = await supabase
                .from("core_entities")
                .insert(rows)
                .select("id");

            if (error) throw error;

            return {
                total: parsed.length,
                inserted: (data ?? []).length,
            };
        },
        onSuccess: async (res) => {
            showSuccess(`Importação concluída. ${res.inserted} entidades importadas.`);
            setImportFile(null);
            setImportPreview([]);
            setImportDefaultType("party");
            onOpenChange(false);
            await qc.invalidateQueries({ queryKey: ["entities", tenantId] });
        },
        onError: (e: any) => showError(e?.message ?? "Falha ao importar entidades"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Importar Entidades via CSV</DialogTitle>
                    <DialogDescription>
                        Envie uma lista de colunas como `Nome;Tipo`.
                        O sistema reconhece termos como Cliente, Fornecedor e Produto automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 pr-2">
                    <div className="space-y-4 pt-2 pb-6">
                        <div className="rounded-[16px] border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
                            <b>Dica:</b> A primeira linha do CSV é considerada o cabeçalho. Formatos suportados: <code>[Nome]</code> ou <code>[Nome, Tipo]</code>.
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <Label className="text-xs">Se não houver coluna "Tipo", classificar como:</Label>
                                <Select value={importDefaultType} onValueChange={(val) => handleDefaultTypeChange(val as "party" | "offering")}>
                                    <SelectTrigger className="mt-1 h-9 rounded-2xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="party">Party (Ex: Cliente, Fornecedor)</SelectItem>
                                        <SelectItem value="offering">Offering (Ex: Produto, Serviço)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs">Arquivo (.csv)</Label>
                                <Input
                                    type="file"
                                    accept=".csv"
                                    className="mt-1 h-9 rounded-2xl file:mr-4 file:h-full file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-0 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                                    onChange={handleFileChange}
                                    disabled={importM.isPending}
                                />
                            </div>
                        </div>

                        {importPreview.length > 0 ? (
                            <div className="mt-4">
                                <Label className="text-xs mb-2 block">Pré-visualização (primeiros 10)</Label>
                                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nome</TableHead>
                                                <TableHead>Macro-Tipo</TableHead>
                                                <TableHead>Subtipo Interpretado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {importPreview.slice(0, 10).map((p, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-medium">{p.display_name}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{p.entity_type}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {p.subtype ? <Badge variant="secondary">{p.subtype}</Badge> : <span className="text-slate-400">Padrão genérico</span>}
                                                        {p.source_type_raw && p.source_type_raw !== p.subtype ? (
                                                            <span className="ml-2 text-[10px] text-slate-500">(de: "{p.source_type_raw}")</span>
                                                        ) : null}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {importPreview.length > 10 ? (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="text-center text-xs text-slate-500 py-3">
                                                        ... e mais {importPreview.length - 10} registros.
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </ScrollArea>

                <DialogFooter className="mt-4 border-t pt-4">
                    <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        className="h-10 rounded-2xl"
                        disabled={!importFile || importM.isPending || importPreview.length === 0}
                        onClick={() => importM.mutate()}
                    >
                        {importM.isPending ? "Importando..." : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Importar {importPreview.length} registros
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
