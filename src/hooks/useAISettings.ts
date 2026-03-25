import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  AISettings,
  AIStageConfig,
  DEFAULT_AI_SETTINGS,
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getDefaultStageGoal, getDefaultStagePrompt } from '@/constants/aiPipelinePdfPrompts';
import { normalizeSupportedTimezone } from '@/lib/timezones';

const STAGE_COL = 'pipeline_stage';
const LEGACY_COL = 'status_pipeline';
const STAGE_CONFIG_REQUIRED_FIELDS =
  'id, org_id, is_active, agent_goal, default_prompt, prompt_override, updated_at';
const STAGE_CONFIG_VERSION_FIELD = 'prompt_override_version';
const STAGE_SCHEMA_ERRORS = new Set(['PGRST204', '42703']);
const SETTINGS_SCHEMA_ERRORS = new Set(['PGRST204', '42703']);

const isStageSchemaMismatch = (error: any): boolean => {
  const code = typeof error?.code === 'string' ? error.code : '';
  return STAGE_SCHEMA_ERRORS.has(code);
};

const isSettingsSchemaMismatch = (error: any): boolean => {
  const code = typeof error?.code === 'string' ? error.code : '';
  return SETTINGS_SCHEMA_ERRORS.has(code);
};

const stageConfigSelect = (stageCol: string, includeVersion = true): string => {
  const baseFields = includeVersion
    ? `${STAGE_CONFIG_REQUIRED_FIELDS}, ${STAGE_CONFIG_VERSION_FIELD}`
    : STAGE_CONFIG_REQUIRED_FIELDS;
  return `${baseFields}, ${stageCol}`;
};

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

const stripPromptVersionField = (updates: Partial<AIStageConfig>): Partial<AIStageConfig> => {
  if (!hasOwn(updates as object, 'prompt_override_version')) return updates;
  const { prompt_override_version, ...rest } = updates;
  return rest;
};

const stageUpdateVariants = (updates: Partial<AIStageConfig>): Partial<AIStageConfig>[] => {
  const variants: Partial<AIStageConfig>[] = [updates];
  const stripped = stripPromptVersionField(updates);
  if (stripped !== updates) variants.push(stripped);
  return variants;
};

const normalizeStageConfig = (row: any): AIStageConfig => ({
  ...row,
  status_pipeline: row?.[STAGE_COL] ?? row?.[LEGACY_COL] ?? 'novo_lead',
  prompt_override_version:
    typeof row?.prompt_override_version === 'number' && Number.isFinite(row.prompt_override_version)
      ? row.prompt_override_version
      : 0,
});

const getStageKey = (row: Partial<AIStageConfig> | undefined): string =>
  row?.status_pipeline ?? ((row as any)?.[LEGACY_COL] as string) ?? 'novo_lead';

const APPOINTMENT_WINDOW_TYPES: AppointmentWindowType[] = ['call', 'visit', 'meeting', 'installation'];
const APPOINTMENT_DAY_KEYS: AppointmentDayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FOLLOW_UP_STEP_KEYS: FollowUpStepKey[] = [1, 2, 3, 4, 5];
const FOLLOW_UP_DELAY_MIN_MINUTES = 5;
const FOLLOW_UP_DELAY_MAX_MINUTES = 365 * 24 * 60;
const AUTO_SCHEDULE_MIN_DAYS_MIN = 0;
const AUTO_SCHEDULE_MIN_DAYS_MAX = 60;

