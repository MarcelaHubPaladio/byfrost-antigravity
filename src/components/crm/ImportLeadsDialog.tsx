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
import { FileUp, UploadCloud, AlertTriangle, CheckCircle2 } from "lucide-react";

type JourneyInfo = {
  id: string;
  key: string;
  name: string;
  default_state_machine_json?: any;
};

type UserProfileLite = {
  user_id: string;
  email: string | null;
  phone_e164: string | null;
  display_name: string | null;
  role: string;
};

type VendorLite = { id: string; phone_e164: string };

type CustomerLite = {
  id: string;
  phone_e164: string;
  name: string | null;
  email: string | null;
  assigned_vendor_id: string | null;
  meta_json?: any;
};

type ChatCaseLite = {
  id: string;
  customer_id: string | null;
  assigned_vendor_id: string | null;
  meta_json?: any;
};

type NonChatCaseLite = {
  id: string;
  customer_id: string | null;
  deleted_at: string | null;
  updated_at: string;
};

type ParsedRow = {
  rowNo: number;
  name: string;
  whatsapp: string;
  email: string;
  ownerEmail: string;
};

type PreviewRow = ParsedRow & {
  normalizedPhone: string | null;
  existingCustomerId: string | null;
  existingChatCaseId: string | null;
  reactivateCaseId: string | null;
  action: "create_case" | "update_only" | "reactivate_case" | "skip_error";
  ownerUserId: string | null;
  ownerVendorId: string | null;
  ownerResolved: boolean;
  error: string | null;
  duplicateInFile: boolean;
};

function stripBom(s: string) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

function digitsTail(s: string | null | undefined, tail = 11) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > tail ? d.slice(-tail) : d;
}

function digitsOnly(s: string | null | undefined) {
  return String(s ?? "").replace(/\D/g, "");
}

function brPhoneVariants(raw: string | null | undefined) {
  const set = new Set<string>();

  const push = (v: string) => {
    const d = digitsOnly(v);
    if (!d) return;
    set.add(d);
  };

  push(raw);

  // Expand variants
  const queue = Array.from(set);
  for (const d0 of queue) {
    let d = d0;

    // strip leading 00 / 0
    while (d.startsWith("00")) d = d.slice(2);
    while (d.startsWith("0") && d.length > 10) d = d.slice(1);

    // strip BR country code
    if (d.startsWith("55") && d.length >= 12) {
      const no55 = d.slice(2);
      if (!set.has(no55)) {
        set.add(no55);
        queue.push(no55);
      }
    }

    // If has DDD + 9-digit mobile, add variant without the extra 9
    if (d.length === 11 && d[2] === "9") {
      const no9 = d.slice(0, 2) + d.slice(3);
      if (!set.has(no9)) {
        set.add(no9);
        queue.push(no9);
      }
    }

    // If has DDD + 8-digit, add variant with 9 inserted
    if (d.length === 10) {
      const with9 = d.slice(0, 2) + "9" + d.slice(2);
      if (!set.has(with9)) {
        set.add(with9);
        queue.push(with9);
      }
    }

    // also add tails for fuzzy matching
    if (d.length >= 10) set.add(d.slice(-10));
    if (d.length >= 11) set.add(d.slice(-11));
    if (d.length >= 12) set.add(d.slice(-12));
  }

  return set;
}

function samePhoneLoose(a: string | null | undefined, b: string | null | undefined) {
  const A = brPhoneVariants(a);
  const B = brPhoneVariants(b);
  if (!A.size || !B.size) return false;

  for (const v of A) {
    if (v.length < 10) continue;
    if (B.has(v)) return true;
  }
  return false;
}

function normalizeWhatsappOrNull(raw: string) {
  const s = String(raw ?? "").trim();
  const digitsRaw = digitsOnly(s);

  // Regra pedida: se não tiver número (ou só texto), ignora e cadastra sem WhatsApp.
  if (!digitsRaw) return { phone: null as string | null, error: null as string | null };

  // Normalização BR-friendly: se vier só DDD+numero (10/11 dígitos), assume Brasil (+55)
  // Ex: "42 8817-3442" => +554288173442
  let digits = digitsRaw;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  // Validação mínima para E.164 / WhatsApp: 10..15 dígitos.
  if (digits.length < 10) return { phone: null, error: "WhatsApp inválido (poucos dígitos)" };
  if (digits.length > 15) return { phone: null, error: "WhatsApp inválido (muitos dígitos)" };

  return { phone: `+${digits}`, error: null };
}

