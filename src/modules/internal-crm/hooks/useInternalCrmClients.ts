import {
  internalCrmQueryKeys,
  useInternalCrmClientDetail,
  useInternalCrmClients,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmClientNote } from '@/modules/internal-crm/types';
import { useQuery } from '@tanstack/react-query';
import { invokeInternalCrmApi } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export type InternalCrmClientsFilters = {
  search?: string;
  stage_code?: string;
  lifecycle_status?: string;
};

export function useInternalCrmClientsModule(selectedClientId: string | null, filters: InternalCrmClientsFilters) {
  const normalizedSearch = String(filters.search || '').trim();
  const normalizedStage = filters.stage_code && filters.stage_code !== 'all' ? filters.stage_code : undefined;
  const normalizedLifecycle =
    filters.lifecycle_status && filters.lifecycle_status !== 'all' ? filters.lifecycle_status : undefined;

  const clientsQuery = useInternalCrmClients({
    search: normalizedSearch || undefined,
    stage_code: normalizedStage,
    lifecycle_status: normalizedLifecycle,
  });

  const clientDetailQuery = useInternalCrmClientDetail(selectedClientId);

  const upsertClientMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.clients({})],
  });

  const deleteClientMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.clients({})],
  });

  const upsertTaskMutation = useInternalCrmMutation({
    invalidate: selectedClientId
      ? [internalCrmQueryKeys.clientDetail(selectedClientId), internalCrmQueryKeys.dashboard({})]
      : [internalCrmQueryKeys.dashboard({})],
  });

  const checkoutMutation = useInternalCrmMutation({
    invalidate: selectedClientId
      ? [internalCrmQueryKeys.clientDetail(selectedClientId), internalCrmQueryKeys.deals({})]
      : [internalCrmQueryKeys.deals({})],
  });

  const provisionMutation = useInternalCrmMutation({
    invalidate: selectedClientId
      ? [
          internalCrmQueryKeys.clientDetail(selectedClientId),
          internalCrmQueryKeys.clients({}),
          internalCrmQueryKeys.dashboard({}),
        ]
      : [internalCrmQueryKeys.clients({}), internalCrmQueryKeys.dashboard({})],
  });

  const notesQuery = useQuery({
    queryKey: ['internal-crm', 'client_notes', selectedClientId],
    queryFn: () =>
      invokeInternalCrmApi<{ ok: true; notes: InternalCrmClientNote[] }>({
        action: 'list_client_notes',
        client_id: selectedClientId,
      }),
    enabled: !!selectedClientId,
  });

  const addNoteMutation = useInternalCrmMutation({
    invalidate: selectedClientId
      ? [['internal-crm', 'client_notes', selectedClientId]]
      : [],
  });

  const deleteNoteMutation = useInternalCrmMutation({
    invalidate: selectedClientId
      ? [['internal-crm', 'client_notes', selectedClientId]]
      : [],
  });

  return {
    clientsQuery,
    clientDetailQuery,
    upsertClientMutation,
    deleteClientMutation,
    upsertTaskMutation,
    checkoutMutation,
    provisionMutation,
    notesQuery,
    addNoteMutation,
    deleteNoteMutation,
  };
}
