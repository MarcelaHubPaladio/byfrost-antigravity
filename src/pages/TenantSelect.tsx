import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MembershipRow = {
  tenant_id: string;
  role: string;
  email: string | null;
  deleted_at: string | null;
  created_at?: string;
};

export default function TenantSelect() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const hasNoAccessError = searchParams.get("error") === "no_access";

  const { user } = useSession();
  const { tenants, activeTenantId, setActiveTenantId, loading, isSuperAdmin, membershipHint, refresh } = useTenant();

  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [membershipRows, setMembershipRows] = useState<MembershipRow[]>([]);

  const userId = user?.id ?? "";
  const userEmail = user?.email ?? "";

  const loadDiag = async () => {
    if (!userId) return;
    setDiagLoading(true);
    setDiagError(null);
    try {
      const { data, error } = await supabase
        .from("users_profile")
        .select("tenant_id, role, email, deleted_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setMembershipRows((data ?? []) as any);
    } catch (e: any) {
      setDiagError(String(e?.message ?? "erro"));
      setMembershipRows([]);
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    // Only auto-skip when there is nothing to choose.
    // Skip auto-redirect if we came from an access error to break the loop.
    if (!loading && tenants.length === 1 && !hasNoAccessError) {
      nav("/app", { replace: true });
    }
  }, [loading, tenants.length, nav, hasNoAccessError]);

  useEffect(() => {
    if (!loading && userId) loadDiag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);

  const membershipSummary = useMemo(() => {
    if (!membershipRows.length) return "nenhum";
    const active = membershipRows.filter((r) => !r.deleted_at).length;
    const soft = membershipRows.filter((r) => Boolean(r.deleted_at)).length;
    return `${active} ativo(s) • ${soft} desativado(s)`;
  }, [membershipRows]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <RequireAuth>
      <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Trocar tenant</h1>
          <p className="mt-1 text-sm text-slate-600">
            Selecione o ambiente onde deseja operar.
            {isSuperAdmin ? " (super-admin: você vê todos os tenants)" : ""}
          </p>

          {hasNoAccessError && (
            <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="font-bold flex items-center gap-2 text-rose-800">
                ⚠️ Acesso Restrito
              </div>
              <p className="mt-1 text-rose-700 leading-relaxed">
                Você tentou acessar o painel, mas seu cargo ainda não tem permissões liberadas para este cliente.
                <br />
                <strong>O que fazer:</strong> Peça ao administrador para ajustar a "Matriz de Acesso" do seu cargo nas configurações do sistema.
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {tenants.map((t) => {
              const isActive = t.id === activeTenantId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTenantId(t.id);
                    nav("/app", { replace: true });
                  }}
                  className={cn(
                    "group rounded-3xl border bg-white/70 p-4 text-left shadow-sm backdrop-blur transition",
                    isActive
                      ? "border-[hsl(var(--byfrost-accent)/0.45)] bg-white"
                      : "border-slate-200 hover:border-slate-300 hover:bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                      <div className="mt-1 text-xs text-slate-500">/{t.slug}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isActive && (
                        <div className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-900">
                          atual
                        </div>
                      )}
                      <div className="rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--byfrost-accent))]">
                        {t.role}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    Painel com trilha completa: mensagens → OCR → validação → pendências → aprovação.
                  </div>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full bg-[hsl(var(--byfrost-accent))] transition",
                        isActive ? "w-2/3" : "w-1/3 group-hover:w-2/3"
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {!loading && tenants.length === 0 && (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {membershipHint.type === "soft_deleted" ? (
                <>
                  Seu vínculo com o tenant está <span className="font-semibold">desativado</span> (users_profile.deleted_at).
                  Peça ao super-admin para <span className="font-semibold">restaurar</span> seu acesso.
                </>
              ) : membershipHint.type === "error" ? (
                <>
                  Não foi possível carregar seu vínculo com tenants (RLS/consulta):{" "}
                  <span className="font-semibold">{membershipHint.message}</span>
                </>
              ) : (
                <>
                  Seu usuário ainda não tem vínculo com nenhum tenant (users_profile). Peça ao super-admin para
                  vincular.
                </>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={async () => {
                    await supabase.auth.refreshSession().catch(() => null);
                    await refresh();
                    await loadDiag();
                  }}
                  disabled={diagLoading}
                >
                  {diagLoading ? "Recarregando…" : "Recarregar vínculo"}
                </Button>
                <div className="text-xs text-amber-900/80">
                  Diagnóstico: <span className="font-semibold">{membershipSummary}</span>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-amber-200 bg-white/70 p-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-800">Usuário</div>
                    <div className="mt-0.5">
                      email: <span className="font-medium text-slate-900">{userEmail || "—"}</span>
                    </div>
                    <div>
                      id: <span className="font-mono text-[11px] text-slate-900">{userId || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => copyText(userId)}>
                      Copiar ID
                    </Button>
                    <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => copyText(userEmail)}>
                      Copiar email
                    </Button>
                  </div>
                </div>

                {diagError && (
                  <div className="mt-2 text-[11px] text-rose-700">
                    Erro ao consultar users_profile: <span className="font-medium">{diagError}</span>
                  </div>
                )}

                {membershipRows.length > 0 && (
                  <div className="mt-2 overflow-auto">
                    <div className="text-[11px] font-semibold text-slate-800">Linhas em users_profile (visão do próprio usuário)</div>
                    <pre className="mt-1 max-h-[180px] overflow-auto rounded-xl bg-slate-50 p-2 text-[11px] text-slate-700">
                      {JSON.stringify(membershipRows, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}