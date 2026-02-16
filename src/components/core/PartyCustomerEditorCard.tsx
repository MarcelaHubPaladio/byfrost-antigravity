import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_ANON_KEY_IN_USE, SUPABASE_URL_IN_USE, USING_FALLBACK_SUPABASE } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";

const PARTY_UPLOAD_LOGO_URL = `${SUPABASE_URL_IN_USE}/functions/v1/party-upload-logo`;

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function formatCpfCnpj(digitsRaw: string) {
  const d = onlyDigits(digitsRaw).slice(0, 14);

  // CPF: 000.000.000-00
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += "." + p2;
    if (p3) out += "." + p3;
    if (p4) out += "-" + p4;
    return out;
  }

  // CNPJ: 00.000.000/0000-00
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "/" + p4;
  if (p5) out += "-" + p5;
  return out;
}

function normalizeWhatsappDigits(digitsRaw: string) {
  const d = onlyDigits(digitsRaw);
  // Allow either:
  // - 10/11 digits (DDD + number)
  // - 13 digits with 55 prefix
  if (d.startsWith("55") && d.length > 13) return d.slice(0, 13);
  if (d.startsWith("55") && d.length <= 13) return d;
  return d.slice(0, 11);
}

function formatWhatsappBr(digitsRaw: string) {
  const d0 = normalizeWhatsappDigits(digitsRaw);

  const has55 = d0.startsWith("55") && d0.length > 11;
  const d = has55 ? d0.slice(2) : d0;

  const dd = d.slice(0, 2);
  const rest = d.slice(2);

  const isMobile = rest.length >= 9;
  const a = isMobile ? rest.slice(0, 5) : rest.slice(0, 4);
  const b = isMobile ? rest.slice(5, 9) : rest.slice(4, 8);

  let out = "";
  if (has55) out += "+55 ";
  if (dd) out += `(${dd}) `;
  out += a;
  if (b) out += "-" + b;
  return out.trim();
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function lookupCep(cepDigits: string) {
  const cep = onlyDigits(cepDigits).slice(0, 8);
  if (cep.length !== 8) throw new Error("CEP inválido (8 dígitos)");

  const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!res.ok) throw new Error("CEP não encontrado");
  const json = await res.json();

  const street = String(json?.street ?? "").trim();
  const neighborhood = String(json?.neighborhood ?? "").trim();
  const city = String(json?.city ?? "").trim();
  const state = String(json?.state ?? "").trim();

  return { street, neighborhood, city, state };
}

