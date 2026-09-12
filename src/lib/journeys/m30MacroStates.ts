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
  
  if (st.includes("boas_vindas") || st.includes("boas-vindas") || st.includes("planejado") || st.includes("planejamento") || st.includes("aprovar_roteiro") || st.includes("roteiro")) {
    return "planejado";
  }

  if (st.includes("producao") || st.includes("produção") || st.includes("gravacao") || st.includes("gravação") || st.includes("gravao") || st.includes("decupagem") || st.includes("edicao") || st.includes("edição") || st.includes("edio") || st.includes("ediçao") || st.includes("validacao") || st.includes("validação") || st.includes("validao")) {
    return "producao";
  }

  if (st.includes("aprovacao") || st.includes("aprovação") || st.includes("aprovao")) {
    return "aprovacao";
  }

  if (st.includes("postar") || st.includes("trafego_pago") || st.includes("tráfego_pago") || st.includes("relatorio") || st.includes("relatório") || st.includes("relatrio")) {
    return "publicacao";
  }

  if (st.includes("concluid") || st.includes("concluíd") || st.includes("finalizad") || st.includes("entregue")) {
    return "concluido";
  }

  return "__other__";
}

export function computeStrategyState(subtasks: any[]): string {
    if (!subtasks || subtasks.length === 0) return 'planejado';
    
    const allDone = subtasks.every(st => st.status === 'done' || st.status === 'concluido');
    if (allDone) return 'concluido';
    
    const anyProd = subtasks.some(st => st.status === 'production' || st.status === 'done' || st.status === 'concluido' || st.status === 'edicao' || st.status === 'gravacao');
    if (anyProd) return 'producao';
    
    return 'planejado';
}

export function calculateStrategyProgress(subtasks: any[]): { completed: number; total: number; percentage: number } {
    if (!subtasks || subtasks.length === 0) return { completed: 0, total: 0, percentage: 0 };
    const done = subtasks.filter(st => st.status === 'done' || st.status === 'concluido').length;
    return {
        completed: done,
        total: subtasks.length,
        percentage: Math.round((done / subtasks.length) * 100)
    };
}
