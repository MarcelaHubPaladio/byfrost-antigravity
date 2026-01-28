import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import panelRef from "@/assets/foto-modelo-painel.webp";

export default function Login() {
  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--byfrost-accent))]" />
              Painel Byfrost.ia
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
              Guardião do Negócio.
              <span className="block text-slate-700">IA proativa, sob governança.</span>
            </h1>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-600">
              OCR, pendências, trilha de eventos e decisões explicáveis — com isolamento estrito por tenant e
              ações críticas sempre humanas.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                onClick={signIn}
                className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                Entrar com Google
              </Button>
              <div className="text-xs text-slate-500">
                {env.SUPABASE_URL && env.SUPABASE_ANON_KEY
                  ? "Supabase configurado."
                  : "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para autenticar."}
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rounded-[28px] bg-white/60 blur-xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
              <img src={panelRef} alt="Referência de layout" className="w-full object-cover" />
              <div className="p-4">
                <div className="text-xs font-medium text-slate-700">Layout: board + cards + timeline</div>
                <div className="mt-1 text-xs text-slate-500">
                  Estilo leve, arredondado, com foco em leitura e rastreabilidade.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