export function PartyCustomerEditorCard({
  tenantId,
  partyId,
  initialDisplayName,
  initialMetadata,
  onUpdated,
}: {
  tenantId: string;
  partyId: string;
  initialDisplayName: string;
  initialMetadata: any;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const md = (initialMetadata ?? {}) as any;

  const logoInfo = (md?.logo ?? null) as
    | { bucket: string; path: string; updated_at?: string }
    | null;

  const logoUrl = useMemo(() => {
    if (!logoInfo?.bucket || !logoInfo?.path) return null;
    try {
      return supabase.storage.from(logoInfo.bucket).getPublicUrl(logoInfo.path).data.publicUrl;
    } catch {
      return null;
    }
  }, [logoInfo?.bucket, logoInfo?.path]);

  const [saving, setSaving] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // IMPORTANT: respect existing top-level metadata fields.
  // We DO NOT create metadata.customer.
  const initialDocDigits = useMemo(() => {
    return onlyDigits(String(md?.cpf_cnpj ?? md?.cpfCnpj ?? md?.document ?? "")).slice(0, 14);
  }, [md?.cpf_cnpj, md?.cpfCnpj, md?.document]);

  const initialWhatsappDigits = useMemo(() => {
    return normalizeWhatsappDigits(String(md?.whatsapp ?? md?.phone ?? md?.phone_e164 ?? ""));
  }, [md?.whatsapp, md?.phone, md?.phone_e164]);

  const initialEmail = useMemo(() => String(md?.email ?? ""), [md?.email]);

  const initialCep = useMemo(() => String(md?.cep ?? ""), [md?.cep]);
  const initialAddress = useMemo(() => String(md?.address ?? ""), [md?.address]);
  const initialCity = useMemo(() => String(md?.city ?? ""), [md?.city]);
  const initialUf = useMemo(() => String(md?.uf ?? md?.state ?? ""), [md?.uf, md?.state]);

  const [displayName, setDisplayName] = useState<string>(String(initialDisplayName ?? ""));
  const [docDigitsState, setDocDigitsState] = useState<string>(initialDocDigits);
  const [whatsappDigitsState, setWhatsappDigitsState] = useState<string>(initialWhatsappDigits);
  const [email, setEmail] = useState<string>(initialEmail);

  const [cep, setCep] = useState<string>(initialCep);
  const [address, setAddress] = useState<string>(initialAddress);
  const [city, setCity] = useState<string>(initialCity);
  const [uf, setUf] = useState<string>(initialUf);

  // Keep UI in sync if entity was refreshed externally.
  useEffect(() => {
    setDisplayName(String(initialDisplayName ?? ""));
    setDocDigitsState(initialDocDigits);
    setWhatsappDigitsState(initialWhatsappDigits);
    setEmail(initialEmail);
    setCep(initialCep);
    setAddress(initialAddress);
    setCity(initialCity);
    setUf(initialUf);
  }, [
    initialDisplayName,
    initialDocDigits,
    initialWhatsappDigits,
    initialEmail,
    initialCep,
    initialAddress,
    initialCity,
    initialUf,
  ]);

  const docDigits = useMemo(() => onlyDigits(docDigitsState).slice(0, 14), [docDigitsState]);
  const whatsappDigits = useMemo(() => normalizeWhatsappDigits(whatsappDigitsState), [whatsappDigitsState]);

  const docDisplay = useMemo(() => formatCpfCnpj(docDigits), [docDigits]);
  const whatsappDisplay = useMemo(() => formatWhatsappBr(whatsappDigits), [whatsappDigits]);

  const save = async () => {
    setSaving(true);
    try {
      const nextMetadata = { ...(initialMetadata ?? {}) } as any;

      // Respect the existing keys; default to the canonical ones.
      nextMetadata.cpf_cnpj = docDigits || null;
      nextMetadata.whatsapp = whatsappDigits || null;
      nextMetadata.email = email.trim() || null;

      nextMetadata.cep = onlyDigits(cep).slice(0, 8) || null;
      nextMetadata.address = address.trim() || null;
      nextMetadata.city = city.trim() || null;
      // Use UF (2 letters) field; also keep legacy `state` untouched.
      nextMetadata.uf = uf.trim().slice(0, 2).toUpperCase() || null;

      const { error } = await supabase
        .from("core_entities")
        .update({
          display_name: displayName.trim() || initialDisplayName,
          metadata: nextMetadata,
        })
        .eq("tenant_id", tenantId)
        .eq("id", partyId)
        .is("deleted_at", null);

      if (error) throw error;

      showSuccess("Dados do cliente atualizados.");
      await qc.invalidateQueries({ queryKey: ["entity", tenantId, partyId] });
      onUpdated();
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const fetchByCep = async () => {
    setFetchingCep(true);
    try {
      const res = await lookupCep(cep);
      const line = [res.street, res.neighborhood].filter(Boolean).join(", ");
      if (line) setAddress(line);
      if (res.city) setCity(res.city);
      if (res.state) setUf(res.state);
      showSuccess("Endereço preenchido pelo CEP.");
    } catch (e: any) {
      showError(e?.message ?? "Erro ao buscar CEP");
    } finally {
      setFetchingCep(false);
    }
  };

  const uploadLogo = async () => {
    if (!tenantId || !partyId) return;
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      showError("Selecione um arquivo.");
      return;
    }

    setUploadingLogo(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const b64 = await fileToBase64(file);

      const res = await fetch(PARTY_UPLOAD_LOGO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY_IN_USE,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId,
          partyId,
          filename: file.name,
          contentType: file.type || "image/png",
          fileBase64: b64,
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // ignore
      }

      if (!res.ok || !json?.ok) {
        const msg = String(json?.error ?? text ?? `HTTP ${res.status}`);
        console.error("[PartyCustomerEditorCard] uploadLogo failed", {
          status: res.status,
          endpoint: PARTY_UPLOAD_LOGO_URL,
          usingFallback: USING_FALLBACK_SUPABASE,
          body: text?.slice?.(0, 500) ?? text,
        });
        if (res.status === 401) {
          throw new Error(
            `401 (unauthorized). Detalhe: ${msg}.\n` +
              `Checklist:\n` +
              `• Confirme que a função party-upload-logo está com "Verify JWT" DESLIGADO (ela valida o token manualmente).\n` +
              `• Confirme que o app e a função estão no MESMO projeto Supabase. URL em uso: ${SUPABASE_URL_IN_USE}`
          );
        }
        throw new Error(msg);
      }

      showSuccess("Logo do cliente enviada.");
      await qc.invalidateQueries({ queryKey: ["entity", tenantId, partyId] });
      onUpdated();
    } catch (e: any) {
      showError(e?.message ?? "Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Dados do cliente</div>
          <div className="mt-1 text-xs text-slate-600">Edita campos já existentes em core_entities (display_name + metadata).</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-2">
          <Label>Nome</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="rounded-xl" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>CPF / CNPJ</Label>
            <Input
              value={docDisplay}
              onChange={(e) => setDocDigitsState(onlyDigits(e.target.value).slice(0, 14))}
              className="rounded-xl"
              inputMode="numeric"
              placeholder="000.000.000-00"
            />
          </div>
          <div className="grid gap-2">
            <Label>WhatsApp</Label>
            <Input
              value={whatsappDisplay}
              onChange={(e) => setWhatsappDigitsState(normalizeWhatsappDigits(e.target.value))}
              className="rounded-xl"
              inputMode="tel"
              placeholder="(DD) 9xxxx-xxxx"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl" />
        </div>

        <div className="grid gap-3 rounded-2xl border bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">Endereço</div>

          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <div className="grid gap-2">
              <Label>CEP</Label>
              <Input value={cep} onChange={(e) => setCep(e.target.value)} className="rounded-xl" />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full rounded-xl"
                onClick={fetchByCep}
                disabled={fetchingCep || onlyDigits(cep).length !== 8}
              >
                {fetchingCep ? "Buscando…" : "Buscar CEP"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label>Endereço</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-xl" />
            </div>
            <div className="grid gap-2">
              <Label>Cidade</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl" />
            </div>
            <div className="grid gap-2">
              <Label>UF</Label>
              <Input value={uf} onChange={(e) => setUf(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-700">Logo</div>
              <div className="mt-1 text-xs text-slate-600">Salvo em metadata.logo</div>
            </div>
            {logoUrl ? (
              <a
                href={logoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-slate-700 underline"
              >
                Abrir
              </a>
            ) : null}
          </div>

          {logoUrl ? (
            <div className="mt-2 flex items-center gap-3">
              <img src={logoUrl} alt="logo" className="h-10 w-10 rounded-xl border object-contain" />
              <div className="min-w-0 text-xs text-slate-600 truncate">{logoInfo?.path}</div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate-600">Nenhum logo cadastrado.</div>
          )}

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_160px]">
            <Input ref={fileRef} type="file" accept="image/*" className="rounded-xl" />
            <Button
              type="button"
              className="rounded-xl"
              onClick={uploadLogo}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button className="rounded-xl" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}