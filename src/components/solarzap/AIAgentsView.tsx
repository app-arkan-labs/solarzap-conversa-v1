import React, { useState } from 'react';
import { useAISettings } from '../../hooks/useAISettings';
import { useUserWhatsAppInstances } from '../../hooks/useUserWhatsAppInstances';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { PIPELINE_STAGES } from '../../types/solarzap';
import { AI_SUPPORT_ELIGIBLE_STAGES } from '../../constants/aiSupportStages';
import {
    ACTIVE_PIPELINE_AGENTS,
    DEFAULT_PROMPTS_BY_STAGE,
    type PipelineAgentDef,
} from '../../constants/aiPipelineAgents';
import { AlertTriangle, RefreshCcw, Save, Bot, ChevronRight, Shield, Power, Wifi, WifiOff, Pencil, Brain } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PageHeader } from './PageHeader';
import {
    DEFAULT_APPOINTMENT_WINDOW_CONFIG,
    DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG,
    DEFAULT_FOLLOW_UP_WINDOW_CONFIG,
    type AppointmentWindowConfig,
    type AppointmentWindowType,
    type AppointmentDayKey,
    type FollowUpSequenceConfig,
    type FollowUpStepKey,
    type FollowUpWindowConfig,
} from '@/types/ai';
import { useBillingBlocker } from '@/contexts/BillingBlockerContext';
import { getSupportedTimezones, normalizeSupportedTimezone } from '@/lib/timezones';

const AI_SECTION_CARD_CLASS = 'overflow-hidden border-border/70 bg-card/98 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_40px_-30px_rgba(2,6,23,0.42)]';
const AI_SUBSECTION_CLASS = 'rounded-xl border border-border/55 bg-muted/20 p-4';
const AI_ROW_CLASS = 'rounded-xl border border-border/45 bg-background/55 px-3 py-2.5';
const AI_STATUS_BADGE_CLASS = 'h-5 border-border/60 bg-background/75 px-2 text-[10px] text-foreground/80';

type SpecialAgentDef = {
    stage: 'follow_up' | 'agente_disparos';
    label: string;
    icon: string;
    objective: string;
    description: string;
};

const SPECIAL_AGENTS: SpecialAgentDef[] = [
    {
        stage: 'follow_up',
        label: 'Follow Up Automático',
        icon: '🔄',
        objective: 'Reengajar leads que pararam de responder (5 tentativas)',
        description: 'Opera independente da IA geral, inclusive quando o lead estiver com IA pausada.',
    },
    {
        stage: 'agente_disparos',
        label: 'Agente de Disparos',
        icon: '📢',
        objective: 'Qualificar leads outbound de campanhas de disparo',
        description: 'Ativa apenas para respostas de leads com vínculo determinístico em broadcast_recipients.',
    },
];

const SUPPORT_AGENT_STAGE_KEY = 'assistente_geral';

const APPOINTMENT_WINDOW_CONFIG_TYPE_OPTIONS: AppointmentWindowType[] = ['call', 'visit', 'meeting', 'installation'];
const APPOINTMENT_WINDOW_TYPE_OPTIONS: Array<{ key: AppointmentWindowType; label: string }> = [
    { key: 'call', label: 'Chamada' },
    { key: 'visit', label: 'Visita' },
];

const SUPPORTED_TIMEZONES = getSupportedTimezones();

const APPOINTMENT_DAY_OPTIONS: Array<{ key: AppointmentDayKey; label: string }> = [
    { key: 'mon', label: 'Seg' },
    { key: 'tue', label: 'Ter' },
    { key: 'wed', label: 'Qua' },
    { key: 'thu', label: 'Qui' },
    { key: 'fri', label: 'Sex' },
    { key: 'sat', label: 'Sáb' },
    { key: 'sun', label: 'Dom' },
];

const parseTimeToMinutes = (value: string): number | null => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
};

const formatMinutesToHHMM = (minutes: number): string => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const cloneWindowConfig = (config: AppointmentWindowConfig): AppointmentWindowConfig => ({
    call: { ...config.call, days: [...config.call.days] },
    visit: { ...config.visit, days: [...config.visit.days] },
    meeting: { ...config.meeting, days: [...config.meeting.days] },
    installation: { ...config.installation, days: [...config.installation.days] },
});

const normalizeWindowConfig = (raw: unknown): AppointmentWindowConfig => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
    const next = cloneWindowConfig(DEFAULT_APPOINTMENT_WINDOW_CONFIG);
    for (const key of APPOINTMENT_WINDOW_CONFIG_TYPE_OPTIONS) {
        const incoming = source[key];
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;
        const startMin = parseTimeToMinutes(String(incoming.start || ''));
        const endMin = parseTimeToMinutes(String(incoming.end || ''));
        const start = startMin === null ? next[key].start : formatMinutesToHHMM(startMin);
        const end = endMin === null ? next[key].end : formatMinutesToHHMM(endMin);
        const days = Array.isArray(incoming.days)
            ? Array.from(new Set(incoming.days.filter((day: string) => APPOINTMENT_DAY_OPTIONS.some((d) => d.key === day))))
            : [];
        next[key] = {
            start,
            end,
            days: days.length > 0 ? (days as AppointmentDayKey[]) : [...DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].days],
        };
    }
    return next;
};

const normalizeDayKey = (raw: unknown): AppointmentDayKey | null => {
    const value = String(raw ?? '').trim().toLowerCase();
    return APPOINTMENT_DAY_OPTIONS.some((day) => day.key === value) ? (value as AppointmentDayKey) : null;
};

const cloneFollowUpWindowConfig = (config: FollowUpWindowConfig): FollowUpWindowConfig => ({
    start: config.start,
    end: config.end,
    days: [...config.days],
    preferred_time: config.preferred_time ? String(config.preferred_time) : null,
});

const normalizeFollowUpWindowConfig = (raw: unknown): FollowUpWindowConfig => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
    const startMin = parseTimeToMinutes(String(source.start || ''));
    const endMin = parseTimeToMinutes(String(source.end || ''));
    const days = Array.isArray(source.days)
        ? Array.from(
            new Set(
                source.days
                    .map((day: unknown) => normalizeDayKey(day))
                    .filter(Boolean)
            )
        ) as AppointmentDayKey[]
        : [];
    const preferredRaw = String(source.preferred_time || '').trim();
    const preferredMin = preferredRaw ? parseTimeToMinutes(preferredRaw) : null;

    return {
        start: startMin === null ? DEFAULT_FOLLOW_UP_WINDOW_CONFIG.start : formatMinutesToHHMM(startMin),
        end: endMin === null ? DEFAULT_FOLLOW_UP_WINDOW_CONFIG.end : formatMinutesToHHMM(endMin),
        days: days.length > 0 ? days : [...DEFAULT_FOLLOW_UP_WINDOW_CONFIG.days],
        preferred_time: preferredMin === null ? null : formatMinutesToHHMM(preferredMin),
    };
};

