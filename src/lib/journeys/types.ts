export interface StateMachine {
  states: string[];
  default: string;
  labels?: Record<string, string>;
  state_labels?: Record<string, string>; // Legacy support
}

export interface MetaContentConfig {
  meta_content_enabled: boolean;
  meta_autopublish_stories: boolean;
  meta_autopublish_feed: boolean;
  meta_autopublish_reels: boolean;
  calendar_import_export_enabled: boolean;
}

export interface JourneyConfig {
  automation?: {
    ocr?: { enabled: boolean; provider: string };
    on_image?: { create_default_pendencies: boolean; initial_state: string };
    on_text?: { create_case: boolean; initial_state: string };
    on_location?: { create_case: boolean; initial_state: string; next_state: string };
    conversations?: { auto_create_vendor: boolean; require_vendor: boolean };
  };
  flags?: {
    presence_enabled?: boolean;
    presence_allow_whatsapp_clocking?: boolean;
  };
  presence?: {
    time_zone?: string;
    scheduled_start_hhmm?: string;
    planned_minutes?: number;
  };
  // Dynamic fields from specific journeys (like meta_content)
  meta_content_enabled?: boolean;
  meta_autopublish_stories?: boolean;
  meta_autopublish_feed?: boolean;
  meta_autopublish_reels?: boolean;
  calendar_import_export_enabled?: boolean;
}
