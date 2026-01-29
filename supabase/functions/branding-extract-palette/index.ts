import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";

function toHex(n: number) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function luminance(r: number, g: number, b: number) {
  // relative luminance (sRGB)
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function bestTextOn(r: number, g: number, b: number) {
  const L = luminance(r, g, b);
  // prefer deep slate instead of pure black
  return L > 0.6 ? "#0b1220" : "#fffdf5";
}

async function getImageBase64(input: {
  logoUrl?: string;
  bucket?: string;
  path?: string;
}) {
  if (input.logoUrl) return await fetchAsBase64(input.logoUrl);

  if (input.bucket && input.path) {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(input.bucket)
      .createSignedUrl(input.path, 60);
    if (error || !data?.signedUrl) throw new Error("Failed to sign logo URL");
    return await fetchAsBase64(data.signedUrl);
  }

  throw new Error("Provide logoUrl or (bucket + path)");
}

function extractVisionError(json: any): string | null {
  // top-level error
  const top = json?.error?.message;
  if (typeof top === "string" && top.trim()) return top;

  // per-request error
  const perReq = json?.responses?.[0]?.error?.message;
  if (typeof perReq === "string" && perReq.trim()) return perReq;

  return null;
}

serve(async (req) => {
  const fn = "branding-extract-palette";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
    if (!apiKey) {
      console.warn(`[${fn}] Missing GOOGLE_VISION_API_KEY`);
      return new Response(JSON.stringify({ ok: false, error: "Missing GOOGLE_VISION_API_KEY" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await getImageBase64({
      logoUrl: body.logoUrl,
      bucket: body.bucket,
      path: body.path,
    });

    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;

    const visionReq = {
      requests: [
        {
          image: { content },
          features: [{ type: "IMAGE_PROPERTIES" }],
        },
      ],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionReq),
    });

    const json = await res.json().catch(() => null);

    const visionErr = extractVisionError(json);
    if (!res.ok || !json || visionErr) {
      console.error(`[${fn}] Vision API error`, {
        upstreamStatus: res.status,
        visionErr,
        json,
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: visionErr ? `Google Vision: ${visionErr}` : "Google Vision request failed",
          upstreamStatus: res.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const colors =
      json?.responses?.[0]?.imagePropertiesAnnotation?.dominantColors?.colors ?? [];

    const top = (colors as any[])
      .map((c) => ({
        r: Number(c?.color?.red ?? 0),
        g: Number(c?.color?.green ?? 0),
        b: Number(c?.color?.blue ?? 0),
        score: Number(c?.score ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    if (!top.length) {
      return new Response(JSON.stringify({ ok: false, error: "No dominant colors found" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const palette = {
      primary: { hex: rgbToHex(top[0].r, top[0].g, top[0].b), text: bestTextOn(top[0].r, top[0].g, top[0].b) },
      secondary: top[1]
        ? { hex: rgbToHex(top[1].r, top[1].g, top[1].b), text: bestTextOn(top[1].r, top[1].g, top[1].b) }
        : null,
      tertiary: top[2]
        ? { hex: rgbToHex(top[2].r, top[2].g, top[2].b), text: bestTextOn(top[2].r, top[2].g, top[2].b) }
        : null,
      quaternary: top[3]
        ? { hex: rgbToHex(top[3].r, top[3].g, top[3].b), text: bestTextOn(top[3].r, top[3].g, top[3].b) }
        : null,
      source: "google_vision:image_properties",
    };

    const supabase = createSupabaseAdmin();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, branding_json")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) {
      console.error(`[${fn}] Tenant not found`, { tErr });
      return new Response(JSON.stringify({ ok: false, error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextBranding = {
      ...(tenant.branding_json ?? {}),
      palette,
    };

    const { error: uErr } = await supabase
      .from("tenants")
      .update({ branding_json: nextBranding })
      .eq("id", tenantId);

    if (uErr) {
      console.error(`[${fn}] Failed to update tenant branding`, { uErr });
      return new Response(JSON.stringify({ ok: false, error: "Failed to update branding" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: { kind: "branding_palette_extracted", palette },
    });

    return new Response(JSON.stringify({ ok: true, tenantId, palette }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[branding-extract-palette] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});