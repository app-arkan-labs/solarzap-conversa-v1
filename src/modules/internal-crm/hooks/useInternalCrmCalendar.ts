import { useMemo } from 'react';
import {
  internalCrmQueryKeys,
  useInternalCrmAppointments,
  useInternalCrmClients,
  useInternalCrmDeals,
  useInternalCrmGoogleCalendarStatus,
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
  const dealsQuery = useInternalCrmDeals({ status: 'open' });
  const googleCalendarQuery = useInternalCrmGoogleCalendarStatus();

  const upsertAppointmentMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.appointments({}),
      internalCrmQueryKeys.dashboard({}),
      internalCrmQueryKeys.clients({}),
    ],
  });

  const googleCalendarActionMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.googleCalendar(),
      internalCrmQueryKeys.appointments({}),
    ],
  });

  const importGoogleEventsMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.googleCalendar(),
      internalCrmQueryKeys.appointments({}),
      internalCrmQueryKeys.dashboard({}),
    ],
  });

  const syncAppointmentGoogleMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.googleCalendar(),
      internalCrmQueryKeys.appointments({}),
    ],
  });

  const deleteAppointmentMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.appointments({}),
      internalCrmQueryKeys.dashboard({}),
    ],
  });

  const upsertDealMutation = useInternalCrmMutation({
    invalidate: [
      internalCrmQueryKeys.deals({}),
      internalCrmQueryKeys.clients({}),
      internalCrmQueryKeys.dashboard({}),
      internalCrmQueryKeys.appointments({}),
    ],
  });

  return {
    params,
    appointmentsQuery,
    clientsQuery,
    dealsQuery,
    googleCalendarQuery,
    upsertAppointmentMutation,
    upsertDealMutation,
    googleCalendarActionMutation,
    importGoogleEventsMutation,
    syncAppointmentGoogleMutation,
    deleteAppointmentMutation,
  };
}
