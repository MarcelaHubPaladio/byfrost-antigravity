import { ReactNode, useEffect } from "react";

function isValidHex(hex: string) {
  return /^#([0-9a-fA-F]{3}){1,2}$/.test(hex);
}

function hexToRgb(hex: string) {
  if (!isValidHex(hex)) return null;
  let v = hex.replace("#", "");
  if (v.length === 3) {
    v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
  }
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHsl(rgb: { r: number; g: number; b: number }) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
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

export type PublicPalette = {
  primary?: { hex: string; text?: string } | null;
  secondary?: { hex: string; text?: string } | null;
  tertiary?: { hex: string; text?: string } | null;
  quaternary?: { hex: string; text?: string } | null;
};

export function PublicPortalShell({
  palette,
  children,
}: {
  palette: PublicPalette | null | undefined;
  children: ReactNode;
}) {
  useEffect(() => {
    const primaryHex = String(palette?.primary?.hex ?? "").trim();

    const root = document.documentElement;
    const prev = {
      tenantAccent: root.style.getPropertyValue("--tenant-accent"),
      tenantBg: root.style.getPropertyValue("--tenant-bg"),
      primary: root.style.getPropertyValue("--primary"),
      ring: root.style.getPropertyValue("--ring"),
      publicBg: root.style.getPropertyValue("--public-bg"),
      publicCardText: root.style.getPropertyValue("--public-card-text"),
    };

    // Default while loading/without palette.
    root.style.setProperty("--public-bg", "hsl(var(--byfrost-bg))");
    root.style.setProperty("--public-card-text", "#0b1220");

    if (isValidHex(primaryHex)) {
      const rgb = hexToRgb(primaryHex);
      if (rgb) {
        const { h, s, l } = rgbToHsl(rgb);

        const accent = `${h} ${Math.max(35, Math.min(95, s))}% ${Math.max(25, Math.min(60, l))}%`;
        const bg = `${h} 40% 97%`;

        // Inspired by mock: background is the primary brand color.
        root.style.setProperty("--public-bg", primaryHex);
        root.style.setProperty("--public-card-text", bestTextOnHex(primaryHex));

        // Keep byfrost/shadcn tokens coherent on this public portal.
        root.style.setProperty("--tenant-accent", accent);
        root.style.setProperty("--tenant-bg", bg);
        root.style.setProperty("--primary", accent);
        root.style.setProperty("--ring", accent);
      }
    }

    return () => {
      root.style.setProperty("--tenant-accent", prev.tenantAccent);
      root.style.setProperty("--tenant-bg", prev.tenantBg);
      root.style.setProperty("--primary", prev.primary);
      root.style.setProperty("--ring", prev.ring);
      root.style.setProperty("--public-bg", prev.publicBg);
      root.style.setProperty("--public-card-text", prev.publicCardText);
    };
  }, [palette?.primary?.hex]);

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: "var(--public-bg)" as any }}
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}