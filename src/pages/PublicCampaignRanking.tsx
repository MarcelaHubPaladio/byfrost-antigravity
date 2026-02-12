import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

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

  const top3 = items.slice(0, 3);
  const top10 = items.slice(0, 10);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tenant || !campaign) return;

      try {
        setError(null);
        const url = new URL(RANKING_URL);
        url.searchParams.set("tenant_slug", tenant);
        url.searchParams.set("campaign_id", campaign);

        const res = await fetch(url.toString(), { method: "GET" });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          const msg = String(json?.error ?? `HTTP ${res.status}`);
          throw new Error(msg);
        }

        if (cancelled) return;
        setItems((json.items ?? []) as Row[]);
        setUpdatedAt(String(json.updated_at ?? new Date().toISOString()));
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message ?? "Erro"));
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
        </div>

        {error && (
          <Card className="mt-6 rounded-3xl border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            Não foi possível carregar o ranking: {error}
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