const validateFollowUpWindowConfig = (config: FollowUpWindowConfig): string | null => {
    const startMin = parseTimeToMinutes(config.start);
    const endMin = parseTimeToMinutes(config.end);
    if (startMin === null || endMin === null || endMin <= startMin) {
        return 'Horario final deve ser maior que o inicial';
    }
    if (!Array.isArray(config.days) || config.days.length === 0) {
        return 'Selecione ao menos 1 dia util para follow-up';
    }
    if (config.preferred_time) {
        const preferredMin = parseTimeToMinutes(config.preferred_time);
        if (preferredMin === null) return 'Horario preferencial invalido';
        if (preferredMin < startMin || preferredMin >= endMin) {
            return 'Horario preferencial precisa estar dentro da janela';
        }
    }
    return null;
};

const validateWindowConfig = (config: AppointmentWindowConfig): Record<AppointmentWindowType, string | null> => {
    const errors: Record<AppointmentWindowType, string | null> = {
        call: null,
        visit: null,
        meeting: null,
        installation: null,
    };

    for (const { key } of APPOINTMENT_WINDOW_TYPE_OPTIONS) {
        const rule = config[key];
        const startMin = parseTimeToMinutes(rule.start);
        const endMin = parseTimeToMinutes(rule.end);
        if (startMin === null || endMin === null || endMin <= startMin) {
            errors[key] = 'Horário final deve ser maior que o inicial';
            continue;
        }
        if (!Array.isArray(rule.days) || rule.days.length === 0) {
            errors[key] = 'Selecione ao menos 1 dia';
        }
    }

    return errors;
};

type FollowUpCadenceUnit = 'm' | 'h' | 'd';
type FollowUpCadenceStepDraft = {
    step: FollowUpStepKey;
    enabled: boolean;
    value: number;
    unit: FollowUpCadenceUnit;
};

const FOLLOW_UP_STEP_KEYS: FollowUpStepKey[] = [1, 2, 3, 4, 5];
const FOLLOW_UP_MIN_DELAY_MINUTES = 5;
const FOLLOW_UP_MAX_DELAY_MINUTES = 365 * 24 * 60;
const FOLLOW_UP_UNIT_LABEL: Record<FollowUpCadenceUnit, string> = {
    m: 'min',
    h: 'h',
    d: 'dias',
};

const cadenceToMinutes = (value: number, unit: FollowUpCadenceUnit): number => {
    const base = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    if (unit === 'd') return base * 24 * 60;
    if (unit === 'h') return base * 60;
    return base;
};

const pickBestCadenceUnit = (minutes: number): FollowUpCadenceUnit => {
    if (minutes % 1440 === 0) return 'd';
    if (minutes % 60 === 0) return 'h';
    return 'm';
};

const minutesToCadenceValue = (minutes: number, unit: FollowUpCadenceUnit): number => {
    if (unit === 'd') return Math.max(1, Math.round(minutes / 1440));
    if (unit === 'h') return Math.max(1, Math.round(minutes / 60));
    return Math.max(1, Math.round(minutes));
};

const normalizeFollowUpSequenceConfig = (raw: unknown): FollowUpSequenceConfig => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
    const incomingSteps = Array.isArray(source.steps) ? source.steps : [];
    const fallbackMap = new Map(
        DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG.steps.map((step) => [step.step, step] as const),
    );

    const steps = FOLLOW_UP_STEP_KEYS.map((stepKey) => {
        const fallback = fallbackMap.get(stepKey)!;
        const incoming = incomingSteps.find((entry) => Number((entry as any)?.step) === stepKey) || {};
        const enabled =
            typeof (incoming as any)?.enabled === 'boolean'
                ? Boolean((incoming as any).enabled)
                : fallback.enabled;
        const delayRaw = Number((incoming as any)?.delay_minutes);
        const delayMinutes = Number.isFinite(delayRaw)
            ? Math.max(
                FOLLOW_UP_MIN_DELAY_MINUTES,
                Math.min(FOLLOW_UP_MAX_DELAY_MINUTES, Math.round(delayRaw)),
            )
            : fallback.delay_minutes;

        return {
            step: stepKey,
            enabled,
            delay_minutes: delayMinutes,
        };
    });

    return { steps };
};

const toFollowUpCadenceDraft = (config: FollowUpSequenceConfig): FollowUpCadenceStepDraft[] =>
    config.steps
        .slice()
        .sort((a, b) => a.step - b.step)
        .map((step) => {
            const unit = pickBestCadenceUnit(step.delay_minutes);
            return {
                step: step.step,
                enabled: step.enabled,
                unit,
                value: minutesToCadenceValue(step.delay_minutes, unit),
            };
        });

const followUpDraftToConfig = (draft: FollowUpCadenceStepDraft[]): FollowUpSequenceConfig => {
    const raw = {
        steps: draft.map((step) => ({
            step: step.step,
            enabled: step.enabled,
            delay_minutes: cadenceToMinutes(step.value, step.unit),
        })),
    };
    return normalizeFollowUpSequenceConfig(raw);
};

const validateFollowUpCadenceDraft = (draft: FollowUpCadenceStepDraft[]): Record<number, string | null> => {
    const errors: Record<number, string | null> = {};
    for (const item of draft) {
        const minutes = cadenceToMinutes(item.value, item.unit);
        if (!item.enabled) {
            errors[item.step] = null;
            continue;
        }
        if (!Number.isFinite(item.value) || item.value <= 0) {
            errors[item.step] = 'Informe um valor maior que zero';
            continue;
        }
        if (minutes < FOLLOW_UP_MIN_DELAY_MINUTES || minutes > FOLLOW_UP_MAX_DELAY_MINUTES) {
            errors[item.step] = 'Tempo fora do limite permitido';
            continue;
        }
        errors[item.step] = null;
    }
    return errors;
};

const formatMinutesCompact = (minutes: number): string => {
    if (minutes % 1440 === 0) {
        const days = Math.round(minutes / 1440);
        return `${days}d`;
    }
    if (minutes % 60 === 0) {
        const hours = Math.round(minutes / 60);
        return `${hours}h`;
    }
    return `${minutes}min`;
};

type AutoScheduleSettingsDraft = {
    timezone: string;
    auto_schedule_call_enabled: boolean;
    auto_schedule_visit_enabled: boolean;
    auto_schedule_call_min_days: number;
    auto_schedule_visit_min_days: number;
};

const AUTO_SCHEDULE_MIN_DAYS_MIN = 0;
const AUTO_SCHEDULE_MIN_DAYS_MAX = 60;

const normalizeAutoScheduleMinDays = (raw: unknown, fallback: number): number => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(AUTO_SCHEDULE_MIN_DAYS_MIN, Math.min(AUTO_SCHEDULE_MIN_DAYS_MAX, Math.round(parsed)));
};

const buildAutoScheduleDraftFromSettings = (settings: any): AutoScheduleSettingsDraft => ({
    timezone: normalizeSupportedTimezone(settings?.timezone, 'America/Sao_Paulo'),
    auto_schedule_call_enabled: settings?.auto_schedule_call_enabled !== false,
    auto_schedule_visit_enabled: settings?.auto_schedule_visit_enabled !== false,
    auto_schedule_call_min_days: normalizeAutoScheduleMinDays(
        settings?.auto_schedule_call_min_days,
        0
    ),
    auto_schedule_visit_min_days: normalizeAutoScheduleMinDays(
        settings?.auto_schedule_visit_min_days,
        0
    ),
});

