import { Component, ReactNode, Suspense, lazy, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useLeads } from '@/hooks/domain/useLeads';
import { useChat } from '@/hooks/domain/useChat';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';
import { usePipeline } from '@/hooks/domain/usePipeline';
import { SolarZapNav } from './SolarZapNav';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMoreModal } from './MobileMoreModal';
import { CreateLeadModal, CreateLeadData } from './CreateLeadModal';
import { AppointmentModal } from './AppointmentModal';
import { VisitOutcomeAfterModal, VisitOutcomeItem } from './VisitOutcomeAfterModal';
import { ProjectPaidFinanceModal } from './ProjectPaidFinanceModal';
// import { ScheduleModal, ScheduleData } from './ScheduleModal'; // Replaced by AppointmentModal
import { ProposalModal, ProposalData } from './ProposalModal';
import { CallConfirmModal } from './CallConfirmModal';
import { VisitScheduleConfirmModal } from './VisitScheduleConfirmModal';
import { MoveToProposalModal } from './MoveToProposalModal';
import { GenerateProposalPromptModal } from './GenerateProposalPromptModal';
import { ProposalReadyModal } from './ProposalReadyModal';
import { LeadCommentsModal } from './LeadCommentsModal';
import { FollowUpExhaustedModal, type FollowUpLostReasonKey } from './FollowUpExhaustedModal';
import { Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Contact, PipelineStage, ChannelFilter, ActiveTab, Conversation } from '@/types/solarzap';
import { useAuth } from '@/contexts/AuthContext';
import { useAppointments } from '@/hooks/useAppointments';
import { useSellerPermissions } from '@/hooks/useSellerPermissions';
import { supabase } from '@/lib/supabase';
import { getAuthUserDisplayName } from '@/lib/memberDisplayName';
import { OrganizationSelectorPanel } from '@/components/organization/OrganizationSelectorPanel';
import type { UpdateLeadData } from './EditLeadModal';
import BillingBanner from '@/components/billing/BillingBanner';
import FeatureSoftWall from '@/components/billing/FeatureSoftWall';
import { buildLossReasonSummary, findLossReasonByKey } from '@/hooks/useLossReasons';
import { useBillingBlocker } from '@/contexts/BillingBlockerContext';
import { buildTabBlocker } from '@/lib/billingBlocker';
import { cn } from '@/lib/utils';
import { useGuidedTour } from '@/hooks/useGuidedTour';
import GuidedTour from '@/components/onboarding/GuidedTour';
import { isMobileMoreTabActive, type SolarZapTabPermissions } from './mobileNavConfig';

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
  skipProjectPaidFinanceModal?: boolean;
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

const isAdminMembersPath = (pathname: string): boolean => pathname === '/settings/members';
const CONVERSAS_SIDEBAR_MIN_WIDTH = 280;
const CONVERSAS_SIDEBAR_MAX_WIDTH = 560;
const CONVERSAS_SIDEBAR_DEFAULT_WIDTH = 320;
const CONVERSAS_SIDEBAR_STORAGE_KEY = 'solarzap_conversas_sidebar_width';
const BILLING_GOVERNED_TABS = new Set<ActiveTab>([
  'disparos',
  'propostas',
  'automacoes',
  'tracking',
  'integracoes',
  'calendario',
  'ia_agentes',
]);
const BILLING_USAGE_TARGET_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="switch"], [contenteditable="true"], [contenteditable=""]';

const shouldBlockBillingGovernedInteraction = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof Element)) return false;
  return target.closest(BILLING_USAGE_TARGET_SELECTOR) !== null;
};

const PipelineView = lazy(() => import('./PipelineView').then((module) => ({ default: module.PipelineView })));
const CalendarView = lazy(() => import('./CalendarView').then((module) => ({ default: module.CalendarView })));
const ContactsView = lazy(() => import('./ContactsView').then((module) => ({ default: module.ContactsView })));
const DashboardView = lazy(() => import('./DashboardView').then((module) => ({ default: module.DashboardView })));
const IntegrationsView = lazy(() => import('./IntegrationsView').then((module) => ({ default: module.IntegrationsView })));
const TrackingView = lazy(() => import('./TrackingView').then((module) => ({ default: module.TrackingView })));
const AutomationsView = lazy(() => import('./AutomationsView').then((module) => ({ default: module.AutomationsView })));
const AIAgentsView = lazy(() => import('./AIAgentsView').then((module) => ({ default: module.AIAgentsView })));
const KnowledgeBaseView = lazy(() => import('./KnowledgeBaseView').then((module) => ({ default: module.KnowledgeBaseView })));
const ProposalsView = lazy(() => import('./ProposalsView').then((module) => ({ default: module.ProposalsView })));
const BroadcastView = lazy(() => import('./BroadcastView').then((module) => ({ default: module.BroadcastView })));
const ConfiguracoesContaView = lazy(() => import('./ConfiguracoesContaView').then((module) => ({ default: module.ConfiguracoesContaView })));
const MeuPlanoView = lazy(() => import('./MeuPlanoView').then((module) => ({ default: module.MeuPlanoView })));
const AdminMembersPage = lazy(() => import('@/pages/AdminMembersPage'));
const ConversationList = lazy(() => import('./ConversationList').then((module) => ({ default: module.ConversationList })));
const ChatArea = lazy(() => import('./ChatArea').then((module) => ({ default: module.ChatArea })));
const ActionsPanel = lazy(() => import('./ActionsPanel').then((module) => ({ default: module.ActionsPanel })));
const NotificationsPanel = lazy(() => import('./NotificationsPanel').then((module) => ({ default: module.NotificationsPanel })));

function TabLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

