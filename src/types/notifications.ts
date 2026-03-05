// Notification Types for SolarZap CRM

export type NotificationType =
  | 'new_lead_response'
  | 'pending_response'
  | 'stage_changed'
  | 'call_scheduled'
  | 'visit_scheduled'
  | 'proposal_ready'
  | 'follow_up_reminder'
  | 'lead_inactive'
  | 'call_completed'
  | 'visit_completed'
  | 'installment_due_check';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  contactId?: string;
  contactName?: string;
  createdAt: Date;
  isRead: boolean;
  actionUrl?: string;
  actionLabel?: string;
  installmentId?: string;
  dueOn?: string;
  amount?: number;
  cycleNo?: number;
  requiresAction?: boolean;
}

export const NOTIFICATION_CONFIG: Record<NotificationType, {
  title: string;
  icon: string;
  priority: NotificationPriority;
  color: string;
}> = {
  new_lead_response: {
    title: 'Nova Resposta',
    icon: '💬',
    priority: 'high',
    color: 'bg-green-500',
  },
  pending_response: {
    title: 'Resposta Pendente',
    icon: '⏰',
    priority: 'urgent',
    color: 'bg-red-500',
  },
  stage_changed: {
    title: 'Etapa Alterada',
    icon: '📊',
    priority: 'medium',
    color: 'bg-blue-500',
  },
  call_scheduled: {
    title: 'Chamada Agendada',
    icon: '📞',
    priority: 'medium',
    color: 'bg-purple-500',
  },
  visit_scheduled: {
    title: 'Visita Agendada',
    icon: '🏠',
    priority: 'medium',
    color: 'bg-teal-500',
  },
  proposal_ready: {
    title: 'Proposta Pronta',
    icon: '📋',
    priority: 'high',
    color: 'bg-indigo-500',
  },
  follow_up_reminder: {
    title: 'Follow-up',
    icon: '🔔',
    priority: 'medium',
    color: 'bg-yellow-500',
  },
  lead_inactive: {
    title: 'Lead Inativo',
    icon: '⚠️',
    priority: 'low',
    color: 'bg-orange-500',
  },
  call_completed: {
    title: 'Chamada Realizada',
    icon: '✅',
    priority: 'low',
    color: 'bg-green-600',
  },
  visit_completed: {
    title: 'Visita Realizada',
    icon: '✅',
    priority: 'low',
    color: 'bg-green-600',
  },
  installment_due_check: {
    title: 'Parcela Vencida',
    icon: '💸',
    priority: 'urgent',
    color: 'bg-red-500',
  },
};
