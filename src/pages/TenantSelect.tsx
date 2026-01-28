import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";

export default function TenantSelect() {
  const nav = useNavigate();
  const { tenants, activeTenantId, setActiveTenantId, loading } = useTenant();

  useEffect(() => {
    if (!loading && tenants.length === 1) nav("/app", { replace: true });
    if (!loading && activeTenantId) nav("/app", { replace: true });
  }, [loading, tenants.length, activeTenantId, nav]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Selecione o tenant</h1>
          <p className="mt-1 text-sm text-slate-600">
            Você tem acesso a mais de um ambiente. Escolha onde deseja operar.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {tenants.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTenantId(t.id);
                  nav("/app", { replace: true });
                }}
                className="group rounded-3xl border border-slate-200 bg-white/70 p-4 text-left shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                    <div className="mt-1 text-xs text-slate-500">/{t.slug}</div>
                  </div>
                  <div className="rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--byfrost-accent))]">
                    {t.role}
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  Painel com trilha completa: mensagens → OCR → validação → pendências → aprovação.
                </div>
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-1/3 rounded-full bg-[hsl(var(--byfrost-accent))] transition group-hover:w-2/3" />
                </div>
              </button>
            ))}
          </div>

          {!loading && tenants.length === 0 && (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Seu usuário ainda não tem vínculo com nenhum tenant (users_profile). Peça ao super-admin para
              vincular.
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
