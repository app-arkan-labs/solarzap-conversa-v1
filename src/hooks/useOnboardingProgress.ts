import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type OnboardingProgress = {
  user_id: string;
  org_id: string | null;
  current_step: string;
  completed_steps: string[];
  skipped_steps: string[];
  tour_completed_tabs: string[];
  is_complete: boolean;
  guided_tour_version: string | null;
  guided_tour_status: 'never_seen' | 'dismissed' | 'completed';
  guided_tour_seen_at: string | null;
  guided_tour_completed_at: string | null;
  guided_tour_dismissed_at: string | null;
  guided_tour_last_manual_started_at: string | null;
  guided_tour_last_manual_completed_at: string | null;
};

type ProgressPatch = Partial<Pick<OnboardingProgress, 'org_id' | 'current_step' | 'is_complete'>> & {
  completed_steps?: string[];
  skipped_steps?: string[];
  tour_completed_tabs?: string[];
};

type GuidedTourPatch = Partial<Pick<OnboardingProgress,
  | 'guided_tour_version'
  | 'guided_tour_status'
  | 'guided_tour_seen_at'
  | 'guided_tour_completed_at'
  | 'guided_tour_dismissed_at'
  | 'guided_tour_last_manual_started_at'
  | 'guided_tour_last_manual_completed_at'
>>;

const ONBOARDING_QUERY_KEY = ['onboarding-progress'] as const;

const SELECT_COLUMNS = [
  'user_id',
  'org_id',
  'current_step',
  'completed_steps',
  'skipped_steps',
  'tour_completed_tabs',
  'is_complete',
  'guided_tour_version',
  'guided_tour_status',
  'guided_tour_seen_at',
  'guided_tour_completed_at',
  'guided_tour_dismissed_at',
  'guided_tour_last_manual_started_at',
  'guided_tour_last_manual_completed_at',
].join(', ');

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toProgressRow = (input: unknown, fallbackUserId: string, fallbackOrgId: string | null): OnboardingProgress => {
  const row = (typeof input === 'object' && input !== null) ? input as Record<string, unknown> : {};

  return {
    user_id: typeof row.user_id === 'string' ? row.user_id : fallbackUserId,
    org_id: typeof row.org_id === 'string' ? row.org_id : fallbackOrgId,
    current_step: typeof row.current_step === 'string' && row.current_step.trim() ? row.current_step : 'profile',
    completed_steps: asStringArray(row.completed_steps),
    skipped_steps: asStringArray(row.skipped_steps),
    tour_completed_tabs: asStringArray(row.tour_completed_tabs),
    is_complete: row.is_complete === true,
    guided_tour_version: typeof row.guided_tour_version === 'string' ? row.guided_tour_version : null,
    guided_tour_status: row.guided_tour_status === 'dismissed' || row.guided_tour_status === 'completed'
      ? row.guided_tour_status
      : 'never_seen',
    guided_tour_seen_at: typeof row.guided_tour_seen_at === 'string' ? row.guided_tour_seen_at : null,
    guided_tour_completed_at: typeof row.guided_tour_completed_at === 'string' ? row.guided_tour_completed_at : null,
    guided_tour_dismissed_at: typeof row.guided_tour_dismissed_at === 'string' ? row.guided_tour_dismissed_at : null,
    guided_tour_last_manual_started_at: typeof row.guided_tour_last_manual_started_at === 'string' ? row.guided_tour_last_manual_started_at : null,
    guided_tour_last_manual_completed_at: typeof row.guided_tour_last_manual_completed_at === 'string' ? row.guided_tour_last_manual_completed_at : null,
  };
};

