import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRightLeft,
  ArrowUpDown,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileDown,
  FileText,
  FileUp,
  GripVertical,
  KanbanSquare,
  MessageSquare,
  MoreVertical,
  Phone,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useToast } from '@/hooks/use-toast';
import { formatCurrencyBr, TokenBadge } from '@/modules/internal-crm/components/InternalCrmUi';
import { DealDetailPanel } from '@/modules/internal-crm/components/pipeline/DealDetailPanel';
import { PipelineFilters } from '@/modules/internal-crm/components/pipeline/PipelineFilters';
import { DealCheckoutModal } from '@/modules/internal-crm/components/pipeline/modals/DealCheckoutModal';
import { DealCommentsSheet } from '@/modules/internal-crm/components/pipeline/modals/DealCommentsSheet';
import { EditDealModal } from '@/modules/internal-crm/components/pipeline/modals/EditDealModal';
import { MarkAsLostModal } from '@/modules/internal-crm/components/pipeline/modals/MarkAsLostModal';
import { MarkAsWonModal } from '@/modules/internal-crm/components/pipeline/modals/MarkAsWonModal';
import { InternalCrmAppointmentModal } from '@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal';
import { CrmExportClientsModal } from '@/modules/internal-crm/components/clients/CrmExportClientsModal';
import { CrmImportClientsModal } from '@/modules/internal-crm/components/clients/CrmImportClientsModal';
import {
  internalCrmQueryKeys,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import {
  useInternalCrmPipelineBoard,
  type InternalCrmPipelineBoardCard,
} from '@/modules/internal-crm/hooks/useInternalCrmPipelineBoard';
import { EMPTY_DEAL_DRAFT, type DealDraft } from '@/modules/internal-crm/components/pipeline/types';
import {
  getInternalCrmStageColor,
  getInternalCrmStageLabel,
  INTERNAL_CRM_PIPELINE_STAGE_ORDER,
  normalizeInternalCrmStageCode,
} from '@/modules/internal-crm/components/pipeline/stageCatalog';
import type { InternalCrmAppointment, InternalCrmDealSummary } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';
import { InternalCrmFilterBar } from '@/modules/internal-crm/components/InternalCrmPageLayout';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function getCardInitials(card: InternalCrmPipelineBoardCard): string {
  const source = card.contactName || card.companyName || card.title;
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getPaymentStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'Pago';
  if (normalized === 'pending') return 'Pendente';
  if (normalized === 'failed') return 'Falhou';
  if (normalized === 'processing') return 'Processando';
  return normalized ? normalized : 'Pendente';
}

function formatAppointmentLabel(appointment: InternalCrmAppointment | null): string | null {
  if (!appointment?.start_at) return null;
  const date = new Date(appointment.start_at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractTrackingAttribution(value: unknown): Record<string, unknown> {
  const context = asRecord(value);
  return asRecord(context.attribution);
}

function hasTrackingAttribution(value: unknown): boolean {
  return Object.keys(extractTrackingAttribution(value)).length > 0;
}

function buildDealDraftFromCard(card: InternalCrmPipelineBoardCard): DealDraft {
  const context = asRecord(card.deal.commercial_context);
  return {
    id: card.deal.id,
    client_id: card.deal.client_id,
    title: card.deal.title,
    stage_code: normalizeInternalCrmStageCode(card.deal.stage_code),
    probability: Number(card.deal.probability || 0),
    notes: card.deal.notes || '',
    items: (card.deal.items || []).length > 0
      ? (card.deal.items || []).map((item) => ({
          product_code: item.product_code,
          billing_type: item.billing_type,
          payment_method: item.payment_method,
          unit_price_cents: item.unit_price_cents,
          quantity: item.quantity,
        }))
      : EMPTY_DEAL_DRAFT.items,
    primary_offer_code: card.deal.primary_offer_code || '',
    closed_product_code: card.deal.closed_product_code || '',
    mentorship_variant: card.deal.mentorship_variant || '',
    next_offer_code: card.deal.next_offer_code || '',
    next_offer_at: card.deal.next_offer_at || '',
    software_status: card.deal.software_status || 'not_offered',
    landing_page_status: card.deal.landing_page_status || 'not_offered',
    traffic_status: card.deal.traffic_status || 'not_offered',
    trial_status: card.deal.trial_status || 'not_offered',
    mentorship_sessions_completed: asString(context.mentorship_sessions_completed) || '0',
    last_declined_offer_code: asString(context.last_declined_offer_code),
    trial_ends_at: asString(context.trial_ends_at),
    scheduling_link: asString(context.scheduling_link),
    meeting_link: asString(context.meeting_link),
  };
}

function buildDealPayload(
  draft: DealDraft,
  ownerUserId: string,
  existingCommercialContext: Record<string, unknown>,
) {
  const items = draft.items
    .filter((item) => item.product_code.trim().length > 0)
    .map((item) => ({
      product_code: item.product_code,
      billing_type: item.billing_type,
      payment_method: item.payment_method,
      unit_price_cents: Number(item.unit_price_cents || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }));

  return {
    action: 'upsert_deal' as const,
    deal_id: draft.id,
    client_id: draft.client_id,
    title: draft.title.trim(),
    owner_user_id: ownerUserId || null,
    stage_code: normalizeInternalCrmStageCode(draft.stage_code),
    probability: Math.max(0, Math.min(100, Number(draft.probability || 0))),
    notes: draft.notes.trim() || null,
    items,
    primary_offer_code: draft.primary_offer_code || null,
    closed_product_code: draft.closed_product_code || null,
    mentorship_variant: draft.mentorship_variant || null,
    next_offer_code: draft.next_offer_code || null,
    next_offer_at: draft.next_offer_at || null,
    software_status: draft.software_status,
    landing_page_status: draft.landing_page_status,
    traffic_status: draft.traffic_status,
    trial_status: draft.trial_status,
    commercial_context: {
      ...existingCommercialContext,
      mentorship_sessions_completed: Number(draft.mentorship_sessions_completed || 0),
      last_declined_offer_code: draft.last_declined_offer_code || null,
      trial_ends_at: draft.trial_ends_at || null,
      scheduling_link: draft.scheduling_link || null,
      meeting_link: draft.meeting_link || null,
    },
  };
}

export function InternalCrmPipelineView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobileViewport = useMobileViewport();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [stageCode, setStageCode] = useState('all');
  const [status, setStatus] = useState<'all' | 'open' | 'won' | 'lost'>('all');
  const [ownerUserId, setOwnerUserId] = useState('all');
  const [sourceChannel, setSourceChannel] = useState('all');

  // D&D state
  const [draggedCard, setDraggedCard] = useState<InternalCrmPipelineBoardCard | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Drag-to-scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftVal, setScrollLeftVal] = useState(0);
  const [activeMobileStage, setActiveMobileStage] = useState('novo_lead');

  // Modal & panel state
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [editDealOpen, setEditDealOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<InternalCrmPipelineBoardCard | null>(null);
  const [editingDraft, setEditingDraft] = useState<DealDraft>(EMPTY_DEAL_DRAFT);
  const [editingOwnerUserId, setEditingOwnerUserId] = useState('');
  const [selectedAppointment, setSelectedAppointment] = useState<InternalCrmAppointment | null>(null);
  const [appointmentDefaults, setAppointmentDefaults] = useState<{
    client_id?: string | null;
    deal_id?: string | null;
    title?: string | null;
    appointment_type?: string | null;
    status?: string | null;
    location?: string | null;
    notes?: string | null;
  } | null>(null);
  const [wonProductCode, setWonProductCode] = useState('');
  const [wonValueReais, setWonValueReais] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');

  const board = useInternalCrmPipelineBoard({
    search,
    stage_code: stageCode,
    status,
    owner_user_id: ownerUserId,
    source_channel: sourceChannel,
  });

  const upsertDealMutation = useInternalCrmMutation<{ ok: true; deal: { id: string } }>({
    invalidate: [
      ['internal-crm', 'deals'],
      ['internal-crm', 'clients'],
      ['internal-crm', 'tasks'],
      ['internal-crm', 'appointments'],
      ['internal-crm', 'conversations'],
      internalCrmQueryKeys.pipelineStages(),
    ],
  });

  const moveDealMutation = useInternalCrmMutation({
    invalidate: [
      ['internal-crm', 'deals'],
      ['internal-crm', 'clients'],
      ['internal-crm', 'tasks'],
      ['internal-crm', 'appointments'],
      ['internal-crm', 'conversations'],
    ],
  });

  const saveNotesMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'deals']],
  });

  const checkoutMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'deals'], ['internal-crm', 'clients']],
    onSuccess: async (data) => {
      const url = String((data as { checkout_url?: string })?.checkout_url || '');
      setCheckoutUrl(url);
      if (url) {
        toast({ title: 'Checkout gerado', description: 'Link Stripe disponível para envio ao cliente.' });
      }
    },
  });

  const appointmentMutation = useInternalCrmMutation({
    invalidate: [
      ['internal-crm', 'appointments'],
      ['internal-crm', 'deals'],
      ['internal-crm', 'clients'],
      ['internal-crm', 'tasks'],
    ],
  });

  const upsertClientMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'clients'], ['internal-crm', 'deals']],
  });

  const products = board.productsQuery.data?.products || [];
  const appointments = board.appointmentsQuery.data?.appointments || [];
  const stages = board.stageOptions;
  const members = board.members;
  const clients = board.clientsQuery.data?.clients || [];

  const cardsById = useMemo(() => {
    return new Map(board.cards.map((card) => [card.id, card]));
  }, [board.cards]);

  const activeSelectedCard = selectedCard ? cardsById.get(selectedCard.id) || selectedCard : null;
  const selectedDeal = activeSelectedCard?.deal || null;

  useEffect(() => {
    const requestedDealId = searchParams.get('deal');
    const requestedClientId = searchParams.get('client');
    if (!requestedDealId && !requestedClientId) return;

    const matchedCard = board.cards.find((card) => {
      if (requestedDealId && card.deal.id === requestedDealId) return true;
      if (!requestedClientId) return false;
      return card.deal.client_id === requestedClientId || card.client?.id === requestedClientId;
    });

    if (!matchedCard) return;

    setSelectedCard(matchedCard);
    setDetailPanelOpen(true);
    setActiveMobileStage(normalizeInternalCrmStageCode(matchedCard.deal.stage_code));

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('deal');
    nextParams.delete('client');
    setSearchParams(nextParams, { replace: true });
  }, [board.cards, searchParams, setSearchParams]);

  const resolveProductPriceCents = (productCode: string): number => {
    const product = products.find((item) => item.product_code === productCode);
    return Number(product?.price_cents || 0);
  };

  const findRelevantAppointment = useCallback((
    card: InternalCrmPipelineBoardCard,
    appointmentType: string,
  ) => {
    const normalizedType = appointmentType === 'demo' ? 'meeting' : appointmentType;
    const matchingTypes = normalizedType === 'meeting' ? ['meeting', 'demo'] : [normalizedType];

    return appointments
      .filter((appointment) => {
        const matchesDeal = appointment.deal_id
          ? appointment.deal_id === card.deal.id
          : appointment.client_id === card.deal.client_id;
        if (!matchesDeal) return false;
        if (!['scheduled', 'confirmed'].includes(String(appointment.status || ''))) return false;
        return matchingTypes.includes(String(appointment.appointment_type || ''));
      })
      .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())[0] || null;
  }, [appointments]);

  const updateActiveMobileStage = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const stageElements = Array.from(container.querySelectorAll<HTMLElement>('[data-pipeline-stage-id]'));
    if (stageElements.length === 0) return;

    const viewportCenter = container.scrollLeft + container.clientWidth / 2;
    let nearestStage = activeMobileStage;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const stageElement of stageElements) {
      const stageId = stageElement.dataset.pipelineStageId;
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
    if (board.columns.length === 0) return;
    if (!board.columns.some((column) => column.stage_code === activeMobileStage)) {
      setActiveMobileStage(board.columns[0].stage_code);
    }
  }, [activeMobileStage, board.columns]);

  // --- Drag-to-scroll handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobileViewport) return;
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('input')) return;
    if (!scrollContainerRef.current) return;
    setIsDraggingScroll(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeftVal(scrollContainerRef.current.scrollLeft);
    scrollContainerRef.current.style.cursor = 'grabbing';
  }, [isMobileViewport]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMobileViewport) return;
    if (!isDraggingScroll || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeftVal - walk;
  }, [isDraggingScroll, isMobileViewport, startX, scrollLeftVal]);

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

  // --- D&D handlers ---
  const handleDragStart = (e: React.DragEvent, card: InternalCrmPipelineBoardCard) => {
    if (isMobileViewport) return;
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.setData('application/json', JSON.stringify({ id: card.id }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedCard(card);
    setTimeout(() => {
      (e.currentTarget as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (isMobileViewport) return;
    (e.currentTarget as HTMLElement).style.opacity = '1';
    setDraggedCard(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, targetStageCode: string) => {
    if (isMobileViewport) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== targetStageCode) {
      setDragOverStage(targetStageCode);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isMobileViewport) return;
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const openMarkWonModal = (card: InternalCrmPipelineBoardCard) => {
    const productCode =
      card.deal.closed_product_code ||
      card.deal.primary_offer_code ||
      card.deal.items?.[0]?.product_code ||
      products[0]?.product_code ||
      '';
    const fallbackCents = card.deal.one_time_total_cents > 0
      ? card.deal.one_time_total_cents
      : resolveProductPriceCents(productCode);

    setSelectedCard(card);
    setWonProductCode(productCode);
    setWonValueReais((fallbackCents / 100).toFixed(2));
    setWonModalOpen(true);
  };

  const openMarkLostModal = (card: InternalCrmPipelineBoardCard) => {
    setSelectedCard(card);
    setLostReason(card.deal.lost_reason || '');
    setLostModalOpen(true);
  };

  const openAppointmentModalForCard = useCallback((card: InternalCrmPipelineBoardCard, appointmentType: string = 'meeting') => {
    const relevantAppointment = findRelevantAppointment(card, appointmentType);
    const normalizedType = appointmentType === 'demo' ? 'meeting' : appointmentType;
    const isCallType = normalizedType === 'call';

    setSelectedCard(card);
    setSelectedAppointment(relevantAppointment);
    setAppointmentDefaults({
      client_id: card.deal.client_id,
      deal_id: card.deal.id,
      title: isCallType ? `Ligacao - ${card.companyName}` : `Reuniao - ${card.companyName}`,
      appointment_type: normalizedType,
      status: relevantAppointment?.status || 'scheduled',
      location: relevantAppointment?.location || null,
      notes: relevantAppointment?.notes || null,
    });
    setAppointmentModalOpen(true);
  }, [findRelevantAppointment]);

  const handleMoveToStage = useCallback(async (
    card: InternalCrmPipelineBoardCard,
    targetStageCode: string,
    options?: { skipTerminalModal?: boolean; skipSchedulingModal?: boolean; successMessage?: string },
  ) => {
    const normalizedStageCode = normalizeInternalCrmStageCode(targetStageCode);
    if (card.stageCode === normalizedStageCode) return;

    if (!options?.skipSchedulingModal && normalizedStageCode === 'chamada_agendada') {
      openAppointmentModalForCard(card, 'meeting');
      return;
    }

    if (!options?.skipTerminalModal && normalizedStageCode === 'fechou') {
      openMarkWonModal(card);
      return;
    }

    if (!options?.skipTerminalModal && normalizedStageCode === 'nao_fechou') {
      openMarkLostModal(card);
      return;
    }

    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: card.deal.id,
      stage_code: normalizedStageCode,
    });

    toast({
      title: 'Lead movido!',
      description: options?.successMessage || `Movido para ${getInternalCrmStageLabel(normalizedStageCode)}`,
    });
  }, [moveDealMutation, openAppointmentModalForCard, toast]);

  const handleDrop = async (e: React.DragEvent, targetStageCode: string) => {
    if (isMobileViewport) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverStage(null);

    let cardToMove = draggedCard;
    if (!cardToMove) {
      const jsonPayload = e.dataTransfer.getData('application/json');
      const textPayload = e.dataTransfer.getData('text/plain');
      if (jsonPayload) {
        try {
          const parsed = JSON.parse(jsonPayload) as { id?: string };
          if (parsed.id) {
            cardToMove = cardsById.get(parsed.id) || null;
          }
        } catch {
          cardToMove = null;
        }
      }
      if (!cardToMove && textPayload) {
        cardToMove = cardsById.get(textPayload) || null;
      }
    }

    if (!cardToMove || cardToMove.stageCode === targetStageCode) {
      setDraggedCard(null);
      return;
    }

    if (targetStageCode === 'fechou') {
      openMarkWonModal(cardToMove);
      setDraggedCard(null);
      return;
    }

    if (targetStageCode === 'nao_fechou') {
      openMarkLostModal(cardToMove);
      setDraggedCard(null);
      return;
    }

    try {
      await handleMoveToStage(cardToMove, targetStageCode);
    } finally {
      setDraggedCard(null);
    }
  };

  const handleMoveToStageById = useCallback((dealId: string, targetStageCode: string) => {
    const card = cardsById.get(dealId);
    if (!card) return;
    void handleMoveToStage(card, targetStageCode);
  }, [cardsById, handleMoveToStage]);

  const handleSaveNotes = async (dealId: string, notes: string) => {
    await saveNotesMutation.mutateAsync({
      action: 'save_deal_notes',
      deal_id: dealId,
      notes,
    });
    toast({ title: 'Notas salvas' });
  };

  const handleOpenNewDeal = () => {
    if (clients.length === 0) {
      toast({ title: 'Cadastre um cliente primeiro', description: 'Crie ao menos um cliente antes de abrir um novo deal.', variant: 'destructive' });
      return;
    }

    setSelectedCard(null);
    setEditingDraft(EMPTY_DEAL_DRAFT);
    setEditingOwnerUserId('');
    setEditDealOpen(true);
  };

  const handleOpenEditDeal = (card: InternalCrmPipelineBoardCard) => {
    setSelectedCard(card);
    setEditingDraft(buildDealDraftFromCard(card));
    setEditingOwnerUserId(card.ownerUserId || '');
    setEditDealOpen(true);
  };

  const handleSaveEditDeal = async () => {
    if (!editingDraft.client_id || !editingDraft.title.trim()) {
      toast({ title: 'Preencha cliente e titulo', variant: 'destructive' });
      return;
    }

    await upsertDealMutation.mutateAsync(
      buildDealPayload(
        editingDraft,
        editingOwnerUserId,
        activeSelectedCard ? asRecord(activeSelectedCard.deal.commercial_context) : {},
      ),
    );

    setEditDealOpen(false);
    toast({ title: editingDraft.id ? 'Deal atualizado' : 'Deal criado' });
  };

  const handleImportClient = async (record: Record<string, string>) => {
    await upsertClientMutation.mutateAsync({
      action: 'upsert_client',
      ...record,
    });
  };

  const confirmDealWon = async () => {
    if (!selectedDeal) return;
    const oneTimeTotalCents = Math.max(0, Math.round(Number(wonValueReais || 0) * 100));

    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: selectedDeal.id,
      stage_code: 'fechou',
      notes: 'Marcado como fechou contrato na pipeline.',
      closed_product_code: wonProductCode,
      one_time_total_cents: oneTimeTotalCents,
      event_currency: 'BRL',
    });
    setWonModalOpen(false);
    setWonProductCode('');
    setWonValueReais('');
    toast({ title: 'Contrato fechado!', description: 'O lead foi movido para Fechou Contrato.' });
  };

  const confirmLostDeal = async () => {
    if (!selectedDeal) return;
    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: selectedDeal.id,
      stage_code: 'nao_fechou',
      notes: lostReason || 'Marcado como não fechou na pipeline.',
      lost_reason: lostReason || null,
    });
    setLostModalOpen(false);
    setLostReason('');
    toast({ title: 'Não fechou', description: 'O lead foi movido para Não Fechou com motivo registrado.' });
  };

  const handleGenerateCheckout = async () => {
    if (!selectedDeal) return;
    await checkoutMutation.mutateAsync({
      action: 'create_deal_checkout_link',
      deal_id: selectedDeal.id,
      client_id: selectedDeal.client_id,
    });
  };

  const handleOpenClient = useCallback((card: InternalCrmPipelineBoardCard) => {
    navigate(`/admin/crm/clients?client=${card.client?.id || card.deal.client_id}`);
  }, [navigate]);

  const handleOpenConversation = useCallback((card: InternalCrmPipelineBoardCard) => {
    if (card.conversation?.id) {
      navigate(`/admin/crm/inbox?conversation=${card.conversation.id}`);
      return;
    }

    toast({ title: 'Sem conversa vinculada', description: 'Este cliente ainda não possui conversa ativa no CRM interno.' });
  }, [navigate, toast]);

  const handleCall = useCallback((card: InternalCrmPipelineBoardCard) => {
    const phone = card.client?.primary_phone;
    if (!phone) {
      toast({ title: 'Telefone indisponivel', description: 'Este cliente não possui telefone cadastrado.', variant: 'destructive' });
      return;
    }

    window.location.href = `tel:${phone}`;
  }, [toast]);

  const handleSaveAppointment = async (payload: Record<string, unknown>) => {
    const result = await appointmentMutation.mutateAsync({
      action: 'upsert_appointment',
      ...payload,
    });
    setAppointmentModalOpen(false);
    setSelectedAppointment(null);
    setAppointmentDefaults(null);
    const savedAppointment = (result as { appointment?: InternalCrmAppointment }).appointment || null;
    const type = String(savedAppointment?.appointment_type || payload.appointment_type || 'meeting');
    const title = type === 'call' ? 'Ligacao agendada' : type === 'visit' ? 'Visita agendada' : 'Reuniao agendada';
    toast({ title });
  };

  const handleAppointmentModalOpenChange = (open: boolean) => {
    setAppointmentModalOpen(open);
    if (open) return;
    setSelectedAppointment(null);
    setAppointmentDefaults(null);
  };

  const handleNextActionClick = async (card: InternalCrmPipelineBoardCard, e: React.MouseEvent) => {
    e.stopPropagation();
    switch (card.stageCode) {
      case 'novo_lead':
        handleOpenConversation(card);
        break;
      case 'respondeu':
        openAppointmentModalForCard(card, 'meeting');
        break;
      case 'chamada_agendada':
        openAppointmentModalForCard(card, 'meeting');
        break;
      case 'chamada_realizada':
        setSelectedCard(card);
        setCheckoutUrl(String(card.deal.checkout_url || ''));
        setCheckoutModalOpen(true);
        break;
      case 'nao_compareceu':
        openAppointmentModalForCard(card, 'meeting');
        break;
      case 'negociacao':
        openMarkWonModal(card);
        break;
      case 'fechou':
        handleOpenClient(card);
        break;
      case 'nao_fechou':
        await handleMoveToStage(card, 'novo_lead', { successMessage: 'Lead reativado e movido para Novo Lead.' });
        break;
      default:
        setSelectedCard(card);
        setDetailPanelOpen(true);
        break;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30">
      <PageHeader
        title="Pipeline"
        subtitle="Arraste os cards entre as etapas para acompanhar a negociação"
        icon={KanbanSquare}
        mobileToolbar={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setImportOpen(true)} title="Importar clientes">
              <FileUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setExportOpen(true)} title="Exportar clientes">
              <FileDown className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleOpenNewDeal}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo Deal
            </Button>
          </div>
        }
        actionContent={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" title="Importar clientes" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="Exportar clientes" onClick={() => setExportOpen(true)}>
              <FileDown className="h-4 w-4" />
            </Button>
            <Button onClick={handleOpenNewDeal}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Deal
            </Button>
          </div>
        }
      />

      <div className="flex-shrink-0 border-b border-border/50 bg-background/78 px-3 py-3 backdrop-blur-sm sm:px-4">
        <InternalCrmFilterBar className="p-3 sm:p-4">
          <PipelineFilters
            search={search}
            onSearchChange={setSearch}
            stageCode={stageCode}
            onStageCodeChange={setStageCode}
            status={status}
            onStatusChange={(value) => setStatus(value as 'all' | 'open' | 'won' | 'lost')}
            ownerUserId={ownerUserId}
            onOwnerUserIdChange={setOwnerUserId}
            sourceChannel={sourceChannel}
            onSourceChannelChange={setSourceChannel}
            stages={stages}
            members={members}
            sources={board.sourceOptions}
          />
        </InternalCrmFilterBar>
      </div>

      {isMobileViewport && board.columns.length > 0 && (
        <div className="border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-sm">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Etapa atual
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span>{getInternalCrmStageLabel(activeMobileStage)}</span>
              </div>
            </div>
            <Badge variant="outline" className="h-8 rounded-full px-3 text-sm">
              {board.columns.find((column) => column.stage_code === activeMobileStage)?.deals.length || 0}
            </Badge>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className={cn(
          'flex-1 bg-muted/50 relative',
          isMobileViewport ? 'overflow-x-auto overflow-y-hidden px-3 py-4 sm:px-4' : 'p-5 select-none',
        )}
        style={{
          overflowX: 'scroll',
          overflowY: 'hidden',
          cursor: isMobileViewport ? 'auto' : (isDraggingScroll ? 'grabbing' : 'grab'),
          WebkitOverflowScrolling: 'touch',
        }}
        onMouseDown={isMobileViewport ? undefined : handleMouseDown}
        onMouseMove={isMobileViewport ? undefined : handleMouseMove}
        onMouseUp={isMobileViewport ? undefined : handleMouseUp}
        onMouseLeave={isMobileViewport ? undefined : handleMouseLeave}
        onScroll={isMobileViewport ? updateActiveMobileStage : undefined}
      >
        <div
          className={cn('flex gap-4 pb-4 pr-4 sm:pr-6 lg:pr-8', isMobileViewport && 'snap-x snap-mandatory')}
          style={{
            width: 'max-content',
            minWidth: isMobileViewport ? '100%' : `${Math.max(board.columns.length, 1) * 296}px`,
            height: 'calc(100% - 16px)',
          }}
        >
          {board.columns.map((column) => {
            const color = getInternalCrmStageColor(column.stage_code);
            const isDropTarget = dragOverStage === column.stage_code;
            const totalCents = column.totals.total_cents;

            return (
              <div
                key={column.stage_code}
                data-pipeline-stage-id={column.stage_code}
                className={cn(
                  isMobileViewport ? 'w-[calc(100vw-1.5rem)] max-w-[360px] min-w-0 snap-center scroll-mx-3 sm:scroll-mx-4' : 'w-[280px]',
                  'flex-shrink-0 flex flex-col bg-card rounded-lg shadow-md transition-all duration-200',
                  isDropTarget && 'ring-2 ring-primary ring-offset-2',
                )}
                onDragOver={isMobileViewport ? undefined : (e) => handleDragOver(e, column.stage_code)}
                onDragLeave={isMobileViewport ? undefined : handleDragLeave}
                onDrop={isMobileViewport ? undefined : (e) => void handleDrop(e, column.stage_code)}
              >
                <div className="p-4 rounded-t-lg" style={{ backgroundColor: color }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-lg">{getInternalCrmStageLabel(column.stage_code).slice(0, 1)}</span>
                      <span className="font-semibold text-white text-sm">
                        {getInternalCrmStageLabel(column.stage_code, column.name)}
                      </span>
                    </div>
                    <Badge className="bg-white/20 text-white hover:bg-white/30 border-0">
                      {column.deals.length}
                    </Badge>
                  </div>
                  <div className="text-white/90 text-sm font-medium">
                    {formatCurrencyBr(totalCents)}
                  </div>
                </div>

                <div className={cn('flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar', isMobileViewport ? 'min-h-[calc(100dvh-24rem)] pr-2' : 'min-h-[400px]')}>
                  {column.deals.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg">
                      {board.isLoading ? 'Carregando...' : 'Nenhum deal'}
                    </div>
                  ) : (
                    column.deals.map((card) => {
                      const isDragging = draggedCard?.id === card.id;
                      const hasTracking = hasTrackingAttribution(card.deal.commercial_context);
                      const nextAppointmentLabel = formatAppointmentLabel(card.nextAppointment);
                      const currentStageIndex = INTERNAL_CRM_PIPELINE_STAGE_ORDER.indexOf(card.stageCode as never);
                      const prevStage = currentStageIndex > 0 ? INTERNAL_CRM_PIPELINE_STAGE_ORDER[currentStageIndex - 1] : null;
                      const nextStage = currentStageIndex >= 0 && currentStageIndex < INTERNAL_CRM_PIPELINE_STAGE_ORDER.length - 1
                        ? INTERNAL_CRM_PIPELINE_STAGE_ORDER[currentStageIndex + 1]
                        : null;

                      return (
                      <div
                        key={card.id}
                        draggable={!isMobileViewport}
                        onClick={(e) => {
                          if (draggedCard) return;
                          if ((e.target as HTMLElement).closest('[draggable]') && e.type !== 'click') return;
                          setSelectedCard(card);
                          setDetailPanelOpen(true);
                        }}
                        onDragStart={isMobileViewport ? undefined : (e) => handleDragStart(e, card)}
                        onDragEnd={isMobileViewport ? undefined : handleDragEnd}
                        className={cn(
                          'rounded-lg border border-border/80 bg-card/96 p-3 text-foreground shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                          !isMobileViewport && 'active:cursor-grabbing',
                          isDragging && 'opacity-50 scale-95',
                        )}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                              {getCardInitials(card)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-foreground text-sm truncate">{card.title}</div>
                              <div className="text-xs text-muted-foreground truncate">{card.companyName}</div>
                              {card.contactName ? (
                                <div className="text-[11px] text-muted-foreground truncate">{card.contactName}</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-0 flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 bg-popover">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenClient(card); }} className="gap-2 cursor-pointer">
                                  <Building2 className="w-4 h-4 text-slate-500" />
                                  <span>Ver Cliente</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenConversation(card); }} className="gap-2 cursor-pointer">
                                  <MessageSquare className="w-4 h-4 text-primary" />
                                  <span>Ver Conversa</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCall(card); }} className="gap-2 cursor-pointer">
                                  <Phone className="w-4 h-4 text-blue-500" />
                                  <span>Ligar Agora</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openAppointmentModalForCard(card, 'meeting'); }} className="gap-2 cursor-pointer">
                                  <Calendar className="w-4 h-4 text-purple-500" />
                                  <span>Agendar Reuniao</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedCard(card); setCheckoutUrl(String(card.deal.checkout_url || '')); setCheckoutModalOpen(true); }} className="gap-2 cursor-pointer">
                                  <FileText className="w-4 h-4 text-green-500" />
                                  <span>Gerar Checkout</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenEditDeal(card); }} className="gap-2 cursor-pointer">
                                  <FileText className="w-4 h-4 text-amber-500" />
                                  <span>Editar Deal</span>
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger className="gap-2">
                                    <ArrowRightLeft className="w-4 h-4" /> Mover para
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {stages.map((stage) => (
                                      <DropdownMenuItem
                                        key={stage.stage_code}
                                        disabled={normalizeInternalCrmStageCode(stage.stage_code) === card.stageCode}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleMoveToStage(card, stage.stage_code);
                                        }}
                                      >
                                        {getInternalCrmStageLabel(stage.stage_code, stage.name)}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <div className="h-px bg-muted my-1" />
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openMarkWonModal(card); }} className="gap-2 cursor-pointer text-emerald-600 focus:text-emerald-600">
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Fechou Contrato</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openMarkLostModal(card); }} className="gap-2 cursor-pointer text-rose-600 focus:text-rose-600">
                                  <CircleX className="w-4 h-4" />
                                  <span>Nao Fechou</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {!isMobileViewport && <GripVertical className="w-4 h-4 text-muted-foreground/30 ml-0.5 cursor-grab active:cursor-grabbing flex-shrink-0" />}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {card.sourceLabel ? <TokenBadge token={card.sourceChannel} label={card.sourceLabel} /> : null}
                          <TokenBadge token={card.paymentStatus} label={getPaymentStatusLabel(card.paymentStatus)} />
                          {hasTracking ? (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                              Tracking
                            </Badge>
                          ) : null}
                          {card.unreadCount > 0 ? (
                            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                              {card.unreadCount} nao lidas
                            </Badge>
                          ) : null}
                        </div>

                        <div className="space-y-1 mb-3 text-xs text-muted-foreground">
                          <div className="truncate">
                            Responsavel: <span className="font-medium text-foreground">{card.owner?.display_name || 'Nao definido'}</span>
                          </div>
                          {card.lastMessagePreview ? (
                            <div className="truncate">Conversa: {card.lastMessagePreview}</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1 text-sm font-bold text-green-600 mb-1">
                          R$ {formatCurrencyBr(card.totalCents).replace('R$', '').trim()}
                        </div>

                        <div className="text-xs text-muted-foreground mb-1">
                          {card.daysInStage === 1 ? '1 dia' : `${card.daysInStage} dias`} nesta etapa
                        </div>

                        <button
                          onClick={(e) => void handleNextActionClick(card, e)}
                          className="text-xs text-blue-600 font-medium hover:text-blue-800 hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
                        >
                          {card.nextActionLabel}
                        </button>

                        <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                          <div className="truncate">Oferta: {card.itemSummary}</div>
                          {card.nextTask ? <div className="truncate">Prox. tarefa: {card.nextTask.title}</div> : null}
                          {nextAppointmentLabel ? <div className="truncate">Agenda: {nextAppointmentLabel}</div> : null}
                        </div>

                        {isMobileViewport && (
                          <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between gap-1">
                            <button
                              disabled={!prevStage}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (prevStage) void handleMoveToStage(card, prevStage);
                              }}
                              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors min-w-0"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{prevStage ? getInternalCrmStageLabel(prevStage) : ''}</span>
                            </button>
                            <button
                              disabled={!nextStage}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (nextStage) void handleMoveToStage(card, nextStage);
                              }}
                              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors min-w-0"
                            >
                              <span className="truncate">{nextStage ? getInternalCrmStageLabel(nextStage) : ''}</span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                            </button>
                          </div>
                        )}
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

      <DealDetailPanel
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        deal={selectedDeal}
        products={products}
        stages={stages}
        onSaveNotes={handleSaveNotes}
        onMoveToStage={handleMoveToStageById}
        onMarkWon={() => {
          if (activeSelectedCard) {
            setDetailPanelOpen(false);
            openMarkWonModal(activeSelectedCard);
          }
        }}
        onMarkLost={() => {
          if (activeSelectedCard) {
            setDetailPanelOpen(false);
            openMarkLostModal(activeSelectedCard);
          }
        }}
        onOpenCheckout={() => {
          if (activeSelectedCard) {
            setDetailPanelOpen(false);
            setCheckoutUrl(String(activeSelectedCard.deal.checkout_url || ''));
            setCheckoutModalOpen(true);
          }
        }}
        isSaving={saveNotesMutation.isPending}
      />

      <EditDealModal
        open={editDealOpen}
        onOpenChange={setEditDealOpen}
        draft={editingDraft}
        onDraftChange={setEditingDraft}
        clients={clients}
        stages={stages}
        products={products}
        members={members}
        ownerUserId={editingOwnerUserId}
        onOwnerUserIdChange={setEditingOwnerUserId}
        onSave={handleSaveEditDeal}
        isSaving={upsertDealMutation.isPending}
      />

      <MarkAsWonModal
        open={wonModalOpen}
        onOpenChange={setWonModalOpen}
        dealTitle={selectedDeal?.title || ''}
        productCode={wonProductCode}
        valueReais={wonValueReais}
        products={products}
        isSubmitting={moveDealMutation.isPending}
        onProductCodeChange={(value) => {
          setWonProductCode(value);
          const suggestedPriceCents = resolveProductPriceCents(value);
          if (Number(wonValueReais || 0) <= 0 && suggestedPriceCents > 0) {
            setWonValueReais((suggestedPriceCents / 100).toFixed(2));
          }
        }}
        onValueReaisChange={setWonValueReais}
        onConfirm={confirmDealWon}
      />

      <MarkAsLostModal
        open={lostModalOpen}
        onOpenChange={setLostModalOpen}
        dealTitle={selectedDeal?.title || ''}
        lostReason={lostReason}
        onLostReasonChange={setLostReason}
        onConfirm={confirmLostDeal}
        isSubmitting={moveDealMutation.isPending}
      />

      <DealCheckoutModal
        open={checkoutModalOpen}
        onOpenChange={setCheckoutModalOpen}
        dealTitle={selectedDeal?.title || ''}
        checkoutUrl={checkoutUrl}
        isGenerating={checkoutMutation.isPending}
        onGenerate={handleGenerateCheckout}
      />

      <DealCommentsSheet
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        dealId={selectedDeal?.id || ''}
        dealTitle={selectedDeal?.title || ''}
        notes={selectedDeal?.notes || ''}
        onSaveNotes={handleSaveNotes}
        isSaving={saveNotesMutation.isPending}
      />

      <InternalCrmAppointmentModal
        open={appointmentModalOpen}
        onOpenChange={handleAppointmentModalOpenChange}
        appointment={selectedAppointment}
        clients={clients}
        defaultStartAt={new Date().toISOString()}
        defaults={appointmentDefaults}
        isSubmitting={appointmentMutation.isPending}
        onSave={handleSaveAppointment}
      />

      <CrmImportClientsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImportClient}
      />

      <CrmExportClientsModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        clients={clients}
      />
    </div>
  );
}
