import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";

function fmtTs(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function parseHashParams() {
  const h = window.location.hash?.replace(/^#/, "") ?? "";
  const sp = new URLSearchParams(h);
  const obj: Record<string, string> = {};
  sp.forEach((v, k) => (obj[k] = v));
  return obj;
}

export default function AuthCallback() {
  const nav = useNavigate();
  const { user, loading: sessionLoading, refresh } = useSession();
  const { activeTenantId, tenants, loading: tenantsLoading, membershipHint } = useTenant();
  const [checking, setChecking] = useState(true);

  const nowInfo = useMemo(() => {
    const now = Date.now();
    return {
      now,
      iso: new Date(now).toISOString(),
      local: fmtTs(now),
    };
  }, []);

  const urlInfo = useMemo(() => {
    const u = new URL(window.location.href);
    const hs = parseHashParams();
    const type = u.searchParams.get("type") || hs.type || "";
    const code = u.searchParams.get("code");
    return { type, code, hasAccessToken: Boolean(hs.access_token) };
  }, []);

  useEffect(() => {
    // If this is a password recovery callback, route to reset page.
    if (String(urlInfo.type).toLowerCase() === "recovery") {
      nav("/auth/reset" + window.location.search + window.location.hash, { replace: true });
      return;
    }

    // Force a session read after returning from Supabase verify link.
    let mounted = true;
    (async () => {
      try {
        // Support PKCE-style redirects
        if (urlInfo.code) {
          await supabase.auth.exchangeCodeForSession(urlInfo.code).catch(() => null);
        }

        await refresh();
        await supabase.auth.getSession();
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refresh, nav, urlInfo.type, urlInfo.code]);

  useEffect(() => {
    if (checking || sessionLoading || tenantsLoading) return;

    if (user) {
      if (activeTenantId) nav("/app", { replace: true });
      else if (tenants.length === 1) nav("/app", { replace: true });
      else nav("/tenants", { replace: true });
      return;
    }

    nav("/login", { replace: true });
  }, [checking, sessionLoading, tenantsLoading, user, activeTenantId, tenants.length, nav]);

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
        <div className="rounded-[28px] border border-slate-200 bg-white/70 p-5 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold text-slate-900">Conectando…</div>
          <div className="mt-1 text-sm text-slate-600">
            Finalizando autenticação e preparando seu acesso ao tenant.
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-800">Diagnóstico rápido</div>
            <div className="mt-1">
              Hora do dispositivo (local): <span className="font-medium text-slate-900">{nowInfo.local}</span>
            </div>
            <div>
              Hora do dispositivo (ISO): <span className="font-medium text-slate-900">{nowInfo.iso}</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Se você ver no console algo como "Session … was issued in the future", normalmente é relógio do dispositivo fora de sincronia.
            </div>
          </div>

          {!checking && !sessionLoading && !user && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Não consegui criar uma sessão. Se você abriu um link de convite, verifique:
              <ul className="mt-2 list-disc pl-5 text-sm">
                <li>Data/hora automáticas no dispositivo (evita "clock skew").</li>
                <li>O link foi aberto em aba anônima ou após sair do app.</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => window.location.reload()}>
                  Recarregar
                </Button>
                <Button
                  className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                  onClick={() => nav("/login", { replace: true })}
                >
                  Ir para login
                </Button>
              </div>
            </div>
          )}

          {!checking && user && tenants.length === 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Você entrou, mas ainda não há tenant acessível para este usuário.
              <div className="mt-2 text-xs text-amber-900">
                {membershipHint.type === "soft_deleted"
                  ? "Seu vínculo está desativado (users_profile.deleted_at)."
                  : membershipHint.type === "error"
                    ? `Erro ao consultar vínculo: ${membershipHint.message}`
                    : "Sem vínculo em users_profile."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}