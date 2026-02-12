export interface AISettings {
    id: number;
    company_id?: string;
    is_active: boolean; // Master switch
    personality_tone: string; // Legacy field, might be used or replaced by assistant_identity_name
    assistant_identity_name?: string;
    assistant_identity_signature?: string;
    openai_api_key?: string;
    daily_report_enabled: boolean;
    weekly_report_enabled: boolean;
    monthly_report_enabled: boolean;
    report_phone_number?: string;
    whatsapp_instance_name?: string;
    updated_at: string;
}

export interface AIStageConfig {
    id: number;
    company_id?: string;
    status_pipeline: string;
    is_active: boolean;
    agent_goal: string;
    default_prompt?: string;  // System Default
    prompt_override?: string; // User Edit
    updated_at: string;
}

export interface AIActionLog {
    id: number;
    lead_id: number;
    action_type: string;
    stage_from?: string;
    stage_to?: string;
    details: string;
    success: boolean;
    created_at: string;
}

export const DEFAULT_AI_SETTINGS: Partial<AISettings> = {
    is_active: false,
    assistant_identity_name: 'Consultor Solar',
    daily_report_enabled: false,
    weekly_report_enabled: false,
    monthly_report_enabled: false
};
