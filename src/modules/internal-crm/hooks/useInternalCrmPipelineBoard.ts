import { useMemo } from 'react';
import {
  useInternalCrmAppointments,
  useInternalCrmClients,
  useInternalCrmConversations,
  useInternalCrmDeals,
  useInternalCrmMembers,
  useInternalCrmPipelineStages,
  useInternalCrmProducts,
  useInternalCrmTasks,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type {
  InternalCrmAppointment,
  InternalCrmClientSummary,
  InternalCrmConversationSummary,
  InternalCrmDealSummary,
  InternalCrmMember,
  InternalCrmStage,
  InternalCrmTask,
} from '@/modules/internal-crm/types';
import {
  getInternalCrmNextActionLabel,
  getInternalCrmStageLabel,
  INTERNAL_CRM_PIPELINE_STAGE_ORDER,
  normalizeInternalCrmStageCode,
} from '@/modules/internal-crm/components/pipeline/stageCatalog';
import { getDealSummaryLabel } from '@/modules/internal-crm/components/pipeline/dealCatalog';

export type InternalCrmPipelineBoardFilters = {
  search?: string;
  stage_code?: string;
  status?: 'all' | 'open' | 'won' | 'lost';
  owner_user_id?: string;
  source_channel?: string;
};

export type InternalCrmPipelineBoardCard = {
  id: string;
  stageCode: string;
  stageLabel: string;
  totalCents: number;
  daysInStage: number;
  title: string;
  companyName: string;
  contactName: string | null;
  ownerUserId: string | null;
  owner: InternalCrmMember | null;
  sourceChannel: string | null;
  sourceLabel: string | null;
  paymentStatus: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  itemSummary: string;
  nextActionLabel: string;
  nextTask: InternalCrmTask | null;
  nextAppointment: InternalCrmAppointment | null;
  conversation: InternalCrmConversationSummary | null;
  client: InternalCrmClientSummary | null;
  deal: InternalCrmDealSummary;
};

export type InternalCrmPipelineBoardColumn = {
  stage_code: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  deals: InternalCrmPipelineBoardCard[];
  totals: {
    count: number;
    total_cents: number;
  };
};

function humanizeToken(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatSourceLabel(sourceChannel: string | null | undefined): string | null {
  return humanizeToken(sourceChannel);
}

function getDaysInStage(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 1;
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return 1;
  return Math.max(1, Math.ceil((Date.now() - parsed.getTime()) / 86400000));
}

function pickConversationByClient(conversations: InternalCrmConversationSummary[]) {
  const map = new Map<string, InternalCrmConversationSummary>();
  for (const conversation of conversations) {
    const clientId = String(conversation.client_id || '');
    if (!clientId) continue;
    const existing = map.get(clientId);
    const existingTime = existing?.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
    const currentTime = conversation.last_message_at ? new Date(conversation.last_message_at).getTime() : 0;
    if (!existing || currentTime >= existingTime) {
      map.set(clientId, conversation);
    }
  }
  return map;
}

function pickNextTask(tasks: InternalCrmTask[]) {
  const byDealId = new Map<string, InternalCrmTask>();
  const byClientId = new Map<string, InternalCrmTask>();

  for (const task of tasks) {
    const targetMap = task.deal_id ? byDealId : byClientId;
    const targetKey = String(task.deal_id || task.client_id || '');
    if (!targetKey) continue;

    const existing = targetMap.get(targetKey);
    const existingTime = existing?.due_at ? new Date(existing.due_at).getTime() : Number.POSITIVE_INFINITY;
    const currentTime = task.due_at ? new Date(task.due_at).getTime() : Number.POSITIVE_INFINITY;

    if (!existing || currentTime < existingTime) {
      targetMap.set(targetKey, task);
    }
  }

  return { byDealId, byClientId };
}

function pickNextAppointment(appointments: InternalCrmAppointment[]) {
  const byDealId = new Map<string, InternalCrmAppointment>();
  const byClientId = new Map<string, InternalCrmAppointment>();

  for (const appointment of appointments) {
    const isFutureLike = ['scheduled', 'confirmed'].includes(String(appointment.status || ''));
    if (!isFutureLike) continue;

    const targetMap = appointment.deal_id ? byDealId : byClientId;
    const targetKey = String(appointment.deal_id || appointment.client_id || '');
    if (!targetKey) continue;

    const existing = targetMap.get(targetKey);
    const existingTime = existing?.start_at ? new Date(existing.start_at).getTime() : Number.POSITIVE_INFINITY;
    const currentTime = appointment.start_at ? new Date(appointment.start_at).getTime() : Number.POSITIVE_INFINITY;

    if (!existing || currentTime < existingTime) {
      targetMap.set(targetKey, appointment);
    }
  }

  return { byDealId, byClientId };
}

export function useInternalCrmPipelineBoard(filters: InternalCrmPipelineBoardFilters) {
  const normalizedStatus = filters.status && filters.status !== 'all' ? filters.status : undefined;

  const stagesQuery = useInternalCrmPipelineStages();
  const dealsQuery = useInternalCrmDeals({ status: normalizedStatus });
  const clientsQuery = useInternalCrmClients();
  const productsQuery = useInternalCrmProducts();
  const tasksQuery = useInternalCrmTasks({ status: 'open' });
  const conversationsQuery = useInternalCrmConversations({ status: 'all' });
  const appointmentsQuery = useInternalCrmAppointments();
  const membersQuery = useInternalCrmMembers();

  const stageOptions = useMemo(() => {
    const stageMap = new Map<string, InternalCrmStage>();

    for (const stage of stagesQuery.data?.stages || []) {
      const stageCode = normalizeInternalCrmStageCode(stage.stage_code);
      if (!stageMap.has(stageCode)) {
        stageMap.set(stageCode, {
          ...stage,
          stage_code: stageCode,
          name: getInternalCrmStageLabel(stageCode, stage.name),
        });
      }
    }

    for (const stageCode of INTERNAL_CRM_PIPELINE_STAGE_ORDER) {
      if (!stageMap.has(stageCode)) {
        stageMap.set(stageCode, {
          stage_code: stageCode,
          name: getInternalCrmStageLabel(stageCode),
          sort_order: (INTERNAL_CRM_PIPELINE_STAGE_ORDER.indexOf(stageCode) + 1) * 10,
          is_terminal: ['fechou', 'nao_fechou'].includes(stageCode),
          win_probability: 0,
          color_token: null,
        });
      }
    }

    return Array.from(stageMap.values()).sort((left, right) => {
      const leftIndex = INTERNAL_CRM_PIPELINE_STAGE_ORDER.indexOf(left.stage_code as never);
      const rightIndex = INTERNAL_CRM_PIPELINE_STAGE_ORDER.indexOf(right.stage_code as never);
      const resolvedLeft = leftIndex >= 0 ? leftIndex : Number(left.sort_order || 999);
      const resolvedRight = rightIndex >= 0 ? rightIndex : Number(right.sort_order || 999);
      return resolvedLeft - resolvedRight;
    });
  }, [stagesQuery.data?.stages]);

  const members = membersQuery.data?.members || [];

  const cards = useMemo<InternalCrmPipelineBoardCard[]>(() => {
    const deals = dealsQuery.data?.deals || [];
    const clients = clientsQuery.data?.clients || [];
    const tasks = tasksQuery.data?.tasks || [];
    const conversations = conversationsQuery.data?.conversations || [];
    const appointments = appointmentsQuery.data?.appointments || [];
    const products = productsQuery.data?.products || [];

    const clientsById = new Map<string, InternalCrmClientSummary>(clients.map((client) => [client.id, client]));
    const membersById = new Map<string, InternalCrmMember>(members.map((member) => [member.user_id, member]));
    const conversationsByClientId = pickConversationByClient(conversations);
    const nextTasks = pickNextTask(tasks);
    const nextAppointments = pickNextAppointment(appointments);
    const search = String(filters.search || '').trim().toLowerCase();

    return deals
      .map((deal) => {
        const client = clientsById.get(deal.client_id) || null;
        const stageCode = normalizeInternalCrmStageCode(deal.stage_code);
        const ownerUserId = deal.owner_user_id || client?.owner_user_id || null;
        const owner = ownerUserId ? membersById.get(ownerUserId) || null : null;
        const conversation = conversationsByClientId.get(deal.client_id) || null;
        const nextTask = nextTasks.byDealId.get(deal.id) || nextTasks.byClientId.get(deal.client_id) || null;
        const nextAppointment = nextAppointments.byDealId.get(deal.id) || nextAppointments.byClientId.get(deal.client_id) || null;
        const itemSummary = getDealSummaryLabel(deal, products);
        const totalCents = Number(deal.one_time_total_cents || 0) + Number(deal.mrr_cents || 0);
        const companyName = client?.company_name || deal.client_company_name || 'Sem empresa';
        const contactName = client?.primary_contact_name || null;
        const sourceChannel = client?.source_channel || null;

        return {
          id: deal.id,
          stageCode,
          stageLabel: getInternalCrmStageLabel(stageCode),
          totalCents,
          daysInStage: getDaysInStage(deal.updated_at),
          title: deal.title,
          companyName,
          contactName,
          ownerUserId,
          owner,
          sourceChannel,
          sourceLabel: formatSourceLabel(sourceChannel),
          paymentStatus: deal.payment_status || 'pending',
          unreadCount: Number(conversation?.unread_count || 0),
          lastMessagePreview: conversation?.last_message_preview || null,
          itemSummary: itemSummary || 'Valor livre',
          nextActionLabel: getInternalCrmNextActionLabel(stageCode),
          nextTask,
          nextAppointment,
          conversation,
          client,
          deal,
        };
      })
      .filter((card) => {
        if (filters.stage_code && filters.stage_code !== 'all' && card.stageCode !== filters.stage_code) return false;
        if (filters.owner_user_id && filters.owner_user_id !== 'all' && card.ownerUserId !== filters.owner_user_id) return false;
        if (filters.source_channel && filters.source_channel !== 'all' && card.sourceChannel !== filters.source_channel) return false;
        if (!search) return true;

        return [
          card.title,
          card.companyName,
          card.contactName,
          card.sourceLabel,
          card.owner?.display_name,
          card.lastMessagePreview,
          card.itemSummary,
          card.nextTask?.title,
        ].some((value) => String(value || '').toLowerCase().includes(search));
      });
  }, [
    appointmentsQuery.data?.appointments,
    clientsQuery.data?.clients,
    conversationsQuery.data?.conversations,
    dealsQuery.data?.deals,
    filters.owner_user_id,
    filters.search,
    filters.source_channel,
    filters.stage_code,
    members,
    productsQuery.data?.products,
    tasksQuery.data?.tasks,
  ]);

  const columns = useMemo<InternalCrmPipelineBoardColumn[]>(() => {
    return stageOptions
      .filter((stage) => !filters.stage_code || filters.stage_code === 'all' || stage.stage_code === filters.stage_code)
      .map((stage) => {
        const stageDeals = cards.filter((card) => card.stageCode === stage.stage_code);
        return {
          ...stage,
          deals: stageDeals,
          totals: {
            count: stageDeals.length,
            total_cents: stageDeals.reduce((sum, card) => sum + card.totalCents, 0),
          },
        };
      });
  }, [cards, filters.stage_code, stageOptions]);

  const sourceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clientsQuery.data?.clients || []) {
      const value = String(client.source_channel || '').trim();
      if (!value || map.has(value)) continue;
      map.set(value, formatSourceLabel(value) || value);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
  }, [clientsQuery.data?.clients]);

  return {
    stagesQuery,
    dealsQuery,
    clientsQuery,
    productsQuery,
    tasksQuery,
    conversationsQuery,
    appointmentsQuery,
    membersQuery,
    members,
    stageOptions,
    sourceOptions,
    cards,
    columns,
    isLoading:
      stagesQuery.isLoading ||
      dealsQuery.isLoading ||
      clientsQuery.isLoading ||
      productsQuery.isLoading ||
      tasksQuery.isLoading ||
      conversationsQuery.isLoading ||
      appointmentsQuery.isLoading ||
      membersQuery.isLoading,
  };
}
