import React, { useState, useRef, useCallback } from 'react';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { Contact, PIPELINE_STAGES, PipelineStage, CalendarEvent } from '@/types/solarzap';
import { Badge } from '@/components/ui/badge';
import { Search, GripVertical, MoreVertical, Phone, Calendar, FileText, Home, MessageSquare, ArrowUpDown, FileUp, FileDown, Trash2, Bot, UserCog, MapPin, MessageSquareQuote } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';
import { EditLeadModal, UpdateLeadData } from './EditLeadModal';

import { ProposalModal, ProposalData } from './ProposalModal';
import { ProposalReadyModal } from './ProposalReadyModal';
import { LeadCommentsModal } from './LeadCommentsModal';
import { AssignMemberSelect } from './AssignMemberSelect';
import { ImportContactsModal, ImportedContact } from './ImportContactsModal';
import { ExportContactsModal } from './ExportContactsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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
  onMoveToPipeline: (contactId: string, stage: PipelineStage) => void;
  onUpdateLead?: (contactId: string, data: UpdateLeadData) => Promise<void>;
  onGoToConversation?: (contactId: string, prefilledMessage: string, shouldAutoMoveToVisita?: boolean) => void;
  onCallAction?: (contact: Contact) => void;
  onGenerateProposal?: (data: ProposalData) => Promise<unknown>;

  onImportContacts?: (contacts: ImportedContact[]) => Promise<unknown>;
  onDeleteLead?: (contactId: string) => Promise<void>;
  onSchedule?: (contact: Contact, type: 'reuniao' | 'visita') => void;
  onToggleLeadAi?: (params: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => Promise<{ leadId: string; enabled: boolean }>;
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

export function PipelineView({ contacts, events, onMoveToPipeline, onUpdateLead, onGoToConversation, onCallAction, onGenerateProposal, onImportContacts, onDeleteLead, onSchedule, onToggleLeadAi }: PipelineViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  const { toast } = useToast();
  const { isDragDropEnabled, getMessage } = useAutomationSettings();

  // Drag-to-scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Drag-to-scroll handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('input')) {
      return;
    }

    if (!scrollContainerRef.current) return;

    setIsDraggingScroll(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    scrollContainerRef.current.style.cursor = 'grabbing';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingScroll || !scrollContainerRef.current) return;

    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  }, [isDraggingScroll, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingScroll(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isDraggingScroll) {
      setIsDraggingScroll(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.cursor = 'grab';
      }
    }
  }, [isDraggingScroll]);

  const handleCardClick = (contact: Contact, e: React.MouseEvent) => {
    if (draggedContact) return;
    if ((e.target as HTMLElement).closest('[draggable]') && e.type !== 'click') return;

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
      case 'delete':
        setContactToDelete(contact);
        setDeleteDialogOpen(true);
        break;
    }
  };

  // handleSchedule REMOVED

  const handleProposal = async (data: ProposalData) => {
    if (onGenerateProposal) {
      return onGenerateProposal(data);
    }

    // Store contactId and name in refs BEFORE any state changes - this survives batching
    proposalContactIdRef.current = data.contactId;
    const contact = contacts.find(c => c.id === data.contactId);
    proposalContactNameRef.current = contact?.name || actionContact?.name || '';
    console.log('handleProposal: storing in refs - contactId:', data.contactId, 'name:', proposalContactNameRef.current);

    // IMPORTANT: Set proposalReadyOpen to true BEFORE closing the modal
    setProposalReadyOpen(true);

    // Move to proposta_pronta
    onMoveToPipeline(data.contactId, 'proposta_pronta');

    // Close the proposal modal after setting proposalReadyOpen
    setProposalModalOpen(false);
  };

  const handleProposalReadyGoToConversation = (contactId: string, prefilledMessage: string) => {
    console.log('handleProposalReadyGoToConversation called');
    console.log('contactId from modal:', contactId);
    console.log('onGoToConversation available:', !!onGoToConversation);

    setProposalReadyOpen(false);
    if (contactId && onGoToConversation) {
      console.log('Calling onGoToConversation with:', contactId, 'shouldAutoMoveToVisita: true');
      // Pass true to auto-move to "Visita Agendada" after message is sent
      onGoToConversation(contactId, prefilledMessage, true);
    } else {
      console.error('Missing contactId or onGoToConversation callback');
    }
    setActionContact(null);
    proposalContactIdRef.current = '';
  };

  const stages = Object.entries(PIPELINE_STAGES) as [PipelineStage, typeof PIPELINE_STAGES[PipelineStage]][];

  const getContactsForStage = (stage: PipelineStage) => {
    let stageContacts = contacts.filter(c => c.pipelineStage === stage);

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

  const handleNextActionClick = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    const stage = contact.pipelineStage;

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
        // Agendar chamada -> abrir modal de agendar reunião
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
        // Reagendar -> abrir modal de agendar reunião
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
        onMoveToPipeline(contact.id, 'visita_realizada');
        toast({
          title: "Visita realizada!",
          description: `${contact.name} movido para "Visita Realizada"`,
        });
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
        // Fechar negócio -> ir para conversa
        if (onGoToConversation) {
          onGoToConversation(contact.id, '');
          toast({
            title: "Conversa aberta!",
            description: `Conversa com ${contact.name} foi aberta para fechar negócio.`,
          });
        }
        break;
      case 'financiamento':
        // Aprovar crédito -> mover para contrato assinado
        onMoveToPipeline(contact.id, 'contrato_assinado');
        toast({
          title: "Crédito aprovado!",
          description: `${contact.name} movido para "Contrato Assinado"`,
        });
        break;
      case 'contrato_assinado':
        // Aguardar pagamento -> mover para projeto pago
        onMoveToPipeline(contact.id, 'projeto_pago');
        toast({
          title: "Pagamento recebido!",
          description: `${contact.name} movido para "Projeto Pago"`,
        });
        break;
      case 'projeto_pago':
        // Agendar instalação -> abrir modal de visita (como instalação)
        if (onSchedule) onSchedule(contact, 'visita');
        break;
      case 'aguardando_instalacao':
        // Instalar sistema -> mover para projeto instalado
        onMoveToPipeline(contact.id, 'projeto_instalado');
        toast({
          title: "Instalação concluída!",
          description: `${contact.name} movido para "Projeto Instalado"`,
        });
        break;
      case 'projeto_instalado':
        // Coletar avaliação -> mover para coletar avaliação
        onMoveToPipeline(contact.id, 'coletar_avaliacao');
        toast({
          title: "Avaliação pendente!",
          description: `${contact.name} movido para "Coletar Avaliação"`,
        });
        break;
      case 'coletar_avaliacao':
        // Pedir indicação -> ir para conversa
        if (onGoToConversation) {
          const referralMsg = getMessage('askForReferralMessage');
          onGoToConversation(contact.id, referralMsg);
        }
        break;
      default:
        // Nenhuma ação especial
        break;
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, contact: Contact) => {
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
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStage: PipelineStage) => {
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

      // Move the contact (Layout will handle automations)
      onMoveToPipeline(contactToMove.id, targetStage);
      toast({
        title: "Lead movido!",
        description: `${contactToMove.name} movido para ${stageInfo.title}`,
      });
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
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    setDraggedContact(null);
    setDragOverStage(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30">
      {/* Premium Header */}
      <div className="px-6 py-5 bg-gradient-to-r from-primary/10 via-background to-blue-500/10 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Pipeline de Vendas</h1>
              <p className="text-sm text-muted-foreground">Arraste os cards entre as etapas para navegar</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background border-border/50 shadow-sm"
              />
            </div>

            {/* Import/Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title="Importar / Exportar contatos"
                  className="border-border/50 shadow-sm"
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
        </div>
      </div>


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

      {/* Pipeline Container with drag-to-scroll */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-muted/50 p-5 pipeline-scroll-container select-none relative"
        style={{
          cursor: isDraggingScroll ? 'grabbing' : 'grab',
          overflowX: 'scroll',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="flex gap-4 pb-4"
          style={{
            width: 'max-content',
            minWidth: `${stages.length * 296}px`,
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
                className={`w-[280px] flex-shrink-0 flex flex-col bg-card rounded-lg shadow-md transition-all duration-200 ${isDropTarget ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                onDragOver={(e) => handleDragOver(e, stageId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stageId)}
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
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px] custom-scrollbar">
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
                          draggable
                          onClick={(e) => handleCardClick(contact, e)}
                          onDragStart={(e) => handleDragStart(e, contact)}
                          onDragEnd={handleDragEnd}
                          className={`bg-white rounded-lg shadow-sm border border-border p-3 cursor-pointer active:cursor-grabbing transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isDragging ? 'opacity-50 scale-95' : ''
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
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
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
                              <GripVertical className="w-4 h-4 text-muted-foreground/30 ml-0.5 cursor-grab active:cursor-grabbing flex-shrink-0" />
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
                                  className="scale-75 data-[state=checked]:bg-green-600"
                                  title={contact.aiEnabled !== false ? 'IA Ativa' : 'IA Pausada'}
                                />
                                {contact.aiEnabled !== false ? (
                                  <Bot className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                                ) : (
                                  <UserCog className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                                )}
                              </div>
                            )}
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


