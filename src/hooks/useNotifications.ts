import { useState, useCallback, useEffect, useRef } from 'react';
import { Notification, NotificationType, NOTIFICATION_CONFIG } from '@/types/notifications';
import { Contact, PipelineStage, PIPELINE_STAGES } from '@/types/solarzap';

// Check if current time is within business hours (8am - 6pm, Mon-Fri)
const isBusinessHours = (): boolean => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  // Monday = 1, Friday = 5
  const isWeekday = day >= 1 && day <= 5;
  const isWorkingHour = hour >= 8 && hour < 18;
  
  return isWeekday && isWorkingHour;
};

// Generate unique ID
const generateId = () => `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a pleasant notification sound
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // First tone
    oscillator1.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator1.type = 'sine';
    
    // Second tone (harmony)
    oscillator2.frequency.setValueAtTime(1318.5, audioContext.currentTime); // E6
    oscillator2.type = 'sine';
    
    // Volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    
    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.4);
    oscillator2.stop(audioContext.currentTime + 0.4);
    
    // Clean up
    setTimeout(() => {
      audioContext.close();
    }, 500);
  } catch (error) {
    console.log('Could not play notification sound:', error);
  }
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Track pending responses (contactId -> timestamp of last client message)
  const pendingResponsesRef = useRef<Map<string, { timestamp: Date; contactName: string }>>(new Map());
  const responseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update unread count when notifications change
  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.isRead).length);
  }, [notifications]);

  // Add a new notification with sound
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

    console.log('🔔 Adding notification:', notification.title, notification.message);
    
    setNotifications(prev => [notification, ...prev].slice(0, 100));
    
    // Play sound (default true)
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
          setNotifications(prev => {
            // Check if we already sent this notification
            const existingNotif = prev.find(
              n => n.type === 'pending_response' && 
                   n.contactId === contactId && 
                   !n.isRead
            );
            
            if (!existingNotif) {
              const config = NOTIFICATION_CONFIG['pending_response'];
              const notification: Notification = {
                id: generateId(),
                type: 'pending_response',
                priority: config.priority,
                title: config.title,
                message: `${data.contactName} aguarda resposta há mais de 10 minutos!`,
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

    responseCheckIntervalRef.current = setInterval(checkPendingResponses, 60000);
    
    return () => {
      if (responseCheckIntervalRef.current) {
        clearInterval(responseCheckIntervalRef.current);
      }
    };
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    pendingResponsesRef.current.clear();
  }, []);

  // Delete a specific notification
  const deleteNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // === Event Handlers for CRM Actions ===

  // When a lead sends a message (first response)
  const onLeadFirstResponse = useCallback((contact: Contact) => {
    addNotification('new_lead_response', {
      contactId: contact.id,
      contactName: contact.name,
      message: `${contact.name} respondeu! Responda rapidamente para aumentar a conversão.`,
    });
  }, [addNotification]);

  // When a lead sends any message (track for 10min rule)
  const onLeadMessage = useCallback((contactId: string, contactName: string) => {
    pendingResponsesRef.current.set(contactId, {
      timestamp: new Date(),
      contactName,
    });
  }, []);

  // When seller responds (clear pending response tracking)
  const onSellerResponse = useCallback((contactId: string) => {
    pendingResponsesRef.current.delete(contactId);
    
    // Also mark any pending response notifications as read
    setNotifications(prev => 
      prev.map(n => 
        n.type === 'pending_response' && n.contactId === contactId 
          ? { ...n, isRead: true } 
          : n
      )
    );
  }, []);

  // When pipeline stage changes
  const onStageChanged = useCallback((contact: Contact, fromStage: PipelineStage, toStage: PipelineStage) => {
    const stageInfo = PIPELINE_STAGES[toStage];
    addNotification('stage_changed', {
      contactId: contact.id,
      contactName: contact.name,
      message: `${contact.name} movido para "${stageInfo.title}"`,
    });
  }, [addNotification]);

  // When a call is scheduled
  const onCallScheduled = useCallback((contact: Contact, scheduledTime: Date) => {
    const timeStr = scheduledTime.toLocaleString('pt-BR', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    });
    console.log('📞 onCallScheduled called for:', contact.name);
    addNotification('call_scheduled', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Chamada com ${contact.name} agendada para ${timeStr}`,
    });
  }, [addNotification]);

  // When a visit is scheduled
  const onVisitScheduled = useCallback((contact: Contact, scheduledTime: Date) => {
    const timeStr = scheduledTime.toLocaleString('pt-BR', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    });
    console.log('🏠 onVisitScheduled called for:', contact.name);
    addNotification('visit_scheduled', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Visita com ${contact.name} agendada para ${timeStr}`,
    });
  }, [addNotification]);

  // When a proposal is ready
  const onProposalReady = useCallback((contact: Contact) => {
    console.log('📋 onProposalReady called for:', contact.name);
    addNotification('proposal_ready', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Proposta para ${contact.name} está pronta! Envie agora.`,
    });
  }, [addNotification]);

  // When a call is completed
  const onCallCompleted = useCallback((contact: Contact) => {
    console.log('✅ onCallCompleted called for:', contact.name);
    addNotification('call_completed', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Chamada com ${contact.name} realizada com sucesso.`,
    });
  }, [addNotification]);

  // When a visit is completed
  const onVisitCompleted = useCallback((contact: Contact) => {
    addNotification('visit_completed', {
      contactId: contact.id,
      contactName: contact.name,
      message: `Visita com ${contact.name} realizada com sucesso.`,
    });
  }, [addNotification]);

  // Follow-up reminder
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
