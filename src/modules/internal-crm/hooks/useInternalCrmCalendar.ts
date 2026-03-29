import { useMemo } from 'react';
import {
  internalCrmQueryKeys,
  useInternalCrmAppointments,
  useInternalCrmClients,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';

export type InternalCrmCalendarFilters = {
  monthAnchor: Date;
  status?: string;
  owner_user_id?: string;
  client_id?: string;
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useInternalCrmCalendar(filters: InternalCrmCalendarFilters) {
  const monthRange = useMemo(() => {
    const anchor = new Date(filters.monthAnchor);
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);

    return {
      date_from: toDateInputValue(from),
      date_to: toDateInputValue(to),
    };
  }, [filters.monthAnchor]);

  const params = useMemo(
    () => ({
      ...monthRange,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.owner_user_id ? { owner_user_id: filters.owner_user_id } : {}),
      ...(filters.client_id ? { client_id: filters.client_id } : {}),
    }),
    [filters.client_id, filters.owner_user_id, filters.status, monthRange],
  );

  const appointmentsQuery = useInternalCrmAppointments(params);
  const clientsQuery = useInternalCrmClients({});

  const upsertAppointmentMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.appointments({}),
      internalCrmQueryKeys.dashboard({}),
      internalCrmQueryKeys.clients({}),
    ],
  });

  return {
    params,
    appointmentsQuery,
    clientsQuery,
    upsertAppointmentMutation,
  };
}
