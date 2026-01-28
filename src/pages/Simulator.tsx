import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SIM_URL = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/simulator-whatsapp";

export default function Simulator() {
  const { activeTenantId } = useTenant();
  const [type, setType] = useState<"image" | "text" | "location">("image");
  const [from, setFrom] = useState("+5511999999999");
  const [to, setTo] = useState("+5511888888888");
  const [mediaUrl, setMediaUrl] = useState("");
  const [text, setText] = useState("Última folha");
  const [lat, setLat] = useState("-23.55052");
  const [lng, setLng] = useState("-46.633308");
  const [instanceId, setInstanceId] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const canRun = Boolean(activeTenantId);

  const run = async () => {
    if (!activeTenantId) return;
    setLoading(true);
    try {
      // auto-pick first instance if not provided
      let instId = instanceId;
      if (!instId) {
        const { data: inst } = await supabase
          .from("wa_instances")
          .select("id")
          .eq("tenant_id", activeTenantId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        instId = inst?.id ?? "";
      }

      if (!instId) throw new Error("Crie ao menos uma wa_instance para o tenant.");

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const payload: any = {
        tenantId: activeTenantId,
        instanceId: instId,
        type,
        from,
        to,
      };
      if (type === "image") payload.mediaUrl = mediaUrl;
      if (type === "text") payload.text = text;
      if (type === "location") payload.location = { lat: Number(lat), lng: Number(lng) };

      const res = await fetch(SIM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      setResult({ status: res.status, json });
    } catch (e) {
      setResult({ status: "error", json: { error: String(e) } });
    } finally {
      setLoading(false);
    }
  };

  const outbox = useMemo(() => result?.json?.outbox ?? [], [result]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Simulador de WhatsApp</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dispare payloads fake e veja a outbox planejada + logs gravados (sem gastar Z-API).
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-[hsl(var(--byfrost-accent)/0.45)] outline-none"
                >
                  <option value="image">Imagem (pedido)</option>
                  <option value="location">Localização</option>
                  <option value="text">Texto</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">From (vendedor)</Label>
                  <Input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-2xl" />
                </div>
                <div>
                  <Label className="text-xs">To (número do tenant)</Label>
                  <Input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-2xl" />
                </div>
              </div>

              <div>
                <Label className="text-xs">wa_instance.id (opcional)</Label>
                <Input
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="Se vazio, pega a primeira instância do tenant"
                  className="mt-1 rounded-2xl"
                />
              </div>

              {type === "image" && (
                <div>
                  <Label className="text-xs">mediaUrl (URL da imagem do pedido)</Label>
                  <Input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1 rounded-2xl"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    Dica: use uma URL pública. Se GOOGLE_VISION_API_KEY estiver configurada, o simulador tenta OCR.
                  </div>
                </div>
              )}

              {type === "text" && (
                <div>
                  <Label className="text-xs">Texto</Label>
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} className="mt-1 rounded-2xl" />
                </div>
              )}

              {type === "location" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Latitude</Label>
                    <Input value={lat} onChange={(e) => setLat(e.target.value)} className="mt-1 rounded-2xl" />
                  </div>
                  <div>
                    <Label className="text-xs">Longitude</Label>
                    <Input value={lng} onChange={(e) => setLng(e.target.value)} className="mt-1 rounded-2xl" />
                  </div>
                </div>
              )}

              <Button
                disabled={!canRun || loading}
                onClick={run}
                className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                {loading ? "Executando…" : "Simular inbound"}
              </Button>

              {!activeTenantId && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Selecione um tenant antes (menu “Trocar”).
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur">
            <h3 className="text-sm font-semibold text-slate-900">Resultado</h3>
            <div className="mt-2 text-xs text-slate-600">Status: {String(result?.status ?? "—")}</div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-700">JSON</div>
                <pre className="mt-1 max-h-[320px] overflow-auto text-[11px] text-slate-600">
                  {JSON.stringify(result?.json ?? {}, null, 2)}
                </pre>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-700">Outbox preview</div>
                <div className="mt-2 space-y-2">
                  {(outbox ?? []).length === 0 && (
                    <div className="text-[11px] text-slate-500">Nenhuma mensagem preparada.</div>
                  )}
                  {(outbox ?? []).map((m: any) => (
                    <div key={m.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[11px] text-slate-500">to: {m.to_phone}</div>
                      <div className="mt-1 text-xs font-medium text-slate-900">{m.body_text ?? "(sem texto)"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
