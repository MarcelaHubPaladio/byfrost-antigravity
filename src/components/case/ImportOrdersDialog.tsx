import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { FileUp, UploadCloud, AlertTriangle, CheckCircle2, Download, Package, Info } from "lucide-react";

type JourneyInfo = {
  id: string;
  key: string;
  name: string;
  default_state_machine_json?: {
    states?: string[];
  };
};

type UserProfileLite = {
  user_id: string;
  email: string | null;
  display_name?: string | null;
  meta_json?: any;
};

type ParsedRow = {
  rowNo: number;
  id?: string;
  externalId: string;
  customerName: string;
  whatsapp: string;
  email: string;
  cpfCnpj: string;
  address: string;
  ownerEmail: string;
  paymentTerms: string;
  signal: string;
  dueDate: string;
  saleDate: string;
  customerCity: string;
  paymentMethod: string;
  billingStatus: string;
  itemCode: string;
  itemDescription: string;
  itemQty: string;
  itemPrice: string;
  obs: string;
};

type OrderItem = {
  code: string;
  description: string;
  qty: number;
  price: number;
  discountPct: number;
  matchedOfferingId?: string | null;
};

type GroupedOrder = {
  id: string; // Grouping key
  dbId?: string; // Actual case_id from database if updating
  externalId: string;
  customerName: string;
  whatsapp: string;
  email: string;
  cpfCnpj: string;
  address: string;
  ownerEmail: string;
  paymentTerms: string;
  signal: string;
  dueDate: string;
  saleDate: string;
  customerCity: string;
  paymentMethod: string;
  billingStatus: string;
  obs: string;
  items: OrderItem[];
};

function stripBom(s: string) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

function digitsOnly(s: string | null | undefined) {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizeWhatsappOrNull(raw: string) {
  const s = String(raw ?? "").trim();
  const digitsRaw = digitsOnly(s);
  if (!digitsRaw) return { phone: null as string | null, error: null as string | null };

  let digits = digitsRaw;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (digits.length < 10) return { phone: null, error: "WhatsApp inválido (curto)" };
  return { phone: `+${digits}`, error: null };
}

function parsePtBrNumber(input: string) {
  // Remove R$, espaços, e qualquer caractere invisível como non-breaking space
  const raw = (input ?? "").trim().replace(/[^\d.,-]/g, ""); 
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(input: string): string {
  let s = String(input ?? "").trim().replace(/\s/g, "");
  if (!s) return "";
  
  // Handle double slashes
  s = s.replace(/\/\/+/g, "/");

  // 1. Try DD/MM/YYYY or DD/MM/YY (standard or with separators like . -)
  const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    let [_, d, m, y] = slashMatch;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 2. Try typo DD/MMYYYY (like 31/032026)
  const typoMatch1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(\d{4})$/);
  if (typoMatch1) {
    const [_, d, m, y] = typoMatch1;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 3. Try typo DDMMYYYY (like 31032026)
  const typoMatch2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (typoMatch2) {
    const [_, d, m, y] = typoMatch2;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 4. Try YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return s; 
}

function normalizeBillingStatus(raw: string): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("pago") || s.includes("faturado")) return "Pago";
  if (s.includes("canc")) return "Cancelado";
  return "Pendente";
}

function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const s = headerLine ?? "";
  let inQ = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQ && s[i + 1] === '"') { i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (inQ) continue;
    if (ch === ",") commas++;
    if (ch === ";") semis++;
    if (ch === "\t") tabs++;
  }
  if (tabs > commas && tabs > semis) return "\t";
  return semis >= commas ? ";" : ",";
}

function parseCsv(text: string, delimiter: "," | ";" | "\t"): string[][] {
  const rows: string[][] = [];
  const s = stripBom(text);
  let row: string[] = [];
  let cur = "";
  let inQ = false;

  const pushCell = () => { row.push(cur); cur = ""; };
  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") { row = []; return; }
    rows.push(row); row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQ && s[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ; continue;
    }
    if (!inQ && ch === delimiter) { pushCell(); continue; }
    if (!inQ && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      pushCell(); pushRow(); continue;
    }
    cur += ch;
  }
  pushCell(); pushRow();
  return rows;
}

function normHeader(s: string) {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");
}

function pickHeaderIndex(headers: string[], variants: string[]) {
  const h = headers.map(normHeader);
  for (const v of variants) {
    const i = h.indexOf(normHeader(v));
    if (i >= 0) return i;
  }
  return -1;
}

