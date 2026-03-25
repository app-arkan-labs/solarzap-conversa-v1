export type AppointmentWindowType = 'call' | 'visit' | 'meeting' | 'installation';
export type AppointmentDayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type FollowUpStepKey = 1 | 2 | 3 | 4 | 5;

export interface AppointmentWindowRule {
    start: string;
    end: string;
    days: AppointmentDayKey[];
}

export type AppointmentWindowConfig = Record<AppointmentWindowType, AppointmentWindowRule>;

export const DEFAULT_APPOINTMENT_WINDOW_CONFIG: AppointmentWindowConfig = {
    call: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    visit: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    meeting: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    installation: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
};

export interface FollowUpSequenceStep {
    step: FollowUpStepKey;
    enabled: boolean;
    delay_minutes: number;
}

export interface FollowUpSequenceConfig {
    steps: FollowUpSequenceStep[];
}

export const DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG: FollowUpSequenceConfig = {
    steps: [
        { step: 1, enabled: true, delay_minutes: 180 },
        { step: 2, enabled: true, delay_minutes: 1440 },
        { step: 3, enabled: true, delay_minutes: 2880 },
        { step: 4, enabled: true, delay_minutes: 4320 },
        { step: 5, enabled: true, delay_minutes: 10080 },
    ],
};

export interface FollowUpWindowConfig {
    start: string;
    end: string;
    days: AppointmentDayKey[];
    preferred_time?: string | null;
}

export const DEFAULT_FOLLOW_UP_WINDOW_CONFIG: FollowUpWindowConfig = {
    start: '09:00',
    end: '18:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    preferred_time: null,
};

export interface AISettings {
    id: number;
    org_id?: string;
    is_active: boolean; // Master switch
    personality_tone: string; // Legacy field, might be used or replaced by assistant_identity_name
    assistant_identity_name?: string;
    assistant_identity_signature?: string;
    daily_report_enabled: boolean;
    weekly_report_enabled: boolean;
    monthly_report_enabled: boolean;
    report_phone_number?: string;
    whatsapp_instance_name?: string;
    updated_at: string;
    // Protocol version & Support AI (added 20260221)
    protocol_version?: string;
    support_ai_enabled?: boolean;
    support_ai_auto_disable_on_seller_message?: boolean;
    respondeu_flow_mode?: string;
    support_ai_stage_toggles?: Record<string, boolean>;
    timezone?: string;
    auto_schedule_call_enabled?: boolean;
    auto_schedule_visit_enabled?: boolean;
    auto_schedule_call_min_days?: number;
    auto_schedule_visit_min_days?: number;
    auto_schedule_call_assign_to_user_id?: string | null;
    auto_schedule_visit_assign_to_user_id?: string | null;
    appointment_window_config?: AppointmentWindowConfig;
    follow_up_sequence_config?: FollowUpSequenceConfig;
    follow_up_window_config?: FollowUpWindowConfig;
}

export interface AIStageConfig {
    id: number;
    org_id?: string;
    status_pipeline: string;
    is_active: boolean;
    agent_goal: string;
    default_prompt?: string;  // System Default
    prompt_override?: string; // User Edit
    prompt_override_version?: number;
    updated_at: string;
}

export type LeadStageDataNamespace =
    | 'respondeu'
    | 'nao_compareceu'
    | 'negociacao'
    | 'proposta_negociacao'
    | 'financiamento';

export interface LeadStageDataBase {
    updated_at?: string | null;
    [key: string]: unknown;
}

export interface RespondeuStageData extends LeadStageDataBase {
    segment?: string | null;
    timing?: string | null;
    budget_fit?: string | null;
    need_reason?: string | null;
    decision_makers?: string[] | null;
    decision_makers_present?: boolean | null;
    visit_datetime?: string | null;
    address?: string | null;
    reference_point?: string | null;
    bant_complete?: boolean | null;
}

export interface NaoCompareceuStageData extends LeadStageDataBase {
    no_show_reason?: string | null;
    recovery_path?: string | null;
    next_step_choice?: string | null;
    next_step?: string | null;
    attempt_count?: number | null;
    call_datetime?: string | null;
    visit_datetime?: string | null;
    address?: string | null;
    reference_point?: string | null;
}

export interface NegociacaoStageData extends LeadStageDataBase {
    payment_track?: string | null;
    payment_method?: string | null;
    main_objection?: string | null;
    chosen_condition?: string | null;
    explicit_approval?: boolean | null;
    negotiation_status?: string | null;
}

export interface FinanciamentoStageData extends LeadStageDataBase {
    financing_status?: string | null;
    missing_docs?: string[] | null;
    last_update_at?: string | null;
    next_followup_at?: string | null;
    fear_reason?: string | null;
    profile_type?: string | null;
    approved_at?: string | null;
    bank_notes?: string | null;
}

export interface LeadStageData {
    respondeu?: RespondeuStageData | null;
    nao_compareceu?: NaoCompareceuStageData | null;
    negociacao?: NegociacaoStageData | null;
    proposta_negociacao?: NegociacaoStageData | null;
    financiamento?: FinanciamentoStageData | null;
    [stage: string]: LeadStageDataBase | null | undefined;
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
    timezone: 'America/Sao_Paulo',
    auto_schedule_call_enabled: true,
    auto_schedule_visit_enabled: true,
    auto_schedule_call_min_days: 0,
    auto_schedule_visit_min_days: 0,
    auto_schedule_call_assign_to_user_id: null,
    auto_schedule_visit_assign_to_user_id: null,
    daily_report_enabled: false,
    weekly_report_enabled: false,
    monthly_report_enabled: false,
    appointment_window_config: DEFAULT_APPOINTMENT_WINDOW_CONFIG,
    follow_up_sequence_config: DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG,
    follow_up_window_config: DEFAULT_FOLLOW_UP_WINDOW_CONFIG,
};
