import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";
import panelRef from "@/assets/foto-modelo-painel.webp";
import { cn } from "@/lib/utils";
import { Mail, Lock, ArrowRight } from "lucide-react";

type Mode = "signin" | "signup" | "forgot";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const origin = useMemo(() => window.location.origin, []);

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (e: any) {
      showError(`Não foi possível entrar com Google. (${e?.message ?? "erro"})`);
      setBusy(false);
    }
  };

  const signInWithPassword = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return showError("Informe um email válido.");
    if (!password) return showError("Informe sua senha.");

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      showSuccess("Bem-vindo! Carregando…");
      // App redireciona pelo Index (/)
      window.location.assign("/");
    } catch (e: any) {
      showError(`Falha no login. (${e?.message ?? "erro"})`);
    } finally {
      setBusy(false);
    }
  };

  const signUpWithPassword = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return showError("Informe um email válido.");
    if (password.length < 8) return showError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return showError("As senhas não conferem.");

    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) throw error;

      showSuccess(
        "Conta criada. Se o projeto exigir confirmação por email, verifique sua caixa de entrada."
      );
      setMode("signin");
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      showError(`Não foi possível criar sua conta. (${e?.message ?? "erro"})`);
    } finally {
      setBusy(false);
    }
  };

  const sendResetEmail = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return showError("Informe um email válido.");

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: `${origin}/auth/reset`,
      });
      if (error) throw error;

      showSuccess("Enviei um email de redefinição. Abra o link para criar uma nova senha.");
      setMode("signin");
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      showError(`Não foi possível enviar o email. (${e?.message ?? "erro"})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--byfrost-accent))]" />
              Painel Byfrost.ia
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
              Guardião do Negócio.
              <span className="block text-slate-700">Acesso por email e senha, com governança.</span>
            </h1>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-600">
              Entre com email e senha (com "esqueci minha senha") ou conecte sua conta Google.
            </p>

            <div className="mt-7 max-w-md rounded-[28px] border border-slate-200 bg-white/70 p-5 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  {mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className={cn(
                      "rounded-full px-2 py-1 font-semibold transition",
                      mode === "signin"
                        ? "bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={cn(
                      "rounded-full px-2 py-1 font-semibold transition",
                      mode === "signup"
                        ? "bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    criar
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs text-slate-700">Email</Label>
                  <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-7 border-0 bg-transparent p-0 focus-visible:ring-0"
                      placeholder="nome@empresa.com"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>
                </div>

                {mode !== "forgot" && (
                  <div>
                    <Label className="text-xs text-slate-700">Senha</Label>
                    <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <Lock className="h-4 w-4 text-slate-400" />
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-7 border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="••••••••"
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      />
                    </div>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-[hsl(var(--byfrost-accent))] hover:underline"
                        onClick={() => setMode("forgot")}
                        disabled={busy}
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                )}

                {mode === "signup" && (
                  <div>
                    <Label className="text-xs text-slate-700">Confirmar senha</Label>
                    <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <Lock className="h-4 w-4 text-slate-400" />
                      <Input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="h-7 border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Mínimo recomendado: 8 caracteres.</div>
                  </div>
                )}

                <Button
                  disabled={busy}
                  onClick={
                    mode === "signin" ? signInWithPassword : mode === "signup" ? signUpWithPassword : sendResetEmail
                  }
                  className="mt-1 h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {busy
                    ? "Processando…"
                    : mode === "signin"
                      ? "Entrar"
                      : mode === "signup"
                        ? "Criar conta"
                        : "Enviar email de reset"}
                </Button>

                <div className="flex items-center gap-3 py-1">
                  <Separator className="flex-1" />
                  <div className="text-[11px] font-semibold text-slate-500">ou</div>
                  <Separator className="flex-1" />
                </div>

                <Button
                  variant="secondary"
                  className="h-11 rounded-2xl"
                  onClick={signInWithGoogle}
                  disabled={busy}
                >
                  Entrar com Google
                </Button>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                  Depois de entrar, você poderá <span className="font-semibold">vincular</span> o Google no seu usuário.
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rounded-[28px] bg-white/60 blur-xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
              <img src={panelRef} alt="Referência de layout" className="w-full object-cover" />
              <div className="p-4">
                <div className="text-xs font-medium text-slate-700">Acesso controlado</div>
                <div className="mt-1 text-xs text-slate-500">
                  Sessões do Supabase, isolamento por tenant e trilha de auditoria.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}