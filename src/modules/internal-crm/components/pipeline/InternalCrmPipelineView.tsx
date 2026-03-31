import { useCallback, useMemo, useRef, useState } from 'react';
import { KanbanSquare, Plus } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import { DealCard } from '@/modules/internal-crm/components/pipeline/DealCard';
import { DealDetailPanel } from '@/modules/internal-crm/components/pipeline/DealDetailPanel';
import { PipelineFilters } from '@/modules/internal-crm/components/pipeline/PipelineFilters';
import { DealCheckoutModal } from '@/modules/internal-crm/components/pipeline/modals/DealCheckoutModal';
import { DealCommentsSheet } from '@/modules/internal-crm/components/pipeline/modals/DealCommentsSheet';
import { NewDealSimpleModal, type NewDealData } from '@/modules/internal-crm/components/pipeline/modals/NewDealSimpleModal';
import { MarkAsLostModal } from '@/modules/internal-crm/components/pipeline/modals/MarkAsLostModal';
import { MarkAsWonModal } from '@/modules/internal-crm/components/pipeline/modals/MarkAsWonModal';
import { useInternalCrmPipeline } from '@/modules/internal-crm/hooks/useInternalCrmPipeline';
import {
  useInternalCrmClients,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmDealSummary } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';

const STAGE_COLORS: Record<string, string> = {
  novo_lead: '#2196F3',
  respondeu: '#FF9800',
  agendou_reuniao: '#9C27B0',
  chamada_agendada: '#3F51B5',
  chamada_realizada: '#4CAF50',
  nao_compareceu: '#F44336',
  negociacao: '#FFC107',
  fechou: '#8BC34A',
  nao_fechou: '#607D8B',
};

const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  respondeu: 'Respondeu',
  agendou_reuniao: 'Agendou Reunião',
  chamada_agendada: 'Reunião Agendada',
  chamada_realizada: 'Reunião Realizada',
  nao_compareceu: 'Não Compareceu',
  negociacao: 'Negociação',
  fechou: 'Fechou Contrato',
  nao_fechou: 'Não Fechou',
};

