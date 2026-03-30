export type StageSubtask = {
  id: string;
  label: string;
  done: boolean;
};

export type MktTechaCreative = {
  id: string;
  channel: string;
  type: "imagem" | "video" | "audio" | "texto";
  format: string;
  responsible_id: string | null;
  due_at: string | null;
  status: "draft" | "production" | "review" | "adjustment" | "approved";
  files: { name: string; url: string }[];
  briefing?: string;
  script?: string;
  references?: string;
  text_content?: string;
  review_link?: string;
  review_files?: { name: string; url: string }[];
  final_files?: { name: string; url: string }[];
  publish_start_date?: string;
  publish_end_date?: string;
  version: number;
  subtasks: StageSubtask[];
};

export const DEFAULT_STAGE_SUBTASKS: Record<string, string[]> = {
  ideias: ["Definir responsável", "Definir prazo", "Definir status", "Adicionar observação"],
  planejamento: ["Definir objetivo", "Definir mensagem central", "Definir mecânica", "Definir canais", "Aprovação"],
  ofertas_definidas: ["Selecionar produtos", "Definir preços", "Validar estoque", "Aprovação"],
  cadastro_big2be: ["Cadastrar ofertas", "Conferência", "Validação"],
  criativos: ["Briefing", "Produção", "Revisão", "Envio para aprovação", "Ajustes", "Aprovação final"],
  distribuio: ["Agendamento", "Publicação", "Envio", "Ativação mídia"],
  analise: ["Coletar vendas", "Coletar métricas", "Identificar produtos destaque", "Identificar canais destaque"],
  relatrio: ["Consolidar dados", "Escrever insights", "Comparar campanhas", "Validar relatório"],
  concluido: ["Finalizar campanha", "Arquivar dados", "Manter histórico"]
};

export const CREATIVE_CHANNELS = ["Instagram", "Facebook", "TikTok", "YouTube", "E-mail", "WhatsApp", "PDV", "Outros"];
export const CREATIVE_TYPES = ["imagem", "video", "audio", "texto"];
export const CREATIVE_STATUSES = [
  { value: "draft", label: "Rascunho" },
  { value: "production", label: "Em Produção" },
  { value: "review", label: "Em Revisão" },
  { value: "adjustment", label: "Ajustes Solicitados" },
  { value: "approved", label: "Aprovado" }
];
