import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, Star } from "lucide-react";

type MembershipRow = {
  tenant_id: string;
  role: string;
  email: string | null;
  deleted_at: string | null;
  created_at?: string;
};

function getTenantLogoUrl(t: any) {
  const logo = t.branding_json?.logo;
  if (!logo?.bucket || !logo?.path) return null;
  try {
    const base = supabase.storage.from(logo.bucket).getPublicUrl(logo.path).data.publicUrl;
    if (!base) return null;
    return logo.updated_at ? `${base}?t=${new Date(logo.updated_at).getTime()}` : base;
  } catch {
    return null;
  }
}

export default function TenantSelect() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const hasNoAccessError = searchParams.get("error") === "no_access";

  const { user } = useSession();
  const { tenants, activeTenantId, setActiveTenantId, loading, isSuperAdmin, membershipHint, refresh } = useTenant();

  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [membershipRows, setMembershipRows] = useState<MembershipRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      if (!user?.id) return [];
      const saved = localStorage.getItem(`tenant_favorites_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const userId = user?.id ?? "";
  const userEmail = user?.email ?? "";

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem(`tenant_favorites_${user?.id}`, JSON.stringify(next));
      return next;
    });
  };

  const filteredTenants = useMemo(() => {
    let list = tenants;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return a.name.localeCompare(b.name);
    });
  }, [tenants, searchQuery, favorites]);

  const loadDiag = async () => {
    if (!userId) return;
    setDiagLoading(true);
    setDiagError(null);
    try {
      const { data, error } = await supabase
        .from("users_profile")
        .select("tenant_id, role, deleted_at, created_at")
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
    if (!loading && tenants.length === 1 && !hasNoAccessError) {
      nav("/app", { replace: true });
    }
  }, [loading, tenants.length, nav, hasNoAccessError]);

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
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Trocar Empresa</h1>
              <p className="mt-1 text-sm text-slate-600">
                Selecione o ambiente onde deseja operar.
                {isSuperAdmin ? " (super-admin: você vê todos os tenants)" : ""}
              </p>
            </div>
            
            {tenants.length > 5 && (
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Buscar empresa..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-11 rounded-2xl bg-white/70 backdrop-blur"
                />
              </div>
            )}
          </div>

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

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTenants.map((t) => {
              const isActive = t.id === activeTenantId;
              const isFav = favorites.includes(t.id);
              const logoUrl = getTenantLogoUrl(t);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTenantId(t.id);
                    nav("/app", { replace: true });
                  }}
                  className={cn(
                    "group relative flex flex-col rounded-3xl border p-5 text-left shadow-sm backdrop-blur transition-all duration-300",
                    isActive
                      ? "border-[hsl(var(--byfrost-accent)/0.45)] bg-white ring-4 ring-[hsl(var(--byfrost-accent)/0.1)]"
                      : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white hover:shadow-md"
                  )}
                >
                  <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                    <div 
                      onClick={(e) => toggleFavorite(t.id, e)}
                      className="p-1 rounded-full bg-white/50 hover:bg-white transition cursor-pointer"
                    >
                      <Star className={cn("h-4 w-4 transition-colors", isFav ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-slate-400")} />
                    </div>
                  </div>

                  <div className="flex flex-col flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center shadow-sm">
                        {logoUrl ? (
                          <img src={logoUrl} alt={t.name} className="h-full w-full object-contain p-1.5" />
                        ) : (
                          <span className="text-xl font-bold text-slate-300">{(t.name.slice(0, 1) || "B").toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pr-8">
                        <div className="text-sm font-bold text-slate-900 truncate" title={t.name}>{t.name}</div>
                        <div className="text-xs font-medium text-slate-500 truncate" title={`/${t.slug}`}>/{t.slug}</div>
                      </div>
                    </div>
                    
                    <div className="mt-auto pt-2 flex items-center justify-between border-t border-slate-100/60">
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-full bg-[hsl(var(--byfrost-accent)/0.1)] px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[hsl(var(--byfrost-accent))] uppercase">
                          {t.role}
                        </div>
                        {isActive && (
                          <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-emerald-900 uppercase">
                            Atual
                          </div>
                        )}
                      </div>
                      
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full transition-all duration-300",
                        isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-200 group-hover:bg-slate-300"
                      )} />
                    </div>
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