export function InternalCrmPipelineView() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [stageCode, setStageCode] = useState('all');
  const [status, setStatus] = useState<'all' | 'open' | 'won' | 'lost'>('all');

  // D&D state
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Drag-to-scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftVal, setScrollLeftVal] = useState(0);

  // Modal & panel state
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<InternalCrmDealSummary | null>(null);
  const [wonProductCode, setWonProductCode] = useState('');
  const [wonValueReais, setWonValueReais] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');

  const pipeline = useInternalCrmPipeline({ search, stage_code: stageCode, status });
  const clientsQuery = useInternalCrmClients();

  const upsertDealMutation = useInternalCrmMutation<{ ok: true; deal: { id: string } }>({
    invalidate: [['internal-crm', 'deals'], ['internal-crm', 'clients'], ['internal-crm', 'dashboard']],
  });

  const moveDealMutation = useInternalCrmMutation({
    invalidate: [
      ['internal-crm', 'deals'],
      ['internal-crm', 'clients'],
      ['internal-crm', 'dashboard'],
      ['internal-crm', 'tasks'],
      ['internal-crm', 'automation-runs'],
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

  const products = pipeline.productsQuery.data?.products || [];
  const stages = pipeline.stagesQuery.data?.stages || [];

  const dealsById = useMemo(() => {
    const map = new Map<string, InternalCrmDealSummary>();
    for (const column of pipeline.columns) {
      for (const deal of column.deals) {
        map.set(deal.id, deal);
      }
    }
    return map;
  }, [pipeline.columns]);

  const resolveProductPriceCents = (productCode: string): number => {
    const product = products.find((item) => item.product_code === productCode);
    return Number(product?.price_cents || 0);
  };

  // --- Drag-to-scroll handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('input')) return;
    if (!scrollContainerRef.current) return;
    setIsDraggingScroll(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeftVal(scrollContainerRef.current.scrollLeft);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingScroll || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeftVal - walk;
  }, [isDraggingScroll, startX, scrollLeftVal]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingScroll(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isDraggingScroll) setIsDraggingScroll(false);
  }, [isDraggingScroll]);

  // --- D&D handlers ---
  const handleDragStart = (e: React.DragEvent, deal: InternalCrmDealSummary) => {
    e.dataTransfer.setData('text/plain', deal.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingDealId(deal.id);
    setTimeout(() => {
      (e.currentTarget as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    setDraggingDealId(null);
    setDragOverStage(null);
  };

  const handleDrop = async (targetStageCode: string) => {
    setDragOverStage(null);
    if (!draggingDealId) return;

    const deal = dealsById.get(draggingDealId);
    if (!deal || deal.stage_code === targetStageCode) {
      setDraggingDealId(null);
      return;
    }

    if (targetStageCode === 'fechou') {
      openMarkWonModal(deal);
      setDraggingDealId(null);
      return;
    }

    if (targetStageCode === 'nao_fechou') {
      setSelectedDeal(deal);
      setLostModalOpen(true);
      setDraggingDealId(null);
      return;
    }

    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: draggingDealId,
      stage_code: targetStageCode,
    });
    setDraggingDealId(null);
    toast({ title: 'Lead movido!', description: `Movido para ${STAGE_LABELS[targetStageCode] || targetStageCode}` });
  };

  // --- Action handlers ---
  const openMarkWonModal = (deal: InternalCrmDealSummary) => {
    const productCode = deal.closed_product_code || deal.primary_offer_code || deal.items?.[0]?.product_code || products[0]?.product_code || '';
    const fallbackCents = deal.one_time_total_cents > 0 ? deal.one_time_total_cents : resolveProductPriceCents(productCode);

    setSelectedDeal(deal);
    setWonProductCode(productCode);
    setWonValueReais((fallbackCents / 100).toFixed(2));
    setWonModalOpen(true);
  };

  const handleMoveToStage = async (dealId: string, targetStageCode: string) => {
    const deal = dealsById.get(dealId);
    if (!deal || deal.stage_code === targetStageCode) return;

    if (targetStageCode === 'fechou') {
      openMarkWonModal(deal);
      return;
    }
    if (targetStageCode === 'nao_fechou') {
      setSelectedDeal(deal);
      setLostModalOpen(true);
      return;
    }

    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: dealId,
      stage_code: targetStageCode,
    });
    toast({ title: 'Lead movido!', description: `Movido para ${STAGE_LABELS[targetStageCode] || targetStageCode}` });
  };

  const handleSaveNotes = async (dealId: string, notes: string) => {
    await saveNotesMutation.mutateAsync({
      action: 'save_deal_notes',
      deal_id: dealId,
      notes,
    });
    toast({ title: 'Notas salvas' });
  };

  const handleSaveNewDeal = async (data: NewDealData) => {
    const product = products.find((p) => p.product_code === data.product_code);
    const items = product
      ? [{
          product_code: product.product_code,
          billing_type: product.billing_type,
          payment_method: product.payment_method,
          unit_price_cents: product.price_cents,
          quantity: 1,
        }]
      : [];

    await upsertDealMutation.mutateAsync({
      action: 'upsert_deal',
      client_id: data.client_id,
      title: data.title,
      stage_code: data.stage_code,
      notes: data.notes,
      items,
    });
    toast({ title: 'Lead criado', description: 'Novo lead adicionado à pipeline.' });
    setNewDealOpen(false);
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

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30">
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <PageHeader
          title="Pipeline"
          subtitle="Arraste os leads entre as etapas para acompanhar o progresso"
          icon={KanbanSquare}
          actionContent={
            <div className="flex items-center gap-2">
              <PipelineFilters
                search={search}
                onSearchChange={setSearch}
                stageCode={stageCode}
                onStageCodeChange={setStageCode}
                status={status}
                onStatusChange={(value) => setStatus(value as 'all' | 'open' | 'won' | 'lost')}
                stages={stages}
              />
              <Button onClick={() => setNewDealOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Lead
              </Button>
            </div>
          }
        />
      </div>

      {/* Kanban container com drag-to-scroll */}
      <div
        ref={scrollContainerRef}
        className="flex-1 px-5 pb-5 select-none"
        style={{
          overflowX: 'scroll',
          overflowY: 'hidden',
          cursor: isDraggingScroll ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex gap-4 pb-4" style={{ width: 'max-content', height: 'calc(100% - 16px)' }}>
          {pipeline.columns.map((column) => {
            const color = STAGE_COLORS[column.stage_code] || '#9E9E9E';
            const isDropTarget = dragOverStage === column.stage_code;
            const totalCents = column.totals.one_time_cents + column.totals.mrr_cents;

            return (
              <div
                key={column.stage_code}
                className={cn(
                  'w-[300px] flex-shrink-0 flex flex-col bg-card rounded-lg shadow-md transition-all duration-200',
                  isDropTarget && 'ring-2 ring-primary ring-offset-2',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverStage(column.stage_code);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStage(null);
                  }
                }}
                onDrop={() => handleDrop(column.stage_code)}
              >
                {/* Header colorido */}
                <div className="p-4 rounded-t-lg" style={{ backgroundColor: color }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white text-sm">
                      {STAGE_LABELS[column.stage_code] || column.name}
                    </span>
                    <Badge className="bg-white/20 text-white hover:bg-white/30 border-0">
                      {column.deals.length}
                    </Badge>
                  </div>
                  <div className="text-white/90 text-sm font-medium">
                    {formatCurrencyBr(totalCents)}
                  </div>
                </div>

                {/* Cards com scroll vertical */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
                  {column.deals.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg">
                      Nenhum lead
                    </div>
                  ) : (
                    column.deals.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, deal)}
                        onDragEnd={handleDragEnd}
                      >
                        <DealCard
                          deal={deal}
                          isDragging={draggingDealId === deal.id}
                          stages={stages}
                          onCardClick={() => {
                            setSelectedDeal(deal);
                            setDetailPanelOpen(true);
                          }}
                          onScheduleMeeting={() => {
                            // TODO: integrar com modal de agendamento quando disponível
                            toast({ title: 'Em breve', description: 'Agendamento de reunião será implementado.' });
                          }}
                          onOpenComments={() => {
                            setSelectedDeal(deal);
                            setCommentsOpen(true);
                          }}
                          onMarkWon={() => openMarkWonModal(deal)}
                          onMarkLost={() => {
                            setSelectedDeal(deal);
                            setLostModalOpen(true);
                          }}
                          onMoveToStage={(targetCode) => handleMoveToStage(deal.id, targetCode)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Painéis e modals */}
      <DealDetailPanel
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        deal={selectedDeal}
        products={products}
        stages={stages}
        onSaveNotes={handleSaveNotes}
        onMoveToStage={handleMoveToStage}
        onMarkWon={() => {
          if (selectedDeal) {
            setDetailPanelOpen(false);
            openMarkWonModal(selectedDeal);
          }
        }}
        onMarkLost={() => {
          if (selectedDeal) {
            setDetailPanelOpen(false);
            setLostModalOpen(true);
          }
        }}
        onOpenCheckout={() => {
          if (selectedDeal) {
            setDetailPanelOpen(false);
            setCheckoutUrl(String(selectedDeal.checkout_url || ''));
            setCheckoutModalOpen(true);
          }
        }}
        isSaving={saveNotesMutation.isPending}
      />

      <NewDealSimpleModal
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
        clients={clientsQuery.data?.clients || []}
        stages={stages}
        products={products}
        onSave={handleSaveNewDeal}
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
    </div>
  );
}
