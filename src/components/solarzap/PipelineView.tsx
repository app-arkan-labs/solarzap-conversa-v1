import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { Contact, PIPELINE_STAGES, PipelineStage, CalendarEvent, CHANNEL_INFO, ChannelFilter } from '@/types/solarzap';
import { Badge } from '@/components/ui/badge';
import { Search, GripVertical, MoreVertical, Phone, Calendar, FileText, Home, MessageSquare, ArrowUpDown, FileUp, FileDown, Trash2, Bot, UserCog, MapPin, MessageSquareQuote, Kanban, Filter, CircleX, TrendingDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { EditLeadModal, UpdateLeadData } from './EditLeadModal';
import { StageBadges } from './StageBadges';
import { FollowUpIndicator } from './FollowUpIndicator';
import { LeadScopeSelect, type LeadScopeValue } from './LeadScopeSelect';
import type { MemberDto } from '@/lib/orgAdminClient';

import { ProposalModal, ProposalData } from './ProposalModal';
import { ProposalReadyModal } from './ProposalReadyModal';
import { LeadCommentsModal } from './LeadCommentsModal';
import { MarkAsLostModal } from './MarkAsLostModal';
import { LossAnalyticsModal } from './LossAnalyticsModal';
import { AssignMemberSelect } from './AssignMemberSelect';
import { PageHeader } from './PageHeader';
import { ImportContactsModal, ImportedContact } from './ImportContactsModal';
import { ExportContactsModal } from './ExportContactsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PipelineViewProps {
  contacts: Contact[];
  events: CalendarEvent[];
  onMoveToPipeline: (contactId: string, stage: PipelineStage) => Promise<void>;
  onUpdateLead?: (contactId: string, data: UpdateLeadData) => Promise<void>;
  onGoToConversation?: (contactId: string, prefilledMessage: string, shouldAutoMoveToVisita?: boolean) => void;
  onCallAction?: (contact: Contact) => void;
  onGenerateProposal?: (data: ProposalData) => Promise<unknown>;

  onImportContacts?: (contacts: ImportedContact[]) => Promise<unknown>;
  onDeleteLead?: (contactId: string) => Promise<void>;
  onSchedule?: (contact: Contact, type: 'reuniao' | 'visita') => void;
  onToggleLeadAi?: (params: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => Promise<{ leadId: string; enabled: boolean }>;
  onOpenFollowUpExhausted?: (leadId: string) => void;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  leadScopeLoading?: boolean;
  currentUserId?: string | null;
}

// Custom colors for each pipeline stage header
const STAGE_COLORS: Record<PipelineStage, string> = {
  novo_lead: '#2196F3',
  respondeu: '#FF9800',
  chamada_agendada: '#9C27B0',
  chamada_realizada: '#4CAF50',
  nao_compareceu: '#F44336',
  aguardando_proposta: '#FF5722',
  proposta_pronta: '#3F51B5',
  visita_agendada: '#00BCD4',
  visita_realizada: '#009688',
  proposta_negociacao: '#FFC107',
  financiamento: '#E91E63',
  aprovou_projeto: '#84cc16', // lime-500
  contrato_assinado: '#8BC34A',
  projeto_pago: '#4CAF50',
  aguardando_instalacao: '#607D8B',
  projeto_instalado: '#CDDC39',
  coletar_avaliacao: '#FF9800',
  contato_futuro: '#9E9E9E',
  perdido: '#424242',
};

export function PipelineView({
  contacts,
  events,
  onMoveToPipeline,
  onUpdateLead,
  onGoToConversation,
  onCallAction,
  onGenerateProposal,
  onImportContacts,
  onDeleteLead,
  onSchedule,
  onToggleLeadAi,
  onOpenFollowUpExhausted,
  canViewTeam = false,
  leadScope = 'mine',
  onLeadScopeChange,
  leadScopeMembers = [],
  leadScopeLoading = false,
  currentUserId = null,
}: PipelineViewProps) {
  const isMobileViewport = useMobileViewport();
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('todos');
  const [draggedContact, setDraggedContact] = useState<Contact | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Quick action modals state - Removed local ScheduleModal state
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [actionContact, setActionContact] = useState<Contact | null>(null);

  // Store contactId separately using useRef to survive state batching issues
  const proposalContactIdRef = useRef<string>('');
  const proposalContactNameRef = useRef<string>('');

  const [proposalReadyOpen, setProposalReadyOpen] = useState(false);

  // Comments modal state
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [commentsContact, setCommentsContact] = useState<Contact | null>(null);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostContact, setLostContact] = useState<Contact | null>(null);
  const [lossAnalyticsOpen, setLossAnalyticsOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  const { toast } = useToast();
  const { isDragDropEnabled, getMessage } = useAutomationSettings();
  const resolvedOwnerUserId = useMemo(() => {
    if (!currentUserId) return null;
    if (!canViewTeam) return currentUserId;
    if (leadScope === 'org_all') return null;
    if (leadScope === 'mine') return currentUserId;
    const scopedUserId = leadScope.slice(5).trim();
    return scopedUserId || currentUserId;
  }, [canViewTeam, currentUserId, leadScope]);

  // Drag-to-scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [activeMobileStage, setActiveMobileStage] = useState<PipelineStage>('novo_lead');

  const updateActiveMobileStage = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const stageElements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-pipeline-stage-id]')
    );
    if (stageElements.length === 0) return;

    const viewportCenter = container.scrollLeft + container.clientWidth / 2;
    let nearestStage = activeMobileStage;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const stageElement of stageElements) {
      const stageId = stageElement.dataset.pipelineStageId as PipelineStage | undefined;
      if (!stageId) continue;
      const stageCenter = stageElement.offsetLeft + stageElement.offsetWidth / 2;
      const distance = Math.abs(stageCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStage = stageId;
      }
    }

    if (nearestStage !== activeMobileStage) {
      setActiveMobileStage(nearestStage);
    }
  }, [activeMobileStage]);

  useEffect(() => {
    if (!isMobileViewport) return;
    updateActiveMobileStage();
  }, [isMobileViewport, searchQuery, channelFilter, contacts, updateActiveMobileStage]);

  // Drag-to-scroll handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobileViewport) return;
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('input')) {
      return;
    }

    if (!scrollContainerRef.current) return;

    setIsDraggingScroll(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    scrollContainerRef.current.style.cursor = 'grabbing';
  }, [isMobileViewport]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMobileViewport) return;
    if (!isDraggingScroll || !scrollContainerRef.current) return;

    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  }, [isDraggingScroll, isMobileViewport, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    if (isMobileViewport) return;
    setIsDraggingScroll(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
    }
  }, [isMobileViewport]);

  const handleMouseLeave = useCallback(() => {
    if (isMobileViewport) return;
    if (isDraggingScroll) {
      setIsDraggingScroll(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.cursor = 'grab';
      }
    }
  }, [isDraggingScroll, isMobileViewport]);

  const handleCardClick = (contact: Contact, e: React.MouseEvent) => {
    if (draggedContact) return;
    if ((e.target as HTMLElement).closest('[draggable]') && e.type !== 'click') return;

    if ((contact.followUpStep ?? 0) >= 5 && contact.followUpExhaustedSeen === false && onOpenFollowUpExhausted) {
      onOpenFollowUpExhausted(contact.id);
      return;
    }

    setEditingContact(contact);
    setIsEditModalOpen(true);
  };

  const handleSaveContact = async (contactId: string, data: UpdateLeadData) => {
    if (onUpdateLead) {
      await onUpdateLead(contactId, data);
      toast({
        title: "Lead atualizado!",
        description: "Os dados foram salvos com sucesso.",
      });
    }
  };

  // Quick action handlers
  const handleQuickAction = (action: string, contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();

    switch (action) {
      case 'conversation':
        if (onGoToConversation) {
          onGoToConversation(contact.id, '');
        }
        break;
      case 'call':
        if (onCallAction) {
          onCallAction(contact);
        }
        break;
      case 'schedule':
        if (onSchedule) onSchedule(contact, 'reuniao');
        break;
      case 'proposal':
        setActionContact(contact);
        setProposalModalOpen(true);
        break;
      case 'visit':
        if (onSchedule) onSchedule(contact, 'visita');
        break;
      case 'comments':
        setCommentsContact(contact);
        setCommentsModalOpen(true);
        break;
      case 'mark_lost':
        setLostContact(contact);
        setLostModalOpen(true);
        break;
      case 'delete':
        setContactToDelete(contact);
        setDeleteDialogOpen(true);
        break;
    }
  };

  // handleSchedule REMOVED

  const handleProposal = async (
    data: ProposalData,
  ): Promise<{ proposalVersionId: string | null; proposal?: any } | void> => {
    if (onGenerateProposal) {
      return onGenerateProposal(data) as Promise<{ proposalVersionId: string | null; proposal?: any } | void>;
    }

    // Store contactId and name in refs BEFORE any state changes - this survives batching
    proposalContactIdRef.current = data.contactId;
    const contact = contacts.find(c => c.id === data.contactId);
    proposalContactNameRef.current = contact?.name || actionContact?.name || '';
    import.meta.env.DEV && console.log('handleProposal: storing in refs - contactId:', data.contactId, 'name:', proposalContactNameRef.current);

    // IMPORTANT: Set proposalReadyOpen to true BEFORE closing the modal
    setProposalReadyOpen(true);

    try {
      // Move to proposta_pronta
      await onMoveToPipeline(data.contactId, 'proposta_pronta');

      // Close the proposal modal after setting proposalReadyOpen
      setProposalModalOpen(false);
    } catch (error) {
      console.error('Failed to move lead to proposta_pronta from pipeline fallback', error);
      setProposalReadyOpen(false);
      toast({
        title: "Falha ao mover lead",
        description: "A proposta foi preparada, mas a etapa nao foi atualizada.",
        variant: "destructive",
      });
      return;
    }
  };

  const handleProposalReadyGoToConversation = (contactId: string, prefilledMessage: string) => {
    import.meta.env.DEV && console.log('handleProposalReadyGoToConversation called');
    import.meta.env.DEV && console.log('contactId from modal:', contactId);
    import.meta.env.DEV && console.log('onGoToConversation available:', !!onGoToConversation);

    setProposalReadyOpen(false);
    if (contactId && onGoToConversation) {
      import.meta.env.DEV && console.log('Calling onGoToConversation with:', contactId, 'shouldAutoMoveToVisita: true');
      // Pass true to auto-move to "Visita Agendada" after message is sent
      onGoToConversation(contactId, prefilledMessage, true);
    } else {
      console.error('Missing contactId or onGoToConversation callback');
    }
    setActionContact(null);
    proposalContactIdRef.current = '';
  };

  const stages = Object.entries(PIPELINE_STAGES) as [PipelineStage, typeof PIPELINE_STAGES[PipelineStage]][];
  const channelFilters = (
    [{ id: 'todos' as ChannelFilter, label: 'Todas as origens' }]
      .concat(
        (Object.entries(CHANNEL_INFO) as Array<[Exclude<ChannelFilter, 'todos'>, { label: string }]>)
          .map(([id, info]) => ({ id, label: info.label }))
      )
  );
  const hasChannelFilter = channelFilter !== 'todos';
  const selectedChannelLabel = channelFilter === 'todos'
    ? 'Todas as origens'
    : CHANNEL_INFO[channelFilter]?.label || 'Origem selecionada';
  const getChannelCount = useCallback((filter: ChannelFilter) => {
    if (filter === 'todos') return contacts.length;
    return contacts.filter((contact) => contact.channel === filter).length;
  }, [contacts]);

  const getContactsForStage = (stage: PipelineStage) => {
    let stageContacts = contacts.filter(c => c.pipelineStage === stage);

    if (channelFilter !== 'todos') {
      stageContacts = stageContacts.filter((contact) => contact.channel === channelFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      stageContacts = stageContacts.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
      );
    }

    return stageContacts;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `R$ ${(value / 1000000).toFixed(1)} mi`;
    }
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)} mil`;
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
  };

  const getDaysInStage = useCallback((contact: Contact) => {
    const now = new Date();
    const stageDate = contact.stageChangedAt ? new Date(contact.stageChangedAt) : new Date(contact.createdAt);
    const diffTime = Math.abs(now.getTime() - stageDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, []);

  const getNextAction = useCallback((contact: Contact): { text: string; nextStageIcon: string } => {
    const stage = contact.pipelineStage;
    const stagesArray = Object.keys(PIPELINE_STAGES) as PipelineStage[];
    const currentIndex = stagesArray.indexOf(stage);
    const nextStage = currentIndex < stagesArray.length - 1 ? stagesArray[currentIndex + 1] : stage;
    const nextStageIcon = PIPELINE_STAGES[nextStage]?.icon || '📋';

    const NEXT_ACTIONS: Record<PipelineStage, string> = {
      novo_lead: 'Entrar em contato',
      respondeu: 'Agendar chamada',
      chamada_agendada: 'Realizar chamada',
      chamada_realizada: 'Enviar proposta',
      nao_compareceu: 'Reagendar',
      aguardando_proposta: 'Preparar proposta',
      proposta_pronta: 'Apresentar proposta',
      visita_agendada: 'Visita realizada',
      visita_realizada: 'Negociar proposta',
      proposta_negociacao: 'Fechar negócio',
      financiamento: 'Aprovar crédito',
      aprovou_projeto: 'Assinar contrato',
      contrato_assinado: 'Aguardar pagamento',
      projeto_pago: 'Agendar instalação',
      aguardando_instalacao: 'Instalar sistema',
      projeto_instalado: 'Coletar avaliação',
      coletar_avaliacao: 'Pedir indicação',
      contato_futuro: 'Aguardar contato',
      perdido: 'Arquivado',
    };
    return { text: NEXT_ACTIONS[stage] || 'Próxima ação', nextStageIcon };
  }, []);

  const moveLeadAndToast = useCallback(async (
    contact: Contact,
    targetStage: PipelineStage,
    successTitle: string,
    successDescription: string,
  ) => {
    try {
      await onMoveToPipeline(contact.id, targetStage);
      toast({
        title: successTitle,
        description: successDescription,
      });
    } catch (error) {
      console.error('Pipeline stage move failed', { contactId: contact.id, targetStage, error });
      toast({
        title: "Falha ao mover lead",
        description: "Nao foi possivel atualizar a etapa. Tente novamente.",
        variant: "destructive",
      });
    }
  }, [onMoveToPipeline, toast]);

  const handleMoveToStageFromMenu = useCallback(async (contact: Contact, targetStage: PipelineStage) => {
    if (contact.pipelineStage === targetStage) {
      return;
    }

    const stageInfo = PIPELINE_STAGES[targetStage];
    await moveLeadAndToast(
      contact,
      targetStage,
      'Lead movido!',
      `${contact.name} movido para "${stageInfo.title}"`,
    );
  }, [moveLeadAndToast]);

  const handleNextActionClick = async (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    const stage = contact.pipelineStage;

    try {
      switch (stage) {
      case 'novo_lead':
        // Entrar em contato -> ir para conversa
        if (onGoToConversation) {
          onGoToConversation(contact.id, '');
          toast({
            title: "Conversa aberta!",
            description: `Conversa com ${contact.name} foi aberta.`,
          });
        }
        break;
      case 'respondeu':
        // Agendar chamada -> abrir modal de agendar reuniao
        if (onSchedule) onSchedule(contact, 'reuniao');
        break;
      case 'chamada_agendada':
        // Realizar chamada -> delega para orquestrador central no layout
        if (onCallAction) {
          onCallAction(contact);
        }
        break;
      case 'chamada_realizada':
        // Enviar proposta -> abrir modal de proposta
        setActionContact(contact);
        setProposalModalOpen(true);
        break;
      case 'nao_compareceu':
        // Reagendar -> abrir modal de agendar reuniao
        if (onSchedule) onSchedule(contact, 'reuniao');
        break;
      case 'aguardando_proposta':
        // Preparar proposta -> abrir modal de proposta
        setActionContact(contact);
        setProposalModalOpen(true);
        break;
      case 'proposta_pronta':
        // Apresentar proposta -> ir para conversa com mensagem de agendamento
        proposalContactIdRef.current = contact.id;
        proposalContactNameRef.current = contact.name;
        setActionContact(contact);
        setProposalReadyOpen(true);
        break;
      case 'visita_agendada':
        // Realizar visita -> confirmar visita realizada
        await moveLeadAndToast(contact, 'visita_realizada', 'Visita realizada!', `${contact.name} movido para "Visita Realizada"`);
        break;
      case 'visita_realizada':
        // Negociar proposta -> ir para conversa
        if (onGoToConversation) {
          onGoToConversation(contact.id, '');
          toast({
            title: "Conversa aberta!",
            description: `Conversa com ${contact.name} foi aberta para negociação.`,
          });
        }
        break;
      case 'proposta_negociacao':
        // Fechar negocio -> ir para conversa
        if (onGoToConversation) {
          onGoToConversation(contact.id, '');
          toast({
            title: "Conversa aberta!",
            description: `Conversa com ${contact.name} foi aberta para fechar negócio.`,
          });
        }
        break;
      case 'financiamento':
        // Aprovar credito -> mover para contrato assinado
        await onMoveToPipeline(contact.id, 'contrato_assinado');
        toast({
          title: "Crédito aprovado!",
          description: `${contact.name} movido para "Contrato Assinado"`,
        });
        break;
      case 'contrato_assinado':
        // Aguardar pagamento -> mover para projeto pago
        await onMoveToPipeline(contact.id, 'projeto_pago');
        toast({
          title: "Pagamento recebido!",
          description: `${contact.name} movido para "Projeto Pago"`,
        });
        break;
      case 'projeto_pago':
        // Agendar instalacao -> abrir modal de visita (como instalacao)
        if (onSchedule) onSchedule(contact, 'visita');
        break;
      case 'aguardando_instalacao':
        // Instalar sistema -> mover para projeto instalado
        await onMoveToPipeline(contact.id, 'projeto_instalado');
        toast({
          title: "Instalação concluída!",
          description: `${contact.name} movido para "Projeto Instalado"`,
        });
        break;
      case 'projeto_instalado':
        // Coletar avaliacao -> mover para coletar avaliacao
        await onMoveToPipeline(contact.id, 'coletar_avaliacao');
        toast({
          title: "Avaliação pendente!",
          description: `${contact.name} movido para "Coletar Avaliação"`,
        });
        break;
      case 'coletar_avaliacao':
        // Pedir indicacao -> ir para conversa
        if (onGoToConversation) {
          const referralMsg = getMessage('askForReferralMessage');
          onGoToConversation(contact.id, referralMsg);
        }
        break;
      default:
        // Nenhuma acao especial
        break;
      }
    } catch (error) {
      console.error('Failed to execute next action stage transition', { contactId: contact.id, stage, error });
      toast({
        title: "Falha ao mover lead",
        description: "Nao foi possivel atualizar a etapa. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, contact: Contact) => {
    if (isMobileViewport) return;
    e.dataTransfer.setData('text/plain', contact.id);
    e.dataTransfer.setData('application/json', JSON.stringify(contact));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedContact(contact);

    const target = e.currentTarget as HTMLElement;
    setTimeout(() => {
      target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, stage: PipelineStage) => {
    if (isMobileViewport) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isMobileViewport) return;
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStage: PipelineStage) => {
    if (isMobileViewport) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverStage(null);

    let contactToMove = draggedContact;
    if (!contactToMove) {
      try {
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
          contactToMove = JSON.parse(jsonData) as Contact;
        }
      } catch (err) {
        console.error('Error parsing drag data:', err);
      }
    }

    if (contactToMove && contactToMove.pipelineStage !== targetStage) {
      const stageInfo = PIPELINE_STAGES[targetStage];
      const previousStage = contactToMove.pipelineStage;

      try {
        // Move the contact (Layout will handle automations)
        await onMoveToPipeline(contactToMove.id, targetStage);
        toast({
          title: "Lead movido!",
          description: `${contactToMove.name} movido para ${stageInfo.title}`,
        });
      } catch (error) {
        console.error('Failed to move lead by drag and drop', {
          contactId: contactToMove.id,
          fromStage: previousStage,
          targetStage,
          error,
        });
        toast({
          title: "Falha ao mover lead",
          description: "Nao foi possivel atualizar a etapa via arrastar e soltar.",
          variant: "destructive",
        });
      }
    }

    setDraggedContact(null);
  };

  const handleConfirmDelete = async () => {
    if (!contactToDelete || !onDeleteLead) return;
    try {
      await onDeleteLead(contactToDelete.id);
      toast({
        title: "Lead excluído!",
        description: `${contactToDelete.name} foi removido com sucesso.`,
      });
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o lead.",
        variant: "destructive"
      });
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (isMobileViewport) return;
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    setDraggedContact(null);
    setDragOverStage(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30">
      <PageHeader
        title="Pipeline de Vendas"
        subtitle="Arraste os cards entre as etapas para navegar"
        icon={Kanban}
        actionContent={
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {canViewTeam && onLeadScopeChange ? (
              <LeadScopeSelect
                value={leadScope}
                onChange={onLeadScopeChange}
                members={leadScopeMembers}
                loading={leadScopeLoading}
                currentUserId={currentUserId}
                testId="pipeline-owner-scope-trigger"
              />
            ) : null}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title={hasChannelFilter ? `Origem: ${selectedChannelLabel}` : 'Filtrar por origem'}
                  className={`border-border/50 shadow-sm glass ${hasChannelFilter ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
                >
                  <Filter className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3 bg-popover border border-border shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Origem do lead</h3>
                  {hasChannelFilter ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setChannelFilter('todos')}
                    >
                      Limpar
                    </Button>
                  ) : null}
                </div>

                <Select
                  value={channelFilter}
                  onValueChange={(value) => setChannelFilter(value as ChannelFilter)}
                >
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {channelFilters.map((filter) => (
                      <SelectItem key={`pipeline-origin-${filter.id}`} value={filter.id}>
                        {`${filter.label} (${getChannelCount(filter.id)})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PopoverContent>
            </Popover>

            <div className="relative min-w-0 flex-1 basis-full sm:basis-auto lg:w-64 lg:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-10 bg-background border-border/50 shadow-sm glass"
              />
            </div>

            <Button
              variant="outline"
              className="border-border/50 shadow-sm glass"
              onClick={() => setLossAnalyticsOpen(true)}
            >
              <TrendingDown className="mr-2 h-4 w-4 text-rose-500" />
              Analise de Perdas
            </Button>

            {/* Import/Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title="Importar / Exportar contatos"
                  className="border-border/50 shadow-sm glass"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={() => setShowImportModal(true)} className="gap-2">
                  <FileUp className="w-4 h-4" />
                  Importar Contatos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowExportModal(true)} className="gap-2">
                  <FileDown className="w-4 h-4" />
                  Exportar Contatos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{contactToDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMobileViewport && (
        <div className="border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-sm">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Etapa atual
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span>{PIPELINE_STAGES[activeMobileStage].icon}</span>
                <span className="truncate">{PIPELINE_STAGES[activeMobileStage].title}</span>
              </div>
            </div>
            <Badge variant="outline" className="h-8 rounded-full px-3 text-sm">
              {getContactsForStage(activeMobileStage).length}
            </Badge>
          </div>
        </div>
      )}

      {/* Pipeline Container with drag-to-scroll */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 bg-muted/50 pipeline-scroll-container relative ${isMobileViewport ? 'overflow-x-auto overflow-y-hidden px-3 py-4 sm:px-4' : 'p-5 select-none'}`}
        style={{
          cursor: isMobileViewport ? 'auto' : (isDraggingScroll ? 'grabbing' : 'grab'),
          overflowX: 'scroll',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
        onMouseDown={isMobileViewport ? undefined : handleMouseDown}
        onMouseMove={isMobileViewport ? undefined : handleMouseMove}
        onMouseUp={isMobileViewport ? undefined : handleMouseUp}
        onMouseLeave={isMobileViewport ? undefined : handleMouseLeave}
        onScroll={isMobileViewport ? updateActiveMobileStage : undefined}
      >
        <div
          className={`flex gap-4 pb-4 ${isMobileViewport ? 'snap-x snap-mandatory' : ''}`}
          style={{
            width: 'max-content',
            minWidth: isMobileViewport ? '100%' : `${stages.length * 296}px`,
            height: 'calc(100% - 16px)',
          }}
        >
          {stages.map(([stageId, stage]) => {
            const stageContacts = getContactsForStage(stageId);
            const totalValue = stageContacts.reduce((sum, c) => sum + c.projectValue, 0);
            const stageColor = STAGE_COLORS[stageId];
            const isDropTarget = dragOverStage === stageId;

            return (
              <div
                key={stageId}
                data-pipeline-stage-id={stageId}
                className={`${isMobileViewport ? 'w-[calc(100vw-2rem)] max-w-[360px] min-w-[280px] snap-center scroll-mx-3 sm:scroll-mx-4' : 'w-[280px]'} flex-shrink-0 flex flex-col bg-card rounded-lg shadow-md transition-all duration-200 ${isDropTarget ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                onDragOver={isMobileViewport ? undefined : (e) => handleDragOver(e, stageId)}
                onDragLeave={isMobileViewport ? undefined : handleDragLeave}
                onDrop={isMobileViewport ? undefined : (e) => handleDrop(e, stageId)}
              >
                {/* Column Header */}
                <div
                  className="p-4 rounded-t-lg"
                  style={{ backgroundColor: stageColor }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-lg">{stage.icon}</span>
                      <span className="font-semibold text-white text-sm">{stage.title}</span>
                    </div>
                    <Badge className="bg-white/20 text-white hover:bg-white/30 border-0">
                      {stageContacts.length}
                    </Badge>
                  </div>
                  <div className="text-white/90 text-sm font-medium">
                    {formatCurrency(totalValue)}
                  </div>
                </div>

                {/* Cards Container */}
                <div className={`flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar ${isMobileViewport ? 'min-h-[calc(100dvh-24rem)] pr-2' : 'min-h-[400px]'}`}>
                  {stageContacts.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg">
                      Nenhum lead
                    </div>
                  ) : (
                    stageContacts.map(contact => {
                      const daysInStage = getDaysInStage(contact);
                      const nextAction = getNextAction(contact);
                      const isDragging = draggedContact?.id === contact.id;

                      return (
                        <div
                          key={contact.id}
                          draggable={!isMobileViewport}
                          onClick={(e) => handleCardClick(contact, e)}
                          onDragStart={isMobileViewport ? undefined : (e) => handleDragStart(e, contact)}
                          onDragEnd={isMobileViewport ? undefined : handleDragEnd}
                          className={`rounded-lg border border-border/80 bg-card/96 p-3 text-foreground shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${!isMobileViewport ? 'active:cursor-grabbing' : ''} ${isDragging ? 'opacity-50 scale-95' : ''
                            }`}
                        >
                          {/* Header with Drag Handle and Actions Button */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-2xl flex-shrink-0">{contact.avatar || '👤'}</span>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-foreground text-sm truncate">{contact.name}</div>
                                {contact.company && (
                                  <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                    <span className="flex-shrink-0">🏢</span> {contact.company}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-0 flex-shrink-0">
                              {/* Actions Dropdown Button */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    data-testid={`lead-actions-${contact.id}`}
                                    aria-label={`Ações do lead ${contact.name}`}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-popover">
                                  <DropdownMenuItem
                                    onClick={(e) => handleQuickAction('conversation', contact, e as unknown as React.MouseEvent)}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <MessageSquare className="w-4 h-4 text-primary" />
                                    <span>Ver Conversa</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => handleQuickAction('comments', contact, e)}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <MessageSquareQuote className="w-4 h-4 text-amber-500" />
                                    <span>Ver Comentários</span>
                                  </DropdownMenuItem>
                                  <div className="h-px bg-muted my-1" />
                                  <DropdownMenuItem
                                    onClick={(e) => handleQuickAction('call', contact, e as unknown as React.MouseEvent)}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <Phone className="w-4 h-4 text-blue-500" />
                                    <span>Ligar Agora</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => handleQuickAction('schedule', contact, e as unknown as React.MouseEvent)}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <Calendar className="w-4 h-4 text-purple-500" />
                                    <span>Agendar Reunião</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => handleQuickAction('proposal', contact, e as unknown as React.MouseEvent)}
                                    className="gap-2 cursor-pointer"
                                    data-testid={`lead-action-proposal-${contact.id}`}
                                  >
                                    <FileText className="w-4 h-4 text-green-500" />
                                    <span>Gerar Proposta</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => handleQuickAction('visit', contact, e as unknown as React.MouseEvent)}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <MapPin className="w-4 h-4 text-orange-500" />
                                    <span>Agendar Visita</span>
                                  </DropdownMenuItem>
                                  {contact.pipelineStage !== 'perdido' ? (
                                    <DropdownMenuItem
                                      onClick={(e) => handleQuickAction('mark_lost', contact, e as unknown as React.MouseEvent)}
                                      className="gap-2 cursor-pointer text-rose-600 focus:text-rose-600"
                                    >
                                      <CircleX className="w-4 h-4" />
                                      <span>Marcar como Perdido</span>
                                    </DropdownMenuItem>
                                  ) : null}
                                  {isMobileViewport ? (
                                    <>
                                      <div className="h-px bg-muted my-1" />
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                                          <ArrowUpDown className="w-4 h-4 text-primary" />
                                          <span>Mover etapa</span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="w-56">
                                          {(Object.keys(PIPELINE_STAGES) as PipelineStage[]).map((stageId) => {
                                            const stageInfo = PIPELINE_STAGES[stageId];
                                            const isCurrentStage = stageId === contact.pipelineStage;

                                            return (
                                              <DropdownMenuItem
                                                key={`${contact.id}-${stageId}`}
                                                data-testid={`lead-move-stage-${contact.id}-${stageId}`}
                                                disabled={isCurrentStage}
                                                onSelect={(event) => {
                                                  event.preventDefault();
                                                  void handleMoveToStageFromMenu(contact, stageId);
                                                }}
                                                className="gap-2"
                                              >
                                                <span>{stageInfo.icon}</span>
                                                <span className="truncate">{stageInfo.title}</span>
                                              </DropdownMenuItem>
                                            );
                                          })}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                    </>
                                  ) : null}
                                  {onDeleteLead && (
                                    <>
                                      <div className="h-px bg-muted my-1" />
                                      <DropdownMenuItem
                                        onClick={(e) => handleQuickAction('delete', contact, e as unknown as React.MouseEvent)}
                                        className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        <span>Excluir Lead</span>
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {!isMobileViewport && <GripVertical className="w-4 h-4 text-muted-foreground/30 ml-0.5 cursor-grab active:cursor-grabbing flex-shrink-0" />}
                            </div>
                          </div>

                          <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                            <AssignMemberSelect
                              contactId={contact.id}
                              currentAssigneeId={contact.assignedToUserId}
                              triggerClassName="w-full"
                            />
                          </div>

                          {/* IA Control Row below name */}
                          <div className="flex items-center gap-2 mb-3">
                            {onToggleLeadAi && (
                              <div className="flex items-center gap-1.5 p-1 bg-muted/30 rounded-md border border-border/40 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Switch
                                  checked={contact.aiEnabled !== false}
                                  onCheckedChange={(checked) => onToggleLeadAi({ leadId: contact.id, enabled: checked })}
                                  className="scale-75 data-[state=checked]:bg-primary"
                                  title={contact.aiEnabled !== false ? 'IA Ativa' : 'IA Pausada'}
                                />
                                {contact.aiEnabled !== false ? (
                                  <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                ) : (
                                  <UserCog className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                                )}
                              </div>
                            )}
                          </div>

                          <StageBadges contact={contact} className="mb-3" />

                          <div className="mb-3">
                            <FollowUpIndicator
                              step={contact.followUpStep ?? 0}
                              enabled={contact.followUpEnabled !== false}
                            />
                          </div>

                          {/* Value */}
                          <div className="flex items-center gap-1 text-sm font-bold text-green-600 mb-1">
                            💰 {formatCurrency(contact.projectValue)}
                          </div>

                          {/* Days in Stage */}
                          <div className="text-xs text-muted-foreground mb-1">
                            ⏱️ {daysInStage === 1 ? '1 dia' : `${daysInStage} dias`} nesta etapa
                          </div>

                          {/* Next Action - Clickable */}
                          <button
                            onClick={(e) => handleNextActionClick(contact, e)}
                            className="text-xs text-blue-600 font-medium hover:text-blue-800 hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
                          >
                            {nextAction.nextStageIcon} {nextAction.text}
                          </button>

                          {/* Consumption Badge */}
                          <div className="mt-2 pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground">
                              ⚡ {contact.consumption} kWh/mês
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Lead Modal */}
      <EditLeadModal
        contact={editingContact}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingContact(null);
        }}
        onSave={handleSaveContact}
      />

      {/* Proposal Modal */}
      <ProposalModal
        isOpen={proposalModalOpen}
        onClose={() => {
          setProposalModalOpen(false);
          if (!proposalReadyOpen) {
            setActionContact(null);
          }
        }}
        contact={actionContact}
        onGenerate={handleProposal}
      />

      {/* Proposal Ready Modal */}
      <ProposalReadyModal
        isOpen={proposalReadyOpen}
        onClose={() => {
          setProposalReadyOpen(false);
          setActionContact(null);
          proposalContactIdRef.current = '';
          proposalContactNameRef.current = '';
        }}
        onGoToConversation={handleProposalReadyGoToConversation}
        contactId={proposalContactIdRef.current}
        contactName={proposalContactNameRef.current || actionContact?.name || ''}
        events={events}
      />

      {/* Lead Comments Modal */}
      <LeadCommentsModal
        isOpen={commentsModalOpen}
        onClose={() => {
          setCommentsModalOpen(false);
          setCommentsContact(null);
        }}
        leadId={commentsContact?.id || ''}
        leadName={commentsContact?.name || ''}
      />

      <MarkAsLostModal
        open={lostModalOpen}
        onOpenChange={(open) => {
          setLostModalOpen(open);
          if (!open) setLostContact(null);
        }}
        lead={lostContact}
        onMoveToPipeline={onMoveToPipeline}
        onUpdateLead={async (contactId, data) => {
          if (!onUpdateLead) return;
          await onUpdateLead(contactId, data);
        }}
      />

      <LossAnalyticsModal
        open={lossAnalyticsOpen}
        onOpenChange={setLossAnalyticsOpen}
        ownerUserId={resolvedOwnerUserId}
      />

      {/* Import Contacts Modal */}
      {onImportContacts && (
        <ImportContactsModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={onImportContacts}
        />
      )}

      {/* Export Contacts Modal */}
      <ExportContactsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        contacts={contacts}
      />
    </div>
  );
}
