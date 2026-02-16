import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";
import { SUPABASE_ANON_KEY_IN_USE, SUPABASE_URL_IN_USE } from "@/lib/supabase";

const FN_URL = `${SUPABASE_URL_IN_USE}/functions/v1/public-proposal`;

type ApiData = {
  ok: boolean;
  tenant: {
    name: string;
    slug: string;
    logo_url: string | null;
    company: any;
    palette_primary_hex?: string | null;
  };
  party: { display_name: string; logo_url: string | null; customer: any };
  proposal: {
    status: string;
    approved_at: string | null;
    signing_link: string | null;
    autentique_status: string | null;
  };
  scope: {
    commitments: any[];
    items: any[];
    offeringsById: Record<string, any>;
    templates: any[];
  };
};

function safe(s: any) {
  return String(s ?? "").trim();
}

function isValidHex(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex: string) {
  if (!isValidHex(hex)) return null;
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHsl(rgb: { r: number; g: number; b: number }) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export default function PublicProposal() {
  const { tenantSlug, token } = useParams();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<"approve" | "sign" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    if (!tenantSlug || !token) return;

    setLoading(true);
    setLoadError(null);
    try {
      const url = new URL(FN_URL);
      url.searchParams.set("tenant_slug", tenantSlug);
      url.searchParams.set("token", token);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY_IN_USE,
        },
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // ignore
      }

      if (!res.ok || !json?.ok) {
        const detailMsg =
          safe(json?.detail?.message) ||
          safe(json?.detail?.error) ||
          safe(json?.message) ||
          safe(json?.error) ||
          (text ? safe(text) : "");

        if (res.status === 401 && detailMsg.toLowerCase().includes("missing authorization header")) {
          throw new Error(
            `401: Missing authorization header. Essa Edge Function provavelmente está com "Verify JWT" ligado no Supabase. ` +
              `Desative o Verify JWT para a função public-proposal (ela é pública). Endpoint: ${FN_URL}`
          );
        }

        throw new Error(detailMsg || `HTTP ${res.status}`);
      }

      setData(json as ApiData);
    } catch (e: any) {
      const msg = e?.message ?? "Erro ao carregar proposta";
      showError(msg);
      setLoadError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, token]);

  const scopeLines = useMemo(() => {
    const templates = data?.scope?.templates ?? [];
    const items = data?.scope?.items ?? [];
    const offs = data?.scope?.offeringsById ?? {};

    const templatesByOffering = new Map<string, any[]>();
    for (const t of templates) {
      const oid = String(t.offering_entity_id);
      if (!templatesByOffering.has(oid)) templatesByOffering.set(oid, []);
      templatesByOffering.get(oid)!.push(t);
    }

    const lines: string[] = [];
    for (const it of items) {
      const oid = String(it.offering_entity_id);
      const offName = String(offs[oid]?.display_name ?? oid);
      const ts = templatesByOffering.get(oid) ?? [];
      for (const t of ts) lines.push(`${offName} — ${String(t.name)}`);
    }
    return lines;
  }, [data]);

  const act = async (action: "approve" | "sign") => {
    if (!tenantSlug || !token) return;

    setActing(action);
    try {
      const url = new URL(FN_URL);
      url.searchParams.set("tenant_slug", tenantSlug);
      url.searchParams.set("token", token);

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY_IN_USE,
        },
        body: JSON.stringify({ action }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // ignore
      }

      if (!res.ok || !json?.ok) {
        const detail = safe(json?.error) || (text ? safe(text) : "");
        throw new Error(detail || `HTTP ${res.status}`);
      }

      if (action === "approve") {
        showSuccess("Escopo aprovado.");
      } else {
        const link = safe(json?.signing_link);
        showSuccess("Link de assinatura gerado.");
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }

      await load();
    } catch (e: any) {
      showError(e?.message ?? "Falha");
    } finally {
      setActing(null);
    }
  };

  const tenant = data?.tenant;
  const party = data?.party;
  const proposal = data?.proposal;

  useEffect(() => {
    const hex = String(tenant?.palette_primary_hex ?? "").trim();
    if (!isValidHex(hex)) return;

    const rgb = hexToRgb(hex);
    if (!rgb) return;

    const { h, s, l } = rgbToHsl(rgb);

    const root = document.documentElement;
    const prev = {
      tenantAccent: root.style.getPropertyValue("--tenant-accent"),
      tenantBg: root.style.getPropertyValue("--tenant-bg"),
      primary: root.style.getPropertyValue("--primary"),
      ring: root.style.getPropertyValue("--ring"),
    };

    const accent = `${h} ${Math.max(35, Math.min(95, s))}% ${Math.max(25, Math.min(60, l))}%`;
    const bg = `${h} 40% 97%`;

    root.style.setProperty("--tenant-accent", accent);
    root.style.setProperty("--tenant-bg", bg);
    // Make shadcn primary match tenant accent on this public page.
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);

    return () => {
      root.style.setProperty("--tenant-accent", prev.tenantAccent);
      root.style.setProperty("--tenant-bg", prev.tenantBg);
      root.style.setProperty("--primary", prev.primary);
      root.style.setProperty("--ring", prev.ring);
    };
  }, [tenant?.palette_primary_hex]);

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))] px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="rounded-3xl border-slate-200 bg-white/75 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {tenant?.logo_url ? (
                <img
                  src={tenant.logo_url}
                  alt="Logo"
                  className="h-10 w-10 rounded-2xl object-contain bg-white p-1"
                />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-700">
                  {safe(tenant?.name).slice(0, 1).toUpperCase() || "B"}
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-slate-900">{tenant?.name ?? tenantSlug}</div>
                <div className="text-xs text-slate-600">Proposta / Escopo</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{proposal?.status ?? (loading ? "carregando" : "—")}</Badge>
              {proposal?.autentique_status ? (
                <Badge variant="outline">Assinatura: {proposal.autentique_status}</Badge>
              ) : null}
            </div>
          </div>
        </Card>

        {loadError ? (
          <Card className="rounded-3xl border-red-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-red-800">Não foi possível carregar a proposta</div>
            <div className="mt-2 text-sm text-red-800">{loadError}</div>
            <div className="mt-4 grid gap-2 text-xs text-slate-700">
              <div>
                <span className="font-semibold">Endpoint:</span> {FN_URL}
              </div>
              <div>
                <span className="font-semibold">tenantSlug:</span> {tenantSlug}
              </div>
              <div>
                <span className="font-semibold">token:</span> {token}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={load}>
                Tentar novamente
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-3xl border-slate-200 bg-white/75 p-5 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-slate-900">Seu tenant</div>
            <div className="mt-2 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Nome:</span> {tenant?.name ?? "—"}
              </div>
              <div>
                <span className="font-semibold">CNPJ:</span> {safe(tenant?.company?.cnpj) || "—"}
              </div>
              <div>
                <span className="font-semibold">Endereço:</span> {safe(tenant?.company?.address_line) || "—"}
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white/75 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Cliente</div>
              {party?.logo_url ? (
                <img
                  src={party.logo_url}
                  alt="Logo cliente"
                  className="h-9 w-9 rounded-2xl object-contain bg-white p-1"
                />
              ) : null}
            </div>
            <div className="mt-2 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Nome:</span> {party?.display_name ?? "—"}
              </div>
              <div>
                <span className="font-semibold">CPF/CNPJ:</span> {safe(party?.customer?.document) || "—"}
              </div>
              <div>
                <span className="font-semibold">Endereço:</span> {safe(party?.customer?.address_line) || "—"}
              </div>
              <div>
                <span className="font-semibold">WhatsApp:</span> {safe(party?.customer?.whatsapp) || "—"}
              </div>
              <div>
                <span className="font-semibold">Email:</span> {safe(party?.customer?.email) || "—"}
              </div>
            </div>
          </Card>
        </div>

        <Card className="rounded-3xl border-slate-200 bg-white/75 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Escopo a ser entregue</div>
              <div className="text-xs text-slate-600">
                Gerado a partir dos templates dos offerings nos compromissos selecionados.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="rounded-xl"
                onClick={() => act("approve")}
                disabled={loading || acting !== null || Boolean(proposal?.approved_at)}
              >
                {proposal?.approved_at
                  ? "Escopo aprovado"
                  : acting === "approve"
                    ? "Aprovando…"
                    : "Aprovar o escopo"}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => act("sign")}
                disabled={loading || acting !== null || !proposal?.approved_at}
              >
                {acting === "sign" ? "Gerando…" : "Assinar contrato"}
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          {loading ? (
            <div className="text-sm text-slate-600">Carregando…</div>
          ) : scopeLines.length === 0 ? (
            <div className="text-sm text-slate-600">Nenhum item no escopo.</div>
          ) : (
            <div className="grid gap-2">
              {scopeLines.map((l, idx) => (
                <div key={idx} className="rounded-2xl border bg-white px-3 py-2 text-sm text-slate-800">
                  {l}
                </div>
              ))}
            </div>
          )}

          {proposal?.signing_link ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm">
              <div className="font-semibold text-slate-900">Link de assinatura</div>
              <div className="mt-1 break-all text-xs text-slate-700">{proposal.signing_link}</div>
              <Button
                className="mt-3 rounded-xl"
                onClick={() => window.open(proposal.signing_link!, "_blank", "noopener,noreferrer")}
              >
                Abrir assinatura
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="text-center text-xs text-slate-500">
          {loading ? "" : `tenant: ${tenantSlug} • token: ${String(token).slice(0, 6)}…`}
        </div>
      </div>
    </div>
  );
}