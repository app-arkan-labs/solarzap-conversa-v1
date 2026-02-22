import { Component, ReactNode, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useLeads } from '@/hooks/domain/useLeads';
import { useChat } from '@/hooks/domain/useChat';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';
import { usePipeline } from '@/hooks/domain/usePipeline';
import { SolarZapNav } from './SolarZapNav';
import { ConversationList } from './ConversationList';
import { ChatArea } from './ChatArea';
import { ActionsPanel } from './ActionsPanel';
import { PipelineView } from './PipelineView';
import { CalendarView } from './CalendarView';
import { ContactsView } from './ContactsView';
import { DashboardView } from './DashboardView';
import { IntegrationsView } from './IntegrationsView';
import { AutomationsView } from './AutomationsView';
import { AIAgentsView } from './AIAgentsView';
import { KnowledgeBaseView } from './KnowledgeBaseView';
import { ProposalsView } from './ProposalsView';
import { ConfiguracoesContaView } from './ConfiguracoesContaView';
import { NotificationsPanel } from './NotificationsPanel';
import { CreateLeadModal, CreateLeadData } from './CreateLeadModal';
import { AppointmentModal } from './AppointmentModal';
import { VisitOutcomeAfterModal, VisitOutcomeItem } from './VisitOutcomeAfterModal';
// import { ScheduleModal, ScheduleData } from './ScheduleModal'; // Replaced by AppointmentModal
import { ProposalModal, ProposalData } from './ProposalModal';
import { CallConfirmModal } from './CallConfirmModal';
import { VisitScheduleConfirmModal } from './VisitScheduleConfirmModal';
import { MoveToProposalModal } from './MoveToProposalModal';
import { GenerateProposalPromptModal } from './GenerateProposalPromptModal';
import { ProposalReadyModal } from './ProposalReadyModal';
import { LeadCommentsModal } from './LeadCommentsModal';
import { Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Contact, PipelineStage, ChannelFilter, ActiveTab, Conversation } from '@/types/solarzap';
import { useAuth } from '@/contexts/AuthContext';
import { useAppointments } from '@/hooks/useAppointments';
import { useSellerPermissions } from '@/hooks/useSellerPermissions';
import { supabase } from '@/lib/supabase';
import AdminMembersPage from '@/pages/AdminMembersPage';

type AppointmentModalErrorBoundaryProps = {
  children: ReactNode;
  onError: (error: Error) => void;
};

type AppointmentModalErrorBoundaryState = {
  hasError: boolean;
};

type PipelineStageChangeOptions = {
  skipScheduleModal?: boolean;
  skipMoveToProposalModal?: boolean;
  skipGenerateProposalPromptModal?: boolean;
};

