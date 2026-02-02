import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

function parseHashParams() {
  const h = window.location.hash?.replace(/^#/, "") ?? "";
  const sp = new URLSearchParams(h);
  const obj: Record<string, string> = {};
  sp.forEach((v, k) => (obj[k] = v));
  return obj;
}

export default function ResetPassword() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const urlInfo = useMemo(() => {
    const u = new URL(window.location.href);
    const qs = Object.fromEntries(u.searchParams.entries());
    const hs = parseHashParams();
    return {
      code: u.searchParams.get("code"),
      type: qs.type ?? hs.type ?? "",
      hasAccessToken: Boolean(hs.access_token),
      qs,
      hs,
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Support PKCE-style links (code=...)
        if (urlInfo.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(urlInfo.code);
          if (error) throw error;
        }

        // For implicit flow, supabase-js will pick up the hash when detectSessionInUrl=true.
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setHasSession(Boolean(data.session));
      } catch (e: any) {
        showError(`Não consegui validar o link de recuperação. (${e?.message ?? "erro"})`);
        setHasSession(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [urlInfo.code]);

  const save = async () => {
    const p = password.trim();
    if (p.length < 8) {
      showError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (p !== confirm.trim()) {
      showError("As senhas não conferem.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;
      showSuccess("Senha atualizada. Você já pode entrar.");
      nav("/", { replace: true });
    } catch (e: any) {
      showError(`Não foi possível atualizar a senha. (${e?.message ?? "erro"})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-[28px] border border-slate-200 bg-white/70 p-5 shadow-sm backdrop-blur">
          <div className="text-xl font-semibold tracking-tight text-slate-900">Redefinir senha</div>
          <div className="mt-1 text-sm text-slate-600">
            Crie uma nova senha para sua conta.
          </div>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Validando link…
            </div>
          ) : !hasSession ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Não encontrei uma sessão válida para redefinir sua senha.
              <div className="mt-2 text-xs text-amber-900/90">
                Abra novamente o link do email (ele expira) e verifique data/hora automáticas no dispositivo.
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => nav("/login", { replace: true })}>
                  Voltar ao login
                </Button>
              </div>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-white/70 p-3 text-[11px] text-slate-700">
                <div className="font-semibold text-slate-800">Info (debug)</div>
                <pre className="mt-1 max-h-[220px] overflow-auto rounded-xl bg-slate-50 p-2 text-[11px]">
                  {JSON.stringify(
                    {
                      type: urlInfo.type,
                      hasAccessToken: urlInfo.hasAccessToken,
                      hasCode: Boolean(urlInfo.code),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              <div>
                <Label className="text-xs text-slate-700">Nova senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn("mt-1 h-11 rounded-2xl bg-white")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-700">Confirmar senha</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={cn("mt-1 h-11 rounded-2xl bg-white")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <Button
                onClick={save}
                disabled={saving}
                className="mt-2 h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                {saving ? "Salvando…" : "Salvar nova senha"}
              </Button>

              <Button
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={() => nav("/login", { replace: true })}
              >
                Voltar ao login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
