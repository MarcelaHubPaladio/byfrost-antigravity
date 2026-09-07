export type M30MacroState = {
  key: string;
  label: string;
  defaultInternalState: string;
};

export const M30_MACRO_STATES: M30MacroState[] = [
  { key: "backlog", label: "BACKLOG", defaultInternalState: "backlog" },
  { key: "planejado", label: "PLANEJADO", defaultInternalState: "planejamento" },
  { key: "producao", label: "PRODUÇÃO", defaultInternalState: "gravacao" },
  { key: "aprovacao", label: "APROVAÇÃO", defaultInternalState: "aprovacao" },
  { key: "publicacao", label: "PUBLICAÇÃO", defaultInternalState: "postar" },
  { key: "concluido", label: "CONCLUÍDO", defaultInternalState: "concluido" },
];

export function getMacroStateKey(internalState: string | null | undefined): string {
  if (!internalState) return "backlog";
  
  const st = internalState.toLowerCase();

  if (st.includes("backlog")) return "backlog";
  
  if (st.includes("boas_vindas") || st.includes("boas-vindas") || st.includes("planejamento") || st.includes("aprovar_roteiro") || st.includes("roteiro")) {
    return "planejado";
  }

  if (st.includes("gravacao") || st.includes("gravação") || st.includes("decupagem") || st.includes("edicao") || st.includes("edição") || st.includes("validacao") || st.includes("validação")) {
    return "producao";
  }

  if (st.includes("aprovacao") || st.includes("aprovação")) {
    return "aprovacao";
  }

  if (st.includes("postar") || st.includes("trafego_pago") || st.includes("tráfego_pago") || st.includes("relatorio") || st.includes("relatório")) {
    return "publicacao";
  }

  if (st.includes("concluid") || st.includes("concluíd") || st.includes("finalizad") || st.includes("entregue")) {
    return "concluido";
  }

  return "__other__";
}
