export type PresencePunchType = "ENTRY" | "BREAK_START" | "BREAK_END" | "EXIT";

export function titleizePunchType(t: PresencePunchType) {
  switch (t) {
    case "ENTRY":
      return "Entrada";
    case "BREAK_START":
      return "Início do intervalo";
    case "BREAK_END":
      return "Fim do intervalo";
    case "EXIT":
      return "Saída";
  }
}

export function inferNextPunchType(last: PresencePunchType | null, breakRequired: boolean): PresencePunchType | null {
  if (!last) return "ENTRY";
  if (last === "ENTRY") return breakRequired ? "BREAK_START" : "EXIT";
  if (last === "BREAK_START") return "BREAK_END";
  if (last === "BREAK_END") return "EXIT";
  return null;
}

export function formatYmdInTimeZone(timeZone: string, d = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(d);
}

export function titleizeCaseState(s: string) {
  const map: Record<string, string> = {
    AGUARDANDO_ENTRADA: "Aguardando entrada",
    EM_EXPEDIENTE: "Em expediente",
    EM_INTERVALO: "Em intervalo",
    AGUARDANDO_SAIDA: "Aguardando saída",
    PENDENTE_JUSTIFICATIVA: "Pendente justificativa",
    PENDENTE_APROVACAO: "Pendente aprovação",
    FECHADO: "Fechado",
    AJUSTADO: "Ajustado",
  };
  return map[s] ?? s;
}