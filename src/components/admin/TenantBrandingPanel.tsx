import { useEffect, useMemo, useRef, useState } from "react";
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
const UPLOAD_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/branding-upload-logo";

type PaletteKey = "primary" | "secondary" | "tertiary" | "quaternary";

function publicUrl(bucket: string, path: string) {
  try {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function paletteErrorHint(message: string) {
  if (message.includes("Missing GOOGLE_VISION_API_KEY")) {
    return "Verifique o secret GOOGLE_VISION_API_KEY nas Edge Functions.";
  }
  if (
    message.toLowerCase().includes("api key not valid") ||
    message.toLowerCase().includes("api_key_invalid")
  ) {
    return "A chave do Google Vision está inválida (ou com restrições/billing). Gere uma nova chave e habilite a Vision API.";
  }
  return null;
}

function isValidHex(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex: string) {
  if (!isValidHex(hex)) return null;
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return { r, g, b };
}

function bestTextOnHex(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#0b1220";

  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const L = 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
  return L > 0.6 ? "#0b1220" : "#fffdf5";
}

function ColorRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_140px] items-end gap-3">
      <div>
        <Label className="text-xs">{label}</Label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`${label} (color picker)`}
          />
          <Input
            value={value}
            onChange={(e) => {
              const raw = e.target.value.trim();
              // Keep it permissive while typing; only apply when it becomes a valid hex.
              if (raw === "" || raw === "#") return;
              const next = raw.startsWith("#") ? raw : `#${raw}`;
              if (isValidHex(next)) onChange(next);
            }}
            disabled={disabled}
            className="h-10 rounded-2xl font-mono text-xs"
            placeholder="#RRGGBB"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div
          className="h-8 w-full rounded-xl border border-slate-200"
          style={{ background: value }}
        />
        <div className="mt-1 text-[11px] text-slate-500">texto: {bestTextOnHex(value)}</div>
      </div>
    </div>
  );
}

export function TenantBrandingPanel() {
  const qc = useQueryClient();
  const { activeTenantId, refresh } = useTenant();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [savingPalette, setSavingPalette] = useState(false);
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

  const [draft, setDraft] = useState<Record<PaletteKey, string>>({
    primary: "#7c3aed",
    secondary: "#0ea5e9",
    tertiary: "#22c55e",
    quaternary: "#f97316",
  });

  useEffect(() => {
    const next: Record<PaletteKey, string> = {
      primary: (palette?.primary?.hex as string | undefined) ?? "#7c3aed",
      secondary: (palette?.secondary?.hex as string | undefined) ?? "#0ea5e9",
      tertiary: (palette?.tertiary?.hex as string | undefined) ?? "#22c55e",
      quaternary: (palette?.quaternary?.hex as string | undefined) ?? "#f97316",
    };
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantQ.data?.id]);

  const setDraftColor = (key: PaletteKey, hex: string) => {
    if (!isValidHex(hex)) return;
    setDraft((d) => ({ ...d, [key]: hex.toLowerCase() }));
  };

  const uploadLogo = async () => {
    if (!activeTenantId) return;

    const f = fileRef.current?.files?.[0];
    if (!f) {
      showError("Selecione um arquivo.");
      return;
    }

    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(f);

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          filename: f.name,
          contentType: f.type || "image/png",
          fileBase64,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      showSuccess("Logo atualizado. Agora extraia a paleta.");
      await qc.invalidateQueries({ queryKey: ["tenant_branding", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await refresh();
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
      await refresh();
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      const hint = paletteErrorHint(msg);
      showError(`Falha ao extrair paleta: ${msg}${hint ? `\n${hint}` : ""}`);
    } finally {
      setExtracting(false);
    }
  };

  const savePalette = async () => {
    if (!activeTenantId) return;
    if (!Object.values(draft).every(isValidHex)) {
      showError("Use cores no formato #RRGGBB.");
      return;
    }

    setSavingPalette(true);
    try {
      const current = tenantQ.data?.branding_json ?? {};

      const nextPalette = {
        primary: { hex: draft.primary, text: bestTextOnHex(draft.primary) },
        secondary: { hex: draft.secondary, text: bestTextOnHex(draft.secondary) },
        tertiary: { hex: draft.tertiary, text: bestTextOnHex(draft.tertiary) },
        quaternary: { hex: draft.quaternary, text: bestTextOnHex(draft.quaternary) },
        source: "manual",
      };

      const next = { ...current, palette: nextPalette };

      const { error } = await supabase
        .from("tenants")
        .update({ branding_json: next })
        .eq("id", activeTenantId);

      if (error) throw error;

      showSuccess("Cores do tenant atualizadas.");
      await qc.invalidateQueries({ queryKey: ["tenant_branding", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await refresh();
    } catch (e: any) {
      showError(
        `Não foi possível salvar a paleta (RLS). Verifique se seu token tem claim de super-admin. (${e?.message ?? "erro"})`
      );
    } finally {
      setSavingPalette(false);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar branding.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Logo do tenant</div>
        <div className="mt-1 text-xs text-slate-500">
          Upload via Edge Function (bypass do Storage RLS) e gravação em{" "}
          <span className="font-medium">tenants.branding_json.logo</span>.
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
              Armazenamento: bucket <span className="font-medium">{BUCKET}</span>.
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
              Extração via Edge Function <span className="font-medium">branding-extract-palette</span> ou edição manual.
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

          <div className="mt-3 grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-800">Editar cores</div>
              <div className="mt-3 grid gap-3">
                <ColorRow
                  label="Primária (accent)"
                  value={draft.primary}
                  onChange={(v) => setDraftColor("primary", v)}
                  disabled={savingPalette}
                />
                <ColorRow
                  label="Secundária"
                  value={draft.secondary}
                  onChange={(v) => setDraftColor("secondary", v)}
                  disabled={savingPalette}
                />
                <ColorRow
                  label="Terciária"
                  value={draft.tertiary}
                  onChange={(v) => setDraftColor("tertiary", v)}
                  disabled={savingPalette}
                />
                <ColorRow
                  label="Quaternária"
                  value={draft.quaternary}
                  onChange={(v) => setDraftColor("quaternary", v)}
                  disabled={savingPalette}
                />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={() => {
                    const next: Record<PaletteKey, string> = {
                      primary: (palette?.primary?.hex as string | undefined) ?? "#7c3aed",
                      secondary: (palette?.secondary?.hex as string | undefined) ?? "#0ea5e9",
                      tertiary: (palette?.tertiary?.hex as string | undefined) ?? "#22c55e",
                      quaternary: (palette?.quaternary?.hex as string | undefined) ?? "#f97316",
                    };
                    setDraft(next);
                  }}
                  disabled={savingPalette}
                >
                  Reverter
                </Button>
                <Button
                  onClick={savePalette}
                  disabled={savingPalette}
                  className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                >
                  {savingPalette ? "Salvando…" : "Salvar paleta"}
                </Button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-800">Atual no banco</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(palette?.primary?.hex ||
                palette?.secondary?.hex ||
                palette?.tertiary?.hex ||
                palette?.quaternary?.hex
                  ? [palette?.primary, palette?.secondary, palette?.tertiary, palette?.quaternary]
                  : [])
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
                    Sem paleta ainda. Suba um logo e clique em "Extrair paleta".
                  </div>
                )}
              </div>

              <pre className="mt-4 max-h-[220px] overflow-auto rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-700">
                {JSON.stringify(tenantQ.data?.branding_json ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}