function getMetaPhone(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  const direct =
    meta.customer_phone ??
    meta.customerPhone ??
    meta.phone ??
    meta.whatsapp ??
    meta.to_phone ??
    meta.toPhone ??
    null;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

function detectDelimiter(headerLine: string): "," | ";" {
  // Heurística simples: conta , e ; fora de aspas
  const s = headerLine ?? "";
  let inQ = false;
  let commas = 0;
  let semis = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQ && s[i + 1] === '"') {
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }
    if (inQ) continue;
    if (ch === ",") commas++;
    if (ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

function parseCsv(text: string, delimiter: "," | ";"): string[][] {
  const rows: string[][] = [];
  const s = stripBom(text);
  let row: string[] = [];
  let cur = "";
  let inQ = false;

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    // ignora linha totalmente vazia
    if (row.length === 1 && row[0].trim() === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      if (inQ && s[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }

    if (!inQ && ch === delimiter) {
      pushCell();
      continue;
    }

    if (!inQ && (ch === "\n" || ch === "\r")) {
      // Handle CRLF
      if (ch === "\r" && s[i + 1] === "\n") i++;
      pushCell();
      pushRow();
      continue;
    }

    cur += ch;
  }

  pushCell();
  pushRow();

  return rows;
}

function normHeader(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function pickHeaderIndex(headers: string[], variants: string[]) {
  const h = headers.map(normHeader);
  for (const v of variants) {
    const i = h.indexOf(normHeader(v));
    if (i >= 0) return i;
  }
  return -1;
}

export function ImportLeadsDialog({
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
  const [rowFailures, setRowFailures] = useState<
    { rowNo: number; name: string; message: string }[]
  >([]);

  const firstState = useMemo(() => {
    const st = (journey.default_state_machine_json?.states ?? []) as any[];
    const first = Array.isArray(st) && st.length ? String(st[0]) : "capturing";
    return first || "capturing";
  }, [journey.default_state_machine_json]);

  const [customersCache, setCustomersCache] = useState<CustomerLite[] | null>(null);
  const [usersCache, setUsersCache] = useState<UserProfileLite[] | null>(null);
  const [vendorsCache, setVendorsCache] = useState<VendorLite[] | null>(null);
  const [chatCasesCache, setChatCasesCache] = useState<ChatCaseLite[] | null>(null);
  const [chatCasePhonesCache, setChatCasePhonesCache] = useState<Map<string, string> | null>(null);
  const [nonChatCasesCache, setNonChatCasesCache] = useState<NonChatCaseLite[] | null>(null);

  const reset = () => {
    setFileName("");
    setRawText("");
    setParsingError(null);
    setImporting(false);
    setProgress(null);
    setRowFailures([]);
  };

  const parseRows = useMemo(() => {
    if (!rawText.trim()) return [] as ParsedRow[];

    try {
      const lines = rawText.split(/\r\n|\n|\r/);
      const delimiter = detectDelimiter(lines[0] ?? "");
      const table = parseCsv(rawText, delimiter);
      if (!table.length) return [];

      const headers = table[0].map((x) => String(x ?? "").trim());

      const idxName = pickHeaderIndex(headers, ["nome", "name"]);
      const idxWa = pickHeaderIndex(headers, ["whasapp", "whatsapp", "whats", "telefone", "phone"]);
      const idxEmail = pickHeaderIndex(headers, ["email", "e-mail"]);
      const idxOwner = pickHeaderIndex(headers, ["dono do lead", "dono", "owner", "owner email"]);

      if (idxWa < 0) {
        throw new Error('Cabeçalho não encontrado: "Whasapp/WhatsApp"');
      }

      const out: ParsedRow[] = [];
      for (let i = 1; i < table.length; i++) {
        const row = table[i];
        const name = idxName >= 0 ? String(row[idxName] ?? "").trim() : "";
        const whatsapp = String(row[idxWa] ?? "").trim();
        const email = idxEmail >= 0 ? String(row[idxEmail] ?? "").trim() : "";
        const ownerEmail = idxOwner >= 0 ? String(row[idxOwner] ?? "").trim() : "";

        // linha vazia
        if (!name && !whatsapp && !email && !ownerEmail) continue;

        out.push({ rowNo: i + 1, name, whatsapp, email, ownerEmail });
      }

      setParsingError(null);
      return out;
    } catch (e: any) {
      setParsingError(e?.message ?? "Falha ao ler CSV");
      return [];
    }
  }, [rawText]);

  const previewRows = useMemo(() => {
    const customers = customersCache ?? [];
    const users = usersCache ?? [];
    const vendors = vendorsCache ?? [];
    const chatCases = chatCasesCache ?? [];
    const chatCasePhones = chatCasePhonesCache ?? new Map<string, string>();
    const nonChatCases = nonChatCasesCache ?? [];

    const userByEmail = new Map<string, UserProfileLite>();
    for (const u of users) {
      const email = (u.email ?? "").trim().toLowerCase();
      if (!email) continue;
      if (!userByEmail.has(email)) userByEmail.set(email, u);
    }

    const vendorByPhone = new Map<string, VendorLite>();
    for (const v of vendors) vendorByPhone.set(v.phone_e164, v);

    const activeCaseByCustomerId = new Set<string>();
    const latestDeletedCaseByCustomerId = new Map<string, NonChatCaseLite>();
    for (const c of nonChatCases) {
      const cid = String(c.customer_id ?? "");
      if (!cid) continue;
      if (!c.deleted_at) {
        activeCaseByCustomerId.add(cid);
        continue;
      }
      const cur = latestDeletedCaseByCustomerId.get(cid);
      if (!cur || new Date(c.updated_at).getTime() > new Date(cur.updated_at).getTime()) {
        latestDeletedCaseByCustomerId.set(cid, c);
      }
    }

    const findChatCaseByPhone = (phone: string) => {
      for (const c of chatCases) {
        const p = chatCasePhones.get(c.id) ?? getMetaPhone(c.meta_json) ?? null;
        if (!p) continue;
        if (samePhoneLoose(p, phone)) return c;
      }
      return null;
    };

    const seenPhones = new Set<string>();

    return parseRows.map((r) => {
      const { phone: normalizedPhone, error: err } = normalizeWhatsappOrNull(r.whatsapp);

      const phoneKey = normalizedPhone ? digitsOnly(normalizedPhone) : "";
      const duplicateInFile = Boolean(phoneKey && seenPhones.has(phoneKey));
      if (phoneKey) seenPhones.add(phoneKey);

      const existingCustomer = normalizedPhone
        ? customers.find((c) => samePhoneLoose(c.phone_e164, normalizedPhone)) ?? null
        : null;

      const existingChatCase = !existingCustomer && normalizedPhone ? findChatCaseByPhone(normalizedPhone) : null;

      const ownerEmail = r.ownerEmail.trim().toLowerCase();
      const ownerUser = ownerEmail ? userByEmail.get(ownerEmail) ?? null : null;

      // Preview considera dono resolvido se existir um usuário com phone (o vendor pode ser criado na importação)
      const ownerResolved = Boolean((ownerUser?.phone_e164 ?? "").trim());

      // tenta resolver vendor via phone do users_profile (se já existir)
      const ownerVendor = ownerUser?.phone_e164 ? vendorByPhone.get(ownerUser.phone_e164) ?? null : null;

      const hasActiveNonChatCase = existingCustomer ? activeCaseByCustomerId.has(existingCustomer.id) : false;
      const reactivateCase = existingCustomer ? latestDeletedCaseByCustomerId.get(existingCustomer.id) ?? null : null;
      const shouldReactivate = Boolean(existingCustomer && !hasActiveNonChatCase && reactivateCase?.id);

      // Regras:
      // - Duplicado dentro do CSV: nunca cria case 2x; vira "atualizar"
      // - Se já existe chat para esse número => atualizar/vincular (não criar case novo)
      // - Se existe customer e só existe lead soft-deleted => reativar
      // - Se existe customer e já existe lead ativo => apenas atualizar
      // - Caso contrário => criar case
      const action: PreviewRow["action"] = err
        ? "skip_error"
        : duplicateInFile
          ? "update_only"
          : existingChatCase
            ? "update_only"
            : shouldReactivate
              ? "reactivate_case"
              : existingCustomer && hasActiveNonChatCase
                ? "update_only"
                : "create_case";

      return {
        ...r,
        normalizedPhone,
        existingCustomerId: existingCustomer?.id ?? null,
        existingChatCaseId: existingChatCase?.id ?? null,
        reactivateCaseId: shouldReactivate ? reactivateCase!.id : null,
        action,
        ownerUserId: ownerUser?.user_id ?? null,
        ownerVendorId: ownerVendor?.id ?? null,
        ownerResolved,
        error: err,
        duplicateInFile,
      } satisfies PreviewRow;
    });
  }, [parseRows, customersCache, usersCache, vendorsCache, chatCasesCache, chatCasePhonesCache, nonChatCasesCache]);

  const counts = useMemo(() => {
    const c = {
      create_case: 0,
      update_only: 0,
      reactivate_case: 0,
      skip_error: 0,
      missing_owner: 0,
      update_chat_only: 0,
    };
    for (const r of previewRows) {
      c[r.action] += 1;
      if ((r.action === "create_case" || r.action === "reactivate_case") && r.ownerEmail && !r.ownerResolved) c.missing_owner += 1;
      if (r.action === "update_only" && r.existingChatCaseId && !r.existingCustomerId) c.update_chat_only += 1;
    }
    return c;
  }, [previewRows]);

  const loadCaches = async () => {
    // Customers
    const { data: customers, error: cErr } = await supabase
      .from("customer_accounts")
      .select("id,phone_e164,name,email,assigned_vendor_id,meta_json")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .limit(10_000);
    if (cErr) throw cErr;

    // Users (for owner mapping)
    const { data: users, error: uErr } = await supabase
      .from("users_profile")
      .select("user_id,email,phone_e164,display_name,role")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .limit(2000);
    if (uErr) throw uErr;

    // Vendors cache
    const { data: vendors, error: vErr } = await supabase
      .from("vendors")
      .select("id,phone_e164")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .limit(5000);
    if (vErr) throw vErr;

    // Existing cases (não-chat) desta jornada (inclui soft-deleted)
    const { data: nonChatCases, error: ncErr } = await supabase
      .from("cases")
      .select("id,customer_id,deleted_at,updated_at")
      .eq("tenant_id", tenantId)
      .eq("journey_id", journey.id)
      .eq("is_chat", false)
      .order("updated_at", { ascending: false })
      .limit(20_000);
    if (ncErr) throw ncErr;

    // Chat cases (para reconhecer lead já existente mesmo se só chat)
    const { data: chatCases, error: ccErr } = await supabase
      .from("cases")
      .select("id,customer_id,assigned_vendor_id,meta_json")
      .eq("tenant_id", tenantId)
      .eq("is_chat", true)
      .is("deleted_at", null)
      .limit(5000);
    if (ccErr) throw ccErr;

    const chatIds = (chatCases ?? []).map((c: any) => String(c.id)).filter(Boolean);

    const phoneByCase = new Map<string, string>();
    if (chatIds.length) {
      const { data: fields, error: fErr } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        // NOTE: case_fields não tem tenant_id; o RLS já valida via cases
        .in("case_id", chatIds)
        .in("key", ["whatsapp", "phone", "customer_phone"])
        .limit(20_000);
      if (fErr) throw fErr;

      const priority = new Map<string, number>([
        ["whatsapp", 1],
        ["customer_phone", 2],
        ["phone", 3],
      ]);

      const best = new Map<string, { p: number; v: string }>();
      for (const r of fields ?? []) {
        const cid = String((r as any).case_id ?? "");
        const k = String((r as any).key ?? "");
        const v = String((r as any).value_text ?? "").trim();
        if (!cid || !v) continue;
        const p = priority.get(k) ?? 999;
        const cur = best.get(cid);
        if (!cur || p < cur.p) best.set(cid, { p, v });
      }

      for (const [cid, { v }] of best.entries()) phoneByCase.set(cid, v);
    }

    setCustomersCache((customers ?? []) as any);
    setUsersCache((users ?? []) as any);
    setVendorsCache((vendors ?? []) as any);
    setNonChatCasesCache((nonChatCases ?? []) as any);
    setChatCasesCache((chatCases ?? []) as any);
    setChatCasePhonesCache(phoneByCase);
  };

  const onFile = async (f: File | null) => {
    reset();
    if (!f) return;

    setFileName(f.name);

    try {
      const text = await f.text();
      setRawText(text);
      await loadCaches();
    } catch (e: any) {
      showError(`Falha ao ler arquivo: ${e?.message ?? "erro"}`);
    }
  };

  const ensureVendorForUser = async (u: UserProfileLite): Promise<string | null> => {
    const phone = (u.phone_e164 ?? "").trim();
    if (!phone) return null;

    // cached?
    const cached = vendorsCache?.find((v) => v.phone_e164 === phone);
    if (cached?.id) return cached.id;

    const displayName = u.display_name || u.email || phone;

    const { data, error } = await supabase
      .from("vendors")
      .upsert(
        {
          tenant_id: tenantId,
          phone_e164: phone,
          display_name: displayName,
          active: true,
          deleted_at: null,
        } as any,
        { onConflict: "tenant_id,phone_e164" }
      )
      .select("id,phone_e164")
      .single();

    if (error) throw error;

    const next = { id: data.id as string, phone_e164: data.phone_e164 as string };
    setVendorsCache((prev) => (prev ? [next, ...prev] : [next]));
    return next.id;
  };

  const ensureCustomerByPhoneTail = async (
    phoneE164: string
  ): Promise<{ customer: CustomerLite; existed: boolean }> => {
    const customers = customersCache ?? [];
    const found = customers.find((c) => samePhoneLoose(c.phone_e164, phoneE164)) ?? null;
    if (found) return { customer: found, existed: true };

    const { data, error } = await supabase
      .from("customer_accounts")
      .insert({
        tenant_id: tenantId,
        phone_e164: phoneE164,
        name: null,
        email: null,
        assigned_vendor_id: null,
        meta_json: { lead_source: "csv_import" },
      } as any)
      .select("id,phone_e164,name,email,assigned_vendor_id,meta_json")
      .single();

    if (error) throw error;

    const created = data as any as CustomerLite;
    setCustomersCache((prev) => (prev ? [created, ...prev] : [created]));
    return { customer: created, existed: false };
  };

  const updateCustomer = async (customerId: string, patch: Partial<CustomerLite>) => {
    const cur = (customersCache ?? []).find((c) => c.id === customerId) ?? null;
    const mergedMeta = { ...(cur?.meta_json ?? {}), lead_source: "csv_import" };

    const { error } = await supabase
      .from("customer_accounts")
      .update({
        name: patch.name ?? null,
        email: patch.email ?? null,
        assigned_vendor_id: patch.assigned_vendor_id ?? null,
        meta_json: mergedMeta,
      } as any)
      .eq("tenant_id", tenantId)
      .eq("id", customerId);

    if (error) throw error;

    setCustomersCache((prev) => {
      if (!prev) return prev;
      return prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              name: patch.name ?? c.name,
              email: patch.email ?? c.email,
              assigned_vendor_id: patch.assigned_vendor_id ?? c.assigned_vendor_id,
              meta_json: mergedMeta,
            }
          : c
      );
    });
  };

  const linkCaseToCustomer = async (caseId: string, customerId: string, assignedVendorId: string | null) => {
    const { error } = await supabase
      .from("cases")
      .update({
        customer_id: customerId,
        assigned_vendor_id: assignedVendorId,
        meta_json: {
          lead_source: "csv_import",
        },
      } as any)
      .eq("tenant_id", tenantId)
      .eq("id", caseId);

    if (error) throw error;
  };

  const promoteChatToCrm = async (p: {
    chatCaseId: string;
    customerId: string;
    assignedVendorId: string | null;
    ownerEmail: string | null;
    rowNo: number;
    leadName: string | null;
    leadEmail: string | null;
    leadWhatsappRaw: string | null;
    leadWhatsappE164: string | null;
  }) => {
    // transforma um case "chat" em um case do CRM, no estado inicial do fluxo
    const { data: existing, error: selErr } = await supabase
      .from("cases")
      .select("id,meta_json")
      .eq("tenant_id", tenantId)
      .eq("id", p.chatCaseId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!existing?.id) throw new Error("Chat não encontrado para promover.");

    const mergedMeta = {
      ...(existing as any).meta_json,
      lead_source: "csv_import",
      lead_owner_email: p.ownerEmail,
      import_file_name: fileName || null,
      import_row_no: p.rowNo,
      lead_name: p.leadName,
      lead_email: p.leadEmail,
      lead_whatsapp_raw: p.leadWhatsappRaw,
      lead_whatsapp_e164: p.leadWhatsappE164,
      promoted_from_chat: true,
    };

    const { error: updErr } = await supabase
      .from("cases")
      .update({
        is_chat: false,
        journey_id: journey.id,
        state: firstState,
        customer_id: p.customerId,
        assigned_vendor_id: p.assignedVendorId,
        meta_json: mergedMeta,
      } as any)
      .eq("tenant_id", tenantId)
      .eq("id", p.chatCaseId);

    if (updErr) throw updErr;

    const { error: tlErr } = await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: p.chatCaseId,
      event_type: "lead_imported",
      actor_type: "admin",
      actor_id: actorUserId,
      message: "Lead importado via planilha (promovido de chat para CRM).",
      meta_json: { source: "csv_import", promoted_from_chat: true },
      occurred_at: new Date().toISOString(),
    });

    if (tlErr) throw tlErr;

    return p.chatCaseId;
  };

  const touchLatestLeadCaseForCustomer = async (p: {
    customerId: string;
    assignedVendorId: string | null;
    ownerEmail: string | null;
    rowNo: number;
    leadName: string | null;
    leadEmail: string | null;
    leadWhatsappRaw: string | null;
    leadWhatsappE164: string | null;
  }) => {
    const { data: existing, error: findErr } = await supabase
      .from("cases")
      .select("id,meta_json")
      .eq("tenant_id", tenantId)
      .eq("journey_id", journey.id)
      .eq("is_chat", false)
      .eq("customer_id", p.customerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing?.id) return false;

    const mergedMeta = {
      ...(existing as any).meta_json,
      lead_source: "csv_import",
      lead_owner_email: p.ownerEmail,
      import_file_name: fileName || null,
      import_row_no: p.rowNo,
      lead_name: p.leadName,
      lead_email: p.leadEmail,
      lead_whatsapp_raw: p.leadWhatsappRaw,
      lead_whatsapp_e164: p.leadWhatsappE164,
    };

    const { error: updErr } = await supabase
      .from("cases")
      .update({
        assigned_vendor_id: p.assignedVendorId,
        meta_json: mergedMeta,
      } as any)
      .eq("tenant_id", tenantId)
      .eq("id", existing.id);

    if (updErr) throw updErr;
    return true;
  };

  const reactivateLeadCase = async (p: {
    caseId: string;
    customerId: string;
    assignedVendorId: string | null;
    ownerEmail: string | null;
    rowNo: number;
    leadName: string | null;
    leadEmail: string | null;
    leadWhatsappRaw: string | null;
    leadWhatsappE164: string | null;
  }) => {
    const { data: existing, error: selErr } = await supabase
      .from("cases")
      .select("id,meta_json")
      .eq("tenant_id", tenantId)
      .eq("id", p.caseId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!existing?.id) throw new Error("Case não encontrado para reativar.");

    const mergedMeta = {
      ...(existing as any).meta_json,
      lead_source: "csv_import",
      lead_owner_email: p.ownerEmail,
      import_file_name: fileName || null,
      import_row_no: p.rowNo,
      lead_name: p.leadName,
      lead_email: p.leadEmail,
      lead_whatsapp_raw: p.leadWhatsappRaw,
      lead_whatsapp_e164: p.leadWhatsappE164,
      reactivated_from_soft_delete: true,
    };

    const { error: updErr } = await supabase
      .from("cases")
      .update({
        deleted_at: null,
        is_chat: false,
        journey_id: journey.id,
        state: firstState,
        customer_id: p.customerId,
        assigned_vendor_id: p.assignedVendorId,
        meta_json: mergedMeta,
      } as any)
      .eq("tenant_id", tenantId)
      .eq("id", p.caseId);
    if (updErr) throw updErr;

    const { error: tlErr } = await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: p.caseId,
      event_type: "lead_reactivated",
      actor_type: "admin",
      actor_id: actorUserId,
      message: "Lead reativado via planilha.",
      meta_json: { source: "csv_import" },
      occurred_at: new Date().toISOString(),
    });

    if (tlErr) throw tlErr;

    return p.caseId;
  };

  const mergeDuplicateLeadCases = async (p: { customerId: string; keepCaseId: string }) => {
    // Mantém o case mais recente (keepCaseId) e soft-delete os demais ativos na mesma jornada.
    const { data: all, error: err } = await supabase
      .from("cases")
      .select("id,deleted_at")
      .eq("tenant_id", tenantId)
      .eq("journey_id", journey.id)
      .eq("is_chat", false)
      .eq("customer_id", p.customerId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (err) throw err;

    const toDelete = (all ?? []).filter((c: any) => c.id !== p.keepCaseId && !c.deleted_at).map((c: any) => String(c.id));
    if (!toDelete.length) return 0;

    const now = new Date().toISOString();
    for (const id of toDelete) {
      const { error: updErr } = await supabase
        .from("cases")
        .update({
          deleted_at: now,
          meta_json: { merged_into_case_id: p.keepCaseId },
        } as any)
        .eq("tenant_id", tenantId)
        .eq("id", id);
      if (updErr) throw updErr;

      // registra no case antigo também (para auditoria)
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: id,
        event_type: "lead_merged",
        actor_type: "admin",
        actor_id: actorUserId,
        message: `Lead mesclado automaticamente no case ${p.keepCaseId}.`,
        meta_json: { merged_into_case_id: p.keepCaseId },
        occurred_at: new Date().toISOString(),
      });
    }

    await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: p.keepCaseId,
      event_type: "lead_merged",
      actor_type: "admin",
      actor_id: actorUserId,
      message: `Leads duplicados mesclados automaticamente (${toDelete.length}).`,
      meta_json: { merged_case_ids: toDelete },
      occurred_at: new Date().toISOString(),
    });

    return toDelete.length;
  };

  const createCase = async (p: {
    customerId: string | null;
    title: string | null;
    assignedVendorId: string | null;
    ownerEmail: string | null;
    rowNo: number;
    leadName: string | null;
    leadEmail: string | null;
    leadWhatsappRaw: string | null;
    leadWhatsappE164: string | null;
  }) => {
    const { data: inserted, error } = await supabase
      .from("cases")
      .insert({
        tenant_id: tenantId,
        journey_id: journey.id,
        customer_id: p.customerId,
        title: p.title,
        is_chat: false,
        // NOTE: não setamos created_by_channel aqui para respeitar o CHECK constraint do banco.
        // O default do banco (ex.: 'whatsapp') será aplicado.
        assigned_vendor_id: p.assignedVendorId,
        state: firstState,
        meta_json: {
          lead_source: "csv_import",
          lead_owner_email: p.ownerEmail,
          import_file_name: fileName || null,
          import_row_no: p.rowNo,
          lead_name: p.leadName,
          lead_email: p.leadEmail,
          lead_whatsapp_raw: p.leadWhatsappRaw,
          lead_whatsapp_e164: p.leadWhatsappE164,
        },
      } as any)
      .select("id")
      .single();

    if (error) throw error;

    const caseId = inserted.id as string;

    const { error: tlErr } = await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "lead_imported",
      actor_type: "admin",
      actor_id: actorUserId,
      message: "Lead importado via planilha.",
      meta_json: {
        source: "csv_import",
        owner_email: p.ownerEmail,
        file_name: fileName || null,
        row_no: p.rowNo,
        lead_name: p.leadName,
        lead_email: p.leadEmail,
        lead_whatsapp_raw: p.leadWhatsappRaw,
        lead_whatsapp_e164: p.leadWhatsappE164,
      },
      occurred_at: new Date().toISOString(),
    });

    if (tlErr) throw tlErr;

    return caseId;
  };

  const createMissingOwnerPendency = async (caseId: string, ownerEmail: string | null) => {
    const { error } = await supabase.from("pendencies").insert({
      case_id: caseId,
      type: "missing_owner",
      assigned_to_role: "admin",
      question_text: ownerEmail
        ? `Definir dono do lead (email informado: ${ownerEmail}).`
        : "Definir dono do lead.",
      required: true,
      status: "open",
      answered_text: null,
      answered_payload_json: null,
      due_at: null,
    } as any);

    if (error) throw error;
  };

  const runImport = async () => {
    if (!previewRows.length) return;

    const hasErrors = previewRows.some((r) => r.action === "skip_error");
    if (hasErrors) {
      showError("Corrija as linhas com erro antes de confirmar.");
      return;
    }

    setRowFailures([]);
    setImporting(true);
    setProgress({ done: 0, total: previewRows.length });

    let createdCases = 0;
    let updatedCustomers = 0;
    let linkedFromChat = 0;
    let touchedCases = 0;
    let reactivatedCases = 0;
    let mergedCases = 0;
    let errors = 0;

    // Dedup intra-import: evita criar 2 cases para o mesmo WhatsApp na mesma execução
    const processedPhoneKeys = new Set<string>();

    try {
      // refresh caches (safe)
      if (!customersCache || !usersCache || !vendorsCache || !chatCasesCache || !chatCasePhonesCache) await loadCaches();

      // index users by email
      const userByEmail = new Map<string, UserProfileLite>();
      for (const u of usersCache ?? []) {
        const email = (u.email ?? "").trim().toLowerCase();
        if (!email) continue;
        if (!userByEmail.has(email)) userByEmail.set(email, u);
      }

      for (let i = 0; i < previewRows.length; i++) {
        const row = previewRows[i];
        setProgress({ done: i, total: previewRows.length });

        try {
          const phone = row.normalizedPhone; // pode ser null (importar sem WhatsApp)
          const phoneKey = phone ? digitsOnly(phone) : "";

          const ownerEmail = row.ownerEmail.trim().toLowerCase() || null;
          const ownerUser = ownerEmail ? userByEmail.get(ownerEmail) ?? null : null;
          const ownerVendorId = ownerUser ? await ensureVendorForUser(ownerUser) : null;

          // Se já processamos esse número nesta execução, nunca cria de novo.
          if (phoneKey && processedPhoneKeys.has(phoneKey)) {
            if (row.existingCustomerId) {
              await updateCustomer(row.existingCustomerId, {
                name: row.name.trim() || null,
                email: row.email.trim() || null,
                assigned_vendor_id: ownerVendorId,
              });
              updatedCustomers += 1;

              const touched = await touchLatestLeadCaseForCustomer({
                customerId: row.existingCustomerId,
                assignedVendorId: ownerVendorId,
                ownerEmail,
                rowNo: row.rowNo,
                leadName: row.name.trim() || null,
                leadEmail: row.email.trim() || null,
                leadWhatsappRaw: row.whatsapp.trim() || null,
                leadWhatsappE164: phone,
              });
              if (touched) touchedCases += 1;
            }
            continue;
          }

          if (row.action === "reactivate_case") {
            if (!phone || !row.existingCustomerId || !row.reactivateCaseId) continue;
            if (phoneKey) processedPhoneKeys.add(phoneKey);

            // Atualiza customer com dados do CSV
            await updateCustomer(row.existingCustomerId, {
              name: row.name.trim() || null,
              email: row.email.trim() || null,
              assigned_vendor_id: ownerVendorId,
            });
            updatedCustomers += 1;

            const keepId = await reactivateLeadCase({
              caseId: row.reactivateCaseId,
              customerId: row.existingCustomerId,
              assignedVendorId: ownerVendorId,
              ownerEmail,
              rowNo: row.rowNo,
              leadName: row.name.trim() || null,
              leadEmail: row.email.trim() || null,
              leadWhatsappRaw: row.whatsapp.trim() || null,
              leadWhatsappE164: phone,
            });
            reactivatedCases += 1;

            mergedCases += await mergeDuplicateLeadCases({ customerId: row.existingCustomerId, keepCaseId: keepId });
            continue;
          }

          if (row.action === "update_only") {
            // update_only só faz sentido com telefone (para localizar registros)
            if (!phone) continue;
            if (phoneKey) processedPhoneKeys.add(phoneKey);

            // 1) já existe customer => atualiza cadastro e "toca" o case para aparecer no funil (sem criar duplicado)
            if (row.existingCustomerId) {
              await updateCustomer(row.existingCustomerId, {
                name: row.name.trim() || null,
                email: row.email.trim() || null,
                assigned_vendor_id: ownerVendorId,
              });
              updatedCustomers += 1;

              const touched = await touchLatestLeadCaseForCustomer({
                customerId: row.existingCustomerId,
                assignedVendorId: ownerVendorId,
                ownerEmail,
                rowNo: row.rowNo,
                leadName: row.name.trim() || null,
                leadEmail: row.email.trim() || null,
                leadWhatsappRaw: row.whatsapp.trim() || null,
                leadWhatsappE164: phone,
              });
              if (touched) touchedCases += 1;

              // mescla duplicados (mantém o mais recente)
              const { data: keep, error: keepErr } = await supabase
                .from("cases")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("journey_id", journey.id)
                .eq("is_chat", false)
                .eq("customer_id", row.existingCustomerId)
                .is("deleted_at", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (keepErr) throw keepErr;
              if (keep?.id) mergedCases += await mergeDuplicateLeadCases({ customerId: row.existingCustomerId, keepCaseId: keep.id });

              continue;
            }

            // 2) já existe apenas como chat => cria/vincula customer e PROMOVE o chat para CRM (não cria case novo)
            if (row.existingChatCaseId) {
              const { customer } = await ensureCustomerByPhoneTail(phone);
              await updateCustomer(customer.id, {
                name: row.name.trim() || null,
                email: row.email.trim() || null,
                assigned_vendor_id: ownerVendorId,
              });

              const keepId = await promoteChatToCrm({
                chatCaseId: row.existingChatCaseId,
                customerId: customer.id,
                assignedVendorId: ownerVendorId,
                ownerEmail,
                rowNo: row.rowNo,
                leadName: row.name.trim() || null,
                leadEmail: row.email.trim() || null,
                leadWhatsappRaw: row.whatsapp.trim() || null,
                leadWhatsappE164: phone,
              });

              linkedFromChat += 1;
              mergedCases += await mergeDuplicateLeadCases({ customerId: customer.id, keepCaseId: keepId });
              continue;
            }

            // fallback
            continue;
          }

          // Novo lead => cria case. Se tiver WhatsApp, cria/vincula customer; se não, cria case sem customer.
          if (phone) {
            if (phoneKey) processedPhoneKeys.add(phoneKey);

            const { customer } = await ensureCustomerByPhoneTail(phone);

            // Se existir algum case soft-deleted nessa jornada para este customer, reativa ao invés de criar.
            const { data: del, error: delErr } = await supabase
              .from("cases")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("journey_id", journey.id)
              .eq("is_chat", false)
              .eq("customer_id", customer.id)
              .not("deleted_at", "is", null)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (delErr) throw delErr;

            // Atualiza customer com dados do CSV
            await updateCustomer(customer.id, {
              name: row.name.trim() || null,
              email: row.email.trim() || null,
              assigned_vendor_id: ownerVendorId,
            });

            let keepId: string;
            if (del?.id) {
              keepId = await reactivateLeadCase({
                caseId: del.id,
                customerId: customer.id,
                assignedVendorId: ownerVendorId,
                ownerEmail,
                rowNo: row.rowNo,
                leadName: row.name.trim() || null,
                leadEmail: row.email.trim() || null,
                leadWhatsappRaw: row.whatsapp.trim() || null,
                leadWhatsappE164: phone,
              });
              reactivatedCases += 1;
            } else {
              const title = row.name.trim() || phone;
              keepId = await createCase({
                customerId: customer.id,
                title,
                assignedVendorId: ownerVendorId,
                ownerEmail,
                rowNo: row.rowNo,
                leadName: row.name.trim() || null,
                leadEmail: row.email.trim() || null,
                leadWhatsappRaw: row.whatsapp.trim() || null,
                leadWhatsappE164: phone,
              });
              createdCases += 1;

              // Atualiza cache local de cases da jornada para o preview/run atual
              setNonChatCasesCache((prev) =>
                prev
                  ? [{ id: keepId, customer_id: customer.id, deleted_at: null, updated_at: new Date().toISOString() }, ...prev]
                  : [{ id: keepId, customer_id: customer.id, deleted_at: null, updated_at: new Date().toISOString() }]
              );
            }

            mergedCases += await mergeDuplicateLeadCases({ customerId: customer.id, keepCaseId: keepId });

            if (!ownerVendorId) {
              await createMissingOwnerPendency(keepId, ownerEmail);
            }
            continue;
          }

          // Sem WhatsApp (ou campo com texto sem números): cria case sem customer.
          const title = row.name.trim() || row.email.trim() || `Lead importado (linha ${row.rowNo})`;
          const caseId = await createCase({
            customerId: null,
            title,
            assignedVendorId: ownerVendorId,
            ownerEmail,
            rowNo: row.rowNo,
            leadName: row.name.trim() || null,
            leadEmail: row.email.trim() || null,
            leadWhatsappRaw: row.whatsapp.trim() || null,
            leadWhatsappE164: null,
          });

          createdCases += 1;

          if (!ownerVendorId) {
            await createMissingOwnerPendency(caseId, ownerEmail);
          }
        } catch (e: any) {
          errors += 1;

          const msgParts = [
            e?.message,
            e?.details ? `details: ${e.details}` : null,
            e?.hint ? `hint: ${e.hint}` : null,
            e?.code ? `code: ${e.code}` : null,
          ].filter(Boolean);
          const msg = msgParts.length ? String(msgParts.join(" | ")) : String(e ?? "erro");

          console.error("[import-leads] row failed", {
            rowNo: row.rowNo,
            name: row.name,
            whatsapp: row.whatsapp,
            normalizedPhone: row.normalizedPhone,
            ownerEmail: row.ownerEmail,
            action: row.action,
            error: e,
          });

          setRowFailures((prev) => {
            const next = [...prev, { rowNo: row.rowNo, name: row.name, message: msg }];
            next.sort((a, b) => a.rowNo - b.rowNo);
            return next.slice(0, 50);
          });
        } finally {
          setProgress({ done: i + 1, total: previewRows.length });
        }
      }

      if (errors > 0) {
        showError(`Algumas linhas falharam (${errors}). Veja os detalhes abaixo em "Falhas na importação".`);
        // Mantém o modal aberto para o usuário ver os erros.
        return;
      }

      showSuccess(
        `Importação concluída: ${createdCases} criado(s), ${reactivatedCases} reativado(s), ${updatedCustomers} cliente(s) atualizado(s), ${touchedCases} atualizado(s) no funil, ${mergedCases} mesclado(s), ${linkedFromChat} promovido(s) do chat.`
      );

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["crm_customers_by_ids", tenantId] }),
      ]);

      setOpen(false);
      reset();
    } catch (e: any) {
      showError(`Falha na importação: ${e?.message ?? "erro"}`);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]">
            <FileUp className="mr-2 h-4 w-4" /> Importar Leads
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-[980px] rounded-[22px]">
        <DialogHeader>
          <DialogTitle>Importar Leads</DialogTitle>
          <DialogDescription>
            Envie um CSV com colunas: <span className="font-medium">Nome</span>, <span className="font-medium">Whasapp</span>,{" "}
            <span className="font-medium">Email</span>, <span className="font-medium">Dono do Lead</span>. Aceita separador por vírgula ou ponto-e-vírgula.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Jornada</div>
                <div className="mt-0.5 text-xs text-slate-600">
                  Importando para: <span className="font-medium">{journey.name}</span>
                  <span className="text-slate-400"> • </span>
                  <span className="text-slate-500">estado inicial: {firstState}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                  Preview
                </Badge>
                <Badge className="rounded-full border-0 bg-slate-200 text-slate-800 hover:bg-slate-200">
                  {fileName || "nenhum arquivo"}
                </Badge>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label className="text-xs">Arquivo CSV</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  className="mt-1 h-11 rounded-2xl bg-white"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  disabled={importing}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-2xl"
                  onClick={() => {
                    setRawText("");
                    setCustomersCache(null);
                    setUsersCache(null);
                    setVendorsCache(null);
                    setChatCasesCache(null);
                    setChatCasePhonesCache(null);
                    setNonChatCasesCache(null);
                    setFileName("");
                    setParsingError(null);
                  }}
                  disabled={importing || (!rawText && !fileName)}
                >
                  Limpar
                </Button>
              </div>
            </div>

            {parsingError && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>{parsingError}</div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
              novos: {counts.create_case}
            </Badge>
            <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
              reativar: {counts.reactivate_case}
            </Badge>
            <Badge className="rounded-full border-0 bg-slate-100 text-slate-800 hover:bg-slate-100">
              atualizar: {counts.update_only}
            </Badge>
            <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
              reconhecidos via chat: {counts.update_chat_only}
            </Badge>
            <Badge className="rounded-full border-0 bg-rose-100 text-rose-900 hover:bg-rose-100">
              erros: {counts.skip_error}
            </Badge>
            <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
              novos/reativados sem dono: {counts.missing_owner}
            </Badge>

            {progress && (
              <div className="ml-auto text-xs text-slate-600">
                Importando… <span className="font-medium text-slate-900">{progress.done}</span>/{progress.total}
              </div>
            )}
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
              Linhas
            </div>

            <ScrollArea className="h-[380px]">
              <div className="divide-y divide-slate-100">
                {previewRows.map((r) => {
                  const tone =
                    r.action === "skip_error"
                      ? "rose"
                      : r.action === "update_only"
                        ? "slate"
                        : r.action === "reactivate_case"
                          ? "amber"
                          : r.ownerResolved
                            ? "emerald"
                            : "amber";

                  const badgeCls =
                    tone === "rose"
                      ? "bg-rose-100 text-rose-900"
                      : tone === "emerald"
                        ? "bg-emerald-100 text-emerald-900"
                        : tone === "amber"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-100 text-slate-800";

                  const label =
                    r.action === "skip_error"
                      ? "erro"
                      : r.action === "update_only"
                        ? "atualizar"
                        : r.action === "reactivate_case"
                          ? "reativar"
                          : r.ownerResolved
                            ? "criar case"
                            : "criar case (sem dono)";

                  return (
                    <div key={r.rowNo} className="px-3 py-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            Linha {r.rowNo}: <span className="font-normal">{r.name || "(sem nome)"}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600">
                            <span className="font-medium">WhatsApp:</span> {r.whatsapp || "—"}
                            <span className="text-slate-300"> • </span>
                            <span className="font-medium">Email:</span> {r.email || "—"}
                            <span className="text-slate-300"> • </span>
                            <span className="font-medium">Dono:</span> {r.ownerEmail || "(vazio)"}
                          </div>

                          {r.duplicateInFile && !r.error ? (
                            <div className="mt-2 text-[11px] text-amber-700">
                              Duplicado no CSV: esta linha não criará um novo case.
                            </div>
                          ) : null}

                          {r.error && (
                            <div className="mt-2 text-[11px] text-rose-700">{r.error}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge className={cn("rounded-full border-0", badgeCls)}>{label}</Badge>
                          {r.duplicateInFile && r.action !== "skip_error" ? (
                            <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                              duplicado
                            </Badge>
                          ) : null}
                          {r.action !== "skip_error" && r.existingCustomerId && (
                            <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                              já existe
                            </Badge>
                          )}
                          {r.action !== "skip_error" && !r.existingCustomerId && r.existingChatCaseId && (
                            <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                              já existe (chat)
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {previewRows.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Selecione um arquivo para ver o preview.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {rowFailures.length > 0 && (
            <div className="rounded-[18px] border border-rose-200 bg-rose-50 p-3">
              <div className="text-sm font-semibold text-rose-900">Falhas na importação</div>
              <div className="mt-1 text-xs text-rose-800">
                Abaixo estão os motivos retornados pelo banco para cada linha.
              </div>
              <div className="mt-3 space-y-2">
                {rowFailures.map((f) => (
                  <div key={`${f.rowNo}-${f.message}`} className="rounded-2xl border border-rose-200 bg-white px-3 py-2">
                    <div className="text-xs font-semibold text-rose-900">Linha {f.rowNo}{f.name ? ` • ${f.name}` : ""}</div>
                    <div className="mt-0.5 text-[11px] text-rose-800 break-words">{f.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {counts.skip_error > 0 && (
            <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                Existem linhas com erro. Ajuste o CSV e reenvie antes de confirmar.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-2xl"
            onClick={() => setOpen(false)}
            disabled={importing}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            onClick={runImport}
            disabled={importing || !previewRows.length || counts.skip_error > 0}
          >
            {importing ? (
              <>
                <UploadCloud className="mr-2 h-4 w-4" /> Importando…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar importação
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}