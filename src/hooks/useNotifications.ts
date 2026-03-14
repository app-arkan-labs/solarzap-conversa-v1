import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Notification, NotificationType, NOTIFICATION_CONFIG } from '@/types/notifications';
import { Contact, PipelineStage, PIPELINE_STAGES } from '@/types/solarzap';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Check if current time is within business hours (8am - 6pm, Mon-Fri) in Sao Paulo timezone
const isBusinessHours = (): boolean => {
  const TZ = 'America/Sao_Paulo';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', hour12: false, weekday: 'short',
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';

  const isWeekday = !['Sat', 'Sun'].includes(weekday);
  const isWorkingHour = hour >= 8 && hour < 18;

  return isWeekday && isWorkingHour;
};

const generateId = () => `notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

const formatCurrency = (value: number): string =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const toDateLabel = (value: string): string => {
  if (!value) return 'data não informada';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('pt-BR');
};

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator1.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator1.type = 'sine';

    oscillator2.frequency.setValueAtTime(1318.5, audioContext.currentTime);
    oscillator2.type = 'sine';

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.4);
    oscillator2.stop(audioContext.currentTime + 0.4);

    setTimeout(() => {
      audioContext.close();
    }, 500);
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
};

export function useNotifications() {
  const { orgId, user } = useAuth();
  const [ephemeralNotifications, setEphemeralNotifications] = useState<Notification[]>([]);
  const [financeNotifications, setFinanceNotifications] = useState<Notification[]>([]);
  const [financeReadIds, setFinanceReadIds] = useState<Set<string>>(new Set());
  const [hiddenFinanceIds, setHiddenFinanceIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  // Track pending responses (contactId -> timestamp of last client message)
  const pendingResponsesRef = useRef<Map<string, { timestamp: Date; contactName: string }>>(new Map());
  const responseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const financePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const notifications = useMemo(() => {
    const hydratedFinance = financeNotifications
      .filter((notification) => !hiddenFinanceIds.has(notification.id))
      .map((notification) => ({
        ...notification,
        isRead: financeReadIds.has(notification.id),
      }));

    return [...hydratedFinance, ...ephemeralNotifications]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [ephemeralNotifications, financeNotifications, financeReadIds, hiddenFinanceIds]);

  // Update unread count when notifications change
  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.isRead).length);
  }, [notifications]);

  const refreshFinanceNotifications = useCallback(async () => {
    if (!orgId) {
      setFinanceNotifications([]);
      return;
    }

    try {
      const { data: installmentsRows, error: installmentsError } = await supabase
        .from('lead_sale_installments')
        .select('id, lead_id, due_on, amount, cycle_no, installment_no, updated_at')
        .eq('org_id', orgId)
        .eq('status', 'awaiting_confirmation')
        .order('due_on', { ascending: true })
        .limit(200);

      if (installmentsError) {
        throw installmentsError;
      }

      const leadIds = Array.from(new Set((installmentsRows || []).map((row: any) => Number(row.lead_id)).filter((value) => Number.isFinite(value))));
      const leadNameById = new Map<number, string>();

      if (leadIds.length > 0) {
        const { data: leadsRows, error: leadsError } = await supabase
          .from('leads')
          .select('id, nome')
          .eq('org_id', orgId)
          .in('id', leadIds);

        if (leadsError) {
          throw leadsError;
        }

        (leadsRows || []).forEach((lead: any) => {
          const leadId = Number(lead.id);
          if (Number.isFinite(leadId)) {
            leadNameById.set(leadId, String(lead.nome || 'Lead'));
          }
        });
      }

      const mapped = (installmentsRows || []).map((row: any) => {
        const leadId = Number(row.lead_id);
        const leadName = leadNameById.get(leadId) || 'Lead';
        const amount = Number(row.amount || 0);
        const installmentNo = Number(row.installment_no || 0);
        const dueOn = String(row.due_on || '').slice(0, 10);
        const createdAt = row.updated_at ? new Date(String(row.updated_at)) : new Date(`${dueOn}T12:00:00`);

        return {
          id: `finance_${row.id}`,
          type: 'installment_due_check' as NotificationType,
          priority: 'urgent' as const,
          title: `Parcela vencida: ${leadName}`,
          message: `Parcela ${installmentNo > 0 ? `#${installmentNo} ` : ''}de ${formatCurrency(amount)} venceu em ${toDateLabel(dueOn)}. Confirmar pagamento?`,
          contactId: Number.isFinite(leadId) ? String(leadId) : undefined,
          contactName: leadName,
          createdAt,
          isRead: false,
          installmentId: String(row.id),
          dueOn,
          amount,
          cycleNo: Number(row.cycle_no || 0),
          requiresAction: true,
        } as Notification;
      });

      setFinanceNotifications(mapped);
    } catch (error) {
      console.error('Failed to refresh installment due notifications:', error);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setFinanceNotifications([]);
      return;
    }

    refreshFinanceNotifications();

    if (financePollingIntervalRef.current) {
      clearInterval(financePollingIntervalRef.current);
    }

    financePollingIntervalRef.current = setInterval(() => {
      refreshFinanceNotifications();
    }, 60_000);

    return () => {
      if (financePollingIntervalRef.current) {
        clearInterval(financePollingIntervalRef.current);
        financePollingIntervalRef.current = null;
      }
    };
  }, [orgId, refreshFinanceNotifications]);

  const confirmInstallmentPaid = useCallback(async (installmentId: string) => {
    if (!orgId) throw new Error('Organização não selecionada.');

    const { error } = await supabase.rpc('rpc_confirm_installment_paid', {
      p_org_id: orgId,
      p_installment_id: installmentId,
      p_paid_at: new Date().toISOString(),
      p_actor_user_id: user?.id || null,
    });

    if (error) {
      throw error;
    }

    await refreshFinanceNotifications();
  }, [orgId, refreshFinanceNotifications, user?.id]);

  const rescheduleInstallment = useCallback(async (installmentId: string, newDueOn: string) => {
    if (!orgId) throw new Error('Organização não selecionada.');
    if (!newDueOn) throw new Error('Nova data obrigatoria para reagendamento.');

    const { error } = await supabase.rpc('rpc_reschedule_installment', {
      p_org_id: orgId,
      p_installment_id: installmentId,
      p_new_due_on: newDueOn,
      p_actor_user_id: user?.id || null,
      p_reason: 'reagendamento_manual_crm',
    });

    if (error) {
      throw error;
    }

    await refreshFinanceNotifications();
  }, [orgId, refreshFinanceNotifications, user?.id]);

  // Add a new ephemeral notification with sound
  const addNotification = useCallback((
    type: NotificationType,
    options: {
      contactId?: string;
      contactName?: string;
      message?: string;
      customTitle?: string;
      playSound?: boolean;
    } = {}
  ) => {
    const config = NOTIFICATION_CONFIG[type];

    const notification: Notification = {
      id: generateId(),
      type,
      priority: config.priority,
      title: options.customTitle || config.title,
      message: options.message || `${config.icon} ${config.title}`,
      contactId: options.contactId,
      contactName: options.contactName,
      createdAt: new Date(),
      isRead: false,
    };

    import.meta.env.DEV && console.log('Adding notification:', notification.title, notification.message);

    setEphemeralNotifications(prev => [notification, ...prev].slice(0, 100));

    if (options.playSound !== false) {
      playNotificationSound();
    }
  }, []);

  // Check for pending responses every minute
  useEffect(() => {
    const checkPendingResponses = () => {
      if (!isBusinessHours()) return;

      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      pendingResponsesRef.current.forEach((data, contactId) => {
        if (data.timestamp < tenMinutesAgo) {
          setEphemeralNotifications(prev => {
            const existingNotif = prev.find(
              n => n.type === 'pending_response' &&
                n.contactId === contactId &&
                !n.isRead
            );

            if (!existingNotif) {
              const config = NOTIFICATION_CONFIG.pending_response;
              const notification: Notification = {
                id: generateId(),
                type: 'pending_response',
                priority: config.priority,
                title: config.title,
                message: `${data.contactName} aguarda resposta ha mais de 10 minutos!`,
                contactId,
                contactName: data.contactName,
                createdAt: new Date(),
                isRead: false,
              };

              playNotificationSound();
              return [notification, ...prev].slice(0, 100);
            }

            return prev;
          });
        }
      });
    };

    responseCheckIntervalRef.current = setInterval(checkPendingResponses, 60_000);

    return () => {
      if (responseCheckIntervalRef.current) {
        clearInterval(responseCheckIntervalRef.current);
      }
    };
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    if (notificationId.startsWith('finance_')) {
      setFinanceReadIds((prev) => {
        const next = new Set(prev);
        next.add(notificationId);
        return next;
      });
      return;
    }

    setEphemeralNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setEphemeralNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setFinanceReadIds(new Set(financeNotifications.map((notification) => notification.id)));
  }, [financeNotifications]);

  const clearAll = useCallback(() => {
    setEphemeralNotifications([]);
    pendingResponsesRef.current.clear();
    setFinanceReadIds(new Set(financeNotifications.map((notification) => notification.id)));
  }, [financeNotifications]);

  const deleteNotification = useCallback((notificationId: string) => {
    if (notificationId.startsWith('finance_')) {
      setHiddenFinanceIds((prev) => {
        const next = new Set(prev);
        next.add(notificationId);
        return next;
      });
      return;
    }

    setEphemeralNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // === Event Handlers for CRM Actions ===
  const onLeadFirstResponse = useCallback((contact: Contact) => {
    addNotification('new_lead_response', {
      contactId: contact.id,
      contactName: contact.name,
      message: `${contact.name} respondeu! Responda rapidamente para aumentar a conversao.`,
    });
  }, [addNotification]);

  const onLeadMessage = useCallback((contactId: string, contactName: string) => {
    pendingResponsesRef.current.set(contactId, {
      timestamp: new Date(),
      contactName,
    });
  }, []);

  const onSellerResponse = useCallback((contactId: string) => {
    pendingResponsesRef.current.delete(contactId);

    setEphemeralNotifications(prev =>
      prev.map(n =>
        n.type === 'pending_response' && n.contactId === contactId
          ? { ...n, isRead: true }
          : n
      )
    );
  }, []);

  const onStageChanged = useCallback((contact: Contact, fromStage: PipelineStage, toStage: PipelineStage) => {
    const stageInfo = PIPELINE_STAGES[toStage];
    addNotification('stage_changed', {
      contactId: contact.id,
      contactName: contact.name,
      message: `${contact.name} movido para "${stageInfo.title}"`,
    });
  }, [addNotification]);

  const onCallScheduled = useCallback((contact: Contact, scheduledTime: Date) => {
    const timeStr = scheduledTime.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
    addNotification('call_scheduled', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Chamada com ${contact.name} agendada para ${timeStr}`,
    });
  }, [addNotification]);

  const onVisitScheduled = useCallback((contact: Contact, scheduledTime: Date) => {
    const timeStr = scheduledTime.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
    addNotification('visit_scheduled', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Visita com ${contact.name} agendada para ${timeStr}`,
    });
  }, [addNotification]);

  const onProposalReady = useCallback((contact: Contact) => {
    addNotification('proposal_ready', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Proposta para ${contact.name} esta pronta! Envie agora.`,
    });
  }, [addNotification]);

  const onCallCompleted = useCallback((contact: Contact) => {
    addNotification('call_completed', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Chamada com ${contact.name} realizada com sucesso.`,
    });
  }, [addNotification]);

  const onVisitCompleted = useCallback((contact: Contact) => {
    addNotification('visit_completed', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Visita com ${contact.name} realizada com sucesso.`,
    });
  }, [addNotification]);

  const onFollowUpReminder = useCallback((contact: Contact, reason: string) => {
    addNotification('follow_up_reminder', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Lembre-se de entrar em contato com ${contact.name}: ${reason}`,
    });
  }, [addNotification]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    deleteNotification,
    refreshFinanceNotifications,
    confirmInstallmentPaid,
    rescheduleInstallment,
    // Event handlers
    onLeadFirstResponse,
    onLeadMessage,
    onSellerResponse,
    onStageChanged,
    onCallScheduled,
    onVisitScheduled,
    onProposalReady,
    onCallCompleted,
    onVisitCompleted,
    onFollowUpReminder,
  };
}

