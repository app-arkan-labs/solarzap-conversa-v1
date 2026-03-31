import {
  internalCrmQueryKeys,
  useInternalCrmCampaigns,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';

export function useInternalCrmCampaignsModule() {
  const campaignsQuery = useInternalCrmCampaigns();
  const instancesQuery = useInternalCrmInstances();

  const upsertCampaignMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.campaigns(), internalCrmQueryKeys.dashboard({})],
  });

  const updateCampaignStatusMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.campaigns()],
  });

  const runCampaignBatchMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.campaigns()],
  });

  const deleteCampaignMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.campaigns(), internalCrmQueryKeys.dashboard({})],
  });

  return {
    campaignsQuery,
    instancesQuery,
    upsertCampaignMutation,
    updateCampaignStatusMutation,
    runCampaignBatchMutation,
    deleteCampaignMutation,
  };
}
