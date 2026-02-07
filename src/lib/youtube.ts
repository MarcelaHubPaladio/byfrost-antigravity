export function extractYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Accept plain video id (most common: 11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  const isYoutube = host === "youtube.com" || host.endsWith(".youtube.com");
  if (!isYoutube) return null;

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

  // youtube.com/embed/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  const embedIdx = parts.indexOf("embed");
  if (embedIdx >= 0 && parts[embedIdx + 1]) {
    const id = parts[embedIdx + 1];
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  // youtube.com/shorts/<id>
  const shortsIdx = parts.indexOf("shorts");
  if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
    const id = parts[shortsIdx + 1];
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  return null;
}
