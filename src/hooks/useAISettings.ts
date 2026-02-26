import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AISettings, AIStageConfig, DEFAULT_AI_SETTINGS } from '@/types/ai';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const STAGE_COL = 'pipeline_stage';
const LEGACY_COL = 'status_pipeline';
const STAGE_CONFIG_REQUIRED_FIELDS =
  'id, org_id, is_active, agent_goal, default_prompt, prompt_override, updated_at';
const STAGE_CONFIG_VERSION_FIELD = 'prompt_override_version';
const STAGE_SCHEMA_ERRORS = new Set(['PGRST204', '42703']);

const isStageSchemaMismatch = (error: any): boolean => {
  const code = typeof error?.code === 'string' ? error.code : '';
  return STAGE_SCHEMA_ERRORS.has(code);
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
    agent_goal: `Conduzir o lead com clareza na etapa ${stageTitle}.`,
    default_prompt:
      `Voce e um consultor solar experiente. Atue na etapa ${stageTitle}, ` +
      'mantenha linguagem objetiva e avance o lead para o proximo passo.',
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
        setSettings(settingsData);

        if (!settingsData.org_id && !didInitOrgId.current) {
          didInitOrgId.current = true;
          const { error: updateErr } = await supabase
            .from('ai_settings')
            .update({ org_id: orgId })
            .eq('id', settingsData.id);

          if (!updateErr) {
            setSettings({ ...settingsData, org_id: orgId });
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
      if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

      if (!settings?.id) {
        const { error } = await supabase
          .from('ai_settings')
          .insert([{ ...DEFAULT_AI_SETTINGS, ...updates, org_id: orgId }])
          .select()
          .single();

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_settings')
          .update(updates)
          .eq('id', settings.id)
          .eq('org_id', orgId);

        if (error) throw error;
      }

      toast({ title: 'Configuracoes atualizadas!' });
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
      if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');
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
