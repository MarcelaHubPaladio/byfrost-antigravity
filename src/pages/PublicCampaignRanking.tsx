import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";

const RANKING_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/public-campaign-ranking";

type Row = {
  display_name: string;
  photo_url: string | null;
  score: number;
  position: number;
};

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const i = parts.map((p) => p[0]?.toUpperCase()).join("");
  return i || "?";
}

function PodiumCard({ row, place }: { row: Row; place: 1 | 2 | 3 }) {
  const badge =
    place === 1
      ? "bg-amber-500 text-white"
      : place === 2
        ? "bg-slate-400 text-white"
        : "bg-orange-700 text-white";

  const ring =
    place === 1
      ? "ring-amber-300"
      : place === 2
        ? "ring-slate-300"
        : "ring-orange-300";

  const scoreFmt = useMemo(() => {
    const n = Number(row.score ?? 0);
    if (Number.isNaN(n)) return "0";
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
  }, [row.score]);

  return (
    <Card className="rounded-3xl border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>
            #{place}
          </span>
          <div className="text-sm font-semibold text-slate-900 line-clamp-1">{row.display_name}</div>
        </div>
        <div className="text-xs font-medium text-slate-600">{scoreFmt}</div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Avatar className={`h-12 w-12 ring-2 ${ring} ring-offset-2 ring-offset-white`}>
          <AvatarImage src={row.photo_url ?? undefined} alt={row.display_name} />
          <AvatarFallback className="bg-slate-100 text-slate-700">
            {initials(row.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="text-xs text-slate-500">Pontuação (realtime)</div>
      </div>
    </Card>
  );
}

export default function PublicCampaignRanking() {
  const { tenant, campaign } = useParams();
  const [items, setItems] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<any>(null);

  const top3 = items.slice(0, 3);
  const top10 = items.slice(0, 10);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tenant || !campaign) return;

      try {
        setError(null);
        setErrorDetail(null);

        // 1) Try Edge Function first (supports signed URLs for private photos)
        const url = new URL(RANKING_URL);
        url.searchParams.set("tenant_slug", tenant);
        url.searchParams.set("campaign_id", campaign);

        const res = await fetch(url.toString(), { method: "GET" });
        const json = await res.json().catch(() => null);

        // If the function is not deployed in this Supabase project, Supabase often returns 404
        // with a body that is either non-JSON or JSON that does NOT match our { ok, error } shape.
        const looksLikeOurResponse =
          Boolean(json) && typeof (json as any).ok === "boolean" && typeof (json as any).error === "string";
        const shouldFallbackToRpc = res.status === 404 && !looksLikeOurResponse;

        if (!shouldFallbackToRpc) {
          if (!res.ok || !json?.ok) {
            const msg = String(json?.error ?? `HTTP ${res.status}`);
            const detail = json?.detail ?? null;
            // eslint-disable-next-line no-console
            console.error("public ranking failed", { status: res.status, msg, detail, url: url.toString() });
            throw Object.assign(new Error(msg), { detail });
          }

          if (cancelled) return;
          setItems((json.items ?? []) as Row[]);
          setUpdatedAt(String(json.updated_at ?? new Date().toISOString()));
          return;
        }

        // 2) Fallback: SQL RPC (does not require Edge Function deployment)
        const { data, error: rpcErr } = await supabase.rpc("public_campaign_ranking", {
          p_tenant_slug: tenant,
          p_campaign_id: campaign,
          p_limit: 10,
        });

        if (rpcErr) throw rpcErr;

        if (!data?.ok) {
          const msg = String(data?.error ?? "Erro");
          throw Object.assign(new Error(msg), { detail: null });
        }

        if (cancelled) return;
        setItems((data.items ?? []) as Row[]);
        setUpdatedAt(String(data.updated_at ?? new Date().toISOString()));
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message ?? "Erro"));
        setErrorDetail(e?.detail ?? null);
        setItems([]);
      }
    }

    // initial
    load();

    // pseudo-realtime: refresh every 10s
    const id = setInterval(load, 10_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tenant, campaign]);

  const helpText = useMemo(() => {
    const e = String(error ?? "");
    const el = e.toLowerCase();

    if (el.includes("public_campaign_ranking") && (el.includes("could not find") || el.includes("does not exist"))) {
      return "A função SQL de fallback não está instalada no seu Supabase. Execute a migration 0026_public_campaign_ranking_rpc.sql no SQL Editor.";
    }

    switch (error) {
      case "tenant_not_found":
        return "Tenant não encontrado. Verifique o tenant_slug na URL.";
      case "campaign_not_found":
        return "Campanha não encontrada para este tenant. Verifique o campaign_id na URL.";
      case "forbidden":
        return "Esta campanha não está pública. No painel, deixe visibility=public para liberar o ranking.";
      case "ranking_query_failed":
        return "Falha ao consultar o ranking (view/campos podem não existir). Confirme se as migrations do Incentive Engine foram aplicadas.";
      case "participants_query_failed":
        return "Falha ao carregar participantes. Confirme se as tabelas do Incentive Engine existem e se o projeto tem a função configurada.";
      case "missing_params":
        return "URL incompleta. Use /incentives/<tenant_slug>/<campaign_id>.";
      default:
        return null;
    }
  }, [error]);

  const updatedAtFmt = useMemo(() => {
    if (!updatedAt) return null;
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  }, [updatedAt]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-slate-600">Ranking</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">
            Incentives • {tenant}
          </div>
          <div className="text-xs text-slate-500">
            Atualizado em tempo real{updatedAtFmt ? ` • ${updatedAtFmt}` : ""}
          </div>
          <div className="text-[11px] text-slate-400">
            URL esperada: <span className="font-mono">/incentives/{tenant ?? "<tenant_slug>"}/{campaign ?? "<campaign_id>"}</span>
          </div>
        </div>

        {error && (
          <Card className="mt-6 rounded-3xl border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Não foi possível carregar o ranking</div>
            <div className="mt-1">Erro: {error}</div>
            {helpText && <div className="mt-2 text-sm text-rose-900/90">{helpText}</div>}
            {errorDetail?.message && (
              <div className="mt-2 rounded-2xl border border-rose-200 bg-white/60 p-3 text-[12px] text-rose-900">
                <div className="font-semibold">Detalhe</div>
                <div className="mt-1 font-mono">{String(errorDetail.message)}</div>
                {errorDetail.code && <div className="mt-1 font-mono">code: {String(errorDetail.code)}</div>}
              </div>
            )}
          </Card>
        )}

        {!error && top3.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <PodiumCard row={top3[1] ?? top3[0]} place={2} />
            <PodiumCard row={top3[0]} place={1} />
            <PodiumCard row={top3[2] ?? top3[0]} place={3} />
          </div>
        )}

        <Card className="mt-6 rounded-3xl border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Top 10</div>
            <div className="text-xs text-slate-500">Campanha: {campaign}</div>
          </div>
          <Separator className="my-3" />

          {top10.length === 0 && !error ? (
            <div className="text-sm text-slate-600">Sem dados ainda.</div>
          ) : (
            <div className="grid gap-2">
              {top10.map((row) => (
                <div
                  key={`${row.position}-${row.display_name}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 text-sm font-semibold tabular-nums text-slate-700">
                      #{row.position}
                    </div>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={row.photo_url ?? undefined} alt={row.display_name} />
                      <AvatarFallback className="bg-white text-slate-700">
                        {initials(row.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium text-slate-900 line-clamp-1">
                      {row.display_name}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(row.score)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 text-[11px] text-slate-500">
            Observação: ranking calculado em tempo real (sem persistência).
          </div>
        </Card>
      </div>
    </div>
  );
}