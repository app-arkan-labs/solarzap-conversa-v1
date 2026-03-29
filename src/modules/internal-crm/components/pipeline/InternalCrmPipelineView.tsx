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

function createEmptyDraft(): DealDraft {
  return {
    ...EMPTY_DEAL_DRAFT,
    items: EMPTY_DEAL_DRAFT.items.map((item) => ({ ...item })),
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

  const upsertDealMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'deals'], ['internal-crm', 'clients'], ['internal-crm', 'dashboard']],
    onSuccess: async () => {
      toast({ title: 'Deal salvo', description: 'A oportunidade foi atualizada no pipeline interno.' });
      setDialogOpen(false);
      setDraft(createEmptyDraft());
      setOwnerUserId('');
    },
  });

  const moveDealMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'deals'], ['internal-crm', 'clients'], ['internal-crm', 'dashboard']],
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

    await upsertDealMutation.mutateAsync({
      action: 'upsert_deal',
      client_id: draft.client_id,
      title: draft.title,
      owner_user_id: ownerUserId || undefined,
      stage_code: draft.stage_code,
      probability: draft.probability,
      notes: draft.notes,
      items: normalizedItems,
    });
  };

  const markDealWon = async (deal: InternalCrmDealSummary) => {
    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: deal.id,
      stage_code: 'ganho',
      notes: 'Marcado como ganho no pipeline interno.',
    });
    toast({ title: 'Deal ganho', description: 'O negócio foi movido para ganho.' });
  };

  const confirmLostDeal = async () => {
    if (!selectedDeal) return;
    await moveDealMutation.mutateAsync({
      action: 'move_deal_stage',
      deal_id: selectedDeal.id,
      stage_code: 'perdido',
      notes: lostReason,
    });
    setLostModalOpen(false);
    setLostReason('');
    toast({ title: 'Deal perdido', description: 'O negócio foi movido para perdido com motivo registrado.' });
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
          <Button onClick={() => setDialogOpen(true)}>
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
        onOpenChange={setDialogOpen}
        draft={draft}
        onDraftChange={setDraft}
        clients={clientsQuery.data?.clients || []}
        stages={pipeline.stagesQuery.data?.stages || []}
        products={pipeline.productsQuery.data?.products || []}
        ownerUserId={ownerUserId}
        onOwnerUserIdChange={setOwnerUserId}
        onSave={handleSaveDeal}
        isSaving={upsertDealMutation.isPending}
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
