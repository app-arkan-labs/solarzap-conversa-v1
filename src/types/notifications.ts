// Notification Types for SolarZap CRM

export type NotificationType = 
  | 'new_lead_response'       // Lead respondeu pela primeira vez
  | 'pending_response'        // Vendedor não respondeu em 10min
  | 'stage_changed'           // Lead mudou de etapa no pipeline
  | 'call_scheduled'          // Chamada agendada
  | 'visit_scheduled'         // Visita agendada
  | 'proposal_ready'          // Proposta pronta para enviar
  | 'follow_up_reminder'      // Lembrete de follow-up
  | 'lead_inactive'           // Lead inativo há muito tempo
  | 'call_completed'          // Chamada realizada
  | 'visit_completed';        // Visita realizada

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
};