const normalizeTimeHHMM = (raw: unknown, fallback: string): string => {
  const text = String(raw ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizeDayKey = (raw: unknown): AppointmentDayKey | null => {
  const value = String(raw ?? '').trim().toLowerCase();
  return APPOINTMENT_DAY_KEYS.includes(value as AppointmentDayKey) ? (value as AppointmentDayKey) : null;
};

const normalizeAppointmentWindowConfig = (raw: unknown): AppointmentWindowConfig => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const normalized: AppointmentWindowConfig = {
    call: { ...DEFAULT_APPOINTMENT_WINDOW_CONFIG.call, days: [...DEFAULT_APPOINTMENT_WINDOW_CONFIG.call.days] },
    visit: { ...DEFAULT_APPOINTMENT_WINDOW_CONFIG.visit, days: [...DEFAULT_APPOINTMENT_WINDOW_CONFIG.visit.days] },
    meeting: { ...DEFAULT_APPOINTMENT_WINDOW_CONFIG.meeting, days: [...DEFAULT_APPOINTMENT_WINDOW_CONFIG.meeting.days] },
    installation: { ...DEFAULT_APPOINTMENT_WINDOW_CONFIG.installation, days: [...DEFAULT_APPOINTMENT_WINDOW_CONFIG.installation.days] },
  };

  for (const typeKey of APPOINTMENT_WINDOW_TYPES) {
    const incoming = source[typeKey];
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;
    const defaultRule = DEFAULT_APPOINTMENT_WINDOW_CONFIG[typeKey];
    const start = normalizeTimeHHMM(incoming.start, defaultRule.start);
    const end = normalizeTimeHHMM(incoming.end, defaultRule.end);
    const days = Array.isArray(incoming.days)
      ? Array.from(new Set(incoming.days.map((day: unknown) => normalizeDayKey(day)).filter(Boolean))) as AppointmentDayKey[]
      : [];
    normalized[typeKey] = {
      start,
      end,
      days: days.length > 0 ? days : [...defaultRule.days],
    };
  }

  return normalized;
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
        FOLLOW_UP_DELAY_MIN_MINUTES,
        Math.min(FOLLOW_UP_DELAY_MAX_MINUTES, Math.round(delayRaw)),
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

const normalizeFollowUpWindowConfig = (raw: unknown): FollowUpWindowConfig => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const start = normalizeTimeHHMM(source.start, DEFAULT_FOLLOW_UP_WINDOW_CONFIG.start);
  const end = normalizeTimeHHMM(source.end, DEFAULT_FOLLOW_UP_WINDOW_CONFIG.end);
  const days = Array.isArray(source.days)
    ? Array.from(new Set(source.days.map((day: unknown) => normalizeDayKey(day)).filter(Boolean))) as AppointmentDayKey[]
    : [];
  const preferredTime = (() => {
    const rawValue = String(source.preferred_time ?? '').trim();
    if (!rawValue) return null;
    return normalizeTimeHHMM(rawValue, '');
  })();

  return {
    start,
    end,
    days: days.length > 0 ? days : [...DEFAULT_FOLLOW_UP_WINDOW_CONFIG.days],
    preferred_time: preferredTime || null,
  };
};

const normalizeBooleanSetting = (raw: unknown, fallback: boolean): boolean =>
  typeof raw === 'boolean' ? raw : fallback;

const normalizeMinDaysSetting = (raw: unknown, fallback: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(
    AUTO_SCHEDULE_MIN_DAYS_MIN,
    Math.min(AUTO_SCHEDULE_MIN_DAYS_MAX, Math.round(parsed)),
  );
};

const normalizeTimezone = (raw: unknown, fallback: string): string => {
  return normalizeSupportedTimezone(raw, fallback);
};

const normalizeOptionalUuid = (raw: unknown): string | null => {
  const value = String(raw ?? '').trim();
  return value ? value : null;
};

const stripAutoScheduleAssigneeFields = (updates: Partial<AISettings>): Partial<AISettings> => {
  const next = { ...updates };
  if (Object.prototype.hasOwnProperty.call(next, 'auto_schedule_call_assign_to_user_id')) {
    delete (next as any).auto_schedule_call_assign_to_user_id;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'auto_schedule_visit_assign_to_user_id')) {
    delete (next as any).auto_schedule_visit_assign_to_user_id;
  }
  return next;
};

const toStageTitle = (stage: string): string =>
  stage
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const getStageSeedDefaults = (stage: string): Pick<AIStageConfig, 'is_active' | 'agent_goal' | 'default_prompt'> => {
  const stageTitle = toStageTitle(stage);
  return {
    is_active: true,
    agent_goal: getDefaultStageGoal(stage),
    default_prompt: getDefaultStagePrompt(stage, stageTitle),
  };
};

