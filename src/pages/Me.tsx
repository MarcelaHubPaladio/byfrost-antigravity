import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";

function ThemeCard({
  selected,
  title,
  description,
  preview,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  preview: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full overflow-hidden rounded-[22px] border text-left transition",
        selected
          ? "border-[hsl(var(--byfrost-accent)/0.55)] bg-[hsl(var(--byfrost-accent)/0.08)]"
          : "border-slate-200 bg-white hover:border-slate-300",
        "dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-950/55"
      )}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</div>
        </div>
        <div className="shrink-0">{preview}</div>
      </div>
    </button>
  );
}

function getUserDisplayName(user: any) {
  const md = user?.user_metadata ?? {};
  const full = (md.full_name as string | undefined) ?? null;
  const first = (md.first_name as string | undefined) ?? null;
  const last = (md.last_name as string | undefined) ?? null;
  const composed = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (composed) return composed;
  const email = (user?.email as string | undefined) ?? "";
  return email ? email.split("@")[0] : "Usuário";
}

export default function Me() {
  const { user } = useSession();
  const { prefs, setMode, setCustom, isLoading } = useTheme();
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);

  const userName = getUserDisplayName(user);
  const userEmail = user?.email ?? "";

  const identities = useMemo(() => {
    const ids = ((user as any)?.identities ?? []) as any[];
    return ids
      .map((i) => ({ provider: String(i.provider ?? ""), created_at: i.created_at }))
      .filter((i) => Boolean(i.provider));
  }, [user]);

  const linkGoogle = async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      } as any);

      if (error) throw error;
      // In browser, supabase-js usually redirects automatically. If not:
      if ((data as any)?.url) window.location.assign((data as any).url);
    } catch (e: any) {
      showError(
        `Não foi possível vincular Google. (${e?.message ?? "erro"}) Verifique se "Manual linking" está habilitado no Auth do Supabase.`
      );
      setLinking(false);
    }
  };

  const applyMode = async (mode: "byfrost" | "dark" | "custom") => {
    setBusy(true);
    try {
      await setMode(mode);
      showSuccess("Tema atualizado.");
    } catch (e: any) {
      showError(`Não foi possível salvar seu tema. (${e?.message ?? "erro"})`);
    } finally {
      setBusy(false);
    }
  };

  const saveCustom = async (patch: { accentHex?: string; bgHex?: string }) => {
    setBusy(true);
    try {
      await setCustom({
        accentHex: patch.accentHex ?? prefs.custom.accentHex,
        bgHex: patch.bgHex ?? prefs.custom.bgHex,
      });
      showSuccess("Tema customizado salvo.");
    } catch (e: any) {
      showError(`Não foi possível salvar seu tema. (${e?.message ?? "erro"})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4">
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Meu usuário
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Preferências pessoais (sincronizadas no banco).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="rounded-full border border-slate-200 bg-white/70 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
                >
                  {isLoading ? "carregando…" : prefs.mode}
                </Badge>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Identidade</div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--byfrost-accent))]">
                    <Link2 className="h-3.5 w-3.5" />
                    contas
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  <div>
                    <Label className="text-xs text-slate-700 dark:text-slate-200">Nome</Label>
                    <Input
                      value={userName}
                      readOnly
                      className="mt-1 h-11 rounded-2xl border-slate-200 bg-white text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-700 dark:text-slate-200">Email</Label>
                    <Input
                      value={userEmail}
                      readOnly
                      className="mt-1 h-11 rounded-2xl border-slate-200 bg-white font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      Provedores conectados
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {identities.length ? (
                        identities.map((i) => (
                          <Badge
                            key={i.provider}
                            className="rounded-full border-0 bg-white text-slate-700 hover:bg-white dark:bg-slate-950/40 dark:text-slate-200"
                          >
                            {i.provider}
                          </Badge>
                        ))
                      ) : (
                        <div className="text-xs text-slate-600 dark:text-slate-400">(apenas email/senha)</div>
                      )}
                    </div>
                    <Button
                      onClick={linkGoogle}
                      disabled={linking}
                      variant="secondary"
                      className="mt-3 h-10 rounded-2xl"
                    >
                      {linking ? "Redirecionando…" : "Vincular Google"}
                    </Button>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Requer Google provider habilitado e "Manual linking" ativo no Supabase Auth.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tema</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Byfrost (padrão), Dark (classe .dark) ou Custom (accent + background).
                </div>

                <div className="mt-3 grid gap-3">
                  <ThemeCard
                    selected={prefs.mode === "byfrost"}
                    title="Byfrost"
                    description="Tema padrão do produto (paleta do tenant + layout claro)."
                    onClick={() => applyMode("byfrost")}
                    preview={
                      <div className="grid w-[108px] gap-1">
                        <div className="h-9 rounded-xl border border-slate-200 bg-[hsl(var(--byfrost-bg))]" />
                        <div className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                      </div>
                    }
                  />

                  <ThemeCard
                    selected={prefs.mode === "dark"}
                    title="Dark"
                    description="Ativa dark mode. Mantém o accent do tenant."
                    onClick={() => applyMode("dark")}
                    preview={
                      <div className="grid w-[108px] gap-1">
                        <div className="h-9 rounded-xl border border-slate-800 bg-slate-950" />
                        <div className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                      </div>
                    }
                  />

                  <ThemeCard
                    selected={prefs.mode === "custom"}
                    title="Custom"
                    description="Você escolhe o accent e o background."
                    onClick={() => applyMode("custom")}
                    preview={
                      <div className="grid w-[108px] gap-1">
                        <div className="h-9 rounded-xl border border-slate-200 bg-[hsl(var(--byfrost-bg))]" />
                        <div className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                      </div>
                    }
                  />
                </div>

                {prefs.mode === "custom" && (
                  <div className="mt-4 grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <div>
                      <Label className="text-xs text-slate-700 dark:text-slate-200">Cor principal (accent)</Label>
                      <div className="mt-2 flex items-center gap-3">
                        <Input
                          type="color"
                          value={prefs.custom.accentHex ?? "#6D28D9"}
                          onChange={(e) => saveCustom({ accentHex: e.target.value })}
                          disabled={busy}
                          className="h-12 w-16 cursor-pointer rounded-2xl border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
                        />
                        <Input
                          value={prefs.custom.accentHex ?? "#6D28D9"}
                          onChange={(e) => saveCustom({ accentHex: e.target.value })}
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200 bg-white font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="#6D28D9"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-slate-700 dark:text-slate-200">Background</Label>
                      <div className="mt-2 flex items-center gap-3">
                        <Input
                          type="color"
                          value={prefs.custom.bgHex ?? "#F7F7FF"}
                          onChange={(e) => saveCustom({ bgHex: e.target.value })}
                          disabled={busy}
                          className="h-12 w-16 cursor-pointer rounded-2xl border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
                        />
                        <Input
                          value={prefs.custom.bgHex ?? "#F7F7FF"}
                          onChange={(e) => saveCustom({ bgHex: e.target.value })}
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200 bg-white font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="#F7F7FF"
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Mantemos o fundo claro para legibilidade.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}