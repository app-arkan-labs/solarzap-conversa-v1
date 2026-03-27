import { differenceInCalendarDays, format, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AppointmentType, Contact, LeadNextActionDueState, LeadTask, PipelineStage } from '@/types/solarzap';

export const LEAD_NEXT_ACTION_SUGGESTIONS: Record<PipelineStage, string> = {
  novo_lead: 'Entrar em contato',
  respondeu: 'Agendar chamada',
  chamada_agendada: 'Realizar chamada',
  chamada_realizada: 'Enviar proposta',
  nao_compareceu: 'Reagendar',
  aguardando_proposta: 'Preparar proposta',
  proposta_pronta: 'Apresentar proposta',
  visita_agendada: 'Realizar visita',
  visita_realizada: 'Negociar proposta',
  proposta_negociacao: 'Fechar negocio',
  financiamento: 'Avancar financiamento',
  aprovou_projeto: 'Assinar contrato',
  contrato_assinado: 'Aguardar pagamento',
  projeto_pago: 'Agendar instalacao',
  aguardando_instalacao: 'Acompanhar instalacao',
  projeto_instalado: 'Coletar avaliacao',
  coletar_avaliacao: 'Pedir indicacao',
  contato_futuro: 'Retomar no periodo combinado',
  perdido: 'Sem proxima acao',
};

export const LEAD_TASK_CHANNEL_LABELS: Record<Exclude<LeadTask['channel'], null>, string> = {
  whatsapp: 'WhatsApp',
  call: 'Ligacao',
  email: 'E-mail',
  other: 'Outro',
};

export const LEAD_TASK_PRIORITY_LABELS: Record<LeadTask['priority'], string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

const compareRecency = (current: LeadTask | null, candidate: LeadTask, value: string | null | undefined) => {
  const candidateTime = value ? new Date(value).getTime() : new Date(candidate.updatedAt).getTime();
  if (!current) return true;
  const currentValue = current.completedAt || current.updatedAt;
  const currentTime = currentValue ? new Date(currentValue).getTime() : 0;
  return candidateTime > currentTime;
};

const compareDueAt = (current: LeadTask | null, candidate: LeadTask) => {
  if (!current) return true;
  if (!current.dueAt && candidate.dueAt) return true;
  if (!candidate.dueAt) return false;
  if (!current.dueAt) return false;
  return new Date(candidate.dueAt).getTime() < new Date(current.dueAt).getTime();
};

export const normalizeLeadTaskKind = (value: unknown, createdBy?: string | null): LeadTask['taskKind'] => {
  if (value === 'next_action' || value === 'follow_up_ai' || value === 'system' || value === 'generic') {
    return value;
  }
  if (createdBy === 'manual_next_action') return 'next_action';
  if (createdBy === 'ai') return 'follow_up_ai';
  return 'generic';
};

export const getLeadTaskDueState = (
  task: Pick<LeadTask, 'status' | 'dueAt'> | null | undefined,
  now = new Date(),
): LeadNextActionDueState => {
  if (!task || task.status !== 'open') return 'none';
  if (!task.dueAt) return 'unscheduled';

  const dueAt = new Date(task.dueAt);
  if (Number.isNaN(dueAt.getTime())) return 'unscheduled';
  if (isToday(dueAt)) {
    return dueAt.getTime() < now.getTime() ? 'overdue' : 'today';
  }
  return dueAt.getTime() < now.getTime() ? 'overdue' : 'upcoming';
};

export const formatLeadTaskDueLabel = (
  task: Pick<LeadTask, 'status' | 'dueAt'> | null | undefined,
  now = new Date(),
): string => {
  const dueState = getLeadTaskDueState(task, now);
  if (dueState === 'none') return 'Sem acao';
  if (!task?.dueAt) return 'Sem prazo';

  const dueAt = new Date(task.dueAt);
  if (Number.isNaN(dueAt.getTime())) return 'Sem prazo';

  if (dueState === 'overdue') {
    const diffDays = Math.max(0, differenceInCalendarDays(now, dueAt));
    if (diffDays <= 0) return `Vencida ${format(dueAt, 'HH:mm', { locale: ptBR })}`;
    if (diffDays === 1) return 'Vencida ontem';
    return `Vencida ${diffDays}d`;
  }

  if (isToday(dueAt)) {
    return `Hoje ${format(dueAt, 'HH:mm', { locale: ptBR })}`;
  }

  if (isTomorrow(dueAt)) {
    return `Amanha ${format(dueAt, 'HH:mm', { locale: ptBR })}`;
  }

  return format(dueAt, 'dd/MM HH:mm', { locale: ptBR });
};

export const formatLeadTaskTimestamp = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'dd/MM HH:mm', { locale: ptBR });
};

export const getLastActionText = (task: LeadTask | null | undefined): string => {
  if (!task) return 'Nenhuma acao concluida';
  const result = String(task.resultSummary || '').trim();
  if (result.length > 0) return result;
  const title = String(task.title || '').trim();
  return title.length > 0 ? title : 'Acao concluida';
};

export const buildLeadActionMaps = (tasks: LeadTask[], now = new Date()) => {
  const nextActionByLeadId = new Map<string, LeadTask>();
  const lastActionByLeadId = new Map<string, LeadTask>();

  for (const task of tasks) {
    const leadId = String(task.leadId);
    if (task.taskKind !== 'next_action') continue;

    if (task.status === 'open') {
      const dueState = getLeadTaskDueState(task, now);
      if (dueState === 'overdue') {
        const currentLast = lastActionByLeadId.get(leadId) || null;
        if (compareRecency(currentLast, task, task.dueAt || task.updatedAt)) {
          lastActionByLeadId.set(leadId, task);
        }
        continue;
      }

      const current = nextActionByLeadId.get(leadId) || null;
      if (compareDueAt(current, task)) {
        nextActionByLeadId.set(leadId, task);
      }
      continue;
    }

    if (task.status === 'done') {
      const current = lastActionByLeadId.get(leadId) || null;
      if (compareRecency(current, task, task.completedAt || task.updatedAt)) {
        lastActionByLeadId.set(leadId, task);
      }
    }
  }

  return {
    nextActionByLeadId,
    lastActionByLeadId,
  };
};

const normalizeSearchText = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const inferLeadNextActionAppointmentType = (
  task: Pick<LeadTask, 'title' | 'notes' | 'channel'> | null | undefined,
  contact?: Pick<Contact, 'pipelineStage'> | null,
): Extract<AppointmentType, 'reuniao' | 'visita'> => {
  const title = normalizeSearchText(task?.title);
  const notes = normalizeSearchText(task?.notes);
  const stage = normalizeSearchText(contact?.pipelineStage);
  const combined = `${title} ${notes} ${stage}`.trim();

  if (
    combined.includes('visita') ||
    combined.includes('instalacao') ||
    combined.includes('tecnica') ||
    combined.includes('tecnico') ||
    stage.includes('visita') ||
    stage.includes('instalacao')
  ) {
    return 'visita';
  }

  if (task?.channel === 'call') {
    return 'reuniao';
  }

  return 'reuniao';
};
