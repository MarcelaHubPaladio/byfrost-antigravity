import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/utils/toast";

const BUCKET = "tenant-assets";
const BRANDING_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/branding-extract-palette";

function publicUrl(bucket: string, path: string) {
  try {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export function TenantBrandingPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const tenantQ = useQuery({
    queryKey: ["tenant_branding", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,branding_json")
        .eq("id", activeTenantId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Tenant não encontrado");
      return data as any;
    },
  });

  const logoInfo = useMemo(() => {
    const bj = tenantQ.data?.branding_json ?? {};
    return (bj.logo ?? null) as
      | { bucket: string; path: string; updated_at?: string }
      | null;
  }, [tenantQ.data]);

  const logoUrl = useMemo(() => {
    if (!logoInfo?.bucket || !logoInfo?.path) return null;
    return publicUrl(logoInfo.bucket, logoInfo.path);
  }, [logoInfo]);

  const palette = useMemo(() => {
    const bj = tenantQ.data?.branding_json ?? {};
    return bj.palette ?? null;
  }, [tenantQ.data]);

  const uploadLogo = async () => {
    if (!activeTenantId) return;

    const f = fileRef.current?.files?.[0];
    if (!f) {
      showError("Selecione um arquivo.");
      return;
    }

    setUploading(true);
    try {
      const ext = f.name.split(".").pop()?.toLowerCase() || "png";
      const path = `tenants/${activeTenantId}/logo.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, f, { upsert: true, contentType: f.type });

      if (upErr) {
        showError(
          `Falha ao subir logo. Verifique se existe o bucket '${BUCKET}' no Supabase Storage e se está público. (${upErr.message})`
        );
        return;
      }

      const current = tenantQ.data?.branding_json ?? {};
      const next = {
        ...current,
        logo: { bucket: BUCKET, path, updated_at: new Date().toISOString() },
      };

      const { error: tErr } = await supabase
        .from("tenants")
        .update({ branding_json: next })
        .eq("id", activeTenantId);
      if (tErr) throw tErr;

      showSuccess("Logo atualizado. Agora extraia a paleta.");
      await qc.invalidateQueries({ queryKey: ["tenant_branding", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenants"] });
    } catch (e: any) {
      showError(`Erro ao atualizar logo: ${e?.message ?? "erro"}`);
    } finally {
      setUploading(false);
    }
  };

  const extractPalette = async () => {
    if (!activeTenantId) return;
    if (!logoInfo?.bucket || !logoInfo?.path) {
      showError("Suba um logo antes.");
      return;
    }

    setExtracting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(BRANDING_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          bucket: logoInfo.bucket,
          path: logoInfo.path,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      showSuccess("Paleta extraída e aplicada ao tenant.");
      await qc.invalidateQueries({ queryKey: ["tenant_branding", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["cases", activeTenantId] });
      // refresh tenant list cache for header branding
      await qc.invalidateQueries({ queryKey: ["admin_tenants"] });
    } catch (e: any) {
      showError(
        `Falha ao extrair paleta. Verifique GOOGLE_VISION_API_KEY nos Secrets das Edge Functions. (${e?.message ?? "erro"})`
      );
    } finally {
      setExtracting(false);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão “Trocar”) para configurar branding.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Logo do tenant</div>
        <div className="mt-1 text-xs text-slate-500">
          Upload no Storage e gravação em <span className="font-medium">tenants.branding_json.logo</span>.
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <Label className="text-xs">Arquivo</Label>
            <Input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="mt-1 rounded-2xl file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
            />
            <div className="mt-1 text-[11px] text-slate-500">
              Bucket usado: <span className="font-medium">{BUCKET}</span> (crie no Supabase Storage e deixe público).
            </div>
          </div>

          <Button
            onClick={uploadLogo}
            disabled={uploading}
            className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          >
            {uploading ? "Enviando…" : "Enviar logo"}
          </Button>

          {logoUrl && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <div className="px-3 py-2 text-[11px] font-medium text-slate-700">
                Preview
              </div>
              <div className="p-3">
                <img
                  src={logoUrl}
                  alt="Logo do tenant"
                  className="h-16 w-auto max-w-full rounded-xl bg-white p-2 shadow-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Paleta</div>
            <div className="mt-1 text-xs text-slate-500">
              Extração via Edge Function <span className="font-medium">branding-extract-palette</span>.
            </div>
          </div>
          <Button
            onClick={extractPalette}
            disabled={extracting}
            variant="secondary"
            className="h-10 rounded-2xl"
          >
            {extracting ? "Extraindo…" : "Extrair paleta"}
          </Button>
        </div>

        <div className="mt-4">
          <div className="text-xs font-medium text-slate-700">
            Tenant: {tenantQ.data?.name ?? "—"}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {(palette?.primary?.hex || palette?.secondary?.hex || palette?.tertiary?.hex || palette?.quaternary?.hex
              ? [palette?.primary, palette?.secondary, palette?.tertiary, palette?.quaternary]
              : []
            )
              .filter(Boolean)
              .map((c: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div
                    className="h-12 w-full rounded-xl border border-slate-200"
                    style={{ background: c.hex }}
                  />
                  <div className="mt-2 text-[11px] font-semibold text-slate-700">
                    {c.hex}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    texto sugerido: {c.text}
                  </div>
                </div>
              ))}

            {!palette && (
              <div className="col-span-2 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                Sem paleta ainda. Suba um logo e clique em “Extrair paleta”.
              </div>
            )}
          </div>

          <pre className="mt-4 max-h-[220px] overflow-auto rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-700">
            {JSON.stringify(tenantQ.data?.branding_json ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
