import {
  internalCrmQueryKeys,
  useInternalCrmAiActionLogs,
  useInternalCrmAi as useInternalCrmAiQuery,
  useInternalCrmClients,
  useInternalCrmMutation,
  useInternalCrmPipelineStages,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';

export function useInternalCrmAiModule() {
  const aiQuery = useInternalCrmAiQuery();
  const aiActionLogsQuery = useInternalCrmAiActionLogs({ limit: 20 });
  const stagesQuery = useInternalCrmPipelineStages();
  const clientsQuery = useInternalCrmClients({});

  const upsertAiSettingsMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.ai()],
  });

  const enqueueAgentJobMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.ai()],
  });

  const runAgentJobsMutation = useInternalCrmMutation<{
    ok: true;
    processed_count: number;
    failed_count: number;
  }>({
    invalidate: [
      internalCrmQueryKeys.ai(),
      internalCrmQueryKeys.aiActionLogs({ limit: 20 }),
      internalCrmQueryKeys.campaigns(),
      internalCrmQueryKeys.tasks({}),
    ],
  });

  return {
    aiQuery,
    aiActionLogsQuery,
    stagesQuery,
    clientsQuery,
    upsertAiSettingsMutation,
    enqueueAgentJobMutation,
    runAgentJobsMutation,
  };
}