export function AIAgentsView() {
    const { settings, stageConfigs, updateGlobalSettings, updateStageConfig, loading, restoreDefaultPrompt } = useAISettings();
    const { instances: whatsappInstances, setInstanceAiEnabled, activateAiForAllLeads } = useUserWhatsAppInstances();
    const { openPackPurchase } = useBillingBlocker();
    const { role, orgId } = useAuth();
    const canEdit = role === 'owner' || role === 'admin';
    const [editingStage, setEditingStage] = useState<string | null>(null);
    const [editingAgent, setEditingAgent] = useState<PipelineAgentDef | null>(null);

    const [isWarningOpen, setIsWarningOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
    const [tempPrompt, setTempPrompt] = useState('');

    // Local state for Assistant Name to prevent auto-refresh/focus loss
    const [localAssistantName, setLocalAssistantName] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [windowConfigDraft, setWindowConfigDraft] = useState<AppointmentWindowConfig>(
        cloneWindowConfig(DEFAULT_APPOINTMENT_WINDOW_CONFIG)
    );
    const [windowConfigDirty, setWindowConfigDirty] = useState(false);
    const [followUpCadenceDraft, setFollowUpCadenceDraft] = useState<FollowUpCadenceStepDraft[]>(
        toFollowUpCadenceDraft(DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG)
    );
    const [followUpCadenceDirty, setFollowUpCadenceDirty] = useState(false);
    const [followUpWindowDraft, setFollowUpWindowDraft] = useState<FollowUpWindowConfig>(
        cloneFollowUpWindowConfig(DEFAULT_FOLLOW_UP_WINDOW_CONFIG)
    );
    const [followUpWindowDirty, setFollowUpWindowDirty] = useState(false);
    const [followUpCadenceExpanded, setFollowUpCadenceExpanded] = useState(false);
    const [autoScheduleDraft, setAutoScheduleDraft] = useState<AutoScheduleSettingsDraft>(
        buildAutoScheduleDraftFromSettings(settings)
    );
    const [autoScheduleDirty, setAutoScheduleDirty] = useState(false);

    // Sync local state when settings load
    React.useEffect(() => {
        if (settings?.assistant_identity_name) {
            setLocalAssistantName(settings.assistant_identity_name);
        }
    }, [settings?.assistant_identity_name]);

    React.useEffect(() => {
        const incoming = normalizeWindowConfig(settings?.appointment_window_config || DEFAULT_APPOINTMENT_WINDOW_CONFIG);
        setWindowConfigDraft(incoming);
        setWindowConfigDirty(false);
    }, [settings?.appointment_window_config]);

    React.useEffect(() => {
        const incoming = normalizeFollowUpSequenceConfig(
            settings?.follow_up_sequence_config || DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG
        );
        setFollowUpCadenceDraft(toFollowUpCadenceDraft(incoming));
        setFollowUpCadenceDirty(false);
    }, [settings?.follow_up_sequence_config]);

    React.useEffect(() => {
        const incoming = normalizeFollowUpWindowConfig(
            settings?.follow_up_window_config || DEFAULT_FOLLOW_UP_WINDOW_CONFIG
        );
        setFollowUpWindowDraft(cloneFollowUpWindowConfig(incoming));
        setFollowUpWindowDirty(false);
    }, [settings?.follow_up_window_config]);

    React.useEffect(() => {
        setAutoScheduleDraft(buildAutoScheduleDraftFromSettings(settings));
        setAutoScheduleDirty(false);
    }, [
        settings?.timezone,
        settings?.auto_schedule_call_enabled,
        settings?.auto_schedule_visit_enabled,
        settings?.auto_schedule_call_min_days,
        settings?.auto_schedule_visit_min_days,
    ]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalAssistantName(e.target.value);
        setHasUnsavedChanges(true);
    };

    const handleCancelNameChange = () => {
        setLocalAssistantName(settings?.assistant_identity_name || '');
        setHasUnsavedChanges(false);
    };

    const handleSaveNameChange = async () => {
        await updateGlobalSettings({ assistant_identity_name: localAssistantName });
        setHasUnsavedChanges(false);
    };

    const handleWindowConfigTimeChange = (
        type: AppointmentWindowType,
        field: 'start' | 'end',
        value: string
    ) => {
        setWindowConfigDraft((prev) => ({
            ...prev,
            [type]: {
                ...prev[type],
                [field]: value,
            },
        }));
        setWindowConfigDirty(true);
    };

    const handleWindowConfigDayToggle = (type: AppointmentWindowType, day: AppointmentDayKey) => {
        setWindowConfigDraft((prev) => {
            const currentDays = prev[type].days || [];
            const nextDays = currentDays.includes(day)
                ? currentDays.filter((d) => d !== day)
                : [...currentDays, day];
            return {
                ...prev,
                [type]: {
                    ...prev[type],
                    days: nextDays,
                },
            };
        });
        setWindowConfigDirty(true);
    };

    const handleWindowConfigCancel = () => {
        setWindowConfigDraft(normalizeWindowConfig(settings?.appointment_window_config || DEFAULT_APPOINTMENT_WINDOW_CONFIG));
        setWindowConfigDirty(false);
    };

    const handleWindowConfigSave = async () => {
        const errors = validateWindowConfig(windowConfigDraft);
        if (Object.values(errors).some(Boolean)) {
            toast.error('Revise os horários: o fim deve ser maior que o início e cada tipo precisa de ao menos 1 dia.');
            return;
        }
        await updateGlobalSettings({ appointment_window_config: normalizeWindowConfig(windowConfigDraft) });
        setWindowConfigDirty(false);
    };

    const handleFollowUpCadenceValueChange = (step: FollowUpStepKey, value: number) => {
        setFollowUpCadenceDraft((prev) => prev.map((item) => (
            item.step === step
                ? { ...item, value: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0 }
                : item
        )));
        setFollowUpCadenceDirty(true);
    };

    const handleFollowUpCadenceUnitChange = (step: FollowUpStepKey, unit: FollowUpCadenceUnit) => {
        setFollowUpCadenceDraft((prev) => prev.map((item) => {
            if (item.step !== step) return item;
            const minutes = cadenceToMinutes(item.value, item.unit);
            return {
                ...item,
                unit,
                value: minutesToCadenceValue(minutes, unit),
            };
        }));
        setFollowUpCadenceDirty(true);
    };

    const handleFollowUpCadenceToggle = (step: FollowUpStepKey, checked: boolean) => {
        setFollowUpCadenceDraft((prev) => prev.map((item) => (
            item.step === step ? { ...item, enabled: checked } : item
        )));
        setFollowUpCadenceDirty(true);
    };

    const handleFollowUpCadenceCancel = () => {
        const incoming = normalizeFollowUpSequenceConfig(
            settings?.follow_up_sequence_config || DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG
        );
        setFollowUpCadenceDraft(toFollowUpCadenceDraft(incoming));
        setFollowUpCadenceDirty(false);
    };

    const handleFollowUpCadenceSave = async () => {
        const activeSteps = followUpCadenceDraft.filter((item) => item.enabled);
        if (activeSteps.length === 0) {
            toast.error('Ative ao menos uma etapa de follow-up.');
            return;
        }

        const errors = validateFollowUpCadenceDraft(followUpCadenceDraft);
        if (Object.values(errors).some(Boolean)) {
            toast.error('Revise os tempos do follow-up antes de salvar.');
            return;
        }

        const normalized = followUpDraftToConfig(followUpCadenceDraft);
        await updateGlobalSettings({ follow_up_sequence_config: normalized });
        setFollowUpCadenceDirty(false);
    };

    const handleFollowUpWindowTimeChange = (field: 'start' | 'end' | 'preferred_time', value: string) => {
        setFollowUpWindowDraft((prev) => ({
            ...prev,
            [field]: field === 'preferred_time'
                ? (value ? value : null)
                : value,
        }));
        setFollowUpWindowDirty(true);
    };

    const handleFollowUpWindowDayToggle = (day: AppointmentDayKey) => {
        setFollowUpWindowDraft((prev) => {
            const currentDays = prev.days || [];
            const nextDays = currentDays.includes(day)
                ? currentDays.filter((d) => d !== day)
                : [...currentDays, day];
            return {
                ...prev,
                days: nextDays,
            };
        });
        setFollowUpWindowDirty(true);
    };

    const handleFollowUpWindowCancel = () => {
        const incoming = normalizeFollowUpWindowConfig(
            settings?.follow_up_window_config || DEFAULT_FOLLOW_UP_WINDOW_CONFIG
        );
        setFollowUpWindowDraft(cloneFollowUpWindowConfig(incoming));
        setFollowUpWindowDirty(false);
    };

    const handleFollowUpWindowSave = async () => {
        const normalized = normalizeFollowUpWindowConfig(followUpWindowDraft);
        const error = validateFollowUpWindowConfig(normalized);
        if (error) {
            toast.error(error);
            return;
        }
        await updateGlobalSettings({ follow_up_window_config: normalized });
        setFollowUpWindowDirty(false);
    };

    const handleAutoScheduleToggle = (
        field: 'auto_schedule_call_enabled' | 'auto_schedule_visit_enabled',
        value: boolean,
    ) => {
        setAutoScheduleDraft((prev) => ({
            ...prev,
            [field]: value,
        }));
        setAutoScheduleDirty(true);
    };

    const handleAutoScheduleMinDaysChange = (
        field: 'auto_schedule_call_min_days' | 'auto_schedule_visit_min_days',
        value: number,
    ) => {
        setAutoScheduleDraft((prev) => ({
            ...prev,
            [field]: normalizeAutoScheduleMinDays(value, prev[field]),
        }));
        setAutoScheduleDirty(true);
    };

    const handleAutoScheduleTimezoneChange = (value: string) => {
        setAutoScheduleDraft((prev) => ({
            ...prev,
            timezone: normalizeSupportedTimezone(value, prev.timezone || 'America/Sao_Paulo'),
        }));
        setAutoScheduleDirty(true);
    };

    const handleAutoScheduleCancel = () => {
        setAutoScheduleDraft(buildAutoScheduleDraftFromSettings(settings));
        setAutoScheduleDirty(false);
    };

    const handleAutoScheduleSave = async () => {
        const timezone = normalizeSupportedTimezone(autoScheduleDraft.timezone, 'America/Sao_Paulo');
        await updateGlobalSettings({
            timezone,
            auto_schedule_call_enabled: autoScheduleDraft.auto_schedule_call_enabled,
            auto_schedule_visit_enabled: autoScheduleDraft.auto_schedule_visit_enabled,
            auto_schedule_call_min_days: normalizeAutoScheduleMinDays(autoScheduleDraft.auto_schedule_call_min_days, 0),
            auto_schedule_visit_min_days: normalizeAutoScheduleMinDays(autoScheduleDraft.auto_schedule_visit_min_days, 0),
        });
        setAutoScheduleDirty(false);
    };

    const handleEditClick = (agent: PipelineAgentDef, currentPrompt: string) => {
        setEditingStage(agent.stage);
        setEditingAgent(agent);
        setTempPrompt(currentPrompt);
        setIsWarningOpen(true);
    };

    const handleConfirmWarning = () => {
        setIsWarningOpen(false);
        setIsEditorOpen(true);
    };

    const handleSavePrompt = async () => {
        if (editingStage) {
            await updateStageConfig(editingStage, { prompt_override: tempPrompt });
            setIsEditorOpen(false);
            setEditingStage(null);
            setEditingAgent(null);
        }
    };

    const handleRestoreDefault = async () => {
        if (editingStage) {
            const defaultPrompt = DEFAULT_PROMPTS_BY_STAGE[editingStage];
            if (defaultPrompt) {
                setTempPrompt(defaultPrompt);
                toast.success('Prompt padrão restaurado. Clique "Salvar" para confirmar.');
            } else {
                setIsRestoreConfirmOpen(true);
            }
        }
    };

    const getStageConfigByKey = (stageKey: string) =>
        stageConfigs.find((config) => {
            const normalized = String((config as any)?.status_pipeline ?? (config as any)?.pipeline_stage ?? '').trim();
            return normalized === stageKey;
        });

    const getStagePromptByKey = (stageKey: string) => {
        const config = getStageConfigByKey(stageKey);
        return (
            config?.prompt_override ||
            config?.default_prompt ||
            DEFAULT_PROMPTS_BY_STAGE[stageKey] ||
            ''
        );
    };

    const handleEditSpecialPrompt = (stageKey: 'follow_up' | 'agente_disparos') => {
        setEditingStage(stageKey);
        setEditingAgent(null);
        setTempPrompt(getStagePromptByKey(stageKey));
        setIsWarningOpen(true);
    };

    const handleEditSupportPrompt = () => {
        setEditingStage(SUPPORT_AGENT_STAGE_KEY);
        setEditingAgent(null);
        setTempPrompt(getStagePromptByKey(SUPPORT_AGENT_STAGE_KEY));
        setIsWarningOpen(true);
    };

    const handleSpecialAgentToggle = async (stageKey: 'follow_up' | 'agente_disparos', checked: boolean) => {
        await updateStageConfig(stageKey, { is_active: checked });

        if (stageKey !== 'follow_up' || checked || !orgId) return;

        const nowIso = new Date().toISOString();
        const { error: cancelJobsErr } = await supabase
            .from('scheduled_agent_jobs')
            .update({
                status: 'cancelled',
                cancelled_reason: 'org_agent_disabled',
                executed_at: nowIso,
            })
            .eq('org_id', orgId)
            .eq('agent_type', 'follow_up')
            .eq('status', 'pending');

        if (cancelJobsErr) {
            toast.error('Não foi possível cancelar jobs pendentes de follow-up da organização.');
            return;
        }

        const { error: resetLeadsErr } = await supabase
            .from('leads')
            .update({ follow_up_step: 0 })
            .eq('org_id', orgId)
            .gt('follow_up_step', 0);

        if (resetLeadsErr) {
            toast.error('Não foi possível resetar o passo de follow-up dos leads da organização.');
        }
    };

    if (loading) return <div className="p-8 text-center">Carregando módulos de IA...</div>;

    const activeCount = ACTIVE_PIPELINE_AGENTS.filter(
        a => getStageConfigByKey(a.stage)?.is_active
    ).length;
    const editingConfig = editingStage ? getStageConfigByKey(editingStage) : null;
    const editingSpecialAgent = SPECIAL_AGENTS.find((agent) => agent.stage === editingStage);
    const editingStageTitle = editingAgent?.label
        || editingSpecialAgent?.label
        || (editingStage === SUPPORT_AGENT_STAGE_KEY ? 'Agente de Apoio Global' : null)
        || (editingStage && (PIPELINE_STAGES as Record<string, { title: string }>)[editingStage]?.title)
        || '';
    const editingPromptVersion = editingConfig?.prompt_override_version ?? 0;
    const promptLength = tempPrompt.length;
    const windowConfigErrors = validateWindowConfig(windowConfigDraft);
    const hasWindowConfigErrors = Object.values(windowConfigErrors).some(Boolean);
    const followUpCadenceErrors = validateFollowUpCadenceDraft(followUpCadenceDraft);
    const hasFollowUpCadenceErrors = Object.values(followUpCadenceErrors).some(Boolean);
    const followUpWindowError = validateFollowUpWindowConfig(followUpWindowDraft);
    const hasFollowUpWindowErrors = Boolean(followUpWindowError);
    const followUpEnabledSteps = followUpCadenceDraft.filter((item) => item.enabled).length;
    const followUpCadencePreview = followUpDraftToConfig(followUpCadenceDraft).steps
        .filter((step) => step.enabled)
        .map((step) => `E${step.step}: ${formatMinutesCompact(step.delay_minutes)}`)
        .join(' -> ');
    const autoScheduleModeLabel = autoScheduleDraft.auto_schedule_call_enabled && autoScheduleDraft.auto_schedule_visit_enabled
        ? 'Ambos ativos: IA escolhe entre ligacao e visita.'
        : autoScheduleDraft.auto_schedule_call_enabled
            ? 'Somente ligacao ativa: IA segue por ligacao.'
            : autoScheduleDraft.auto_schedule_visit_enabled
                ? 'Somente visita ativa: IA segue por visita.'
                : 'Ambos desativados: IA nao agenda automaticamente e informa retorno.';
    const promptWarnings = [
        promptLength > 0 && promptLength < 50 ? `Prompt curto (${promptLength} < 50 caracteres)` : null,
        promptLength > 15000 ? `Prompt longo (${promptLength} > 15000 caracteres)` : null,
        tempPrompt && !/ETAPA:/i.test(tempPrompt) ? 'Aviso: sem "ETAPA:"' : null,
        tempPrompt && !/OBJETIVO:/i.test(tempPrompt) ? 'Aviso: sem "OBJETIVO:"' : null,
    ].filter(Boolean) as string[];

    return (
        <div className="app-shell-bg flex-1 flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Inteligência Artificial"
                subtitle="Configure os agentes autônomos do seu funil de vendas"
                icon={Bot}
                actionContent={
                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                            variant="outline"
                            onClick={() => {
                                void openPackPurchase('ai', { source: 'ai_credits', targetPlan: 'pro' });
                            }}
                            className="h-9 gap-2 border-border/60 bg-background/70 font-semibold"
                        >
                            <Brain className="w-4 h-4" />
                            Comprar créditos de IA
                        </Button>
                        <div className="flex items-center gap-3 rounded-xl border border-border/55 bg-background/65 px-3.5 py-2 backdrop-blur-sm">
                            <Badge variant={settings?.is_active ? "default" : "secondary"} className="h-6 px-2.5 text-[11px]">
                                {settings?.is_active ? "SISTEMA ATIVO" : "SISTEMA PAUSADO"}
                            </Badge>
                            <Switch
                                data-testid="ai-master-switch"
                                checked={settings?.is_active || false}
                                onCheckedChange={(checked) => updateGlobalSettings({ is_active: checked })}
                                className="data-[state=checked]:bg-primary"
                                disabled={!canEdit}
                            />
                        </div>
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto w-full px-6 py-6 pb-24">
                <div className="mx-auto w-full max-w-[900px] space-y-6">

                    {/* Settings Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Nome do Assistente */}
                        <Card className={AI_SECTION_CARD_CLASS}>
                            <CardContent className="p-4">
                                <Label className="text-xs font-semibold text-muted-foreground">Nome do Assistente</Label>
                                <Input
                                    className="mt-2"
                                    value={localAssistantName}
                                    onChange={handleNameChange}
                                    placeholder="Ex: Consultor Solar, Ana, Carlos..."
                                />
                            </CardContent>
                        </Card>

                        {/* Instâncias WhatsApp - TODAS, não só connected */}
                        <Card className={AI_SECTION_CARD_CLASS}>
                            <CardContent className="p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <Label className="text-xs font-semibold text-muted-foreground">Instâncias WhatsApp</Label>
                                    <span className="text-[11px] text-muted-foreground">Controle por instância</span>
                                </div>
                                <div className="mt-2 flex flex-col gap-2.5">
                                    {whatsappInstances.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5" /> Nenhuma instância cadastrada
                                        </p>
                                    ) : (
                                        whatsappInstances.map(inst => {
                                            const isOnline = inst.status === 'connected';
                                            const isConnecting = inst.status === 'connecting';
                                            return (
                                                <div key={inst.id} className={`${AI_ROW_CLASS} flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between`}>
                                                    <div className="flex min-w-0 items-center gap-2.5">
                                                        {isOnline ? (
                                                            <Wifi className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                                        ) : (
                                                            <WifiOff className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                        <span className={`font-medium truncate ${!isOnline ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                            {inst.display_name || inst.instance_name}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className={`flex-shrink-0 ${AI_STATUS_BADGE_CLASS} ${isOnline ? 'border-primary/30 text-primary' : isConnecting ? 'border-amber-300/70 text-amber-700 dark:text-amber-300' : ''}`}
                                                        >
                                                            {isOnline ? 'Online' : isConnecting ? 'Conectando' : 'Offline'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                                                        <Switch
                                                            checked={!!inst.ai_enabled}
                                                            onCheckedChange={(checked) => setInstanceAiEnabled(inst.instance_name, checked)}
                                                            disabled={!settings?.is_active || !isOnline}
                                                            className="scale-75 origin-right data-[state=checked]:bg-primary"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            data-testid={`instance-ai-activate-all-${inst.instance_name}`}
                                                            className="h-7 border-border/60 px-2 text-[11px] text-primary hover:bg-primary/5 hover:text-primary/80"
                                                            disabled={!isOnline}
                                                            onClick={async () => {
                                                                const count = await activateAiForAllLeads(inst.instance_name);
                                                                if (count !== null) toast.success(`IA reativada para ${count} contato(s) da instância ${inst.instance_name}`);
                                                            }}
                                                            title="Reativar IA para todos os leads desta instância"
                                                        >
                                                            <Power className="h-3 w-3 mr-1" />
                                                            Religar todos
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className={AI_SECTION_CARD_CLASS} data-testid="auto-schedule-controls-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Politica de Agendamento Automatico</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-1">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className={AI_SUBSECTION_CLASS}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-xs font-semibold text-muted-foreground">
                                                Agendamento de Ligacoes
                                            </Label>
                                            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                                Ativa/desativa convite automatico para chamada.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={autoScheduleDraft.auto_schedule_call_enabled}
                                            onCheckedChange={(checked) => handleAutoScheduleToggle('auto_schedule_call_enabled', checked)}
                                            disabled={!canEdit}
                                            className="data-[state=checked]:bg-primary"
                                        />
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <Label className="text-[11px] text-muted-foreground">Dias minimos para ligacao</Label>
                                        <Input
                                            type="number"
                                            min={AUTO_SCHEDULE_MIN_DAYS_MIN}
                                            max={AUTO_SCHEDULE_MIN_DAYS_MAX}
                                            step={1}
                                            value={autoScheduleDraft.auto_schedule_call_min_days}
                                            onChange={(event) => handleAutoScheduleMinDaysChange(
                                                'auto_schedule_call_min_days',
                                                Number(event.target.value || 0),
                                            )}
                                            disabled={!canEdit}
                                        />
                                    </div>
                                </div>

                                <div className={AI_SUBSECTION_CLASS}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-xs font-semibold text-muted-foreground">
                                                Agendamento de Visitas
                                            </Label>
                                            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                                Ativa/desativa convite automatico para visita tecnica.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={autoScheduleDraft.auto_schedule_visit_enabled}
                                            onCheckedChange={(checked) => handleAutoScheduleToggle('auto_schedule_visit_enabled', checked)}
                                            disabled={!canEdit}
                                            className="data-[state=checked]:bg-primary"
                                        />
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <Label className="text-[11px] text-muted-foreground">Dias minimos para visita</Label>
                                        <Input
                                            type="number"
                                            min={AUTO_SCHEDULE_MIN_DAYS_MIN}
                                            max={AUTO_SCHEDULE_MIN_DAYS_MAX}
                                            step={1}
                                            value={autoScheduleDraft.auto_schedule_visit_min_days}
                                            onChange={(event) => handleAutoScheduleMinDaysChange(
                                                'auto_schedule_visit_min_days',
                                                Number(event.target.value || 0),
                                            )}
                                            disabled={!canEdit}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={AI_SUBSECTION_CLASS}>
                                <Label className="text-xs font-semibold text-muted-foreground">Timezone operacional</Label>
                                <Select
                                    value={autoScheduleDraft.timezone}
                                    onValueChange={handleAutoScheduleTimezoneChange}
                                    disabled={!canEdit}
                                >
                                    <SelectTrigger className="mt-2">
                                        <SelectValue placeholder="Selecione a timezone" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SUPPORTED_TIMEZONES.map((timezone) => (
                                            <SelectItem key={timezone} value={timezone}>
                                                {timezone}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="mt-2 text-[11px] text-muted-foreground">{autoScheduleModeLabel}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Regra fixa em runtime: apos 18:00 no timezone acima, a IA nao convida para ligacao.
                                </p>
                            </div>

                            {canEdit && (
                                <div className="flex items-center justify-end gap-2">
                                    {autoScheduleDirty && (
                                        <Button variant="outline" onClick={handleAutoScheduleCancel}>
                                            Cancelar
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleAutoScheduleSave}
                                        disabled={!autoScheduleDirty}
                                        data-testid="auto-schedule-controls-save"
                                    >
                                        <Save className="mr-2 h-4 w-4" />
                                        Salvar Politica
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className={AI_SECTION_CARD_CLASS} data-testid="appointment-window-config-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Janela de Agendamento da IA</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-1">
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                Defina os intervalos e dias em que a IA pode sugerir chamadas e visitas.
                            </p>
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {APPOINTMENT_WINDOW_TYPE_OPTIONS.map((item) => {
                                const rule = windowConfigDraft[item.key];
                                const error = windowConfigErrors[item.key];
                                return (
                                    <div key={item.key} className={AI_SUBSECTION_CLASS}>
                                        <div className="mb-2 flex items-center justify-between">
                                            <Label className="text-xs font-semibold text-muted-foreground">{item.label}</Label>
                                            {error && (
                                                <span className="text-[11px] font-medium text-red-600">{error}</span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-muted-foreground">Início</Label>
                                                <Input
                                                    type="time"
                                                    value={rule.start}
                                                    onChange={(e) => handleWindowConfigTimeChange(item.key, 'start', e.target.value)}
                                                    disabled={!canEdit}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-muted-foreground">Fim</Label>
                                                <Input
                                                    type="time"
                                                    value={rule.end}
                                                    onChange={(e) => handleWindowConfigTimeChange(item.key, 'end', e.target.value)}
                                                    disabled={!canEdit}
                                                />
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {APPOINTMENT_DAY_OPTIONS.map((day) => {
                                                const active = rule.days.includes(day.key);
                                                return (
                                                    <Button
                                                        key={`${item.key}-${day.key}`}
                                                        type="button"
                                                        size="sm"
                                                        variant={active ? 'default' : 'outline'}
                                                        className="h-7 px-2 text-[11px]"
                                                        onClick={() => handleWindowConfigDayToggle(item.key, day.key)}
                                                        disabled={!canEdit}
                                                    >
                                                        {day.label}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            </div>

                            {canEdit && (
                                <div className="flex items-center justify-end gap-2">
                                    {windowConfigDirty && (
                                        <Button variant="outline" onClick={handleWindowConfigCancel}>
                                            Cancelar
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleWindowConfigSave}
                                        disabled={!windowConfigDirty || hasWindowConfigErrors}
                                        data-testid="appointment-window-config-save"
                                    >
                                        <Save className="mr-2 h-4 w-4" />
                                        Salvar Janela
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Agente de Apoio Global */}
                    <Card className={AI_SECTION_CARD_CLASS} data-testid="support-ai-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                        <Shield className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-sm">Agente de Apoio Global</h3>
                                        <p className="text-xs text-muted-foreground">Responde mensagens fora do horário e em etapas sem agente dedicado. Mantém o lead engajado.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="text-xs">
                                        {AI_SUPPORT_ELIGIBLE_STAGES.length} etapas elegíveis
                                    </Badge>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={handleEditSupportPrompt}
                                        disabled={!canEdit}
                                        data-testid="support-ai-edit-prompt-button"
                                    >
                                        <Pencil className="w-3 h-3 mr-1.5" />
                                        Editar Prompt
                                    </Button>
                                    <Switch
                                        data-testid="support-ai-toggle"
                                        checked={settings?.support_ai_enabled ?? true}
                                        onCheckedChange={(checked) => updateGlobalSettings({ support_ai_enabled: checked })}
                                        className="data-[state=checked]:bg-primary"
                                        disabled={!canEdit}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pipeline Agents - APENAS OS 5 ATIVOS */}
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Agentes de Pipeline</h2>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Agentes inteligentes que guiam o lead por cada etapa do funil de vendas.
                                    As demais etapas são operadas pelo vendedor ou por lembretes automáticos.
                                </p>
                            </div>
                            <Badge variant="outline" className="text-xs flex-shrink-0 border-border/60 bg-background/70">
                                {activeCount}/{ACTIVE_PIPELINE_AGENTS.length} ativos
                            </Badge>
                        </div>

                        <div className="space-y-3">
                            {ACTIVE_PIPELINE_AGENTS.map((agent) => {
                                const config = getStageConfigByKey(agent.stage);
                                const stageInfo = PIPELINE_STAGES[agent.stage];
                                const isEnabled = config?.is_active || false;
                                const effectivePrompt =
                                    config?.prompt_override ||
                                    config?.default_prompt ||
                                    DEFAULT_PROMPTS_BY_STAGE[agent.stage] ||
                                    agent.defaultPrompt;

                                return (
                                    <div key={agent.stage} data-testid={`ai-stage-row-${agent.stage}`}>
                                        <Card
                                            className={`${AI_SECTION_CARD_CLASS} transition-all ${isEnabled ? 'border-l-4 border-l-primary' : 'opacity-75'}`}
                                            data-testid={`ai-stage-card-${agent.stage}`}
                                        >
                                            <CardContent className="p-4">
                                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                                                {/* Stage icon */}
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stageInfo.color} bg-opacity-20`}>
                                                    <span className="text-lg">{stageInfo.icon}</span>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-semibold text-foreground">{agent.label}</span>
                                                        <Badge
                                                            variant={isEnabled ? "default" : "secondary"}
                                                            className={`h-5 px-2 text-[10px] ${isEnabled ? 'bg-primary/12 text-primary hover:bg-primary/12' : ''}`}
                                                        >
                                                            {isEnabled ? "Ativo" : "Desativado"}
                                                        </Badge>
                                                        <Badge variant="outline" className="h-5 border-border/60 px-2 text-[10px] text-foreground/72">
                                                            Versão {config?.prompt_override_version ?? 0}
                                                        </Badge>
                                                    </div>
                                                    <p className="mb-0.5 text-xs font-medium text-foreground/78">
                                                        🎯 {agent.objective}
                                                    </p>
                                                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                                                        Próxima etapa → {agent.nextStages}
                                                    </p>
                                                </div>

                                                {/* Controls */}
                                                <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-1.5 border-border/60 text-xs"
                                                        onClick={() => handleEditClick(agent, effectivePrompt)}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                        Editar Prompt
                                                    </Button>
                                                    <Switch
                                                        checked={isEnabled}
                                                        onCheckedChange={(checked) => updateStageConfig(agent.stage, { is_active: checked })}
                                                            className="data-[state=checked]:bg-primary"
                                                        disabled={!canEdit}
                                                    />
                                                </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Agentes Especiais</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Agentes transversais sem etapa fixa de pipeline.
                            </p>
                        </div>

                        {SPECIAL_AGENTS.map((agent) => {
                            const config = getStageConfigByKey(agent.stage);
                            const isEnabled = config?.is_active || false;

                            return (
                                <Card
                                    key={agent.stage}
                                    className={`${AI_SECTION_CARD_CLASS} transition-all ${isEnabled ? 'border-l-4 border-l-primary' : 'opacity-75'}`}
                                    data-testid={`ai-special-stage-card-${agent.stage}`}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted">
                                                <span className="text-lg">{agent.icon}</span>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-semibold text-foreground">{agent.label}</span>
                                                    <Badge
                                                        variant={isEnabled ? "default" : "secondary"}
                                                        className={`h-5 px-2 text-[10px] ${isEnabled ? 'bg-primary/12 text-primary hover:bg-primary/12' : ''}`}
                                                    >
                                                        {isEnabled ? "Ativo" : "Desativado"}
                                                    </Badge>
                                                    <Badge variant="outline" className="h-5 border-border/60 px-2 text-[10px] text-foreground/72">
                                                        Versão {config?.prompt_override_version ?? 0}
                                                    </Badge>
                                                </div>
                                                <p className="mb-0.5 text-xs font-medium text-foreground/78">
                                                    🎯 {agent.objective}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {agent.description}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
                                                {agent.stage === 'follow_up' && (
                                                    <Button
                                                        size="sm"
                                                        variant={followUpCadenceExpanded ? 'default' : 'outline'}
                                                        className="h-8 border-border/60 text-xs"
                                                        onClick={() => setFollowUpCadenceExpanded((prev) => !prev)}
                                                        disabled={!canEdit}
                                                    >
                                                        Controlar Etapas
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    className="h-8 gap-1.5 border-border/60 text-xs"
                                                    onClick={() => handleEditSpecialPrompt(agent.stage)}
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                    Editar Prompt
                                                </Button>
                                                <Switch
                                                    checked={isEnabled}
                                                    onCheckedChange={(checked) => {
                                                        void handleSpecialAgentToggle(agent.stage, checked);
                                                    }}
                                                    className="data-[state=checked]:bg-primary"
                                                    disabled={!canEdit}
                                                />
                                            </div>
                                        </div>

                                        {agent.stage === 'follow_up' && (
                                            <div className="mt-4 space-y-3 border-t border-border pt-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-xs font-semibold text-foreground/84">Controlador de Cadencia</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {followUpCadencePreview || 'Nenhuma etapa ativa'}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className="h-5 border-border/60 bg-background/70 px-2 text-[10px]">
                                                        {followUpEnabledSteps}/5 etapas ativas
                                                    </Badge>
                                                </div>

                                                <div className="space-y-3 rounded-xl border border-border/55 bg-muted/24 px-4 py-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <p className="text-xs font-semibold text-foreground/84">Janela Comercial do Follow-up</p>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                O worker so dispara follow-up dentro desta janela e nos dias selecionados.
                                                            </p>
                                                        </div>
                                                        {hasFollowUpWindowErrors && (
                                                            <span className="text-[11px] font-medium text-red-600">{followUpWindowError}</span>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Inicio</Label>
                                                            <Input
                                                                type="time"
                                                                value={followUpWindowDraft.start}
                                                                onChange={(event) => handleFollowUpWindowTimeChange('start', event.target.value)}
                                                                disabled={!canEdit}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Fim</Label>
                                                            <Input
                                                                type="time"
                                                                value={followUpWindowDraft.end}
                                                                onChange={(event) => handleFollowUpWindowTimeChange('end', event.target.value)}
                                                                disabled={!canEdit}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Horario preferencial (opcional)</Label>
                                                            <Input
                                                                type="time"
                                                                value={followUpWindowDraft.preferred_time || ''}
                                                                onChange={(event) => handleFollowUpWindowTimeChange('preferred_time', event.target.value)}
                                                                disabled={!canEdit}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-1.5">
                                                        {APPOINTMENT_DAY_OPTIONS.map((day) => {
                                                            const active = followUpWindowDraft.days.includes(day.key);
                                                            return (
                                                                <Button
                                                                    key={`follow-up-window-${day.key}`}
                                                                    type="button"
                                                                    size="sm"
                                                                    variant={active ? 'default' : 'outline'}
                                                                    className="h-7 px-2 text-[11px]"
                                                                    onClick={() => handleFollowUpWindowDayToggle(day.key)}
                                                                    disabled={!canEdit}
                                                                >
                                                                    {day.label}
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs"
                                                            onClick={handleFollowUpWindowCancel}
                                                            disabled={!canEdit || !followUpWindowDirty}
                                                        >
                                                            Reverter Janela
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className="h-8 text-xs"
                                                            onClick={handleFollowUpWindowSave}
                                                            disabled={!canEdit || !followUpWindowDirty || hasFollowUpWindowErrors}
                                                        >
                                                            Salvar Janela
                                                        </Button>
                                                    </div>
                                                </div>

                                                {followUpCadenceExpanded && (
                                                    <div className="space-y-2.5">
                                                        {followUpCadenceDraft.map((item) => (
                                                            <div
                                                                key={item.step}
                                                                className="grid grid-cols-1 gap-2 rounded-xl border border-border/45 bg-background/60 px-3 py-3 md:grid-cols-[auto_1fr_auto_auto] md:items-center"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Switch
                                                                        checked={item.enabled}
                                                                        onCheckedChange={(checked) => handleFollowUpCadenceToggle(item.step, checked)}
                                                                        className="data-[state=checked]:bg-primary"
                                                                        disabled={!canEdit}
                                                                    />
                                                                    <span className="text-xs font-semibold text-foreground/84">Etapa {item.step}</span>
                                                                </div>

                                                                <div className="text-[11px] text-muted-foreground md:pr-2">
                                                                    {item.enabled ? 'Disparo automatico ativo' : 'Etapa pausada'}
                                                                </div>

                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    step={1}
                                                                    value={item.value}
                                                                    onChange={(event) =>
                                                                        handleFollowUpCadenceValueChange(
                                                                            item.step,
                                                                            Number(event.target.value || 0),
                                                                        )
                                                                    }
                                                                    className="h-8 w-20 text-xs"
                                                                    disabled={!canEdit || !item.enabled}
                                                                />

                                                                <Select
                                                                    value={item.unit}
                                                                    onValueChange={(value) => handleFollowUpCadenceUnitChange(item.step, value as FollowUpCadenceUnit)}
                                                                    disabled={!canEdit || !item.enabled}
                                                                >
                                                                        <SelectTrigger className="h-8 w-[92px] text-xs">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {Object.entries(FOLLOW_UP_UNIT_LABEL).map(([key, label]) => (
                                                                            <SelectItem key={key} value={key} className="text-xs">
                                                                                {label}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>

                                                                {followUpCadenceErrors[item.step] && (
                                                                    <div className="col-span-4 text-[11px] text-red-600">
                                                                        {followUpCadenceErrors[item.step]}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Padrao do sistema: E1 3h {'->'} E2 1d {'->'} E3 2d {'->'} E4 3d {'->'} E5 7d.
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs"
                                                            onClick={handleFollowUpCadenceCancel}
                                                            disabled={!canEdit || !followUpCadenceDirty}
                                                        >
                                                            Reverter
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className="h-8 text-xs"
                                                            onClick={handleFollowUpCadenceSave}
                                                            disabled={!canEdit || !followUpCadenceDirty || hasFollowUpCadenceErrors}
                                                        >
                                                            Salvar Cadencia
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Floating Save Bar */}
                </div>
            </div>

            {hasUnsavedChanges && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card/96 p-4 shadow-[0_22px_56px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:shadow-[0_22px_56px_-28px_rgba(2,6,23,0.65)]">
                        <span className="text-sm font-medium text-muted-foreground">Alterações não salvas</span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={handleCancelNameChange} className="h-9">
                                ✕ Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSaveNameChange} className="bg-primary hover:bg-primary/90 text-white h-9">
                                <Save className="w-4 h-4 mr-2" /> Salvar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Warning Dialog */}
            <Dialog open={isWarningOpen} onOpenChange={setIsWarningOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            Editar prompt do agente
                        </DialogTitle>
                        <DialogDescription className="pt-2 text-foreground/80">
                            <p className="font-medium">Atenção: editar as instruções pode prejudicar o funcionamento do agente.</p>
                            <p className="mt-2 text-sm">Os prompts padrão foram exaustivamente testados para garantir conversão e humanização. Faça alterações apenas se souber exatamente o que está fazendo.</p>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsWarningOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmWarning}>Continuar Edição</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Editor Dialog */}
            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>
                            Editor de Agente: {editingStageTitle}
                        </DialogTitle>
                        <DialogDescription>
                            {editingAgent && (
                                <span>🎯 {editingAgent.objective} - Próxima etapa {'->'} {editingAgent.nextStages}</span>
                            )}
                            {!editingAgent && editingSpecialAgent && (
                                <span>🎯 {editingSpecialAgent.objective}</span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 py-4 min-h-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="h-5 px-2 text-[10px]">
                                Versão {editingPromptVersion}
                            </Badge>
                            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                {promptLength} caracteres
                            </Badge>
                            {promptWarnings.map((warning) => (
                                <Badge
                                    key={warning}
                                    variant="outline"
                                    className="h-5 border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-800"
                                >
                                    {warning}
                                </Badge>
                            ))}
                            {promptWarnings.length > 0 && (
                                <span className="text-[11px] text-muted-foreground">Avisos não bloqueiam o salvamento.</span>
                            )}
                        </div>
                        <Textarea
                            className="h-full resize-none font-mono text-sm"
                            value={tempPrompt}
                            onChange={(e) => setTempPrompt(e.target.value)}
                        />
                    </div>
                    <DialogFooter className="flex justify-between items-center sm:justify-between">
                        <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={handleRestoreDefault}>
                            <RefreshCcw className="w-4 h-4 mr-2" /> Restaurar Padrão
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSavePrompt}>
                                <Save className="w-4 h-4 mr-2" /> Salvar Alterações
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Restore default confirm dialog (replaces window.confirm) */}
            <Dialog open={isRestoreConfirmOpen} onOpenChange={setIsRestoreConfirmOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Restaurar Prompt Padrão</DialogTitle>
                        <DialogDescription>
                            Isso vai restaurar o prompt desta etapa para o padrão do sistema. Continuar?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRestoreConfirmOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={async () => {
                            if (editingStage) {
                                await restoreDefaultPrompt(editingStage);
                                setIsEditorOpen(false);
                                setEditingStage(null);
                                setEditingAgent(null);
                            }
                            setIsRestoreConfirmOpen(false);
                        }}>Restaurar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
