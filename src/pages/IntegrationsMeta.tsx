import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Facebook,
  Instagram,
  Link2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

const META_OAUTH_START_URL = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-oauth-start";
const META_OAUTH_CALLBACK_URL = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-oauth-callback";
const META_ACCOUNTS_DEACTIVATE_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-accounts-deactivate";

type MetaAccountRow = {
  id: string;
  tenant_id: string;
  fb_page_id: string;
  fb_page_name: string;
  ig_business_account_id: string;
  ig_username: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  is_active: boolean;
  created_at: string;
};

type Candidate = {
  fb_page_id: string;
  fb_page_name: string;
  ig_business_account_id: string;
  ig_username: string | null;
};

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = t - Date.now();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function looksLikeSchemaCacheMissing(msg: string) {
  const m = (msg ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("could not find") || m.includes("meta_accounts");
}

export default function IntegrationsMeta() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation();
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const sp = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const state = sp.get("state") ?? "";
  const connected = sp.get("connected") === "1";
  const error = sp.get("error") ?? "";

  const [connecting, setConnecting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectingPageId, setSelectingPageId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const accountsQ = useQuery({
    queryKey: ["meta_accounts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_accounts")
        .select(
          "id,tenant_id,fb_page_id,fb_page_name,ig_business_account_id,ig_username,token_expires_at,scopes,is_active,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as MetaAccountRow[];
    },
  });

  useEffect(() => {
    if (connected) {
      showSuccess("Instagram conectado com sucesso.");
      nav("/app/integrations/meta", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (error) {
      const label: Record<string, string> = {
        missing_code_or_state: "Callback inválido (sem code/state).",
        invalid_state: "Sessão OAuth inválida/expirada.",
        state_expired: "Sessão OAuth expirada. Tente novamente.",
        token_exchange_failed: "Não foi possível trocar o code por token.",
        no_ig_connected: "Não encontrei Instagram Business conectado a nenhuma Página.",
        failed_to_save_account: "Falha ao salvar a conexão.",
      };
      showError(label[error] ?? `Falha ao conectar: ${error}`);
      nav("/app/integrations/meta", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const fetchCandidates = async () => {
    if (!state) return;
    setLoadingCandidates(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(META_OAUTH_CALLBACK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "list", state }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }

      setCandidates((json?.candidates ?? []) as Candidate[]);
    } catch (e: any) {
      showError(`Não foi possível carregar páginas: ${e?.message ?? "erro"}`);
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    if (state) fetchCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const startConnect = async () => {
    if (!activeTenantId) {
      showError("Selecione um tenant.");
      return;
    }

    setConnecting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(META_OAUTH_START_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantId: activeTenantId }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.url) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }

      window.location.href = String(json.url);
    } catch (e: any) {
      showError(`Falha ao iniciar conexão: ${e?.message ?? "erro"}`);
    } finally {
      setConnecting(false);
    }
  };

  const selectPage = async (fbPageId: string) => {
    if (!state) return;
    setSelectingPageId(fbPageId);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(META_OAUTH_CALLBACK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "select", state, fb_page_id: fbPageId }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }

      showSuccess("Conexão concluída.");
      await qc.invalidateQueries({ queryKey: ["meta_accounts", activeTenantId] });
      nav("/app/integrations/meta", { replace: true });
    } catch (e: any) {
      showError(`Falha ao concluir: ${e?.message ?? "erro"}`);
    } finally {
      setSelectingPageId(null);
    }
  };

  const setAccountActive = async (metaAccountId: string, isActive: boolean) => {
    setUpdatingId(metaAccountId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(META_ACCOUNTS_DEACTIVATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ metaAccountId, isActive }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.details || json?.error || `HTTP ${res.status}`);

      showSuccess(isActive ? "Conta reativada." : "Conta desativada.");
      await qc.invalidateQueries({ queryKey: ["meta_accounts", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar: ${e?.message ?? "erro"}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const schemaCacheHint = accountsQ.isError
    ? looksLikeSchemaCacheMissing((accountsQ.error as any)?.message ?? "")
    : false;

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">Integrações • Meta</h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Conecte Instagram Business via uma Página do Facebook (sem publicar nesta fase).
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <Link
                  to="/app/settings"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para Configurações
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={() => accountsQ.refetch()}
                variant="secondary"
                className="h-10 rounded-2xl"
                disabled={accountsQ.isFetching}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", accountsQ.isFetching ? "animate-spin" : "")} />
                Atualizar
              </Button>

              <Button
                onClick={startConnect}
                disabled={connecting || !activeTenantId}
                className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                <Facebook className="mr-2 h-4 w-4" />
                {connecting ? "Abrindo…" : "Conectar Instagram (via Página)"}
              </Button>
            </div>
          </div>

          {schemaCacheHint ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Parece que as tabelas da integração Meta ainda não existem neste banco (ex.: <span className="font-mono">meta_accounts</span>).
              <div className="mt-1 text-xs text-amber-900/80">
                Aplique a migração <span className="font-mono">0008_meta_accounts_and_oauth_states.sql</span> no Supabase e recarregue a página.
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Contas conectadas</div>
              <div className="mt-1 text-xs text-slate-500">
                Tokens ficam criptografados no banco. O painel só exibe metadados.
              </div>

              <div className="mt-4 grid gap-3">
                {(accountsQ.data ?? []).map((a) => {
                  const d = daysUntil(a.token_expires_at);
                  const expiresLabel =
                    d === null
                      ? "expiração: —"
                      : d < 0
                        ? "token expirado"
                        : d === 0
                          ? "expira hoje"
                          : `expira em ${d} dia(s)`;

                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "rounded-[20px] border p-4",
                        a.is_active ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                              <Instagram className="h-4.5 w-4.5 text-slate-700" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{a.fb_page_name}</div>
                              <div className="mt-0.5 truncate text-xs text-slate-600">
                                {a.ig_username ? `@${a.ig_username}` : `IG: ${a.ig_business_account_id}`}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge
                              className={cn(
                                "rounded-full border-0",
                                a.is_active
                                  ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                                  : "bg-amber-100 text-amber-900 hover:bg-amber-100"
                              )}
                            >
                              {a.is_active ? "ativa" : "desativada"}
                            </Badge>
                            <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                              <CalendarDays className="mr-1 h-3.5 w-3.5" /> {expiresLabel}
                            </Badge>
                          </div>

                          {a.scopes?.length ? (
                            <div className="mt-2 text-[11px] text-slate-500">
                              scopes: <span className="font-medium text-slate-700">{a.scopes.join(", ")}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            className={cn(
                              "h-10 rounded-2xl",
                              a.is_active
                                ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                            )}
                            disabled={updatingId === a.id}
                            onClick={() => setAccountActive(a.id, !a.is_active)}
                          >
                            {updatingId === a.id ? "Salvando…" : a.is_active ? "Desativar" : "Reativar"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-1 text-[11px] text-slate-500">
                        <div>page_id: {a.fb_page_id}</div>
                        <div>criado em: {new Date(a.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}

                {(accountsQ.data ?? []).length === 0 && (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                    Nenhuma conexão ainda.
                    <div className="mt-2 text-xs text-slate-500">
                      Clique em <span className="font-semibold">Conectar Instagram (via Página)</span>.
                    </div>
                  </div>
                )}

                {accountsQ.isError && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                    Erro ao carregar conexões: {(accountsQ.error as any)?.message ?? ""}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {state && (
                <div className="rounded-[22px] border border-indigo-200 bg-indigo-50/40 p-4">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 text-indigo-700" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Selecione uma Página</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Encontrei mais de uma Página com Instagram Business conectado. Escolha qual deseja ativar.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-9 rounded-2xl"
                      disabled={loadingCandidates}
                      onClick={fetchCandidates}
                    >
                      <RefreshCw className={cn("mr-2 h-4 w-4", loadingCandidates ? "animate-spin" : "")} />
                      Recarregar
                    </Button>
                    <div className="text-[11px] text-slate-500">state: {state.slice(0, 8)}…</div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {candidates.map((c) => (
                      <button
                        key={c.fb_page_id}
                        type="button"
                        onClick={() => selectPage(c.fb_page_id)}
                        className={cn(
                          "flex items-start justify-between gap-3 rounded-2xl border bg-white px-3 py-3 text-left transition hover:bg-slate-50",
                          selectingPageId === c.fb_page_id ? "border-indigo-300 opacity-70" : "border-slate-200"
                        )}
                        disabled={Boolean(selectingPageId)}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{c.fb_page_name}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-600">
                            {c.ig_username ? `@${c.ig_username}` : `IG: ${c.ig_business_account_id}`}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">page_id: {c.fb_page_id}</div>
                        </div>
                        <div className="shrink-0">
                          <div className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-900">
                            <CheckCircle2 className="h-3.5 w-3.5" /> selecionar
                          </div>
                        </div>
                      </button>
                    ))}

                    {!loadingCandidates && candidates.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/60 p-3 text-xs text-slate-600">
                        Nenhuma opção disponível (ou estado expirou). Clique em conectar novamente.
                      </div>
                    )}

                    {loadingCandidates && (
                      <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/60 p-3 text-xs text-slate-600">
                        Carregando páginas…
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Requisitos (para funcionar)</div>
                <div className="mt-2 text-xs text-slate-600">
                  Esta fase depende do app Meta (Facebook) configurado e dos Secrets nas Edge Functions.
                </div>

                <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    Secrets necessários:
                    <div className="mt-1 font-mono text-[11px] text-slate-700">
                      META_APP_ID, META_APP_SECRET, META_OAUTH_CALLBACK_URL, APP_BASE_URL, APP_TOKEN_ENCRYPTION_KEY
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    Callback registrado no Meta App deve bater com:
                    <div className="mt-1 font-mono text-[11px] text-slate-700 break-all">{META_OAUTH_CALLBACK_URL}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    Você está logado como: <span className="font-semibold">{user?.email ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}