import { useMemo, useState } from 'react';
import { KanbanSquare, Plus } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatCurrencyBr, TokenBadge } from '@/modules/internal-crm/components/InternalCrmUi';
import { DealCard } from '@/modules/internal-crm/components/pipeline/DealCard';
import { PipelineFilters } from '@/modules/internal-crm/components/pipeline/PipelineFilters';
import { DealCheckoutModal } from '@/modules/internal-crm/components/pipeline/modals/DealCheckoutModal';
import { DealCommentsSheet } from '@/modules/internal-crm/components/pipeline/modals/DealCommentsSheet';
import { EditDealModal } from '@/modules/internal-crm/components/pipeline/modals/EditDealModal';
import { MarkAsLostModal } from '@/modules/internal-crm/components/pipeline/modals/MarkAsLostModal';
import { EMPTY_DEAL_DRAFT, type DealDraft } from '@/modules/internal-crm/components/pipeline/types';
import { useInternalCrmPipeline } from '@/modules/internal-crm/hooks/useInternalCrmPipeline';
import {
  useInternalCrmClients,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmDealSummary } from '@/modules/internal-crm/types';

function getRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function createEmptyDraft(): DealDraft {
  return {
    ...EMPTY_DEAL_DRAFT,
    items: EMPTY_DEAL_DRAFT.items.map((item) => ({ ...item })),
  };
}

function createDraftFromDeal(deal: InternalCrmDealSummary): DealDraft {
  const commercialContext = getRecord(deal.commercial_context);

  return {
    id: deal.id,
    client_id: deal.client_id,
    title: deal.title,
    stage_code: deal.stage_code || 'novo_lead',
    probability: deal.probability,
    primary_offer_code: deal.primary_offer_code || '',
    closed_product_code: deal.closed_product_code || '',
    mentorship_variant: deal.mentorship_variant || '',
    software_status: deal.software_status,
    landing_page_status: deal.landing_page_status,
    traffic_status: deal.traffic_status,
    trial_status: deal.trial_status,
    next_offer_code: deal.next_offer_code || '',
    next_offer_at: deal.next_offer_at || '',
    mentorship_sessions_completed:
      commercialContext.mentorship_sessions_completed == null
        ? ''
        : String(commercialContext.mentorship_sessions_completed),
    last_declined_offer_code: getText(commercialContext.last_declined_offer_code),
    trial_ends_at: getText(commercialContext.trial_ends_at),
    scheduling_link: getText(commercialContext.scheduling_link),
    meeting_link: getText(commercialContext.meeting_link),
    notes: deal.notes || '',
    items: deal.items?.length
      ? deal.items.map((item) => ({
          product_code: item.product_code,
          billing_type: item.billing_type,
          payment_method: item.payment_method,
          unit_price_cents: item.unit_price_cents,
          quantity: item.quantity,
        }))
      : EMPTY_DEAL_DRAFT.items.map((item) => ({ ...item })),
  };
}