class AppointmentModalErrorBoundary extends Component<AppointmentModalErrorBoundaryProps, AppointmentModalErrorBoundaryState> {
  state: AppointmentModalErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppointmentModalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

const isAdminMembersPath = (pathname: string): boolean => pathname === '/admin/members';
const CONVERSAS_SIDEBAR_MIN_WIDTH = 280;
const CONVERSAS_SIDEBAR_MAX_WIDTH = 560;
const CONVERSAS_SIDEBAR_DEFAULT_WIDTH = 320;
const CONVERSAS_SIDEBAR_STORAGE_KEY = 'solarzap_conversas_sidebar_width';

export function SolarZapLayout() {
  const { orgId, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canAccessAdmin = role === 'owner' || role === 'admin';
  const { permissions: sellerPerms } = useSellerPermissions();
  // Domain Hooks
  const {
    contacts,
    isLoading: isLoadingLeads,
    showTeamLeads,
    setShowTeamLeads,
    canViewTeam,
    createLead,
    updateLead,
    deleteLead,
    importContacts,
    toggleLeadAi
  } = useLeads();

  const {
    conversations,
    allMessages,
    isLoadingMessages,
    sendMessage,
    sendAttachment,
    sendAudio,
    sendReaction
  } = useChat(contacts);

  const {
    events,
    isLoadingEvents,
    moveToPipeline,
    saveProposal,
    addEvent
  } = usePipeline();

  const { getMessage, isDragDropEnabled, activeSettings } = useAutomationSettings();
  const { appointments, updateAppointment } = useAppointments();

  // Global loading state - Only show full screen loader on INITIAL load (no data)
  // We check if lists are empty AND loading is true.
  const isInitialLoading =
    (isLoadingLeads && contacts.length === 0) ||
    (isLoadingMessages && conversations.length === 0) ||
    (isLoadingEvents && events.length === 0);

  // UI State
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    isAdminMembersPath(location.pathname) ? 'admin_members' : 'conversas',
  );
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('todos');
  const [stageFilter, setStageFilter] = useState<PipelineStage | 'todos'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationsSidebarWidth, setConversationsSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return CONVERSAS_SIDEBAR_DEFAULT_WIDTH;
    const raw = window.localStorage.getItem(CONVERSAS_SIDEBAR_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) return CONVERSAS_SIDEBAR_DEFAULT_WIDTH;
    return Math.min(CONVERSAS_SIDEBAR_MAX_WIDTH, Math.max(CONVERSAS_SIDEBAR_MIN_WIDTH, parsed));
  });
  const [isResizingConversationsSidebar, setIsResizingConversationsSidebar] = useState(false);
  const conversationsSidebarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isAdminMembersPath(location.pathname)) {
      if (activeTab !== 'admin_members') {
        setActiveTab('admin_members');
      }
      return;
    }

    if (activeTab === 'admin_members') {
      setActiveTab('conversas');
    }
  }, [activeTab, location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CONVERSAS_SIDEBAR_STORAGE_KEY, String(conversationsSidebarWidth));
  }, [conversationsSidebarWidth]);

  useEffect(() => {
    if (!isResizingConversationsSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = conversationsSidebarRef.current;
      if (!container) return;
      const left = container.getBoundingClientRect().left;
      const nextWidth = event.clientX - left;
      setConversationsSidebarWidth(
        Math.min(CONVERSAS_SIDEBAR_MAX_WIDTH, Math.max(CONVERSAS_SIDEBAR_MIN_WIDTH, nextWidth)),
      );
    };

    const handleMouseUp = () => {
      setIsResizingConversationsSidebar(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingConversationsSidebar]);

  const handleConversationsSidebarResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizingConversationsSidebar(true);
  }, []);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (location.pathname !== '/') {
      navigate('/');
    }
  }, [location.pathname, navigate]);

  // Derivar a conversa ativa da lista atualizada de conversas para garantir que temos as mensagens mais recentes
  const activeConversation = useMemo(() => {
    if (!selectedConversation) return null;
    return conversations.find(c => c.id === selectedConversation.id) || selectedConversation;
  }, [conversations, selectedConversation]);

  // Mark As Read logic (Local + potentially optimistic update if we had mutation)
  const markAsRead = useCallback((conversationId: string) => {
    // Since we don't have a mutation for reading status in DB yet, we can't persist it.
    // Ideally, useChat should expose a method to update the cache.
    // For now, we will handle it visually via selectedConversation update if needed,
    // but the ConversationList relies on 'conversations' prop.
    // NOTE: This feature was "local only" in the previous implementation.
  }, []);

  // Filter Logic
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      const matchesChannel = channelFilter === 'todos' || conv.contact.channel === channelFilter;
      const matchesStage = stageFilter === 'todos' || conv.contact.pipelineStage === stageFilter;
      const matchesSearch = searchQuery === '' ||
        conv.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (conv.contact.company?.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesChannel && matchesStage && matchesSearch;
    });
  }, [conversations, channelFilter, stageFilter, searchQuery]);

  // Set initial selected conversation
  if (!selectedConversation && conversations.length > 0) {
    // Avoid infinite loop by checking if it's already set or if we really need to set it
    // Actually, doing this in render is bad. Use useEffect.
  }

  // Notifications system
  const {
    notifications,
    unreadCount: unreadNotifications,
    markAsRead: markNotificationAsRead,
    markAllAsRead: markAllNotificationsAsRead,
    deleteNotification,
    clearAll: clearAllNotifications,
    onLeadFirstResponse,
    onLeadMessage,
    onSellerResponse,
    onStageChanged,
    onCallScheduled,
    onVisitScheduled,
    onProposalReady,
    onCallCompleted,
  } = useNotifications();

  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<'reuniao' | 'visita'>('reuniao');
  const [actionContact, setActionContact] = useState<Contact | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string>('');
  const [pendingVisitScheduleContactId, setPendingVisitScheduleContactId] = useState<string | null>(null);

  // Call confirmation modals
  const [callConfirmOpen, setCallConfirmOpen] = useState(false);
  const [pendingCallContact, setPendingCallContact] = useState<Contact | null>(null);

  // Visit schedule confirmation modal
  const [visitScheduleConfirmOpen, setVisitScheduleConfirmOpen] = useState(false);
  const [pendingVisitContact, setPendingVisitContact] = useState<Contact | null>(null);

  // Proposal flow modals
  const [moveToProposalOpen, setMoveToProposalOpen] = useState(false);
  const [generateProposalPromptOpen, setGenerateProposalPromptOpen] = useState(false);
  const [proposalReadyOpen, setProposalReadyOpen] = useState(false);

  // Last proposal data (for seller script in ProposalReadyModal)
  const [lastProposalSellerData, setLastProposalSellerData] = useState<any>(null);

  // Comments modal
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [commentsContact, setCommentsContact] = useState<Contact | null>(null);
  const [visitOutcomeModalOpen, setVisitOutcomeModalOpen] = useState(false);
  const [visitOutcomeSubmitting, setVisitOutcomeSubmitting] = useState(false);
  const [pendingVisitOutcome, setPendingVisitOutcome] = useState<VisitOutcomeItem | null>(null);
  const [dismissedVisitOutcomeIds, setDismissedVisitOutcomeIds] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  const tryOpenNextVisitOutcome = useCallback(() => {
    if (!activeSettings.visitOutcomeModalEnabled) return;
    if (visitOutcomeModalOpen || pendingVisitOutcome) return;

    const now = Date.now();
    const thresholdMs = 3 * 60 * 60 * 1000;

    const candidates = appointments
      .filter((appointment) => {
        const typeRaw = String(appointment.type || '').toLowerCase();
        const isVisit = typeRaw === 'visita' || typeRaw === 'visit';
        if (!isVisit) return false;
        if (dismissedVisitOutcomeIds.has(String(appointment.id))) return false;

        const outcome = String(appointment.outcome || '').trim();
        if (outcome) return false;

        const status = String(appointment.status || '').toLowerCase();
        if (status === 'canceled' || status === 'no_show') return false;

        const endAtMs = new Date(appointment.end_at).getTime();
        if (!Number.isFinite(endAtMs)) return false;

        return now - endAtMs >= thresholdMs;
      })
      .sort((a, b) => new Date(a.end_at).getTime() - new Date(b.end_at).getTime());

    const next = candidates[0];
    if (!next) return;

    const contact = contacts.find((c) => String(c.id) === String(next.lead_id));

    setPendingVisitOutcome({
      appointment_id: String(next.id),
      lead_id: Number(next.lead_id),
      lead_name: contact?.name || null,
      lead_stage: contact?.pipelineStage || null,
      start_at: next.start_at,
      end_at: next.end_at,
      title: next.title || null,
      notes: next.notes || null,
    });
    setVisitOutcomeModalOpen(true);
  }, [
    activeSettings.visitOutcomeModalEnabled,
    appointments,
    contacts,
    dismissedVisitOutcomeIds,
    pendingVisitOutcome,
    visitOutcomeModalOpen,
  ]);

  useEffect(() => {
    tryOpenNextVisitOutcome();
  }, [tryOpenNextVisitOutcome]);

  const closeVisitOutcomeModal = useCallback(() => {
    if (pendingVisitOutcome?.appointment_id) {
      setDismissedVisitOutcomeIds((prev) => {
        const next = new Set(prev);
        next.add(String(pendingVisitOutcome.appointment_id));
        return next;
      });
    }

    setVisitOutcomeModalOpen(false);
    setPendingVisitOutcome(null);
  }, [pendingVisitOutcome]);

  const handleAppointmentModalError = useCallback((error: Error) => {
    console.error(error);
    setIsScheduleOpen(false);
    toast({
      title: "Erro ao abrir agendamento",
      variant: "destructive",
    });
  }, [toast]);

  // Listen for custom events (e.g. from AppointmentModal)
  // Effect moved below goToConversation to avoid ReferenceError

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    if (conv) markAsRead(conv.id);
    setIsDetailsPanelOpen(false);
  };

  // Navigate to conversation with prefilled message
  const goToConversation = useCallback((contactId: string, prefilledMessage: string, shouldAutoMoveToVisita: boolean = false) => {
    console.log('goToConversation called with:', { contactId, prefilledMessage: prefilledMessage.substring(0, 50) + '...', shouldAutoMoveToVisita });

    // Try allConversations first (unfiltered implied by `conversations` being all)
    // In new hooks, `conversations` is all conversations.
    const conv = conversations.find(c => c.id === contactId);

    console.log('Found conversation:', conv?.id, conv?.contact?.name);

    if (conv) {
      if (shouldAutoMoveToVisita) {
        setPendingVisitScheduleContactId(contactId);
      }

      setActiveTab('conversas');
      setIsDetailsPanelOpen(false);

      setTimeout(() => {
        setSelectedConversation(conv);
        markAsRead(conv.id);
        setPendingChatMessage(prefilledMessage);
        toast({
          title: "Mensagem preparada",
          description: "Revise e edite a mensagem antes de enviar.",
        });
      }, 100);
    } else {
      console.error('Conversation not found for contactId:', contactId);
      toast({
        title: "Conversa não encontrada",
        description: `Não foi possível encontrar a conversa do lead (ID: ${contactId}).`,
        variant: "destructive",
      });
    }
  }, [conversations, markAsRead, setActiveTab, toast]);

  // Listen for custom events (e.g. from AppointmentModal)
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ contactId: string }>) => {
      console.log('Open chat event received:', e.detail);
      if (e.detail?.contactId) {
        goToConversation(e.detail.contactId, '', false);
      }
    };

    window.addEventListener('open-chat', handleOpenChat as EventListener);
    return () => window.removeEventListener('open-chat', handleOpenChat as EventListener);
  }, [goToConversation]);

  const handleAction = (action: string, contact?: Contact) => {
    const targetContact = contact || selectedConversation?.contact;
    if (!targetContact && action !== 'pipeline' && action !== 'details') return;

    switch (action) {
      case 'call':
        setPendingCallContact(targetContact || null);
        setCallConfirmOpen(true);
        break;

      case 'video_call':
        console.log('Action: video_call executing', targetContact);
        // Open Meet immediately
        window.open('https://meet.google.com/new', '_blank');

        if (targetContact) {
          // Pre-fill message instead of auto-sending
          const videoCallMsg = getMessage('videoCallMessage', { nome: targetContact.name || 'Cliente' });
          console.log('Setting pre-filled message:', videoCallMsg);
          setPendingChatMessage(videoCallMsg || "Vamos agendar uma videochamada?");

          toast({
            title: "Link do Meet aberto",
            description: "Revise a mensagem e envie para o cliente quando estiver pronto.",
          });
        } else {
          console.error('Video call action missing targetContact');
        }
        break;

      case 'schedule':
        setActionContact(targetContact || null);
        setScheduleType('reuniao');
        setIsScheduleOpen(true);
        break;

      case 'proposal':
        setActionContact(targetContact || null);
        setIsProposalOpen(true);
        break;

      case 'visit':
        setActionContact(targetContact || null);
        setScheduleType('visita');
        setIsScheduleOpen(true);
        break;

      case 'pipeline':
        setActiveTab('pipelines');
        break;

      case 'details':
        setActiveTab('contatos');
        break;

      case 'comments':
        setCommentsContact(targetContact || null);
        setCommentsModalOpen(true);
        break;

      case 'proposals':
        if (targetContact?.id) {
          localStorage.setItem('solarzap_proposals_filter_lead_id', String(targetContact.id));
        }
        setActiveTab('propostas');
        setIsDetailsPanelOpen(false);
        break;
    }
  };

  const handleCallConfirm = async (completed: boolean, feedback?: string) => {
    const contact = pendingCallContact;
    setCallConfirmOpen(false);

    if (!completed || !contact) {
      setPendingCallContact(null);
      return;
    }

    try {
      await handlePipelineStageChange(contact.id, 'chamada_realizada', { skipMoveToProposalModal: true });
      toast({
        title: "Chamada registrada!",
        description: `${contact.name} movido para "Chamada Realizada"`,
      });

      onCallCompleted(contact);

      if (feedback) {
        console.log('Call feedback:', { contactId: contact.id, feedback });

        if (contact.id && orgId) {
          import('@/lib/supabase').then(async (m) => {
            const { error: commentError } = await m.supabase
              .from('comentarios_leads')
              .insert([{
                org_id: orgId,
                lead_id: parseInt(contact.id),
                texto: `[Feedback Ligacao]: ${feedback}`,
                autor: 'Vendedor'
              }]);
            if (commentError) console.error("Error saving call comment:", commentError);
          });
        }

        toast({
          title: "Feedback registrado!",
          description: "A descricao da ligacao foi salva.",
        });
      }

      setActionContact(contact);
      setMoveToProposalOpen(true);
    } catch (error) {
      console.error('Call confirmation stage transition failed', {
        contactId: contact.id,
        targetStage: 'chamada_realizada',
        error,
      });
      toast({
        title: "Falha ao mover lead",
        description: "Nao foi possivel atualizar a etapa do lead apos confirmar a ligacao.",
        variant: "destructive",
      });
    } finally {
      setPendingCallContact(null);
    }
  };

  const handleMoveToProposalConfirm = async (moveToProposal: boolean) => {
    setMoveToProposalOpen(false);

    if (moveToProposal && actionContact) {
      await handlePipelineStageChange(actionContact.id, 'aguardando_proposta', { skipGenerateProposalPromptModal: true });
      toast({
        title: "Lead movido!",
        description: `${actionContact.name} movido para "Aguardando Proposta"`,
      });

      setTimeout(() => {
        setGenerateProposalPromptOpen(true);
      }, 3000);
    } else {
      setActionContact(null);
    }
  };

  const handleGenerateProposalPrompt = () => {
    setGenerateProposalPromptOpen(false);
    setIsProposalOpen(true);
  };

  const handleProposalReadyGoToConversation = (contactId: string, prefilledMessage: string) => {
    setProposalReadyOpen(false);
    if (contactId) {
      goToConversation(contactId, prefilledMessage, true);
    }
    setActionContact(null);
  };

  /* 
    CENTRALIZED PIPELINE AUTOMATION HANDLER 
    Ensures that ALL stage changes (Drag&Drop, Dropdown, Buttons) trigger the same behavior.
  */
  const handlePipelineStageChange = useCallback(async (contactId: string, newStage: PipelineStage, options: PipelineStageChangeOptions = {}) => {
    // 1. Check if configured to block/automate this transition
    // Note: The original Drag&Drop logic checked `isDragDropEnabled(toStage, fromStage)`.
    // Since we want this for ALL changes, we should use that check or a broader one.
    // For now, let's assume if it is enabled in settings, it applies to all movements.

    const contact = contacts.find(c => c.id === contactId);
    const oldStage = contact?.pipelineStage;

    // Perform the move
    await moveToPipeline({ contactId, newStage });

    if (!contact) return;
    if (oldStage) {
      onStageChanged(contact, oldStage as PipelineStage, newStage);
    }

    // 2. Trigger Automations based on destination stage
    // This logic was previously only in PipelineView.tsx

    switch (newStage) {
      case 'chamada_realizada':
        // When moved to "Chamada Realizada", ask if should move to "Aguardando Proposta"
        if (!options.skipMoveToProposalModal) {
          setActionContact(contact);
          setMoveToProposalOpen(true);
        }
        break;

      case 'aguardando_proposta':
        // When moved to "Aguardando Proposta", ask to generate proposal after delay
        if (!options.skipGenerateProposalPromptModal) {
          setActionContact(contact);
          setTimeout(() => {
            setGenerateProposalPromptOpen(true);
          }, 1500);
        }
        break;

      case 'proposta_pronta':
        // When moved to "Proposta Pronta", show proposal ready modal
        setActionContact(contact);
        setProposalReadyOpen(true);
        break;

      case 'visita_realizada':
        toast({
          title: "Visita realizada!",
          description: `${contact.name} movido para "Visita Realizada"`,
        });
        break;

      case 'chamada_agendada':
        if (!options.skipScheduleModal && isDragDropEnabled(newStage, oldStage)) {
          setActionContact(contact);
          setScheduleType('reuniao');
          setIsScheduleOpen(true);
        }
        break;

      case 'visita_agendada':
        if (!options.skipScheduleModal && isDragDropEnabled(newStage, oldStage)) {
          setActionContact(contact);
          setScheduleType('visita');
          setIsScheduleOpen(true);
        }
        break;

      // Add other cases from PipelineView here if needed

      case 'financiamento':
        toast({ title: "Crédito aprovado!", description: `${contact.name} movido para "Contrato Assinado"` });
        break;

      case 'contrato_assinado':
        // Chain automation?
        break;

      default:
        // No default automation
        break;
    }

  }, [contacts, moveToPipeline, onStageChanged, toast, isDragDropEnabled]);

  const handleVisitOutcomeSubmit = useCallback(async (targetStage: string, notes: string) => {
    if (!pendingVisitOutcome) return;

    const normalizedStage = targetStage as PipelineStage;
    const contact = contacts.find((c) => String(c.id) === String(pendingVisitOutcome.lead_id));

    setVisitOutcomeSubmitting(true);
    try {
      await updateAppointment({
        id: pendingVisitOutcome.appointment_id,
        data: {
          outcome: normalizedStage,
          status: 'completed',
        },
      });

      if (contact) {
        await handlePipelineStageChange(contact.id, normalizedStage);

        const commentText = [`Outcome visita: ${normalizedStage}`, notes].filter(Boolean).join('\n');
        if (commentText.trim() && orgId) {
          await supabase.from('comentarios_leads').insert({
            org_id: orgId,
            lead_id: Number(contact.id),
            texto: commentText,
            autor: 'Sistema',
          });
        }
      }

      setDismissedVisitOutcomeIds((prev) => {
        const next = new Set(prev);
        next.add(String(pendingVisitOutcome.appointment_id));
        return next;
      });

      setVisitOutcomeModalOpen(false);
      setPendingVisitOutcome(null);

      toast({
        title: 'Outcome da visita registrado',
        description: 'Lead atualizado e comentário salvo automaticamente.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao registrar outcome',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setVisitOutcomeSubmitting(false);
    }
  }, [contacts, handlePipelineStageChange, orgId, pendingVisitOutcome, toast, updateAppointment]);

  const handleCreateLead = async (data: CreateLeadData) => {
    await createLead(data);
    toast({
      title: "Lead criado!",
      description: `${data.nome} foi adicionado com sucesso.`,
    });
  };

  // handleSchedule removed (replaced by AppointmentModal onSuccess)

  const handleProposal = async (data: ProposalData) => {
    console.log('📋 handleProposal called with:', data);
    const selectedContact = actionContact || contacts.find(c => c.id === data.contactId);
    const proposalSegment =
      data.tipo_cliente === 'residencial'
        ? 'residencial'
        : data.tipo_cliente === 'rural'
          ? 'agronegocio'
          : data.tipo_cliente === 'usina'
            ? 'usina'
            : (data.tipo_cliente === 'comercial' || data.tipo_cliente === 'industrial')
              ? 'empresarial'
              : 'indefinido';

    const premiumPayloadAny =
      data.premiumPayload && typeof data.premiumPayload === 'object'
        ? (data.premiumPayload as Record<string, unknown>)
        : {};
    const selectedVariant = String((premiumPayloadAny as any)?.selected_variant || '').toLowerCase();
    const hasAI =
      typeof (premiumPayloadAny as any)?.ai_model === 'string' ||
      selectedVariant === 'a' ||
      selectedVariant === 'b' ||
      String((premiumPayloadAny as any)?.generatedBy || '').toLowerCase() === 'ai' ||
      (Array.isArray((premiumPayloadAny as any)?.ai_variants) && (premiumPayloadAny as any)?.ai_variants?.length > 0);
    const proposalSource: 'manual' | 'ai' | 'hybrid' = hasAI ? 'ai' : 'manual';

    const saveResult = await saveProposal({
      leadId: data.contactId,
      valorProjeto: data.valorTotal,
      consumoKwh: data.consumoMensal,
      potenciaKw: data.potenciaSistema,
      paineisQtd: data.quantidadePaineis,
      economiaMensal: data.economiaAnual / 12,
      paybackAnos: data.paybackMeses / 12,
      status: 'Enviada',
      tipoCliente: data.tipo_cliente,
      contactName: selectedContact?.name,
      observacoes: data.observacoes,
      source: proposalSource,
      segment: proposalSegment,
      premiumPayload: data.premiumPayload,
      contextEngine: data.contextEngine,
    });

    // Store seller script data for ProposalReadyModal
    const premiumContentFromPayload = data.premiumPayload && typeof data.premiumPayload === 'object'
      ? data.premiumPayload
      : null;
    if (selectedContact) {
      setLastProposalSellerData({
        contact: selectedContact,
        consumoMensal: data.consumoMensal,
        potenciaSistema: data.potenciaSistema,
        quantidadePaineis: data.quantidadePaineis,
        valorTotal: data.valorTotal,
        economiaAnual: data.economiaAnual,
        paybackMeses: data.paybackMeses,
        garantiaAnos: data.garantiaAnos,
        tipo_cliente: data.tipo_cliente,
        premiumContent: premiumContentFromPayload ? {
          segment: premiumContentFromPayload.segment,
          segmentLabel: premiumContentFromPayload.segmentLabel,
          headline: premiumContentFromPayload.headline,
          executiveSummary: premiumContentFromPayload.executiveSummary,
          valuePillars: premiumContentFromPayload.valuePillars,
          proofPoints: premiumContentFromPayload.proofPoints,
          objectionHandlers: premiumContentFromPayload.objectionHandlers,
          nextStepCta: premiumContentFromPayload.nextStepCta,
          persuasionScore: premiumContentFromPayload.persuasionScore,
          scoreBreakdown: premiumContentFromPayload.scoreBreakdown,
        } : undefined,
        taxaFinanciamento: (data as any).taxaFinanciamento,
        proposalVersionId: (saveResult as any)?.proposalVersionId || null,
        propostaId: (saveResult as any)?.proposal?.id || null,
      });
    }

    await handlePipelineStageChange(data.contactId, 'proposta_pronta');

    await updateLead({
      contactId: data.contactId,
      data: {
        valor_estimado: data.valorTotal,
        consumo_kwh: data.consumoMensal,
      }
    });

    const contact = selectedContact;

    if (contact) {
      onProposalReady(contact);
    }

    // Modal state is centralized in handlePipelineStageChange for proposta_pronta.
    return saveResult;
  };

  if (isInitialLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      <SolarZapNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        unreadNotifications={unreadNotifications}
        onNotificationsClick={() => setIsNotificationsPanelOpen(true)}
        isAdminUser={canAccessAdmin}
        onAdminMembersClick={() => navigate('/admin/members')}
        tabPermissions={{
          ia_agentes: sellerPerms.tab_ia_agentes,
          automacoes: sellerPerms.tab_automacoes,
          integracoes: sellerPerms.tab_integracoes,
          banco_ia: sellerPerms.tab_banco_ia,
          minha_conta: sellerPerms.tab_minha_conta,
        }}
      />

      <NotificationsPanel
        notifications={notifications}
        isOpen={isNotificationsPanelOpen}
        onClose={() => setIsNotificationsPanelOpen(false)}
        onMarkAsRead={markNotificationAsRead}
        onMarkAllAsRead={markAllNotificationsAsRead}
        onDelete={deleteNotification}
        onClearAll={clearAllNotifications}
        onGoToContact={(contactId) => {
          const conv = conversations.find(c => c.id === contactId);
          if (conv) {
            handleTabChange('conversas');
            setSelectedConversation(conv);
            markAsRead(conv.id);
          }
        }}
      />

      {activeTab === 'conversas' && (
        <>
          <div
            ref={conversationsSidebarRef}
            className="relative flex-shrink-0"
            style={{ width: conversationsSidebarWidth }}
          >
            <ConversationList
              conversations={filteredConversations}
              contacts={contacts}
              canViewTeam={canViewTeam}
              showTeamLeads={showTeamLeads}
              onToggleTeamLeads={setShowTeamLeads}
              selectedId={selectedConversation?.id || null}
              channelFilter={channelFilter}
              searchQuery={searchQuery}
              stageFilter={stageFilter}
              onSelect={handleSelectConversation}
              onChannelFilterChange={setChannelFilter}
              onSearchChange={setSearchQuery}
              onStageFilterChange={setStageFilter}
              onImportContacts={importContacts}
              onDeleteLead={sellerPerms.can_delete_leads ? async (id) => { await deleteLead(id); } : undefined}
            />
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar aba lateral"
              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
              onMouseDown={handleConversationsSidebarResizeStart}
            />
            <Button
              onClick={() => setIsCreateLeadOpen(true)}
              size="icon"
              className="absolute bottom-4 right-4 rounded-full w-12 h-12 shadow-lg"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          <ChatArea
            conversation={activeConversation}
            conversations={conversations}
            onToggleLeadAi={sellerPerms.can_toggle_ai ? toggleLeadAi : undefined}
            onSendMessage={async (conversationId, content, instanceName, replyTo) => {
              console.log('SolarZapLayout: onSendMessage called', { conversationId, contentLength: content.length, instanceName, replyTo });
              try {
                await sendMessage({ conversationId, content, instanceName, replyTo });
                onSellerResponse(conversationId);
              } catch (error) {
                console.error('Failed to send message:', error);
                toast({
                  title: "Erro ao enviar mensagem",
                  description: error instanceof Error ? error.message : "Ocorreu um erro desconhecido",
                  variant: "destructive"
                });
              }
            }}
            onSendAttachment={async (id, file, type, caption, instanceName) => {
              await sendAttachment({ conversationId: id, file, fileType: type, caption, instanceName });
              onSellerResponse(id);
            }}
            onSendAudio={async (id, blob, duration, instanceName) => {
              await sendAudio({ conversationId: id, audioBlob: blob, duration, instanceName });
              onSellerResponse(id);
            }}
            onOpenDetails={() => setIsDetailsPanelOpen(true)}
            isDetailsOpen={isDetailsPanelOpen}
            onCallAction={(contact) => {
              setPendingCallContact(contact);
              setCallConfirmOpen(true);
            }}
            onImportContacts={importContacts}
            initialMessage={pendingChatMessage}
            onInitialMessageUsed={() => setPendingChatMessage('')}
            onClientMessage={(conversationId) => {
              if (pendingVisitScheduleContactId && conversationId === pendingVisitScheduleContactId) {
                const contact = conversations.find(c => c.id === conversationId)?.contact;
                if (contact) {
                  setPendingVisitContact(contact);
                  setVisitScheduleConfirmOpen(true);
                }
                setPendingVisitScheduleContactId(null);
              }
            }}
            onSendReaction={async (messageId, waMessageId, remoteJid, emoji, instanceName) => {
              try {
                await sendReaction({ messageId, waMessageId, remoteJid, emoji, instanceName });
                toast({
                  title: "Reação enviada!",
                  description: `${emoji}`,
                });
              } catch (error) {
                console.error('Failed to send reaction:', error);
                toast({
                  title: "Erro ao enviar reação",
                  description: error instanceof Error ? error.message : "Ocorreu um erro",
                  variant: "destructive"
                });
              }
            }}
            onVideoCallAction={(contact) => {
              // Pre-fill message instead of auto-sending - seller reviews and sends
              console.log('Video Call Action Triggered', contact);
              const videoCallMsg = getMessage('videoCallMessage', { nome: contact.name || 'Cliente' });
              console.log('Generated Video Msg:', videoCallMsg);

              if (!videoCallMsg) {
                console.warn("Empty video call message config!");
              }

              setPendingChatMessage(videoCallMsg || "Vamos agendar uma videochamada?"); // Fallback

              toast({
                title: "Link do Meet aberto",
                description: "Revise a mensagem e envie para o cliente quando estiver pronto.",
              });
            }}
          />

          {isDetailsPanelOpen && (
            <ActionsPanel
              conversation={activeConversation}
              onMoveToPipeline={handlePipelineStageChange}
              onAction={handleAction}
              onClose={() => setIsDetailsPanelOpen(false)}
              onUpdateLead={async (contactId, data) => { await updateLead({ contactId, data }); }}
            />
          )}
        </>
      )}

      {activeTab === 'pipelines' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          <PipelineView
            contacts={contacts}
            events={events}
            onMoveToPipeline={handlePipelineStageChange}
            onUpdateLead={async (contactId, data) => { await updateLead({ contactId, data }); }}
            onToggleLeadAi={sellerPerms.can_toggle_ai ? toggleLeadAi : undefined}
            onGoToConversation={goToConversation}
            onCallAction={(contact) => {
              setPendingCallContact(contact);
              setCallConfirmOpen(true);
            }}
            onGenerateProposal={handleProposal}
            onImportContacts={importContacts}
            onDeleteLead={sellerPerms.can_delete_leads ? async (id) => { await deleteLead(id); } : undefined}
            onSchedule={(contact, type) => {
              setActionContact(contact);
              setScheduleType(type === 'reuniao' ? 'reuniao' : 'visita');
              setIsScheduleOpen(true);
            }}
          />
          <Button
            onClick={() => setIsCreateLeadOpen(true)}
            size="icon"
            data-testid="open-create-lead-modal"
            className="absolute bottom-4 right-4 rounded-full w-12 h-12 shadow-lg z-10"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      )}

      {activeTab === 'calendario' && (
        <CalendarView contacts={contacts} />
      )}

      {activeTab === 'contatos' && (
        <div className="flex-1 relative">
          <ContactsView
            contacts={contacts}
            onUpdateLead={async (contactId, data) => { await updateLead({ contactId, data }); }}
            onImportContacts={importContacts}
            onDeleteLead={sellerPerms.can_delete_leads ? async (id) => { await deleteLead(id); } : undefined}
            onToggleLeadAi={sellerPerms.can_toggle_ai ? toggleLeadAi : undefined}
          />
          <Button
            onClick={() => setIsCreateLeadOpen(true)}
            size="icon"
            data-testid="open-create-lead-modal"
            className="absolute bottom-4 right-4 rounded-full w-12 h-12 shadow-lg z-10"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <DashboardView onNavigate={(tab) => handleTabChange(tab as any)} />
      )}

      {activeTab === 'propostas' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <ProposalsView />
        </div>
      )}

      {activeTab === 'admin_members' && (
        <div className="flex-1 h-full overflow-hidden">
          <AdminMembersPage embedded />
        </div>
      )}

      {activeTab === 'integracoes' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <IntegrationsView />
        </div>
      )}

      {activeTab === 'automacoes' && (
        <AutomationsView />
      )}

      {activeTab === 'ia_agentes' && (
        <AIAgentsView />
      )}

      {activeTab === 'banco_ia' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <KnowledgeBaseView />
        </div>
      )}

      {activeTab === 'minha_conta' && (
        <div className="flex-1 h-full overflow-auto">
          <ConfiguracoesContaView />
        </div>
      )}

      <CreateLeadModal
        isOpen={isCreateLeadOpen}
        onClose={() => setIsCreateLeadOpen(false)}
        onSave={handleCreateLead}
      />

      <AppointmentModalErrorBoundary
        key={`appointment-${isScheduleOpen ? 'open' : 'closed'}-${actionContact?.id ?? 'none'}-${scheduleType}`}
        onError={handleAppointmentModalError}
      >
        <AppointmentModal
          isOpen={isScheduleOpen}
          onClose={() => setIsScheduleOpen(false)}
          preselectedLeadId={actionContact?.id}
          preselectedContact={actionContact || undefined}
          initialData={undefined}
          initialType={scheduleType}
          onSuccess={async (appointment) => {
            if (!actionContact) return;

            const isCallLikeType = appointment.type === 'reuniao' || appointment.type === 'chamada' || appointment.type === 'meeting' || appointment.type === 'call';
            const newStage: PipelineStage = isCallLikeType ? 'chamada_agendada' : 'visita_agendada';
            await handlePipelineStageChange(actionContact.id, newStage, { skipScheduleModal: true });

            const dateStr = new Date(appointment.start_at).toLocaleDateString('pt-BR');
            const timeStr = format(new Date(appointment.start_at), 'HH:mm');

            let message = '';
            if (isCallLikeType) {
              message = getMessage('callScheduledMessage', { data: dateStr, hora: timeStr });
            } else {
              message = getMessage('visitScheduledMessage', { data: dateStr, hora: timeStr });
            }

            goToConversation(actionContact.id, message, false);

            const startDate = new Date(appointment.start_at);
            if (isCallLikeType) {
              onCallScheduled(actionContact, startDate);
            } else {
              onVisitScheduled(actionContact, startDate);
            }

            toast({
              title: "Agendamento realizado!",
              description: `Lead movido para "${newStage === 'chamada_agendada' ? 'Chamada Agendada' : 'Visita Agendada'}"`
            });
          }}
        />
      </AppointmentModalErrorBoundary>

      <ProposalModal
        isOpen={isProposalOpen}
        onClose={() => {
          setIsProposalOpen(false);
          // Don't clear actionContact here as we need it for ProposalReadyModal
        }}
        contact={actionContact}
        onGenerate={handleProposal}
      />

      <CallConfirmModal
        isOpen={callConfirmOpen}
        onClose={() => {
          setCallConfirmOpen(false);
          setPendingCallContact(null);
        }}
        onConfirm={handleCallConfirm}
        contactName={pendingCallContact?.name || ''}
        contactPhone={pendingCallContact?.phone || ''}
      />

      <MoveToProposalModal
        isOpen={moveToProposalOpen}
        onClose={() => {
          setMoveToProposalOpen(false);
          setActionContact(null);
        }}
        onConfirm={handleMoveToProposalConfirm}
        contactName={actionContact?.name || ''}
      />

      <GenerateProposalPromptModal
        isOpen={generateProposalPromptOpen}
        onClose={() => {
          setGenerateProposalPromptOpen(false);
          setActionContact(null);
        }}
        onGenerate={handleGenerateProposalPrompt}
        contactName={actionContact?.name || ''}
      />

      <ProposalReadyModal
        isOpen={proposalReadyOpen}
        onClose={() => {
          setProposalReadyOpen(false);
          setActionContact(null);
          setLastProposalSellerData(null);
        }}
        onGoToConversation={handleProposalReadyGoToConversation}
        contactId={actionContact?.id || ''}
        contactName={actionContact?.name || ''}
        events={events}
        sellerScriptData={lastProposalSellerData}
      />

      <LeadCommentsModal
        isOpen={commentsModalOpen}
        onClose={() => {
          setCommentsModalOpen(false);
          setCommentsContact(null);
        }}
        leadId={commentsContact?.id || ''}
        leadName={commentsContact?.name || ''}
      />

      <VisitOutcomeAfterModal
        item={pendingVisitOutcome}
        open={visitOutcomeModalOpen}
        submitting={visitOutcomeSubmitting}
        onSubmit={handleVisitOutcomeSubmit}
        onClose={closeVisitOutcomeModal}
      />

      <VisitScheduleConfirmModal
        isOpen={visitScheduleConfirmOpen}
        onClose={() => {
          setVisitScheduleConfirmOpen(false);
          setPendingVisitContact(null);
        }}
        onConfirm={(approved) => {
          setVisitScheduleConfirmOpen(false);
          if (approved && pendingVisitContact) {
            setActionContact(pendingVisitContact);
            setScheduleType('visita');
            setIsScheduleOpen(true);
          }
          setPendingVisitContact(null);
        }}
        contactName={pendingVisitContact?.name || ''}
      />
    </div >
  );
}
