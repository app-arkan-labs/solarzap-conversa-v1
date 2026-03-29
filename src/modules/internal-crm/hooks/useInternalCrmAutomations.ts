import {
  internalCrmQueryKeys,
  useInternalCrmAutomationRules,
  useInternalCrmAutomationRuns,
  useInternalCrmAutomationSettings,
  useInternalCrmClients,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';

export function useInternalCrmAutomationsModule() {
  const rulesQuery = useInternalCrmAutomationRules();
  const runsQuery = useInternalCrmAutomationRuns({ limit: 40 });
  const settingsQuery = useInternalCrmAutomationSettings();
  const instancesQuery = useInternalCrmInstances();
  const clientsQuery = useInternalCrmClients({});

  const upsertAutomationRuleMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.automationRules(),
      internalCrmQueryKeys.automationRuns({ limit: 40 }),
    ],
  });

  const upsertAutomationSettingsMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.automationSettings()],
  });

  const testAutomationRuleMutation = useInternalCrmMutation<{
    ok: true;
    processed: {
      processed_count: number;
      failed_count: number;
    };
  }>({
    invalidate: [
      internalCrmQueryKeys.automationRuns({ limit: 40 }),
      internalCrmQueryKeys.tasks({}),
      internalCrmQueryKeys.conversations({}),
    ],
  });

  return {
    rulesQuery,
    runsQuery,
    settingsQuery,
    instancesQuery,
    clientsQuery,
    upsertAutomationRuleMutation,
    upsertAutomationSettingsMutation,
    testAutomationRuleMutation,
  };
}