import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showError, showSuccess } from "@/utils/toast";
import { SUPABASE_ANON_KEY_IN_USE, SUPABASE_URL_IN_USE, USING_FALLBACK_SUPABASE } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { PublicPortalShell, type PublicPalette } from "@/components/public/PublicPortalShell";
import { PublicReport, type PublicReportData } from "@/components/public/PublicReport";
import { PublicPostsCalendar, type PublicPublication } from "@/components/public/PublicPostsCalendar";
import { PublicEntityHistory, type PublicCase, type PublicTimelineEvent } from "@/components/public/PublicEntityHistory";
import { PublicEntityTasks, type PublicTask } from "@/components/public/PublicEntityTasks";
import { PublicPortalLoading } from "@/components/public/PublicPortalLoading";

const FN_URL = `${SUPABASE_URL_IN_USE}/functions/v1/public-proposal`;

type ApiData = {
  ok: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    company: any;
  };
  party: { id: string; display_name: string; logo_url: string | null; customer: any };
  proposal: {
    id: string;
    status: string;
    approved_at: string | null;
    selected_commitment_ids: string[];
    signing_link: string | null;
    autentique_status: string | null;
  };
  palette: PublicPalette | null;
  report: PublicReportData;
  calendar: { publications: PublicPublication[] };
  history: { cases: PublicCase[]; events: PublicTimelineEvent[] };
  tasks: PublicTask[]; // New field for open trello tasks
  scope: {
    commitments: any[];
    items: any[];
    offeringsById: Record<string, any>;
    templates: any[];
  };
};

const publicSb = createClient(SUPABASE_URL_IN_USE, SUPABASE_ANON_KEY_IN_USE, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function safe(s: any) {
  return String(s ?? "").trim();
}

function initials(name: string) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const i = parts.map((p) => p[0]?.toUpperCase()).join("");
  return i || "?";
}

