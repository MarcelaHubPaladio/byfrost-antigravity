type ChatMessage = { role: "system" | "user"; content: string };

function seededPick(text: string, options: string[]) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % options.length;
  return options[idx];
}

async function openAIChat({
  messages,
  model,
  temperature,
}: {
  messages: ChatMessage[];
  model: string;
  temperature: number;
}): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(`OpenAI chat failed: ${res.status}`);
  }

  const text = json?.choices?.[0]?.message?.content;
  const tokensUsed = json?.usage?.total_tokens || 1000;
  if (!text || typeof text !== "string") throw new Error("OpenAI chat: invalid response");
  return { text, tokensUsed };
}

export async function generateText({
  messages,
  fallback,
}: {
  messages: ChatMessage[];
  fallback: () => string;
}): Promise<{ text: string; provider: string; tokensUsed: number }>
{
  const provider = (Deno.env.get("AI_PROVIDER") ?? "openai").toLowerCase();

  if (provider === "openai") {
    const model = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
    const temperature = Number(Deno.env.get("AI_TEMPERATURE") ?? 0.6);
    const { text, tokensUsed } = await openAIChat({ messages, model, temperature });
    return { text, provider: "openai", tokensUsed };
  }

  // Deterministic fallback: keeps product usable without keys.
  const txt = fallback();
  return { text: txt, provider: provider || "fallback", tokensUsed: 0 };
}

export function fallbackCaption({
  themeTitle,
  clientName,
  tags,
}: {
  themeTitle: string;
  clientName: string;
  tags: string[];
}) {
  const hooks = [
    `Você está cometendo estes erros em ${themeTitle}?`,
    `3 verdades que ninguém te conta sobre ${themeTitle}.`,
    `Se você quer resultado em ${themeTitle}, leia isso.`,
  ];

  const ctas = [
    "Salva pra usar depois e manda pra alguém que precisa.",
    "Comenta \"QUERO\" que eu te envio um checklist.",
    "Se isso te ajudou, comenta sua dúvida que eu respondo.",
  ];

  const hook = seededPick(`${themeTitle}:${clientName}:hook`, hooks);
  const cta = seededPick(`${themeTitle}:${clientName}:cta`, ctas);

  const hash = tags.length
    ? tags.map((t) => `#${t.replace(/\s+/g, "").replace(/^#/, "")}`).join(" ")
    : "#dicas #conteudo #marketing";

  return `${hook}\n\n✅ O que fazer hoje:\n1) Comece pelo básico.\n2) Ajuste consistência antes de volume.\n3) Acompanhe o que dá resultado por 7 dias.\n\n${cta}\n\n${hash}`;
}

export function fallbackStoryPack({
  themeTitle,
  clientName,
}: {
  themeTitle: string;
  clientName: string;
}) {
  const brand = clientName ? ` — ${clientName}` : "";

  const slides = [
    {
      slide: 1,
      headline: `Pare de perder resultado${brand}`,
      on_screen_text: `O erro #1 em ${themeTitle}`,
      notes: "Use fundo limpo + texto grande (2 linhas no máximo).",
    },
    {
      slide: 2,
      headline: "O que quase todo mundo faz",
      on_screen_text: "Foco em volume antes de clareza",
      notes: "Mostre exemplo real (print, bastidor, antes/depois).",
    },
    {
      slide: 3,
      headline: "O ajuste simples",
      on_screen_text: "Gancho → Prova → Passo a passo",
      notes: "Use setas e marcador para guiar leitura.",
    },
    {
      slide: 4,
      headline: "CTA",
      on_screen_text: "Quer o roteiro? Responde \"QUERO\"",
      notes: "Sugestão de sticker: caixa de pergunta ou enquete.",
    },
  ];

  return JSON.stringify({
    kind: "story_pack",
    theme_title: themeTitle,
    slides,
  });
}