export function ImportOrdersDialog({
  tenantId,
  journey,
  actorUserId,
  trigger,
}: {
  tenantId: string;
  journey: JourneyInfo;
  actorUserId: string | null;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setFileName("");
    setRawText("");
    setParsingError(null);
    setImporting(false);
    setProgress(null);
  };

  const parsedOrders = useMemo(() => {
    if (!rawText.trim()) return [] as GroupedOrder[];
    try {
      const lines = rawText.split(/\r\n|\n|\r/);
      const delimiter = detectDelimiter(lines[0] ?? "");
      const table = parseCsv(rawText, delimiter);
      if (!table.length) return [];

      const headers = table[0].map((x) => String(x ?? "").trim());
      const idxId = pickHeaderIndex(headers, ["id", "case_id", "id_pedido"]);
      const idxExt = pickHeaderIndex(headers, ["id_externo", "external_id", "numero_pedido"]);
      const idxName = pickHeaderIndex(headers, ["cliente_nome", "nome", "name"]);
      const idxWa = pickHeaderIndex(headers, ["cliente_whatsapp", "whatsapp", "telefone", "phone"]);
      const idxEmail = pickHeaderIndex(headers, ["cliente_email", "email"]);
      const idxCpf = pickHeaderIndex(headers, ["cliente_cpf_cnpj", "cpf", "cnpj"]);
      const idxAddr = pickHeaderIndex(headers, ["cliente_endereco", "endereco", "address"]);
      const idxOwner = pickHeaderIndex(headers, ["vendedor_email", "dono", "owner"]);
      const idxPay = pickHeaderIndex(headers, ["pagamento_condicoes", "condicoes", "payment_terms"]);
      const idxSignal = pickHeaderIndex(headers, ["valor_sinal", "sinal", "signal"]);
      const idxDue = pickHeaderIndex(headers, ["vencimento", "due_date"]);
      const idxSaleDate = pickHeaderIndex(headers, ["data_venda", "data", "date", "sale_date"]);
      const idxCity = pickHeaderIndex(headers, ["cidade_cliente", "cliente_cidade", "cidade", "city"]);
      const idxPayMethod = pickHeaderIndex(headers, ["forma_pagamento", "pagamento_forma", "payment_method"]);
      const idxBillStatus = pickHeaderIndex(headers, ["status_faturamento", "faturamento_status", "billing_status"]);
      const idxItemCode = pickHeaderIndex(headers, ["item_codigo", "codigo", "code"]);
      const idxItemDesc = pickHeaderIndex(headers, ["item_descricao", "descricao", "description"]);
      const idxItemQty = pickHeaderIndex(headers, ["item_qtd", "quantidade", "qty"]);
      const idxItemPrice = pickHeaderIndex(headers, ["item_valor_unit", "valor", "price"]);
      const idxItemDiscount = pickHeaderIndex(headers, ["item_desconto_pct", "desconto", "discount"]);
      const idxObs = pickHeaderIndex(headers, ["obs", "notes"]);

      const ordersMap = new Map<string, GroupedOrder>();

      for (let i = 1; i < table.length; i++) {
        const row = table[i];
        const dbId = idxId >= 0 ? String(row[idxId] ?? "").trim() : "";
        const extId = idxExt >= 0 ? String(row[idxExt] ?? "").trim() : "";
        const wa = idxWa >= 0 ? String(row[idxWa] ?? "").trim() : "";
        const pay = idxPay >= 0 ? String(row[idxPay] ?? "").trim() : "";
        const rawSaleDate = idxSaleDate >= 0 ? String(row[idxSaleDate] ?? "") : "";
        const normSaleDate = normalizeDate(rawSaleDate);
        
        // Grouping key: externalId + saleDate OR (whatsapp + paymentTerms)
        // Reused IDs on different dates/customers should be treated as separate orders
        const groupKey = extId 
          ? `${extId}|${normSaleDate}` 
          : `${wa}|${pay}`;
        
        if (!groupKey || groupKey === "|" || groupKey.startsWith("|")) continue;

        let order = ordersMap.get(groupKey);
        if (!order) {
          order = {
            id: groupKey,
            dbId: dbId,
            externalId: extId,
            customerName: idxName >= 0 ? String(row[idxName] ?? "").trim() : "",
            whatsapp: wa,
            email: idxEmail >= 0 ? String(row[idxEmail] ?? "").trim() : "",
            cpfCnpj: idxCpf >= 0 ? String(row[idxCpf] ?? "").trim() : "",
            address: idxAddr >= 0 ? String(row[idxAddr] ?? "").trim() : "",
            ownerEmail: idxOwner >= 0 ? String(row[idxOwner] ?? "").trim() : "",
            paymentTerms: pay,
            signal: idxSignal >= 0 ? String(row[idxSignal] ?? "").trim() : "",
            dueDate: idxDue >= 0 ? normalizeDate(String(row[idxDue] ?? "")) : "",
            saleDate: normSaleDate,
            customerCity: idxCity >= 0 ? String(row[idxCity] ?? "").trim() : "",
            paymentMethod: idxPayMethod >= 0 ? String(row[idxPayMethod] ?? "").trim() : "",
            billingStatus: idxBillStatus >= 0 ? normalizeBillingStatus(row[idxBillStatus]) : "Pendente",
            obs: idxObs >= 0 ? String(row[idxObs] ?? "").trim() : "",
            items: []
          };
          ordersMap.set(groupKey, order);
        }

        const itemCode = idxItemCode >= 0 ? String(row[idxItemCode] ?? "").trim() : "";
        const itemDesc = idxItemDesc >= 0 ? String(row[idxItemDesc] ?? "").trim() : "";
        if (itemCode || itemDesc) {
          order.items.push({
            code: itemCode,
            description: itemDesc,
            qty: idxItemQty >= 0 ? parsePtBrNumber(row[idxItemQty]) : 1,
            price: idxItemPrice >= 0 ? parsePtBrNumber(row[idxItemPrice]) : 0,
            discountPct: idxItemDiscount >= 0 ? parsePtBrNumber(row[idxItemDiscount]) : 0
          });
        }
      }
      setParsingError(null);
      return Array.from(ordersMap.values());
    } catch (e: any) {
      setParsingError(e?.message ?? "Falha ao processar CSV");
      return [];
    }
  }, [rawText]);

  const onFile = async (f: File | null) => {
    reset();
    if (!f) return;
    setFileName(f.name);
    try {
      const text = await f.text();
      setRawText(text);
    } catch (e: any) {
      showError(`Falha ao ler arquivo: ${e?.message}`);
    }
  };

  const handleImport = async () => {
    if (!parsedOrders.length) return;
    setImporting(true);
    setProgress({ done: 0, total: parsedOrders.length });

    try {
      // Load users for owner mapping
      const { data: usersData } = await supabase.rpc("list_tenant_users_profiles", { p_tenant_id: tenantId });
      const usersMap = new Map<string, UserProfileLite>();
      ((usersData ?? []) as UserProfileLite[]).forEach((u) => {
        if (u.email) usersMap.set(u.email.toLowerCase().trim(), u);
      });

      // Load offerings (products) for matching
      const { data: offeringsData } = await supabase
        .from("core_entities")
        .select("id,display_name,metadata")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "offering")
        .is("deleted_at", null);
      
      const offerings = (offeringsData ?? []) as any[];

      const firstState = (journey.default_state_machine_json?.states ?? [])[0] || "new";

      for (let i = 0; i < parsedOrders.length; i++) {
        const o = parsedOrders[i];
        
        // 1. Ensure Customer
        const { phone: waE164 } = normalizeWhatsappOrNull(o.whatsapp);
        let customerId: string | null = null;
        if (waE164) {
          const { data: existingCust } = await supabase
            .from("customer_accounts")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("phone_e164", waE164)
            .maybeSingle();
          
          if (existingCust) {
            customerId = existingCust.id;
          } else {
            const { data: newCust, error: custErr } = await supabase
              .from("customer_accounts")
              .insert({
                tenant_id: tenantId,
                phone_e164: waE164,
                name: o.customerName || null,
                email: o.email || null,
                meta_json: { source: "bulk_import", import_file: fileName }
              })
              .select("id")
              .single();
            if (custErr) {
              console.error("Erro ao criar cliente:", custErr.message);
            }
            if (newCust) customerId = newCust.id;
          }
        }

        // 2. Resolve Case (Update or Create)
        let caseId: string | null = null;
        const tId = String(tenantId).trim();
        if (!tId || tId.length < 32) throw new Error("ID de tenant inválido");

        const ownerProfile = usersMap.get(o.ownerEmail.toLowerCase().trim());
        const ownerUserId = ownerProfile?.user_id || null;
        const ownerCommissionRules = ownerProfile?.meta_json?.commission_rules;

        // Try to find existing case by provided dbId or externalId
        if (o.dbId) {
          const { data: existing } = await supabase
            .from("cases")
            .select("id")
            .eq("tenant_id", tId)
            .eq("id", o.dbId)
            .maybeSingle();
          if (existing) caseId = existing.id;
        }

        if (!caseId && o.externalId) {
          const { data: existing } = await supabase
            .from("cases")
            .select("id")
            .eq("tenant_id", tId)
            .eq("journey_id", journey.id)
            .filter("meta_json->>external_id", "eq", o.externalId)
            .maybeSingle();
          if (existing) caseId = existing.id;
        }

        if (caseId) {
          // Update existing case
          const { error: caseErr } = await supabase
            .from("cases")
            .update({
              customer_id: customerId || undefined,
              assigned_user_id: ownerUserId || undefined,
              title: o.customerName || undefined,
              updated_at: new Date().toISOString(),
              meta_json: { 
                external_id: o.externalId, 
                import_source: "bulk_update", 
                import_file: fileName,
                last_import_at: new Date().toISOString()
              }
            })
            .eq("id", caseId);
          if (caseErr) throw caseErr;
        } else {
          // Create New Case
          const { data: caseRow, error: caseErr } = await supabase
            .from("cases")
            .insert({
              tenant_id: tId,
              journey_id: journey.id,
              customer_id: customerId,
              assigned_user_id: ownerUserId,
              title: o.customerName || "Pedido Importado",
              case_type: "sales_order",
              status: "open",
              state: firstState,
              created_by_channel: "panel",
              meta_json: { 
                external_id: o.externalId, 
                import_source: "bulk", 
                import_file: fileName 
              }
            })
            .select("id")
            .single();

          if (caseErr || !caseRow) throw caseErr || new Error("Falha ao criar pedido");
          caseId = caseRow.id;
        }

        // 3. Upsert Fields
        const fields = [
          { key: "name", value_text: o.customerName },
          { key: "email", value_text: o.email },
          { key: "cpf", value_text: o.cpfCnpj },
          { key: "address", value_text: o.address },
          { key: "payment_terms", value_text: o.paymentTerms },
          { key: "payment_signal_value_raw", value_text: o.signal },
          { key: "payment_due_date_text", value_text: normalizeDate(o.dueDate) },
          { key: "sale_date_text", value_text: normalizeDate(o.saleDate) },
          { key: "city", value_text: o.customerCity },
          { key: "payment_method", value_text: o.paymentMethod },
          { key: "billing_status", value_text: o.billingStatus },
          { key: "obs", value_text: o.obs },
        ].filter(f => f.value_text).map(f => ({
          case_id: caseId,
          key: f.key,
          value_text: f.value_text,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel"
        }));

        if (fields.length) {
          await supabase.from("case_fields").upsert(fields, { onConflict: "case_id,key" });
        }

        // 4. Update Items (Replace methodology to ensure sync)
        const unmatchedNames: string[] = [];
        if (o.items.length) {
          // If updating, clear existing items first
          await supabase.from("case_items").delete().eq("case_id", caseId);

          const itemsPayload = o.items.map((it, idx) => {
            // Attempt to match offering if not already matched
            let offeringId = it.matchedOfferingId || null;
            if (!offeringId) {
              const codeClean = it.code.trim().toLowerCase();
              const descClean = it.description.trim().toLowerCase();
              
              const match = offerings.find(off => {
                const offCode = String(off.metadata?.code || off.metadata?.short_name || "").toLowerCase();
                const offName = String(off.display_name || "").toLowerCase();
                return (codeClean && offCode === codeClean) || (descClean && offName === descClean);
              });
              if (match) {
                offeringId = match.id;
              } else {
                unmatchedNames.push(it.description || it.code || "Item sem nome");
              }
            }

            // Calculate Commission based on owner rules
            let commissionValue = 0;
            const subtotal = it.qty * it.price;
            const discValue = subtotal * (it.discountPct / 100);
            const total = subtotal - discValue;

            if (ownerCommissionRules) {
                const base = ownerCommissionRules.base_percent || 0;
                const tiers = ownerCommissionRules.discount_tiers || [];
                const tier = tiers.find((t: any) => t.max_discount_pct >= it.discountPct);
                const pct = tier ? tier.commission_pct : base;
                commissionValue = total * (pct / 100);
            }

            return {
              tenant_id: tenantId,
              case_id: caseId,
              line_no: idx + 1,
              code: it.code || null,
              description: it.description || null,
              qty: it.qty,
              price: it.price,
              discount_percent: it.discountPct,
              discount_value: discValue,
              total,
              commission_value: commissionValue,
              offering_entity_id: offeringId,
              confidence_json: { source: "bulk_import" }
            };
          });
          await supabase.from("case_items").insert(itemsPayload);
        }

        // 5. Update Observations if items were unmatched
        if (unmatchedNames.length > 0) {
          const warning = `⚠️ Atenção: Os itens [${unmatchedNames.join(", ")}] não foram vinculados automaticamente ao catálogo de produtos.`;
          const finalObs = o.obs ? `${o.obs}\n\n${warning}` : warning;
          
          await supabase
            .from("case_fields")
            .upsert({
              case_id: caseId,
              key: "obs",
              value_text: finalObs,
              confidence: 1,
              source: "admin",
              last_updated_by: "panel"
            }, { onConflict: "case_id,key" });
        }

        setProgress(p => p ? { ...p, done: i + 1 } : null);
      }

      showSuccess(`${parsedOrders.length} pedidos importados com sucesso.`);
      qc.invalidateQueries({ queryKey: ["cases_orders"] });
      setOpen(false);
      reset();
    } catch (e: any) {
      showError(`Erro na importação: ${e?.message}`);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      "id_externo,data_venda,cliente_nome,cliente_whatsapp,cliente_email,cliente_cpf_cnpj,cliente_endereco,cliente_cidade,vendedor_email,pagamento_condicoes,forma_pagamento,valor_sinal,vencimento,status_faturamento,item_codigo,item_descricao,item_qtd,item_valor_unit,obs",
      '1001,10/05/2026,João Silva,42988887777,joao@email.com,123.456.789-00,Rua A 123,Guarapuava,vendedor@agroforte.com,30 dias,Boleto,"R$ 500,00",15/05/2026,Faturado,PROD01,Semente de Milho,10,"R$ 150,00",Entrega urgente',
      '1001,10/05/2026,João Silva,42988887777,joao@email.com,123.456.789-00,Rua A 123,Guarapuava,vendedor@agroforte.com,30 dias,Boleto,"R$ 500,00",15/05/2026,Faturado,PROD02,Fertilizante NPK,5,"R$ 80,00",',
      '1002,12/04/2026,Maria Oliveira,41999998888,maria@email.com,00.111.222/0001-99,Av Central 456,Curitiba,vendedor2@agroforte.com,À vista,PIX,,20/04/2026,Pendente,SERV01,Assessoria Técnica,1,"R$ 300,00",Pagamento via PIX'
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_importacao_pedidos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
      <DialogTrigger asChild>
        {trigger || <Button variant="secondary" className="h-10 rounded-2xl"><UploadCloud className="mr-2 h-4 w-4" /> Importar</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-[28px] p-0 overflow-hidden">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" /> Importar Pedidos em Massa
              </DialogTitle>
              <DialogDescription>
                Suba uma planilha CSV para criar múltiplos pedidos simultaneamente.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-6">
              <div className="rounded-2xl bg-blue-50 p-4 border border-blue-100 space-y-3">
                <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
                  <Info className="h-4 w-4" /> Instruções de Importação
                </div>
                <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                  <li>Use o <b>ID Externo</b> para agrupar vários itens no mesmo pedido.</li>
                  <li>Se o ID estiver vazio, agrupamos por Telefone + Condições.</li>
                  <li>Números e valores aceitam formato brasileiro (1.500,00).</li>
                  <li>O vendedor será vinculado pelo e-mail informado.</li>
                </ul>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full bg-white border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl">
                  <Download className="mr-2 h-3 w-3" /> Baixar Planilha Modelo
                </Button>
              </div>

              {!fileName ? (
                <div className="relative group">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-slate-200 rounded-[24px] p-10 flex flex-col items-center justify-center gap-3 bg-slate-50 group-hover:bg-slate-100 group-hover:border-blue-300 transition-all">
                    <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400">
                      <FileUp className="h-6 w-6" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700">Clique ou arraste o arquivo CSV</p>
                      <p className="text-xs text-slate-500 mt-1">Apenas arquivos .csv são suportados</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between bg-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{fileName}</p>
                      <p className="text-xs text-slate-500">{parsedOrders.length} pedidos detectados</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={reset} disabled={importing} className="rounded-xl text-slate-500">Alterar</Button>
                </div>
              )}

              {parsingError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-100 p-3 flex items-center gap-2 text-rose-700 text-xs shadow-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {parsingError}
                </div>
              )}

              {importing && progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Processando pedidos...</span>
                    <span>{progress.done} de {progress.total}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-300" 
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-8 flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={importing} className="rounded-2xl">
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !parsedOrders.length}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-6 min-w-[140px]"
              >
                {importing ? "Importando..." : "Confirmar Importação"}
              </Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
