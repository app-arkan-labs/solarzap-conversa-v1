import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AISettings, AIStageConfig, DEFAULT_AI_SETTINGS } from '@/types/ai';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const STAGE_COL = 'pipeline_stage';
const LEGACY_COL = 'status_pipeline';
const STAGE_CONFIG_BASE_FIELDS =
  'id, org_id, is_active, agent_goal, default_prompt, prompt_override, updated_at';
const STAGE_SCHEMA_ERRORS = new Set(['PGRST204', '42703']);

const isStageSchemaMismatch = (error: any): boolean => {
  const code = typeof error?.code === 'string' ? error.code : '';
  return STAGE_SCHEMA_ERRORS.has(code);
};

const stageConfigSelect = (stageCol: string): string => `${STAGE_CONFIG_BASE_FIELDS}, ${stageCol}`;

const normalizeStageConfig = (row: any): AIStageConfig => ({
  ...row,
  status_pipeline: row?.[STAGE_COL] ?? row?.[LEGACY_COL] ?? 'novo_lead',
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

      let { data: stagesData, error: stagesError } = await supabase
        .from('ai_stage_config')
        .select(stageConfigSelect(STAGE_COL))
        .eq('org_id', orgId)
        .order('id');

      if (stagesError && isStageSchemaMismatch(stagesError)) {
        const legacyFetch = await supabase
          .from('ai_stage_config')
          .select(stageConfigSelect(LEGACY_COL))
          .eq('org_id', orgId)
          .order('id');
        stagesData = legacyFetch.data;
        stagesError = legacyFetch.error;
      }

      if (stagesError) {
        console.error('Error fetching AI stages:', stagesError);
      } else {
        setStageConfigs((stagesData || []).map(normalizeStageConfig));
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
    let stageColUsed = STAGE_COL;
    let updateResp = await supabase
      .from('ai_stage_config')
      .update(updates)
      .eq(stageColUsed, stage)
      .eq('org_id', orgIdValue)
      .select(stageConfigSelect(stageColUsed))
      .maybeSingle();

    if (updateResp.error && isStageSchemaMismatch(updateResp.error)) {
      stageColUsed = LEGACY_COL;
      updateResp = await supabase
        .from('ai_stage_config')
        .update(updates)
        .eq(stageColUsed, stage)
        .eq('org_id', orgIdValue)
        .select(stageConfigSelect(stageColUsed))
        .maybeSingle();
    }

    if (updateResp.error) {
      throw updateResp.error;
    }

    return {
      stageColUsed,
      hasRowAfterUpdate: Boolean(updateResp.data),
    };
  };

  const upsertStageRow = async (
    stage: string,
    stageColUsed: string,
    orgIdValue: string,
    updates: Partial<AIStageConfig>,
  ) => {
    const stageSeed = getStageSeedDefaults(stage);
    const payload = {
      org_id: orgIdValue,
      [stageColUsed]: stage,
      ...stageSeed,
      ...updates,
    };

    const conflictCols = stageColUsed === LEGACY_COL ? 'org_id,status_pipeline' : 'org_id,pipeline_stage';
    let upsertResp = await supabase
      .from('ai_stage_config')
      .upsert(payload, { onConflict: conflictCols })
      .select(stageConfigSelect(stageColUsed))
      .maybeSingle();

    if (upsertResp.error && stageColUsed === LEGACY_COL) {
      const retryPayload = {
        org_id: orgIdValue,
        [STAGE_COL]: stage,
        ...stageSeed,
        ...updates,
      };
      upsertResp = await supabase
        .from('ai_stage_config')
        .upsert(retryPayload, { onConflict: 'org_id,pipeline_stage' })
        .select(stageConfigSelect(STAGE_COL))
        .maybeSingle();
    }

    if (upsertResp.error) {
      throw upsertResp.error;
    }
  };

  const updateStageConfig = async (stage: string | number, updates: Partial<AIStageConfig>) => {
    try {
      if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

      if (typeof stage === 'number') {
        const { error } = await supabase
          .from('ai_stage_config')
          .update(updates)
          .eq('id', stage)
          .eq('org_id', orgId);

        if (error) throw error;
      } else {
        const stageKey = String(stage);
        const updateResult = await updateExistingStageRow(stageKey, orgId, updates);

        if (!updateResult.hasRowAfterUpdate) {
          await upsertStageRow(stageKey, updateResult.stageColUsed, orgId, updates);
        }
      }

      toast({ title: 'Agente atualizado!' });
      await fetchSettings();
    } catch (error) {
      console.error('Error updating stage config:', error);
      toast({ title: 'Erro ao atualizar agente', variant: 'destructive' });
    }
  };

  const restoreDefaultPrompt = async (stage: string) => {
    try {
      if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

      const updateResult = await updateExistingStageRow(stage, orgId, { prompt_override: null });

      if (!updateResult.hasRowAfterUpdate) {
        await upsertStageRow(stage, updateResult.stageColUsed, orgId, { prompt_override: null });
      }

      toast({ title: 'Prompt restaurado para o padrao!' });
      await fetchSettings();
    } catch (error) {
      console.error('Error restoring default prompt:', error);
      toast({ title: 'Erro ao restaurar', variant: 'destructive' });
    }
  };

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
