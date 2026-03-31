import {
  internalCrmQueryKeys,
  invokeInternalCrmApi,
  useInternalCrmAutomationRules,
  useInternalCrmAutomationRuns,
  useInternalCrmAutomationSettings,
  useInternalCrmClients,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { useQuery } from '@tanstack/react-query';

type AutomationHealthResponse = {
  ok: true;
  whatsapp_connected: boolean;
  whatsapp_instance_name: string | null;
  evolution_api_reachable: boolean;
  pending_runs_count: number;
  failed_runs_last_24h: number;
  last_processed_at: string | null;
};

export function useInternalCrmAutomationsModule() {
  const rulesQuery = useInternalCrmAutomationRules();
  const runsQuery = useInternalCrmAutomationRuns({ limit: 40 });
  const settingsQuery = useInternalCrmAutomationSettings();
  const instancesQuery = useInternalCrmInstances();
  const clientsQuery = useInternalCrmClients({});

  const healthQuery = useQuery({
    queryKey: ['internal-crm', 'automation-health'],
    queryFn: () => invokeInternalCrmApi<AutomationHealthResponse>({ action: 'check_automation_health' }),
    refetchInterval: 30_000,
  });

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
    healthQuery,
    upsertAutomationRuleMutation,
    upsertAutomationSettingsMutation,
    testAutomationRuleMutation,
  };
}