export function SolarZapLayout() {
  const { user, orgId, role, hasMultipleOrganizations, organizations, selectOrganization, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canAccessAdmin = role === 'owner' || role === 'admin';
  const activeOrganizationName = useMemo(() => {
    if (!orgId) return null;
    const current = organizations.find((organization) => organization.org_id === orgId);
    return current?.display_name || null;
  }, [orgId, organizations]);
  const userAvatarUrl = useMemo(() => {
    const metadata = user?.user_metadata;
    if (!metadata || typeof metadata !== 'object') return null;

    const candidate = (metadata as Record<string, unknown>).avatar_url;
    if (typeof candidate !== 'string') return null;

    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : null;
  }, [user]);
  const userDisplayName = useMemo(() => (user ? getAuthUserDisplayName(user) : ''), [user]);
  const { permissions: sellerPerms } = useSellerPermissions();
  const { billing, openBillingBlocker } = useBillingBlocker();
  const accessState = billing?.access_state ?? 'full';
  const trackingFeatureBlocker = useMemo(() => {
    if (!billing) return null;
    const blocker = buildTabBlocker('tracking', billing);
    return blocker?.kind === 'feature_locked' ? blocker : null;
  }, [billing]);
  // Domain Hooks
  const {
    contacts,
    isLoading: isLoadingLeads,
    leadScope,
    setLeadScope,
    leadScopeMembers,
    isLoadingLeadScopeMembers,
    canViewTeam,
    createLead,
    updateLead,
    deleteLead,
    importContacts,
    toggleLeadAi,
    toggleLeadFollowUp,
  } = useLeads();

  const {
    conversations,
    allMessages,
    isLoadingMessages,
    sendMessage,
    sendAttachment,
    sendAudio,
    sendReaction,
    markAsRead: markConversationAsRead,
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
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1023px)').matches;
  });
  const conversationsSidebarRef = useRef<HTMLDivElement | null>(null);
  const proposalPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectPaidFinanceResolverRef = useRef<((completed: boolean) => void) | null>(null);

  // Cleanup proposal prompt timer on unmount
  useEffect(() => {
    return () => {
      if (proposalPromptTimerRef.current) clearTimeout(proposalPromptTimerRef.current);
      if (projectPaidFinanceResolverRef.current) {
        projectPaidFinanceResolverRef.current(false);
        projectPaidFinanceResolverRef.current = null;
      }
    };
  }, []);

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
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1023px)');

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(media.matches);

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMediaChange);
      return () => media.removeEventListener('change', handleMediaChange);
    }

    media.addListener(handleMediaChange);
    return () => media.removeListener(handleMediaChange);
  }, []);

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
  const openTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (location.pathname !== '/') {
      navigate('/');
    }
    return true;
  }, [location.pathname, navigate]);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    return openTab(tab);
  }, [openTab]);

  const handleBillingGovernedInteractionCapture = useCallback((event: React.SyntheticEvent<HTMLElement>) => {
    if (!BILLING_GOVERNED_TABS.has(activeTab)) return;
    if (!shouldBlockBillingGovernedInteraction(event.target)) return;

    const blocker = buildTabBlocker(activeTab, billing);
    if (!blocker) return;

    event.preventDefault();
    event.stopPropagation();
    openBillingBlocker(blocker);
  }, [activeTab, billing, openBillingBlocker]);

  const handleBillingGovernedKeyDownCapture = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (!BILLING_GOVERNED_TABS.has(activeTab)) return;
    if (!shouldBlockBillingGovernedInteraction(event.target)) return;
    if (
      event.key === 'Tab' ||
      event.key === 'Shift' ||
      event.key === 'Escape' ||
      event.key.startsWith('Arrow')
    ) {
      return;
    }

    const blocker = buildTabBlocker(activeTab, billing);
    if (!blocker) return;

    event.preventDefault();
    event.stopPropagation();
    openBillingBlocker(blocker);
  }, [activeTab, billing, openBillingBlocker]);

  const openProposalFlow = useCallback((contact: Contact | null) => {
    const blocker = buildTabBlocker('propostas', billing);
    if (blocker) {
      openBillingBlocker(blocker);
      return false;
    }

    setActionContact(contact || null);
    setIsProposalOpen(true);
    return true;
  }, [billing, openBillingBlocker]);

  const openScheduleFlow = useCallback((contact: Contact | null, type: 'reuniao' | 'visita') => {
    const blocker = buildTabBlocker('calendario', billing);
    if (blocker) {
      openBillingBlocker(blocker);
      return false;
    }

    setActionContact(contact || null);
    setScheduleType(type);
    setIsScheduleOpen(true);
    return true;
  }, [billing, openBillingBlocker]);


  // Derivar a conversa ativa da lista atualizada de conversas para garantir que temos as mensagens mais recentes
  const activeConversation = useMemo(() => {
    if (!selectedConversation) return null;
    return conversations.find(c => c.id === selectedConversation.id) || selectedConversation;
  }, [conversations, selectedConversation]);

  // Mark As Read logic (Local + potentially optimistic update if we had mutation)
  // Mark As Read — delegates to useChat which persists to DB (Sprint 2, Item #4)
  const markAsRead = useCallback((conversationId: string) => {
    markConversationAsRead(conversationId);
  }, [markConversationAsRead]);

  // Filter Logic
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      const matchesChannel = channelFilter === 'todos' || conv.contact.channel === channelFilter;
      const matchesStage = stageFilter === 'todos' || conv.contact.pipelineStage === stageFilter;
      const matchesSearch = searchQuery === '' ||
        conv.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.contact.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.contact.phone?.toLowerCase().includes(searchQuery.toLowerCase());
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
    confirmInstallmentPaid,
    rescheduleInstallment,
  } = useNotifications();

  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
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
  const [projectPaidFinanceOpen, setProjectPaidFinanceOpen] = useState(false);
  const [projectPaidFinanceContact, setProjectPaidFinanceContact] = useState<Contact | null>(null);

  // Last proposal data (for seller script in ProposalReadyModal)
  const [lastProposalSellerData, setLastProposalSellerData] = useState<any>(null);

  // Comments modal
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [commentsContact, setCommentsContact] = useState<Contact | null>(null);
  const [isOrganizationSwitcherOpen, setIsOrganizationSwitcherOpen] = useState(false);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<string | null>(null);
  const [visitOutcomeModalOpen, setVisitOutcomeModalOpen] = useState(false);
  const [visitOutcomeSubmitting, setVisitOutcomeSubmitting] = useState(false);
  const [pendingVisitOutcome, setPendingVisitOutcome] = useState<VisitOutcomeItem | null>(null);
  const [dismissedVisitOutcomeIds, setDismissedVisitOutcomeIds] = useState<Set<string>>(new Set());
  const [followUpExhaustedModalOpen, setFollowUpExhaustedModalOpen] = useState(false);
  const [followUpExhaustedLeadId, setFollowUpExhaustedLeadId] = useState<string | null>(null);
  const [followUpExhaustedSubmitting, setFollowUpExhaustedSubmitting] = useState(false);

  const { toast } = useToast();

  const openFollowUpExhaustedForLead = useCallback((leadId: string) => {
    const candidate = contacts.find((contact) => contact.id === leadId);
    if (!candidate) return;
    if ((candidate.followUpStep ?? 0) < 5) return;
    if (candidate.followUpExhaustedSeen !== false) return;

    setFollowUpExhaustedLeadId(candidate.id);
    setFollowUpExhaustedModalOpen(true);
  }, [contacts]);

  const followUpExhaustedLead = useMemo(() => {
    if (!followUpExhaustedLeadId) return null;
    return contacts.find((contact) => contact.id === followUpExhaustedLeadId) || null;
  }, [contacts, followUpExhaustedLeadId]);

  useEffect(() => {
    if (activeTab !== 'conversas') return;
    const candidate = activeConversation?.contact;
    if (!candidate) return;
    openFollowUpExhaustedForLead(candidate.id);
  }, [
    activeTab,
    activeConversation?.id,
    activeConversation?.contact?.followUpStep,
    activeConversation?.contact?.followUpExhaustedSeen,
    openFollowUpExhaustedForLead,
  ]);

  const handleSelectOrganizationFromModal = useCallback(async (nextOrgId: string) => {
    try {
      setSwitchingOrganizationId(nextOrgId);
      await selectOrganization(nextOrgId, { reload: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao selecionar organização.';
      toast({
        title: 'Erro ao trocar empresa',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSwitchingOrganizationId(null);
    }
  }, [selectOrganization, toast]);

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
    import.meta.env.DEV && console.log('goToConversation called with:', { contactId, prefilledMessage: prefilledMessage.substring(0, 50) + '...', shouldAutoMoveToVisita });

    // Try allConversations first (unfiltered implied by `conversations` being all)
    // In new hooks, `conversations` is all conversations.
    const conv = conversations.find(c => c.id === contactId);

    import.meta.env.DEV && console.log('Found conversation:', conv?.id, conv?.contact?.name);

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
      import.meta.env.DEV && console.log('Open chat event received:', e.detail);
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
        import.meta.env.DEV && console.log('Action: video_call executing', targetContact);
        // Open Meet immediately
        window.open('https://meet.google.com/new', '_blank');

        if (targetContact) {
          // Pre-fill message instead of auto-sending
          const videoCallMsg = getMessage('videoCallMessage', { nome: targetContact.name || 'Cliente' });
          import.meta.env.DEV && console.log('Setting pre-filled message:', videoCallMsg);
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
        openScheduleFlow(targetContact || null, 'reuniao');
        break;

      case 'proposal':
        openProposalFlow(targetContact || null);
        break;

      case 'visit':
        openScheduleFlow(targetContact || null, 'visita');
        break;

      case 'pipeline':
        handleTabChange('pipelines');
        break;

      case 'details':
        handleTabChange('contatos');
        break;

      case 'comments':
        setCommentsContact(targetContact || null);
        setCommentsModalOpen(true);
        break;

      case 'proposals':
        if (targetContact?.id) {
          localStorage.setItem('solarzap_proposals_filter_lead_id', String(targetContact.id));
        }
        handleTabChange('propostas');
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

      const normalizedFeedback = String(feedback || '').trim();
      if (normalizedFeedback) {
        import.meta.env.DEV && console.log('Call feedback:', { contactId: contact.id, feedback: normalizedFeedback });

        if (contact.id && orgId) {
          void (async () => {
            try {
              const leadId = parseInt(contact.id, 10);
              const { error: commentError } = await supabase
                .from('comentarios_leads')
                .insert([{
                  org_id: orgId,
                  lead_id: leadId,
                  texto: `[Feedback Ligação]: ${normalizedFeedback}`,
                  autor: 'Vendedor',
                }]);
              if (commentError) {
                console.error('Error saving call comment:', commentError);
                return;
              }

              const { error: scheduleError } = await supabase
                .from('scheduled_agent_jobs')
                .insert({
                  org_id: orgId,
                  lead_id: leadId,
                  agent_type: 'post_call',
                  scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                  status: 'pending',
                  guard_stage: 'chamada_realizada',
                  payload: {
                    comment_text: normalizedFeedback,
                    instance_name: contact.instanceName || null,
                  },
                });

              if (scheduleError) {
                console.error('Error scheduling post-call agent job:', scheduleError);
              }
            } catch (commentError) {
              console.error('Unexpected error saving call comment:', commentError);
            }
          })();
        }

        toast({
          title: "Feedback registrado!",
          description: "A descrição da ligação foi salva.",
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
        description: "Não foi possível atualizar a etapa do lead após confirmar a ligação.",
        variant: "destructive",
      });
    } finally {
      setPendingCallContact(null);
    }
  };

  const handleMoveToProposalConfirm = async (moveToProposal: boolean) => {
    setMoveToProposalOpen(false);

    if (moveToProposal && actionContact) {
      try {
        await handlePipelineStageChange(actionContact.id, 'aguardando_proposta', { skipGenerateProposalPromptModal: true });
        toast({
          title: "Lead movido!",
          description: `${actionContact.name} movido para "Aguardando Proposta"`,
        });

        proposalPromptTimerRef.current = setTimeout(() => {
          setGenerateProposalPromptOpen(true);
        }, 3000);
      } catch (error) {
        console.error('Move to aguardando_proposta failed', {
          contactId: actionContact.id,
          targetStage: 'aguardando_proposta',
          error,
        });
        toast({
          title: "Falha ao mover lead",
          description: "Não foi possível mover o lead para \"Aguardando Proposta\".",
          variant: "destructive",
        });
      }
    } else {
      setActionContact(null);
    }
  };

  const handleGenerateProposalPrompt = () => {
    setGenerateProposalPromptOpen(false);
    openProposalFlow(actionContact || null);
  };

  const handleProposalReadyGoToConversation = (contactId: string, prefilledMessage: string) => {
    setProposalReadyOpen(false);
    if (contactId) {
      goToConversation(contactId, prefilledMessage, true);
    }
    setActionContact(null);
  };

  const openProjectPaidFinanceGate = useCallback((contact: Contact) => {
    return new Promise<boolean>((resolve) => {
      projectPaidFinanceResolverRef.current = resolve;
      setProjectPaidFinanceContact(contact);
      setProjectPaidFinanceOpen(true);
    });
  }, []);

  const resolveProjectPaidFinanceGate = useCallback((completed: boolean) => {
    setProjectPaidFinanceOpen(false);
    setProjectPaidFinanceContact(null);
    const resolver = projectPaidFinanceResolverRef.current;
    projectPaidFinanceResolverRef.current = null;
    if (resolver) {
      resolver(completed);
    }
  }, []);

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

    if (
      newStage === 'projeto_pago' &&
      !options.skipProjectPaidFinanceModal
    ) {
      if (!contact) {
        throw new Error('Lead não encontrado para abrir o fechamento financeiro.');
      }

      const financeCompleted = await openProjectPaidFinanceGate(contact);
      if (!financeCompleted) {
        return;
      }
    }

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
        if (isDragDropEnabled(newStage, oldStage)) {
          setActionContact(contact);
          setProposalReadyOpen(true);
        }
        break;

      case 'visita_realizada':
        toast({
          title: "Visita realizada!",
          description: `${contact.name} movido para "Visita Realizada"`,
        });
        break;

      case 'chamada_agendada':
        if (!options.skipScheduleModal && isDragDropEnabled(newStage, oldStage)) {
          openScheduleFlow(contact, 'reuniao');
        }
        break;

      case 'visita_agendada':
        if (!options.skipScheduleModal && isDragDropEnabled(newStage, oldStage)) {
          openScheduleFlow(contact, 'visita');
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

  }, [contacts, moveToPipeline, onStageChanged, toast, isDragDropEnabled, openProjectPaidFinanceGate, openScheduleFlow]);

  const compactLeadPatch = useCallback((data: UpdateLeadData): UpdateLeadData => {
    return Object.fromEntries(
      Object.entries(data || {}).filter(([, value]) => value !== undefined),
    ) as UpdateLeadData;
  }, []);

  const handleLeadUpdateWithoutStage = useCallback(async (contactId: string, data: UpdateLeadData) => {
    const { status_pipeline: _ignoredStage, ...rest } = data || {};
    const payload = compactLeadPatch(rest as UpdateLeadData);
    if (Object.keys(payload).length === 0) return;
    await updateLead({ contactId, data: payload });
  }, [compactLeadPatch, updateLead]);

  const handleLeadUpdateWithStageGuard = useCallback(async (contactId: string, data: UpdateLeadData) => {
    const { status_pipeline: requestedStage, ...rest } = data || {};
    const payload = compactLeadPatch(rest as UpdateLeadData);
    if (Object.keys(payload).length > 0) {
      await updateLead({ contactId, data: payload });
    }

    if (!requestedStage) return;

    const currentStage = contacts.find((item) => item.id === contactId)?.pipelineStage;
    if (requestedStage !== currentStage) {
      await handlePipelineStageChange(contactId, requestedStage);
    }
  }, [compactLeadPatch, contacts, handlePipelineStageChange, updateLead]);

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

  const closeFollowUpExhaustedModal = useCallback(() => {
    setFollowUpExhaustedModalOpen(false);
    setFollowUpExhaustedLeadId(null);
  }, []);

  const handleFollowUpKeepCurrent = useCallback(async () => {
    if (!followUpExhaustedLead) return;

    setFollowUpExhaustedSubmitting(true);
    try {
      await updateLead({
        contactId: followUpExhaustedLead.id,
        data: { follow_up_exhausted_seen: true },
      });
      closeFollowUpExhaustedModal();
    } catch (error) {
      console.error('Failed to acknowledge follow-up exhausted modal (keep current):', error);
      toast({
        title: 'Erro ao atualizar lead',
        description: 'Não foi possível confirmar o follow-up exaurido.',
        variant: 'destructive',
      });
    } finally {
      setFollowUpExhaustedSubmitting(false);
    }
  }, [closeFollowUpExhaustedModal, followUpExhaustedLead, toast, updateLead]);

  const handleFollowUpDisableForLead = useCallback(async () => {
    if (!followUpExhaustedLead) return;

    setFollowUpExhaustedSubmitting(true);
    try {
      await toggleLeadFollowUp({
        leadId: followUpExhaustedLead.id,
        enabled: false,
      });
      await updateLead({
        contactId: followUpExhaustedLead.id,
        data: { follow_up_exhausted_seen: true, follow_up_step: 0 },
      });
      closeFollowUpExhaustedModal();
    } catch (error) {
      console.error('Failed to disable follow-up for exhausted lead:', error);
      toast({
        title: 'Erro ao desabilitar follow-up',
        description: 'Não foi possível desabilitar o follow-up para este lead.',
        variant: 'destructive',
      });
    } finally {
      setFollowUpExhaustedSubmitting(false);
    }
  }, [closeFollowUpExhaustedModal, followUpExhaustedLead, toast, toggleLeadFollowUp, updateLead]);

  const handleFollowUpMoveToLost = useCallback(async (reasonKey: FollowUpLostReasonKey, reasonDetail?: string) => {
    if (!followUpExhaustedLead) return;

    const reasonMap: Record<FollowUpLostReasonKey, string> = {
      sem_resposta: 'Não respondeu',
      sem_interesse: 'Sem interesse',
      concorrente: 'Fechou com concorrente',
      timing: 'Não é o momento',
      financeiro: 'Sem condição financeira',
      outro: 'Outro',
    };

    const baseReason = reasonMap[reasonKey] || 'Outro';
    const normalizedReason = buildLossReasonSummary(baseReason, reasonDetail);

    setFollowUpExhaustedSubmitting(true);
    try {
      await toggleLeadFollowUp({
        leadId: followUpExhaustedLead.id,
        enabled: false,
      });

      await updateLead({
        contactId: followUpExhaustedLead.id,
        data: {
          lost_reason: normalizedReason,
          follow_up_exhausted_seen: true,
        },
      });

      await handlePipelineStageChange(followUpExhaustedLead.id, 'perdido');

      if (orgId) {
        const matchingReason = await findLossReasonByKey(orgId, reasonKey);
        if (matchingReason) {
          const { error: lossError } = await supabase.from('perdas_leads').insert({
            org_id: orgId,
            lead_id: Number(followUpExhaustedLead.id),
            motivo_id: matchingReason.id,
            motivo_detalhe: reasonDetail?.trim() || null,
            registrado_por: 'Sistema',
          });

          if (lossError) {
            throw lossError;
          }
        }

        await supabase.from('comentarios_leads').insert({
          org_id: orgId,
          lead_id: Number(followUpExhaustedLead.id),
          texto: `[Follow Up Esgotado]: ${normalizedReason}`,
          autor: 'Sistema',
        });
      }

      closeFollowUpExhaustedModal();
    } catch (error) {
      console.error('Failed to move exhausted follow-up lead to perdido:', error);
      toast({
        title: 'Erro ao mover para perdido',
        description: 'Não foi possível concluir a ação para follow-up exaurido.',
        variant: 'destructive',
      });
    } finally {
      setFollowUpExhaustedSubmitting(false);
    }
  }, [closeFollowUpExhaustedModal, followUpExhaustedLead, handlePipelineStageChange, orgId, toast, toggleLeadFollowUp, updateLead]);

  const handleCreateLead = async (data: CreateLeadData) => {
    await createLead(data);
    toast({
      title: "Lead criado!",
      description: `${data.nome} foi adicionado com sucesso.`,
    });
  };

  // handleSchedule removed (replaced by AppointmentModal onSuccess)

  const handleProposal = async (data: ProposalData) => {
    import.meta.env.DEV && console.log('📋 handleProposal called with:', data);
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
        rentabilityRatePerKwh: (data as any).rentabilityRatePerKwh,
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
          personaFocus: premiumContentFromPayload.personaFocus,
          assumptions: premiumContentFromPayload.assumptions,
          visitSteps: premiumContentFromPayload.visitSteps,
          bantQualification: premiumContentFromPayload.bantQualification,
          // Sprint 3 (ADD-6): propagate missing premium fields for seller script
          termsConditions: premiumContentFromPayload.termsConditions,
          companyContact: premiumContentFromPayload.companyContact,
          environmentalImpact: premiumContentFromPayload.environmentalImpact,
          monthlyGeneration: premiumContentFromPayload.monthlyGeneration,
          equipmentSpecs: premiumContentFromPayload.equipmentSpecs,
          nextStepsDetailed: premiumContentFromPayload.nextStepsDetailed,
        } : undefined,
        taxaFinanciamento: (data as any).taxaFinanciamento,
        parcela36x: (data as any).parcela36x,
        parcela60x: (data as any).parcela60x,
        paymentConditions: (data as any).paymentConditions,
        financingConditions: (data as any).financingConditions,
        financingPrimaryInstitutionId: (data as any).financingPrimaryInstitutionId,
        showFinancingSimulation: (data as any).showFinancingSimulation,
        secondaryColorHex: (data as any).secondaryColorHex,
        validadeDias: (data as any).validadeDias,
        annualEnergyIncreasePct: (data as any).annualEnergyIncreasePct,
        moduleDegradationPct: (data as any).moduleDegradationPct,
        financialInputs: (data as any).financialInputs,
        financialOutputs: (data as any).financialOutputs,
        financialModelVersion: (data as any).financialModelVersion,
        propNum: (data as any).propNum,
        proposalVersionId: (saveResult as any)?.proposalVersionId || null,
        propostaId: (saveResult as any)?.proposal?.id || null,
        // Sprint 3: pass theme/logo for seller script branding
        colorTheme: (data as any).colorTheme,
        logoDataUrl: (data as any).logoDataUrl,
      });
    }

    let stageMoveError: Error | null = null;
    try {
      await handlePipelineStageChange(data.contactId, 'proposta_pronta');
    } catch (error) {
      stageMoveError = error instanceof Error ? error : new Error('Erro desconhecido ao mover etapa');
      console.error('Proposal stage transition failed', {
        contactId: data.contactId,
        targetStage: 'proposta_pronta',
        error,
      });
    }

    await updateLead({
      contactId: data.contactId,
      data: {
        valor_estimado: data.valorTotal,
        consumo_kwh: data.consumoMensal,
        uf: data.estado,
        concessionaria: data.concessionaria,
        tipo_ligacao: data.tipoLigacao,
        tarifa_kwh: data.tarifaKwh ?? data.rentabilityRatePerKwh,
        custo_disponibilidade_kwh: data.custoDisponibilidadeKwh,
        performance_ratio: data.performanceRatio,
        preco_por_kwp: data.precoPorKwp,
        abater_custo_disponibilidade_no_dimensionamento: data.abaterCustoDisponibilidadeNoDimensionamento,
      }
    });

    const contact = selectedContact;

    if (contact && !stageMoveError) {
      onProposalReady(contact);
    }

    if (stageMoveError) {
      throw new Error(`Proposta salva, mas não foi possível mover o lead para "Proposta Pronta". ${stageMoveError.message}`);
    }

    // Modal state is centralized in handlePipelineStageChange for proposta_pronta.
    return saveResult;
  };

  const showConversationList = !isMobileViewport || !activeConversation;
  const showConversationChat = !isMobileViewport || Boolean(activeConversation);
  const showMobileBottomBar = isMobileViewport && !(activeTab === 'conversas' && activeConversation);
  const tabPermissions: SolarZapTabPermissions = useMemo(() => ({
    ia_agentes: sellerPerms.tab_ia_agentes,
    automacoes: sellerPerms.tab_automacoes,
    integracoes: sellerPerms.tab_integracoes,
    tracking: sellerPerms.tab_integracoes,
    banco_ia: sellerPerms.tab_banco_ia,
    minha_conta: sellerPerms.tab_minha_conta,
    meu_plano: canAccessAdmin,
  }), [canAccessAdmin, sellerPerms]);
  const guidedTour = useGuidedTour(activeTab, handleTabChange, Boolean(user));

  useEffect(() => {
    if (!showMobileBottomBar) {
      setIsMobileMoreOpen(false);
    }
  }, [showMobileBottomBar]);

  useEffect(() => {
    setIsMobileMoreOpen(false);
  }, [activeTab, location.pathname]);

  if (isInitialLoading) {
    return (
      <div className="app-shell-bg h-dvh w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-bg relative h-dvh w-full flex bg-background overflow-hidden">
      {!isMobileViewport ? (
        <SolarZapNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          unreadNotifications={unreadNotifications}
          onNotificationsClick={() => setIsNotificationsPanelOpen(true)}
          isAdminUser={canAccessAdmin}
          onAdminMembersClick={() => navigate('/settings/members')}
          hasMultipleOrganizations={hasMultipleOrganizations}
          onSwitchOrganization={() => setIsOrganizationSwitcherOpen(true)}
          activeOrganizationName={activeOrganizationName ?? undefined}
          userAvatarUrl={userAvatarUrl}
          userDisplayName={userDisplayName}
          tabPermissions={tabPermissions}
          currentPlanKey={billing?.plan_key ?? null}
          onHelpClick={() => guidedTour.startTour('manual')}
        />
      ) : null}

      <Dialog
        open={isOrganizationSwitcherOpen}
        onOpenChange={(nextOpen) => {
          if (switchingOrganizationId) return;
          setIsOrganizationSwitcherOpen(nextOpen);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden border-border/80 bg-card/97 p-0 sm:max-w-3xl">
          <OrganizationSelectorPanel
            rootTestId="org-selector-modal-panel"
            organizations={organizations}
            submittingOrgId={switchingOrganizationId}
            onSelectOrganization={(nextOrgId) => {
              void handleSelectOrganizationFromModal(nextOrgId);
            }}
            showSignOut={false}
            title="Trocar empresa"
            description="Selecione a empresa que deseja abrir. O app sera recarregado ao confirmar."
            connectLabel="Abrir empresa"
          />

          <div className="flex items-center justify-between border-t border-border/70 bg-muted/25 px-7 py-5 sm:px-9">
            <Button
              type="button"
              variant="outline"
              disabled={!!switchingOrganizationId}
              onClick={() => setIsOrganizationSwitcherOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!switchingOrganizationId}
              onClick={() => {
                void signOut();
              }}
            >
              Sair
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <NotificationsPanel
          notifications={notifications}
          isOpen={isNotificationsPanelOpen}
          onClose={() => setIsNotificationsPanelOpen(false)}
          onMarkAsRead={markNotificationAsRead}
          onMarkAllAsRead={markAllNotificationsAsRead}
          onDelete={deleteNotification}
          onClearAll={clearAllNotifications}
          onConfirmInstallmentPaid={confirmInstallmentPaid}
          onRescheduleInstallment={rescheduleInstallment}
          onGoToContact={(contactId) => {
            const conv = conversations.find(c => c.id === contactId);
            if (conv) {
              handleTabChange('conversas');
              setSelectedConversation(conv);
              markAsRead(conv.id);
            }
          }}
        />
      </Suspense>

      <div
        className={cn(
          'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          showMobileBottomBar && 'pb-[calc(4rem+env(safe-area-inset-bottom))]',
        )}
      >
        <div className="absolute top-0 left-0 right-0 z-20 px-4 py-2 space-y-2 pointer-events-none">
          <div className="pointer-events-auto">
            <BillingBanner billing={billing} />
          </div>
        </div>

        {accessState === 'read_only' ? (
          <div className="absolute top-14 left-0 right-0 z-20 px-4 py-2 bg-amber-50/95 border-b border-amber-200 text-amber-900 text-sm backdrop-blur-sm">
            Seu acesso está em modo leitura. Algumas ações estão bloqueadas até a regularização da assinatura.
          </div>
        ) : null}

        <GuidedTour
          showWelcome={guidedTour.showWelcome}
          running={guidedTour.running}
          steps={guidedTour.steps}
          stepIndex={guidedTour.stepIndex}
          welcomeTitle="Bem-vindo ao novo SolarZap"
          welcomeDescription="Preparamos um tour rapido para apresentar os principais atalhos e fluxos."
          onStart={() => guidedTour.startTour('auto')}
          onSkip={() => {
            void guidedTour.closeTour('skip');
          }}
          onClose={() => {
            void guidedTour.closeTour('close');
          }}
          onNext={() => {
            void guidedTour.nextStep();
          }}
          onPrev={guidedTour.previousStep}
        />

        {activeTab === 'conversas' && (
        <div className="flex flex-1 min-h-0 min-w-0">
          {showConversationList && (
            <div
              ref={conversationsSidebarRef}
              className={`relative ${isMobileViewport ? 'flex-1 min-w-0' : 'flex-shrink-0'}`}
              style={isMobileViewport ? undefined : { width: conversationsSidebarWidth }}
            >
            <Suspense fallback={<TabLoadingFallback label="Carregando conversas..." />}>
              <ConversationList
                conversations={filteredConversations}
                contacts={contacts}
                canViewTeam={canViewTeam}
                leadScope={leadScope}
                onLeadScopeChange={setLeadScope}
                leadScopeMembers={leadScopeMembers}
                leadScopeLoading={isLoadingLeadScopeMembers}
                currentUserId={user?.id ?? null}
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
            </Suspense>
              {!isMobileViewport && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Redimensionar aba lateral"
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
                  onMouseDown={handleConversationsSidebarResizeStart}
                />
              )}
            <Button
              onClick={() => setIsCreateLeadOpen(true)}
              size="icon"
              data-testid="open-create-lead-modal"
              className={cn('absolute right-4 rounded-full w-12 h-12 shadow-lg', isMobileViewport ? 'bottom-20' : 'bottom-4')}
            >
              <Plus className="w-6 h-6" />
            </Button>
            </div>
          )}

          {showConversationChat && (
            <Suspense fallback={<TabLoadingFallback label="Carregando conversa..." />}>
              <ChatArea
              conversation={activeConversation}
              conversations={conversations}
              onToggleLeadAi={sellerPerms.can_toggle_ai ? toggleLeadAi : undefined}
              onSendMessage={async (conversationId, content, instanceName, replyTo, options) => {
                import.meta.env.DEV && console.log('SolarZapLayout: onSendMessage called', {
                  conversationId,
                  contentLength: content.length,
                  instanceName,
                  replyTo,
                  hasContactPhone: Boolean(options?.contactPhone || options?.contactPhoneE164),
                  hasReplyMeta: Boolean(options?.replyMeta),
                });
                try {
                  await sendMessage({
                    conversationId,
                    content,
                    instanceName,
                    replyTo,
                    contactPhone: options?.contactPhone,
                    contactPhoneE164: options?.contactPhoneE164,
                    replyMeta: options?.replyMeta,
                  });
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
                try {
                  await sendAttachment({ conversationId: id, file, fileType: type, caption, instanceName });
                  onSellerResponse(id);
                } catch (error) {
                  console.error('Failed to send attachment:', error);
                  toast({
                    title: "Erro ao enviar anexo",
                    description: error instanceof Error ? error.message : "Ocorreu um erro desconhecido",
                    variant: "destructive"
                  });
                }
              }}
              onSendAudio={async (id, blob, duration, instanceName) => {
                try {
                  await sendAudio({ conversationId: id, audioBlob: blob, duration, instanceName });
                  onSellerResponse(id);
                } catch (error) {
                  console.error('Failed to send audio:', error);
                  toast({
                    title: "Erro ao enviar áudio",
                    description: error instanceof Error ? error.message : "Ocorreu um erro desconhecido",
                    variant: "destructive"
                  });
                }
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
              onSendReaction={async (messageId, waMessageId, remoteJid, emoji, instanceName, fromMe) => {
                try {
                  await sendReaction({ messageId, waMessageId, remoteJid, emoji, instanceName, fromMe });
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
                import.meta.env.DEV && console.log('Video Call Action Triggered', contact);
                const videoCallMsg = getMessage('videoCallMessage', { nome: contact.name || 'Cliente' });
                import.meta.env.DEV && console.log('Generated Video Msg:', videoCallMsg);

                if (!videoCallMsg) {
                  console.warn("Empty video call message config!");
                }

                setPendingChatMessage(videoCallMsg || "Vamos agendar uma videochamada?");

                toast({
                  title: "Link do Meet aberto",
                  description: "Revise a mensagem e envie para o cliente quando estiver pronto.",
                });
              }}
              onBack={isMobileViewport ? () => {
                setSelectedConversation(null);
                setIsDetailsPanelOpen(false);
              } : undefined}
            />
            </Suspense>
          )}

          {isDetailsPanelOpen && (
            <div className={isMobileViewport ? 'absolute inset-0 z-30 bg-background' : ''}>
              <Suspense fallback={<TabLoadingFallback label="Carregando detalhes..." />}>
                <ActionsPanel
                  conversation={activeConversation}
                  onMoveToPipeline={handlePipelineStageChange}
                  onAction={handleAction}
                  onClose={() => setIsDetailsPanelOpen(false)}
                  onUpdateLead={handleLeadUpdateWithoutStage}
                  onToggleLeadFollowUp={toggleLeadFollowUp}
                />
              </Suspense>
            </div>
          )}
        </div>
        )}

        {activeTab === 'pipelines' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando pipeline..." />}>
          <div data-tour="tab-pipelines-root" className="flex-1 min-w-0 flex flex-col h-full overflow-hidden relative">
            <PipelineView
              contacts={contacts}
              events={events}
              onMoveToPipeline={handlePipelineStageChange}
              onUpdateLead={handleLeadUpdateWithStageGuard}
              onToggleLeadAi={sellerPerms.can_toggle_ai ? toggleLeadAi : undefined}
              canViewTeam={canViewTeam}
              leadScope={leadScope}
              onLeadScopeChange={setLeadScope}
              leadScopeMembers={leadScopeMembers}
              leadScopeLoading={isLoadingLeadScopeMembers}
              currentUserId={user?.id ?? null}
              onGoToConversation={goToConversation}
              onCallAction={(contact) => {
                setPendingCallContact(contact);
                setCallConfirmOpen(true);
              }}
              onGenerateProposal={handleProposal}
              onImportContacts={importContacts}
              onDeleteLead={sellerPerms.can_delete_leads ? async (id) => { await deleteLead(id); } : undefined}
              onSchedule={(contact, type) => {
                openScheduleFlow(contact, type === 'reuniao' ? 'reuniao' : 'visita');
              }}
              onOpenFollowUpExhausted={openFollowUpExhaustedForLead}
            />
            <Button
              onClick={() => setIsCreateLeadOpen(true)}
              size="icon"
              data-testid="open-create-lead-modal"
              className={cn('absolute right-4 rounded-full w-12 h-12 shadow-lg z-10', isMobileViewport ? 'bottom-20' : 'bottom-4')}
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>
        </Suspense>
        )}

        {activeTab === 'calendario' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando calendário..." />}>
          <div
            data-tour="tab-calendario-root"
            className="flex-1 min-w-0 h-full overflow-hidden"
            onPointerDownCapture={handleBillingGovernedInteractionCapture}
            onClickCapture={handleBillingGovernedInteractionCapture}
            onKeyDownCapture={handleBillingGovernedKeyDownCapture}
          >
            <CalendarView
              contacts={contacts}
              canViewTeam={canViewTeam}
              leadScope={leadScope}
              onLeadScopeChange={setLeadScope}
              leadScopeMembers={leadScopeMembers}
              leadScopeLoading={isLoadingLeadScopeMembers}
              currentUserId={user?.id ?? null}
            />
          </div>
        </Suspense>
        )}

        {activeTab === 'contatos' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando contatos..." />}>
          <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            <ContactsView
              contacts={contacts}
              onUpdateLead={handleLeadUpdateWithStageGuard}
              onImportContacts={importContacts}
              onDeleteLead={sellerPerms.can_delete_leads ? async (id) => { await deleteLead(id); } : undefined}
              onToggleLeadAi={sellerPerms.can_toggle_ai ? toggleLeadAi : undefined}
              canViewTeam={canViewTeam}
              leadScope={leadScope}
              onLeadScopeChange={setLeadScope}
              leadScopeMembers={leadScopeMembers}
              leadScopeLoading={isLoadingLeadScopeMembers}
              currentUserId={user?.id ?? null}
              onOpenFollowUpExhausted={openFollowUpExhaustedForLead}
            />
            <Button
              onClick={() => setIsCreateLeadOpen(true)}
              size="icon"
              data-testid="open-create-lead-modal"
              className={cn('absolute right-4 rounded-full w-12 h-12 shadow-lg z-10', isMobileViewport ? 'bottom-20' : 'bottom-4')}
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>
        </Suspense>
        )}

        {activeTab === 'disparos' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando disparos..." />}>
          <div
            data-tour="tab-disparos-root"
            className="flex-1 min-w-0 flex flex-col h-full overflow-hidden"
            onPointerDownCapture={handleBillingGovernedInteractionCapture}
            onClickCapture={handleBillingGovernedInteractionCapture}
            onKeyDownCapture={handleBillingGovernedKeyDownCapture}
          >
            <BroadcastView />
          </div>
        </Suspense>
        )}

        {activeTab === 'dashboard' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando dashboard..." />}>
          <DashboardView
            onNavigate={(tab) => handleTabChange(tab as any)}
            canViewTeam={canViewTeam}
            leadScope={leadScope}
            onLeadScopeChange={setLeadScope}
            leadScopeMembers={leadScopeMembers}
            isLoadingLeadScopeMembers={isLoadingLeadScopeMembers}
          />
        </Suspense>
        )}

        {activeTab === 'propostas' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando propostas..." />}>
          <div
            className="flex-1 min-w-0 flex flex-col h-full overflow-hidden"
            onPointerDownCapture={handleBillingGovernedInteractionCapture}
            onClickCapture={handleBillingGovernedInteractionCapture}
            onKeyDownCapture={handleBillingGovernedKeyDownCapture}
          >
            <ProposalsView />
          </div>
        </Suspense>
        )}

        {activeTab === 'admin_members' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando equipe..." />}>
          <div className="flex-1 min-w-0 h-full overflow-hidden">
            <AdminMembersPage embedded />
          </div>
        </Suspense>
        )}

        {activeTab === 'integracoes' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando integrações..." />}>
          <div
            className="flex-1 min-w-0 flex flex-col h-full overflow-hidden"
            onPointerDownCapture={handleBillingGovernedInteractionCapture}
            onClickCapture={handleBillingGovernedInteractionCapture}
            onKeyDownCapture={handleBillingGovernedKeyDownCapture}
          >
            <IntegrationsView />
          </div>
        </Suspense>
        )}

        {activeTab === 'tracking' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando tracking..." />}>
          {trackingFeatureBlocker ? (
            <FeatureSoftWall
              featureName="Tracking Avancado"
              requiredPlan="Scale"
              description="Faca upgrade para acompanhar conversoes e eventos com mais profundidade."
              onUpgrade={() => openBillingBlocker(trackingFeatureBlocker)}
            />
          ) : (
            <div
              className="flex-1 min-w-0 flex flex-col h-full overflow-hidden"
              onPointerDownCapture={handleBillingGovernedInteractionCapture}
              onClickCapture={handleBillingGovernedInteractionCapture}
              onKeyDownCapture={handleBillingGovernedKeyDownCapture}
            >
              <TrackingView />
            </div>
          )}
        </Suspense>
        )}

        {activeTab === 'automacoes' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando automações..." />}>
          <div
            className="flex-1 min-w-0 h-full overflow-hidden"
            onPointerDownCapture={handleBillingGovernedInteractionCapture}
            onClickCapture={handleBillingGovernedInteractionCapture}
            onKeyDownCapture={handleBillingGovernedKeyDownCapture}
          >
            <AutomationsView />
          </div>
        </Suspense>
        )}

        {activeTab === 'ia_agentes' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando IA..." />}>
          <div
            className="flex-1 min-w-0 h-full overflow-hidden"
            onPointerDownCapture={handleBillingGovernedInteractionCapture}
            onClickCapture={handleBillingGovernedInteractionCapture}
            onKeyDownCapture={handleBillingGovernedKeyDownCapture}
          >
            <AIAgentsView />
          </div>
        </Suspense>
        )}

        {activeTab === 'banco_ia' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando base de conhecimento..." />}>
          <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
            <KnowledgeBaseView />
          </div>
        </Suspense>
        )}

        {activeTab === 'minha_conta' && (
        <Suspense fallback={<TabLoadingFallback label="Carregando conta..." />}>
          <div className="flex-1 min-w-0 h-full overflow-auto">
            <ConfiguracoesContaView />
          </div>
        </Suspense>
        )}

        {activeTab === 'meu_plano' && canAccessAdmin && (
        <Suspense fallback={<TabLoadingFallback label="Carregando plano..." />}>
          <div className="flex-1 min-w-0 h-full overflow-auto">
            <MeuPlanoView />
          </div>
        </Suspense>
        )}

        {showMobileBottomBar ? (
          <>
            <MobileBottomNav
              activeTab={activeTab}
              onTabChange={handleTabChange}
              onMorePress={() => setIsMobileMoreOpen(true)}
              unreadCount={unreadNotifications}
              isMoreActive={isMobileMoreTabActive(activeTab)}
            />
            <MobileMoreModal
              isOpen={isMobileMoreOpen}
              onClose={() => setIsMobileMoreOpen(false)}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              onNotificationsClick={() => setIsNotificationsPanelOpen(true)}
              unreadNotifications={unreadNotifications}
              tabPermissions={tabPermissions}
              isAdminUser={canAccessAdmin}
              onAdminMembersClick={() => navigate('/settings/members')}
              hasMultipleOrganizations={hasMultipleOrganizations}
              onSwitchOrganization={() => setIsOrganizationSwitcherOpen(true)}
              activeOrganizationName={activeOrganizationName ?? undefined}
            />
          </>
        ) : null}
      </div>

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
            try {
              await handlePipelineStageChange(actionContact.id, newStage, { skipScheduleModal: true });
            } catch (error) {
              console.error('Appointment success stage transition failed', {
                contactId: actionContact.id,
                targetStage: newStage,
                error,
              });
              toast({
                title: "Falha ao mover lead",
                description: "Agendamento salvo, mas não foi possível mover o lead para a etapa correspondente.",
                variant: "destructive",
              });
              return;
            }

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

      <ProjectPaidFinanceModal
        isOpen={projectPaidFinanceOpen}
        contact={projectPaidFinanceContact}
        orgId={orgId}
        onCancel={() => resolveProjectPaidFinanceGate(false)}
        onCompleted={() => resolveProjectPaidFinanceGate(true)}
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

      <FollowUpExhaustedModal
        open={followUpExhaustedModalOpen && !!followUpExhaustedLead}
        leadName={followUpExhaustedLead?.name || ''}
        submitting={followUpExhaustedSubmitting}
        onKeepCurrent={handleFollowUpKeepCurrent}
        onDisableFollowUp={handleFollowUpDisableForLead}
        onMoveToLost={handleFollowUpMoveToLost}
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
            openScheduleFlow(pendingVisitContact, 'visita');
          }
          setPendingVisitContact(null);
        }}
        contactName={pendingVisitContact?.name || ''}
      />
    </div >
  );
}
