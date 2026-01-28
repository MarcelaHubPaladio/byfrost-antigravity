type EmbeddingOptions = {
  model?: string;
};

const DEFAULT_EMBEDDINGS_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

function xorshift32(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // -> [0, 1)
    return ((x >>> 0) / 0xffffffff) as number;
  };
}

function seedFromText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function openAIEmbed({
  text,
  model,
}: {
  text: string;
  model: string;
}): Promise<number[]> {
  const apiKey = Deno.env.get("AI_API_KEY") ?? "";
  if (!apiKey) throw new Error("Missing AI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(`OpenAI embeddings failed: ${res.status}`);
  }

  const emb = json?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("OpenAI embeddings: invalid response");
  return emb as number[];
}

export async function embedText(text: string, opts: EmbeddingOptions = {}) {
  const provider = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
  const model = opts.model ?? Deno.env.get("EMBEDDINGS_MODEL") ?? DEFAULT_EMBEDDINGS_MODEL;

  if (provider === "openai") {
    const emb = await openAIEmbed({ text, model });
    return emb;
  }

  // Deterministic fallback (no vendor hardcode) — useful for local/dev without keys.
  const rand = xorshift32(seedFromText(`${provider}:${model}:${text}`));
  const out = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) out[i] = (rand() - 0.5) * 0.2;
  return out;
}

export function toVectorString(vec: number[]) {
  // PostgREST vector can be inserted as a string like: "[0.1,0.2,...]"
  return `[${vec.map((n) => (Number.isFinite(n) ? n.toFixed(8) : "0")).join(",")}]`;
}