type StageUpdateResult = {
  stageColUsed: string;
  hasRowAfterUpdate: boolean;
};

const fetchStageConfigsRows = async (orgId: string) => {
  const attempts: Array<{ stageCol: string; includeVersion: boolean }> = [
    { stageCol: STAGE_COL, includeVersion: true },
    { stageCol: STAGE_COL, includeVersion: false },
    { stageCol: LEGACY_COL, includeVersion: true },
    { stageCol: LEGACY_COL, includeVersion: false },
  ];

  let lastSchemaError: any = null;

  for (const attempt of attempts) {
    const resp = await supabase
      .from('ai_stage_config')
      .select(stageConfigSelect(attempt.stageCol, attempt.includeVersion))
      .eq('org_id', orgId)
      .order('id');

    if (!resp.error) return resp.data || [];

    if (isStageSchemaMismatch(resp.error)) {
      lastSchemaError = resp.error;
      continue;
    }

    throw resp.error;
  }

  if (lastSchemaError) throw lastSchemaError;
  return [];
};

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [stageConfigs, setStageConfigs] = useState<AIStageConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { orgId } = useAuth();

  const didInitOrgId = useRef(false);

  const fetchSettings = useCallback(async () => {
    if (!orgId) {
      setSettings(null);
      setStageConfigs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data: settingsData, error: settingsError } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle();

      if (settingsError) {
        console.error('Error fetching AI settings:', settingsError);
      } else if (!settingsData) {
        setSettings(null);
      } else {
        const timezone = normalizeTimezone(
          (settingsData as any)?.timezone,
          DEFAULT_AI_SETTINGS.timezone || 'America/Sao_Paulo',
        );
        const normalizedSettings: AISettings = {
          ...settingsData,
          timezone,
          auto_schedule_call_enabled: normalizeBooleanSetting(
            (settingsData as any)?.auto_schedule_call_enabled,
            DEFAULT_AI_SETTINGS.auto_schedule_call_enabled ?? true,
          ),
          auto_schedule_visit_enabled: normalizeBooleanSetting(
            (settingsData as any)?.auto_schedule_visit_enabled,
            DEFAULT_AI_SETTINGS.auto_schedule_visit_enabled ?? true,
          ),
          auto_schedule_call_min_days: normalizeMinDaysSetting(
            (settingsData as any)?.auto_schedule_call_min_days,
            DEFAULT_AI_SETTINGS.auto_schedule_call_min_days ?? 0,
          ),
          auto_schedule_visit_min_days: normalizeMinDaysSetting(
            (settingsData as any)?.auto_schedule_visit_min_days,
            DEFAULT_AI_SETTINGS.auto_schedule_visit_min_days ?? 0,
          ),
          auto_schedule_call_assign_to_user_id: normalizeOptionalUuid(
            (settingsData as any)?.auto_schedule_call_assign_to_user_id
          ),
          auto_schedule_visit_assign_to_user_id: normalizeOptionalUuid(
            (settingsData as any)?.auto_schedule_visit_assign_to_user_id
          ),
          appointment_window_config: normalizeAppointmentWindowConfig((settingsData as any)?.appointment_window_config),
          follow_up_sequence_config: normalizeFollowUpSequenceConfig((settingsData as any)?.follow_up_sequence_config),
          follow_up_window_config: normalizeFollowUpWindowConfig((settingsData as any)?.follow_up_window_config),
        };
        setSettings(normalizedSettings);

        if (!settingsData.org_id && !didInitOrgId.current) {
          didInitOrgId.current = true;
          const { error: updateErr } = await supabase
            .from('ai_settings')
            .update({ org_id: orgId })
            .eq('id', settingsData.id);

          if (!updateErr) {
            setSettings({ ...normalizedSettings, org_id: orgId });
          }
        }
      }

      try {
        const stagesData = await fetchStageConfigsRows(orgId);
        setStageConfigs((stagesData || []).map(normalizeStageConfig));
      } catch (stagesError) {
        console.error('Error fetching AI stages:', stagesError);
      }
    } catch (error) {
      console.error('Unexpected error in useAISettings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchSettings();

    if (!orgId) return;

    const settingsSub = supabase
      .channel(`ai_settings_changes_${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_settings', filter: `org_id=eq.${orgId}` },
        () => {
          void fetchSettings();
        },
      )
      .subscribe();

    const stageSub = supabase
      .channel(`ai_stage_config_changes_${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_stage_config', filter: `org_id=eq.${orgId}` },
        () => {
          void fetchSettings();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsSub);
      supabase.removeChannel(stageSub);
    };
  }, [fetchSettings, orgId]);

  const updateGlobalSettings = async (updates: Partial<AISettings>) => {
    try {
      if (!orgId) throw new Error('Organização não vinculada ao usuário');
      const normalizedUpdates: Partial<AISettings> = {
        ...updates,
      };

      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'timezone')) {
        normalizedUpdates.timezone = normalizeTimezone(
          (normalizedUpdates as any).timezone,
          settings?.timezone || DEFAULT_AI_SETTINGS.timezone || 'America/Sao_Paulo',
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'auto_schedule_call_enabled')) {
        normalizedUpdates.auto_schedule_call_enabled = normalizeBooleanSetting(
          (normalizedUpdates as any).auto_schedule_call_enabled,
          settings?.auto_schedule_call_enabled ?? DEFAULT_AI_SETTINGS.auto_schedule_call_enabled ?? true,
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'auto_schedule_visit_enabled')) {
        normalizedUpdates.auto_schedule_visit_enabled = normalizeBooleanSetting(
          (normalizedUpdates as any).auto_schedule_visit_enabled,
          settings?.auto_schedule_visit_enabled ?? DEFAULT_AI_SETTINGS.auto_schedule_visit_enabled ?? true,
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'auto_schedule_call_min_days')) {
        normalizedUpdates.auto_schedule_call_min_days = normalizeMinDaysSetting(
          (normalizedUpdates as any).auto_schedule_call_min_days,
          settings?.auto_schedule_call_min_days ?? DEFAULT_AI_SETTINGS.auto_schedule_call_min_days ?? 0,
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'auto_schedule_visit_min_days')) {
        normalizedUpdates.auto_schedule_visit_min_days = normalizeMinDaysSetting(
          (normalizedUpdates as any).auto_schedule_visit_min_days,
          settings?.auto_schedule_visit_min_days ?? DEFAULT_AI_SETTINGS.auto_schedule_visit_min_days ?? 0,
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'auto_schedule_call_assign_to_user_id')) {
        normalizedUpdates.auto_schedule_call_assign_to_user_id = normalizeOptionalUuid(
          (normalizedUpdates as any).auto_schedule_call_assign_to_user_id
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'auto_schedule_visit_assign_to_user_id')) {
        normalizedUpdates.auto_schedule_visit_assign_to_user_id = normalizeOptionalUuid(
          (normalizedUpdates as any).auto_schedule_visit_assign_to_user_id
        );
      }

      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'appointment_window_config')) {
        normalizedUpdates.appointment_window_config = normalizeAppointmentWindowConfig(
          (normalizedUpdates as any).appointment_window_config
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'follow_up_sequence_config')) {
        normalizedUpdates.follow_up_sequence_config = normalizeFollowUpSequenceConfig(
          (normalizedUpdates as any).follow_up_sequence_config
        );
      }
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'follow_up_window_config')) {
        normalizedUpdates.follow_up_window_config = normalizeFollowUpWindowConfig(
          (normalizedUpdates as any).follow_up_window_config
        );
      }

      if (!settings?.id) {
        const initialConfig = normalizeAppointmentWindowConfig(
          (normalizedUpdates as any).appointment_window_config || DEFAULT_APPOINTMENT_WINDOW_CONFIG
        );
        const initialFollowUpSequence = normalizeFollowUpSequenceConfig(
          (normalizedUpdates as any).follow_up_sequence_config || DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG
        );
        const initialFollowUpWindow = normalizeFollowUpWindowConfig(
          (normalizedUpdates as any).follow_up_window_config || DEFAULT_FOLLOW_UP_WINDOW_CONFIG
        );
        const insertPayload: Partial<AISettings> = {
          ...DEFAULT_AI_SETTINGS,
          ...normalizedUpdates,
          timezone: normalizeTimezone(
            (normalizedUpdates as any).timezone,
            DEFAULT_AI_SETTINGS.timezone || 'America/Sao_Paulo',
          ),
          auto_schedule_call_enabled: normalizeBooleanSetting(
            (normalizedUpdates as any).auto_schedule_call_enabled,
            DEFAULT_AI_SETTINGS.auto_schedule_call_enabled ?? true,
          ),
          auto_schedule_visit_enabled: normalizeBooleanSetting(
            (normalizedUpdates as any).auto_schedule_visit_enabled,
            DEFAULT_AI_SETTINGS.auto_schedule_visit_enabled ?? true,
          ),
          auto_schedule_call_min_days: normalizeMinDaysSetting(
            (normalizedUpdates as any).auto_schedule_call_min_days,
            DEFAULT_AI_SETTINGS.auto_schedule_call_min_days ?? 0,
          ),
          auto_schedule_visit_min_days: normalizeMinDaysSetting(
            (normalizedUpdates as any).auto_schedule_visit_min_days,
            DEFAULT_AI_SETTINGS.auto_schedule_visit_min_days ?? 0,
          ),
          auto_schedule_call_assign_to_user_id: normalizeOptionalUuid(
            (normalizedUpdates as any).auto_schedule_call_assign_to_user_id
          ),
          auto_schedule_visit_assign_to_user_id: normalizeOptionalUuid(
            (normalizedUpdates as any).auto_schedule_visit_assign_to_user_id
          ),
          appointment_window_config: initialConfig,
          follow_up_sequence_config: initialFollowUpSequence,
          follow_up_window_config: initialFollowUpWindow,
          org_id: orgId
        };

        let { error } = await supabase
          .from('ai_settings')
          .insert([insertPayload])
          .select()
          .single();

        if (error && isSettingsSchemaMismatch(error)) {
          const fallbackPayload = stripAutoScheduleAssigneeFields(insertPayload);
          const retry = await supabase
            .from('ai_settings')
            .insert([fallbackPayload])
            .select()
            .single();
          error = retry.error;
        }

        if (error) throw error;
      } else {
        let { error } = await supabase
          .from('ai_settings')
          .update(normalizedUpdates)
          .eq('id', settings.id)
          .eq('org_id', orgId);

        if (error && isSettingsSchemaMismatch(error)) {
          const fallbackUpdates = stripAutoScheduleAssigneeFields(normalizedUpdates);
          const retry = await supabase
            .from('ai_settings')
            .update(fallbackUpdates)
            .eq('id', settings.id)
            .eq('org_id', orgId);
          error = retry.error;
        }

        if (error) throw error;
      }

      toast({ title: 'Configurações atualizadas!' });
      await fetchSettings();
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const updateExistingStageRow = async (
    stage: string,
    orgIdValue: string,
    updates: Partial<AIStageConfig>,
  ): Promise<StageUpdateResult> => {
    let lastSchemaError: any = null;

    for (const stageColUsed of [STAGE_COL, LEGACY_COL]) {
      for (const updateVariant of stageUpdateVariants(updates)) {
        const updateResp = await supabase
          .from('ai_stage_config')
          .update(updateVariant)
          .eq(stageColUsed, stage)
          .eq('org_id', orgIdValue)
          .select(stageConfigSelect(stageColUsed, false))
          .maybeSingle();

        if (!updateResp.error) {
          return {
            stageColUsed,
            hasRowAfterUpdate: Boolean(updateResp.data),
          };
        }

        if (isStageSchemaMismatch(updateResp.error)) {
          lastSchemaError = updateResp.error;
          continue;
        }

        throw updateResp.error;
      }
    }

    if (lastSchemaError) throw lastSchemaError;
    throw new Error('Unable to update ai_stage_config row');
  };

  const upsertStageRow = async (
    stage: string,
    stageColUsed: string,
    orgIdValue: string,
    updates: Partial<AIStageConfig>,
  ) => {
    const stageSeed = getStageSeedDefaults(stage);
    const stageColAttempts =
      stageColUsed === LEGACY_COL ? [LEGACY_COL, STAGE_COL] : [STAGE_COL, LEGACY_COL];
    let lastSchemaError: any = null;

    for (const stageColCandidate of stageColAttempts) {
      const conflictCols = stageColCandidate === LEGACY_COL ? 'org_id,status_pipeline' : 'org_id,pipeline_stage';

      for (const updateVariant of stageUpdateVariants(updates)) {
        const payload = {
          org_id: orgIdValue,
          [stageColCandidate]: stage,
          ...stageSeed,
          ...updateVariant,
        };

        const upsertResp = await supabase
          .from('ai_stage_config')
          .upsert(payload, { onConflict: conflictCols })
          .select(stageConfigSelect(stageColCandidate, false))
          .maybeSingle();

        if (!upsertResp.error) return;

        if (isStageSchemaMismatch(upsertResp.error)) {
          lastSchemaError = upsertResp.error;
          continue;
        }

        throw upsertResp.error;
      }
    }

    if (lastSchemaError) throw lastSchemaError;
    throw new Error('Unable to upsert ai_stage_config row');
  };

  const withPromptVersion = (stage: string | number, updates: Partial<AIStageConfig>): Partial<AIStageConfig> => {
    if (!hasOwn(updates as object, 'prompt_override')) return updates;

    const currentVersion =
      typeof stage === 'number'
        ? (stageConfigs.find((cfg) => cfg.id === stage)?.prompt_override_version ?? 0)
        : (stageConfigs.find((cfg) => cfg.status_pipeline === String(stage))?.prompt_override_version ?? 0);

    const safeCurrentVersion = Number.isFinite(Number(currentVersion)) ? Number(currentVersion) : 0;
    return {
      ...updates,
      prompt_override_version: Math.max(0, safeCurrentVersion) + 1,
    };
  };

  const updateStageConfig = async (stage: string | number, updates: Partial<AIStageConfig>) => {
    try {
      if (!orgId) throw new Error('Organização não vinculada ao usuário');
      const effectiveUpdates = withPromptVersion(stage, updates);

      if (typeof stage === 'number') {
        let { error } = await supabase
          .from('ai_stage_config')
          .update(effectiveUpdates)
          .eq('id', stage)
          .eq('org_id', orgId);

        if (error && isStageSchemaMismatch(error)) {
          const fallbackUpdates = stripPromptVersionField(effectiveUpdates);
          if (fallbackUpdates !== effectiveUpdates) {
            const retry = await supabase
              .from('ai_stage_config')
              .update(fallbackUpdates)
              .eq('id', stage)
              .eq('org_id', orgId);
            error = retry.error;
          }
        }

        if (error) throw error;
      } else {
        const stageKey = String(stage);
        const updateResult = await updateExistingStageRow(stageKey, orgId, effectiveUpdates);

        if (!updateResult.hasRowAfterUpdate) {
          await upsertStageRow(stageKey, updateResult.stageColUsed, orgId, effectiveUpdates);
        }
      }

      toast({ title: 'Agente atualizado!' });
      await fetchSettings();
    } catch (error) {
      console.error('Error updating stage config:', error);
      toast({ title: 'Erro ao atualizar agente', variant: 'destructive' });
    }
  };

  const restoreDefaultPrompt = async (stage: string) => updateStageConfig(stage, { prompt_override: null });

  return {
    settings: settings || (DEFAULT_AI_SETTINGS as AISettings),
    stageConfigs,
    loading: isLoading,
    updateGlobalSettings,
    updateStageConfig,
    restoreDefaultPrompt,
    refresh: fetchSettings,
  };
}

