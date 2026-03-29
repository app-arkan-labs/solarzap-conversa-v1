import {
  internalCrmQueryKeys,
  useInternalCrmAi as useInternalCrmAiQuery,
  useInternalCrmClients,
  useInternalCrmMutation,
  useInternalCrmPipelineStages,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';

export function useInternalCrmAiModule() {
  const aiQuery = useInternalCrmAiQuery();
  const stagesQuery = useInternalCrmPipelineStages();
  const clientsQuery = useInternalCrmClients({});

  const upsertAiSettingsMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.ai()],
  });

  const enqueueAgentJobMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.ai()],
  });

  return {
    aiQuery,
    stagesQuery,
    clientsQuery,
    upsertAiSettingsMutation,
    enqueueAgentJobMutation,
  };
}
