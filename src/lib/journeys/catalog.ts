import { MetaContentConfig, StateMachine } from "./types";

export const TRELLO_SECTOR_NAME = "Operações";
export const TRELLO_JOURNEY_KEY = "trello";
export const TRELLO_JOURNEY_NAME = "Trello (Byfrost)";

export const TRELLO_DEFAULT_STATE_MACHINE: StateMachine = {
    states: ["BACKLOG", "FAZER", "EM_ANDAMENTO", "BLOQUEADO", "REVISAO", "CONCLUIDO"],
    default: "BACKLOG",
    labels: {
        BACKLOG: "Backlog",
        FAZER: "Fazer",
        EM_ANDAMENTO: "Em andamento",
        BLOQUEADO: "Bloqueado",
        REVISAO: "Revisão",
        CONCLUIDO: "Concluído",
    },
};

export const META_CONTENT_DEFAULT_CONFIG: MetaContentConfig = {
    meta_content_enabled: true,
    meta_autopublish_stories: true,
    meta_autopublish_feed: true,
    meta_autopublish_reels: false,
    calendar_import_export_enabled: true,
};