export function useOnboardingProgress(enabled = true) {
  const queryClient = useQueryClient();
  const { user, orgId } = useAuth();

  const queryKey = useMemo(() => [...ONBOARDING_QUERY_KEY, user?.id, orgId] as const, [user?.id, orgId]);

  const query = useQuery({
    queryKey,
    enabled: enabled && Boolean(user?.id) && Boolean(orgId),
    staleTime: 15_000,
    queryFn: async (): Promise<OnboardingProgress | null> => {
      if (!user?.id || !orgId) return null;

      const { data, error } = await supabase
        .from('onboarding_progress')
        .select(SELECT_COLUMNS)
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const seed = {
          user_id: user.id,
          org_id: orgId,
          current_step: 'profile',
          completed_steps: [],
          skipped_steps: [],
          tour_completed_tabs: [],
          is_complete: false,
          guided_tour_version: null,
          guided_tour_status: 'never_seen',
          guided_tour_seen_at: null,
          guided_tour_completed_at: null,
          guided_tour_dismissed_at: null,
          guided_tour_last_manual_started_at: null,
          guided_tour_last_manual_completed_at: null,
        };

        const { data: inserted, error: insertError } = await supabase
          .from('onboarding_progress')
          .upsert(seed, { onConflict: 'user_id,org_id' })
          .select(SELECT_COLUMNS)
          .single();

        if (insertError) throw insertError;
        return toProgressRow(inserted, user.id, orgId);
      }

      return toProgressRow(data, user.id, orgId);
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: ProgressPatch): Promise<OnboardingProgress | null> => {
      if (!user?.id || !orgId) return null;

      const payload = {
        user_id: user.id,
        org_id: patch.org_id ?? orgId,
        current_step: patch.current_step ?? 'profile',
        completed_steps: patch.completed_steps ?? [],
        skipped_steps: patch.skipped_steps ?? [],
        tour_completed_tabs: patch.tour_completed_tabs ?? [],
        is_complete: patch.is_complete ?? false,
      };

      const { data, error } = await supabase
        .from('onboarding_progress')
        .upsert(payload, { onConflict: 'user_id,org_id' })
        .select(SELECT_COLUMNS)
        .single();

      if (error) throw error;
      return toProgressRow(data, user.id, orgId);
    },
    onSuccess: (nextValue) => {
      queryClient.setQueryData(queryKey, nextValue);
    },
  });

  const tourMutation = useMutation({
    mutationFn: async (patch: GuidedTourPatch): Promise<OnboardingProgress | null> => {
      if (!user?.id || !orgId) return null;

      const { data, error } = await supabase
        .from('onboarding_progress')
        .update(patch)
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .select(SELECT_COLUMNS)
        .single();

      if (error) throw error;
      return toProgressRow(data, user.id, orgId);
    },
    onSuccess: (nextValue) => {
      if (nextValue) queryClient.setQueryData(queryKey, nextValue);
    },
  });

  const updateStep = async (nextStep: string) => {
    const current = query.data;
    await patchMutation.mutateAsync({
      current_step: nextStep,
      completed_steps: current?.completed_steps ?? [],
      skipped_steps: current?.skipped_steps ?? [],
      tour_completed_tabs: current?.tour_completed_tabs ?? [],
      is_complete: current?.is_complete ?? false,
    });
  };

  const completeStep = async (step: string) => {
    const current = query.data;
    const completed = Array.from(new Set([...(current?.completed_steps ?? []), step]));
    await patchMutation.mutateAsync({
      current_step: step,
      completed_steps: completed,
      skipped_steps: current?.skipped_steps ?? [],
      tour_completed_tabs: current?.tour_completed_tabs ?? [],
      is_complete: current?.is_complete ?? false,
    });
  };

  const skipStep = async (step: string) => {
    const current = query.data;
    const skipped = Array.from(new Set([...(current?.skipped_steps ?? []), step]));
    await patchMutation.mutateAsync({
      current_step: step,
      completed_steps: current?.completed_steps ?? [],
      skipped_steps: skipped,
      tour_completed_tabs: current?.tour_completed_tabs ?? [],
      is_complete: current?.is_complete ?? false,
    });
  };

  const markTourTabCompleted = async (tab: string) => {
    const current = query.data;
    const completedTabs = Array.from(new Set([...(current?.tour_completed_tabs ?? []), tab]));
    await patchMutation.mutateAsync({
      current_step: current?.current_step ?? 'profile',
      completed_steps: current?.completed_steps ?? [],
      skipped_steps: current?.skipped_steps ?? [],
      tour_completed_tabs: completedTabs,
      is_complete: current?.is_complete ?? false,
    });
  };

  const markComplete = async () => {
    const current = query.data;
    await patchMutation.mutateAsync({
      current_step: current?.current_step ?? 'profile',
      completed_steps: current?.completed_steps ?? [],
      skipped_steps: current?.skipped_steps ?? [],
      tour_completed_tabs: current?.tour_completed_tabs ?? [],
      is_complete: true,
    });
  };

  const saveGuidedTourState = async (patch: GuidedTourPatch) => {
    return tourMutation.mutateAsync(patch);
  };

  const markGuidedTourDismissed = async (version: string) => {
    return tourMutation.mutateAsync({
      guided_tour_version: version,
      guided_tour_status: 'dismissed',
      guided_tour_dismissed_at: new Date().toISOString(),
      guided_tour_seen_at: query.data?.guided_tour_seen_at ?? new Date().toISOString(),
    });
  };

  const markGuidedTourCompleted = async (version: string) => {
    return tourMutation.mutateAsync({
      guided_tour_version: version,
      guided_tour_status: 'completed',
      guided_tour_completed_at: new Date().toISOString(),
      guided_tour_seen_at: query.data?.guided_tour_seen_at ?? new Date().toISOString(),
    });
  };

  const recordGuidedTourManualReplay = async (action: 'start' | 'complete') => {
    if (action === 'start') {
      return tourMutation.mutateAsync({
        guided_tour_last_manual_started_at: new Date().toISOString(),
      });
    }

    return tourMutation.mutateAsync({
      guided_tour_last_manual_completed_at: new Date().toISOString(),
    });
  };

  return {
    ...query,
    savePatch: patchMutation.mutateAsync,
    isSaving: patchMutation.isPending || tourMutation.isPending,
    updateStep,
    completeStep,
    skipStep,
    markComplete,
    markTourTabCompleted,
    saveGuidedTourState,
    markGuidedTourDismissed,
    markGuidedTourCompleted,
    recordGuidedTourManualReplay,
  };
}
