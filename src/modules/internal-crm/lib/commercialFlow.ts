import type {
  InternalCrmAppointment,
  InternalCrmClientSummary,
  InternalCrmDealSummary,
} from '@/modules/internal-crm/types';

export function buildAutoDealTitle(input: {
  companyName?: string | null;
  contactName?: string | null;
}) {
  const label = String(input.companyName || input.contactName || 'Lead').trim() || 'Lead';
  return `Oportunidade - ${label}`;
}

export function deriveDealStageFromAppointmentStatus(
  status: string | null | undefined,
): string | null {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'no_show') return 'nao_compareceu';
  if (normalized === 'done') return 'chamada_realizada';
  if (normalized === 'scheduled' || normalized === 'confirmed') return 'chamada_agendada';
  return null;
}

export function getOpenDealsForClient(
  deals: InternalCrmDealSummary[] | undefined,
  clientId: string | null | undefined,
) {
  if (!Array.isArray(deals)) return [];
  const targetClientId = String(clientId || '').trim();
  if (!targetClientId) return [];
  return deals.filter((deal) => String(deal.client_id || '') === targetClientId && String(deal.status || '') === 'open');
}

export function patchDealSummaryInList(
  deals: InternalCrmDealSummary[] | undefined,
  updatedDeal: InternalCrmDealSummary,
): InternalCrmDealSummary[] | undefined {
  if (!Array.isArray(deals)) return deals;
  const exists = deals.some((deal) => deal.id === updatedDeal.id);
  if (!exists) return deals;
  return deals.map((deal) => (deal.id === updatedDeal.id ? { ...deal, ...updatedDeal } : deal));
}

export function appendDealSummaryIfMissing(
  deals: InternalCrmDealSummary[] | undefined,
  createdDeal: InternalCrmDealSummary,
): InternalCrmDealSummary[] | undefined {
  if (!Array.isArray(deals)) return deals;
  if (deals.some((deal) => deal.id === createdDeal.id)) return deals;
  return [createdDeal, ...deals];
}

export function patchClientStageInList(
  clients: InternalCrmClientSummary[] | undefined,
  clientId: string,
  nextStageCode: string,
) {
  if (!Array.isArray(clients)) return clients;
  return clients.map((client) =>
    client.id === clientId
      ? {
          ...client,
          current_stage_code: nextStageCode,
          updated_at: new Date().toISOString(),
        }
      : client,
  );
}

export function patchAppointmentInList(
  appointments: InternalCrmAppointment[] | undefined,
  updatedAppointment: InternalCrmAppointment,
) {
  if (!Array.isArray(appointments)) return appointments;
  const exists = appointments.some((appointment) => appointment.id === updatedAppointment.id);
  if (!exists) return appointments;
  return appointments.map((appointment) =>
    appointment.id === updatedAppointment.id ? { ...appointment, ...updatedAppointment } : appointment,
  );
}

export function appendAppointmentIfMissing(
  appointments: InternalCrmAppointment[] | undefined,
  createdAppointment: InternalCrmAppointment,
) {
  if (!Array.isArray(appointments)) return appointments;
  if (appointments.some((appointment) => appointment.id === createdAppointment.id)) return appointments;
  return [createdAppointment, ...appointments];
}