export default function PublicProposal() {
  const { tenantSlug, token } = useParams();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<"approve" | "sign" | "sign_force" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const debug = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, []);

  const load = async () => {
    if (!tenantSlug || !token) return;

    setLoading(true);
    setLoadError(null);
    try {
      const url = new URL(FN_URL);
      url.searchParams.set("tenant_slug", tenantSlug);
      url.searchParams.set("token", token);

      const [res, rpcRes] = await Promise.all([
        fetch(url.toString(), {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY_IN_USE,
          },
        }),
        publicSb.rpc("public_get_portal_data", { p_token: token })
      ]);

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

        const msg = detailMsg || `HTTP ${res.status}`;

        console.error("[PublicProposal] load failed", {
          status: res.status,
          endpoint: url.toString(),
          usingFallback: USING_FALLBACK_SUPABASE,
          body: text?.slice?.(0, 500) ?? text,
        });

        if (res.status === 401 && msg.toLowerCase().includes("missing authorization header")) {
          throw new Error(
            `401: Missing authorization header. Essa Edge Function provavelmente está com "Verify JWT" ligado no Supabase. ` +
            `Desative o Verify JWT para a função public-proposal (ela é pública). Endpoint: ${FN_URL}`
          );
        }

        throw new Error(msg);
      }

      // Merge RPC data (tasks, timeline) into the Edge Function response
      // The RPC returns { valid: true, tasks: [], timeline: [], cases: [] }
      if (rpcRes.data?.valid) {
        json.tasks = rpcRes.data.tasks || [];
        // We can merge history or overwrite. The EF might return empty history anyway.
        // Let's rely on RPC for history as it's what we want to fix.
        // We need mapping: RPC timeline -> PublicTimelineEvent
        // RPC cases -> PublicCase

        // RPC returns timeline with meta_json, EF expects specific fields? 
        // PublicTimelineEvent = { id, event_type, message, occurred_at, meta_json? }
        // My RPC returns exactly that structure (from timeline_events).
        // And cases needs { id, title, status }. My RPC returns that.

        json.history = {
          cases: rpcRes.data.cases || [],
          events: rpcRes.data.timeline || []
        };
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

  // Realtime + polling to reflect signature status updates (webhook or status polling)
  useEffect(() => {
    if (!tenantSlug || !token) return;

    const channel = publicSb
      .channel(`public-proposal:${tenantSlug}:${token}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "party_proposals",
        },
        () => {
          // Best effort reload; the function will compute the latest status.
          load();
        }
      )
      .subscribe();

    return () => {
      publicSb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, token]);

  useEffect(() => {
    // Poll every 1h (also useful if webhook is not configured)
    const id = window.setInterval(() => setTick((t) => t + 1), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tick === 0) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

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
      const qty = Number(it.quantity ?? 1);
      const ts = templatesByOffering.get(oid) ?? [];

      if (ts.length === 0) {
        lines.push(`${offName} (qtd ${qty})`);
      } else {
        for (const t of ts) lines.push(`${offName} — ${String(t.name)} (qtd ${qty})`);
      }
    }

    // If there are selected commitments but no items returned, show a fallback.
    if (!lines.length && (data?.proposal?.selected_commitment_ids ?? []).length) {
      lines.push("(itens do escopo não encontrados para os compromissos selecionados)");
    }

    return lines;
  }, [data]);

  const act = async (action: "approve" | "sign" | "sign_force") => {
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
        const detailMsg =
          safe(json?.detail?.message) ||
          safe(json?.detail?.error) ||
          safe(json?.message) ||
          safe(json?.error) ||
          (text ? safe(text) : "");

        const msg = detailMsg || `HTTP ${res.status}`;

        console.error("[PublicProposal] action failed", {
          action,
          status: res.status,
          endpoint: url.toString(),
          usingFallback: USING_FALLBACK_SUPABASE,
          body: text?.slice?.(0, 500) ?? text,
        });

        throw new Error(msg);
      }

      if (action === "approve") {
        showSuccess("Escopo aprovado.");
      } else {
        const link = safe(json?.signing_link);
        showSuccess(action === "sign_force" ? "Contrato reenviado." : "Link gerado.");
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

  const isSigned =
    String(proposal?.status ?? "").toLowerCase() === "signed" ||
    String(proposal?.autentique_status ?? "").toLowerCase() === "signed";

  const openContract = () => {
    const link = safe(proposal?.signing_link);
    if (!link) {
      showError("Link do contrato não disponível.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  };

  return (
    <PublicPortalShell palette={data?.palette}>
      {loading && !data ? (
        <PublicPortalLoading label="Carregando proposta…" />
      ) : (
        <div className="mx-auto max-w-5xl space-y-4">
          <Tabs defaultValue="scope" className="w-full">
            <Card className="rounded-[34px] border-black/10 bg-white/85 p-4 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[30px] bg-white shadow-sm">
                    {party?.logo_url ? (
                      <img src={party.logo_url} alt="Logo" className="h-20 w-20 object-contain" />
                    ) : (
                      <div className="text-xl font-bold text-slate-700">{initials(party?.display_name ?? "")}</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: "var(--public-card-text)" as any }}>
                      Proposta pública
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900 line-clamp-1">{party?.display_name ?? "Cliente"}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {tenant?.name ?? tenantSlug} • token: {String(token ?? "").slice(0, 6)}…
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:items-end">
                  <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-[24px] bg-white/70 p-2">
                    <TabsTrigger value="scope" className="rounded-2xl">
                      Proposta / Escopo
                    </TabsTrigger>
                    <TabsTrigger value="report" className="rounded-2xl">
                      Relatório
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="rounded-2xl">
                      Calendário
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="rounded-2xl">
                      Tarefas
                    </TabsTrigger>
                    <TabsTrigger value="history" className="rounded-2xl">
                      Linha do tempo
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </Card>

            {loadError ? (
              <Card className="rounded-[34px] border-red-200 bg-white/85 p-5 shadow-sm backdrop-blur">
                <div className="text-sm font-semibold text-red-800">Não foi possível carregar a proposta</div>
                <div className="mt-2 text-sm text-red-800">{loadError}</div>
                <div className="mt-4 grid gap-2 text-xs text-slate-700">
                  <div>
                    <span className="font-semibold">Endpoint:</span> {FN_URL}
                  </div>
                  <div>
                    <span className="font-semibold">Supabase URL em uso:</span> {SUPABASE_URL_IN_USE}
                    {USING_FALLBACK_SUPABASE ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        fallback
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span className="font-semibold">tenantSlug:</span> {tenantSlug}
                  </div>
                  <div>
                    <span className="font-semibold">token:</span> {token}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" className="rounded-2xl" onClick={load}>
                    Tentar novamente
                  </Button>
                </div>
              </Card>
            ) : null}

            <TabsContent value="scope" className="mt-4 space-y-4">
              {debug ? (
                <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Debug (escopo)</div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-700">
                        <div>
                          <span className="font-semibold">selected_commitment_ids:</span>{" "}
                          {JSON.stringify(data?.proposal?.selected_commitment_ids ?? [])}
                        </div>
                        <div>
                          <span className="font-semibold">scope.commitments:</span> {(data?.scope?.commitments ?? []).length}
                        </div>
                        <div>
                          <span className="font-semibold">scope.items:</span> {(data?.scope?.items ?? []).length}
                        </div>
                        <div>
                          <span className="font-semibold">scope.templates:</span> {(data?.scope?.templates ?? []).length}
                        </div>
                        <div>
                          <span className="font-semibold">scopeLines:</span> {scopeLines.length}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                      <Button
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          if (window.confirm("Reenviar o contrato para assinatura (vai gerar um novo documento no Autentique)?")) {
                            act("sign_force");
                          }
                        }}
                        disabled={loading || acting !== null || !proposal?.approved_at}
                      >
                        {acting === "sign_force" ? "Reenviando…" : "Reenviar contrato (debug)"}
                      </Button>
                      <div className="text-[11px] text-slate-600">
                        Útil quando um contrato antigo foi gerado sem escopo/template e você precisa regenerar.
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
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

                <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
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

              {(data?.scope?.commitments ?? []).length ? (
                <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">Compromissos selecionados</div>
                  <div className="mt-2 grid gap-2">
                    {(data?.scope?.commitments ?? []).map((c: any) => (
                      <div key={c.id} className="rounded-2xl border bg-white px-3 py-2 text-sm text-slate-800">
                        <div className="font-semibold">{String(c.commitment_type ?? "commitment")}</div>
                        <div className="text-xs text-slate-600">id: {String(c.id).slice(0, 8)}… • status: {c.status ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Escopo a ser entregue</div>
                  <div className="text-xs text-slate-600">Itens derivados dos compromissos selecionados.</div>
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

                <Separator className="my-4" />

                {/* Rodapé: botões + status ao lado */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    className="rounded-2xl"
                    onClick={() => act("approve")}
                    disabled={loading || acting !== null || Boolean(proposal?.approved_at)}
                  >
                    {proposal?.approved_at ? "Escopo aprovado" : acting === "approve" ? "Aprovando…" : "Aprovar o escopo"}
                  </Button>

                  <div className="flex flex-wrap items-center gap-2">
                    {proposal?.signing_link && isSigned ? (
                      <Button variant="outline" className="rounded-2xl" onClick={openContract}>
                        Ver contrato
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => act("sign")}
                        disabled={loading || acting !== null || !proposal?.approved_at}
                      >
                        {acting === "sign" ? "Gerando…" : "Assinar contrato"}
                      </Button>
                    )}

                    <Badge variant="secondary">{proposal?.status ?? (loading ? "carregando" : "—")}</Badge>
                    {proposal?.autentique_status ? <Badge variant="outline">Assinatura: {proposal.autentique_status}</Badge> : null}
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="report" className="mt-4">
              {data?.report ? <PublicReport report={data.report} /> : null}
            </TabsContent>

            <TabsContent value="calendar" className="mt-4">
              <PublicPostsCalendar publications={data?.calendar?.publications ?? []} />
            </TabsContent>

            <TabsContent value="tasks" className="mt-4">
              <PublicEntityTasks tasks={data?.tasks ?? []} />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <PublicEntityHistory cases={data?.history?.cases ?? []} events={data?.history?.events ?? []} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PublicPortalShell>
  );
}