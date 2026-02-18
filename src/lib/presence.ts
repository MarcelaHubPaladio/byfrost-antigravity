import {
  type PresencePunchType,
  inferNextPunchType,
  getLocalYmd as formatYmdInTimeZone,
} from "./presence-logic";

export type { PresencePunchType };
export { inferNextPunchType, formatYmdInTimeZone };

export function titleizePunchType(t: PresencePunchType) {
  switch (t) {
    case "ENTRY":
      return "Entrada";
    case "BREAK_START":
      return "Início do intervalo";
    case "BREAK_END":
      return "Fim do intervalo";
    case "BREAK2_START":
      return "Início do intervalo extra";
    case "BREAK2_END":
      return "Fim do intervalo extra";
    case "EXIT":
      return "Saída";
  }
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