export function InternalCrmPipelineView() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [stageCode, setStageCode] = useState('all');
  const [status, setStatus] = useState<'all' | 'open' | 'won' | 'lost'>('all');
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DealDraft>(createEmptyDraft());
  const [ownerUserId, setOwnerUserId] = useState('');

  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<InternalCrmDealSummary | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');

  const pipeline = useInternalCrmPipeline({ search, stage_code: stageCode, status });
  const clientsQuery = useInternalCrmClients();

  const upsertDealMutation = useInternalCrmMutation<{ ok: true; deal: { id: string } }>({
    invalidate: [['internal-crm', 'deals'], ['internal-crm', 'clients'], ['internal-crm', 'dashboard']],
  });

  const updateCommercialStateMutation = useInternalCrmMutation({
    invalidate: [
      ['internal-crm', 'deals'],
      ['internal-crm', 'clients'],
      ['internal-crm', 'dashboard'],
      ['internal-crm', 'tasks'],
      ['internal-crm', 'automation-runs'],
    ],
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

  const canSaveDeal = useMemo(() => {
    return draft.client_id.trim().length > 0 && draft.title.trim().length > 0;
  }, [draft.client_id, draft.title]);

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setDraft(createEmptyDraft());
      setOwnerUserId('');
    }
  };

  const openNewDealDialog = () => {
    setDraft(createEmptyDraft());
    setOwnerUserId('');
    setDialogOpen(true);
  };

  const openEditDealDialog = (deal: InternalCrmDealSummary) => {
    setDraft(createDraftFromDeal(deal));
    setOwnerUserId(deal.owner_user_id || '');
    setDialogOpen(true);
  };

  const handleSaveDeal = async () => {
    if (!canSaveDeal) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Selecione cliente e informe um título para o deal.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedItems = draft.items
      .filter((item) => item.product_code)
      .map((item) => ({
        ...item,
        unit_price_cents: Number(item.unit_price_cents || 0),
        quantity: Math.max(1, Number(item.quantity || 1)),
      }));

    const savedDeal = await upsertDealMutation.mutateAsync({
      action: 'upsert_deal',
      deal_id: draft.id,
      client_id: draft.client_id,
      title: draft.title,
      owner_user_id: ownerUserId || undefined,
      stage_code: draft.stage_code,
      probability: draft.probability,
      notes: draft.notes,
      items: normalizedItems,
    });

    const mentorshipSessionsCompleted = draft.mentorship_sessions_completed.trim();

    await updateCommercialStateMutation.mutateAsync({
      action: 'update_deal_commercial_state',
      deal_id: savedDeal.deal.id,
      primary_offer_code: draft.primary_offer_code || null,
      closed_product_code: draft.closed_product_code || null,
      mentorship_variant: draft.mentorship_variant || null,
      software_status: draft.software_status,
      landing_page_status: draft.landing_page_status,
      traffic_status: draft.traffic_status,
      trial_status: draft.trial_status,
      next_offer_code: draft.next_offer_code || null,
      next_offer_at: draft.next_offer_at || null,
      commercial_context: {
        mentorship_sessions_completed:
          mentorshipSessionsCompleted.length > 0 ? Math.max(0, Number(mentorshipSessionsCompleted || 0)) : null,
        last_declined_offer_code: draft.last_declined_offer_code.trim() || null,
        trial_ends_at: draft.trial_ends_at || null,
        scheduling_link: draft.scheduling_link.trim() || null,
        meeting_link: draft.meeting_link.trim() || null,
      },
    });

    toast({
      title: draft.id ? 'Deal atualizado' : 'Deal salvo',
      description: 'A oportunidade foi sincronizada com a esteira comercial interna.',
    });
    handleDialogOpenChange(false);
  };

  const markDealWon = async (deal: InternalCrmDealSummary) => {
    const closedProductCode = deal.closed_product_code || deal.primary_offer_code || deal.items?.[0]?.product_code;

    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: deal.id,
      stage_code: 'fechou',
      notes: 'Marcado como fechou no pipeline interno.',
      closed_product_code: closedProductCode,
    });
    toast({ title: 'Deal fechado', description: 'O negocio foi movido para Fechou.' });
  };

  const confirmLostDeal = async () => {
    if (!selectedDeal) return;
    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: selectedDeal.id,
      stage_code: 'nao_fechou',
      notes: lostReason || 'Marcado como nao fechou no pipeline interno.',
      lost_reason: lostReason || null,
    });
    setLostModalOpen(false);
    setLostReason('');
    toast({ title: 'Deal nao fechou', description: 'O negocio foi movido para Nao Fechou com motivo registrado.' });
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
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle="Kanban comercial interno para velocidade de fechamento e provisionamento."
        icon={KanbanSquare}
        actionContent={
          <Button onClick={openNewDealDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Novo deal
          </Button>
        }
      />

      <PipelineFilters
        search={search}
        onSearchChange={setSearch}
        stageCode={stageCode}
        onStageCodeChange={setStageCode}
        status={status}
        onStatusChange={(value) => setStatus(value as 'all' | 'open' | 'won' | 'lost')}
        stages={pipeline.stagesQuery.data?.stages || []}
      />

      <div className="flex gap-4 overflow-x-auto pb-2">
        {pipeline.columns.map((column) => (
          <Card
            key={column.stage_code}
            className="min-h-[540px] min-w-[320px] max-w-[320px] flex-shrink-0 border-border/70 bg-card/95"
            onDragOver={(event) => event.preventDefault()}
            onDrop={async () => {
              if (!draggingDealId) return;
              await moveDealMutation.mutateAsync({
                action: 'move_deal_stage',
                deal_id: draggingDealId,
                stage_code: column.stage_code,
              });
              setDraggingDealId(null);
            }}
          >
            <CardHeader className="pb-3">
              <CardTitle className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>{column.name}</span>
                  <TokenBadge token={column.stage_code} label={String(column.totals.count)} />
                </div>
                <div className="text-xs font-normal text-muted-foreground">
                  <p>One-time: {formatCurrencyBr(column.totals.one_time_cents)}</p>
                  <p>MRR: {formatCurrencyBr(column.totals.mrr_cents)}</p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {column.deals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                  Nenhum deal nesta etapa.
                </div>
              ) : (
                column.deals.map((deal) => (
                  <div key={deal.id} draggable onDragStart={() => setDraggingDealId(deal.id)}>
                    <DealCard
                      deal={deal}
                      onEditDeal={openEditDealDialog}
                      onMarkWon={markDealWon}
                      onMarkLost={(row) => {
                        setSelectedDeal(row);
                        setLostModalOpen(true);
                      }}
                      onOpenCheckout={(row) => {
                        setSelectedDeal(row);
                        setCheckoutUrl(String(row.checkout_url || ''));
                        setCheckoutModalOpen(true);
                      }}
                      onOpenComments={(row) => {
                        setSelectedDeal(row);
                        setCommentsOpen(true);
                      }}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <EditDealModal
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        draft={draft}
        onDraftChange={setDraft}
        clients={clientsQuery.data?.clients || []}
        stages={pipeline.stagesQuery.data?.stages || []}
        products={pipeline.productsQuery.data?.products || []}
        ownerUserId={ownerUserId}
        onOwnerUserIdChange={setOwnerUserId}
        onSave={handleSaveDeal}
        isSaving={upsertDealMutation.isPending || updateCommercialStateMutation.isPending}
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
        dealTitle={selectedDeal?.title || ''}
        notes={selectedDeal?.notes || ''}
      />
    </div>
  );
}
