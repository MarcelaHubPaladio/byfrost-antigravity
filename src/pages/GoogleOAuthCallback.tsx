import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

export default function GoogleOAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Autenticando com o Google...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      showError(`Erro na autorização do Google: ${error}`);
      navigate("/app/me");
      return;
    }

    if (!code) {
      showError("Código de autorização não encontrado.");
      navigate("/app/me");
      return;
    }

    const exchangeCode = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("google-oauth", {
          body: {
            action: "callback",
            code,
            redirect_uri: `${window.location.origin}/app/oauth/google/callback`,
          },
        });

        if (fnError) throw fnError;

        showSuccess(`Google Agenda conectado com sucesso (${data.email})!`);
      } catch (err: any) {
        showError(`Erro ao conectar: ${err.message}`);
      } finally {
        navigate("/app/me");
      }
    };

    exchangeCode();
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{status}</p>
      </div>
    </div>
  );
}
