import { useMemo, useState } from 'react';
import { KanbanSquare, Plus, Save } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  internalCrmQueryKeys,
  useInternalCrmClients,
  useInternalCrmDeals,
  useInternalCrmMutation,
  useInternalCrmPipelineStages,
  useInternalCrmProducts,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { TokenBadge, formatCurrencyBr, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';

type DealItemDraft = {
  product_code: string;
  billing_type: 'one_time' | 'recurring';
  payment_method: 'stripe' | 'manual' | 'hybrid';
  unit_price_cents: number;
  quantity: number;
};

const EMPTY_DEAL_ITEM: DealItemDraft = {
  product_code: '',
  billing_type: 'one_time',
  payment_method: 'manual',
  unit_price_cents: 0,
  quantity: 1,
};

export default function InternalCrmPipelinePage() {
  const { toast } = useToast();
  const stagesQuery = useInternalCrmPipelineStages();
  const dealsQuery = useInternalCrmDeals();
  const clientsQuery = useInternalCrmClients();
  const productsQuery = useInternalCrmProducts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    client_id: '',
    title: '',
    stage_code: 'lead_entrante',
    probability: 10,
    notes: '',
    items: [EMPTY_DEAL_ITEM],
  });

  const upsertDealMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.deals({}), internalCrmQueryKeys.dashboard({}), internalCrmQueryKeys.clients({})],
    onSuccess: async () => {
      toast({ title: 'Deal salvo', description: 'Oportunidade atualizada no pipeline interno.' });
      setDialogOpen(false);
      setDraft({
        client_id: '',
        title: '',
        stage_code: 'lead_entrante',
        probability: 10,
        notes: '',
        items: [EMPTY_DEAL_ITEM],
      });
    },
  });

  const moveDealMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.deals({}), internalCrmQueryKeys.dashboard({}), internalCrmQueryKeys.clients({})],
    onSuccess: async () => {
      toast({ title: 'Deal movido', description: 'A etapa foi atualizada com sucesso.' });
    },
  });

  const stageColumns = useMemo(() => {
    const stages = stagesQuery.data?.stages || [];
    const deals = dealsQuery.data?.deals || [];
    return stages.map((stage) => ({
      ...stage,
      deals: deals.filter((deal) => deal.stage_code === stage.stage_code),
    }));
  }, [dealsQuery.data?.deals, stagesQuery.data?.stages]);

  const productMap = useMemo(() => {
    return new Map((productsQuery.data?.products || []).map((product) => [product.product_code, product]));
  }, [productsQuery.data?.products]);

  const handleSaveDeal = async () => {
    if (!draft.client_id || !draft.title) {
      toast({ title: 'Campos obrigatorios', description: 'Selecione um cliente e informe o titulo do deal.', variant: 'destructive' });
      return;
    }

    const normalizedItems = draft.items
      .filter((item) => item.product_code)
      .map((item) => ({
        ...item,
        unit_price_cents: Number(item.unit_price_cents || 0),
        quantity: Number(item.quantity || 1),
      }));

    await upsertDealMutation.mutateAsync({
      action: 'upsert_deal',
      client_id: draft.client_id,
      title: draft.title,
      stage_code: draft.stage_code,
      probability: draft.probability,
      notes: draft.notes,
      items: normalizedItems,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle="Kanban comercial da SolarZap interna."
        icon={KanbanSquare}
        actionContent={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo deal
          </Button>
        }
      />

      <div className="flex gap-4 overflow-x-auto pb-2">
        {stageColumns.map((stage) => (
          <Card
            key={stage.stage_code}
            className="min-h-[520px] min-w-[290px] max-w-[290px] flex-shrink-0 border-border/70 bg-card/95"
            onDragOver={(event) => event.preventDefault()}
            onDrop={async () => {
              if (!draggingDealId) return;
              await moveDealMutation.mutateAsync({ action: 'move_deal_stage', deal_id: draggingDealId, stage_code: stage.stage_code });
              setDraggingDealId(null);
            }}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                <span>{stage.name}</span>
                <TokenBadge token={stage.stage_code} label={`${stage.deals.length}`} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stage.deals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                  Nenhum deal nesta etapa.
                </div>
              ) : (
                stage.deals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => setDraggingDealId(deal.id)}
                    className="rounded-2xl border border-border/80 bg-background/90 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">{deal.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{deal.client_company_name || 'Cliente sem nome'}</p>
                      </div>
                      <TokenBadge token={deal.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>One-time</span>
                        <span>{formatCurrencyBr(deal.one_time_total_cents)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>MRR</span>
                        <span>{formatCurrencyBr(deal.mrr_cents)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Fechamento</span>
                        <span>{formatDateOnly(deal.expected_close_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Novo deal interno</DialogTitle>
            <DialogDescription>Cadastre uma oportunidade, associe produtos e posicione o deal no pipeline.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={draft.client_id} onValueChange={(value) => setDraft((current) => ({ ...current, client_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(clientsQuery.data?.clients || []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Plano Pro + Mentoria" />
            </div>

            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={draft.stage_code} onValueChange={(value) => setDraft((current) => ({ ...current, stage_code: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(stagesQuery.data?.stages || []).map((stage) => (
                    <SelectItem key={stage.stage_code} value={stage.stage_code}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Probabilidade</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.probability}
                onChange={(event) => setDraft((current) => ({ ...current, probability: Number(event.target.value || 0) }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Produtos associados</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft((current) => ({ ...current, items: [...current.items, EMPTY_DEAL_ITEM] }))}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            </div>

            <div className="space-y-3">
              {draft.items.map((item, index) => {
                const resolvedProduct = productMap.get(item.product_code);
                return (
                  <div key={`${item.product_code}-${index}`} className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-5">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Produto</Label>
                      <Select
                        value={item.product_code}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            items: current.items.map((currentItem, currentIndex) =>
                              currentIndex === index
                                ? {
                                    product_code: value,
                                    billing_type: productMap.get(value)?.billing_type || 'one_time',
                                    payment_method: productMap.get(value)?.payment_method || 'manual',
                                    unit_price_cents: productMap.get(value)?.price_cents || 0,
                                    quantity: currentItem.quantity,
                                  }
                                : currentItem,
                            ),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {(productsQuery.data?.products || []).map((product) => (
                            <SelectItem key={product.product_code} value={product.product_code}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Preco</Label>
                      <Input
                        type="number"
                        min={0}
                        value={item.unit_price_cents}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            items: current.items.map((currentItem, currentIndex) =>
                              currentIndex === index
                                ? { ...currentItem, unit_price_cents: Number(event.target.value || 0) }
                                : currentItem,
                            ),
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Qtd.</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            items: current.items.map((currentItem, currentIndex) =>
                              currentIndex === index
                                ? { ...currentItem, quantity: Number(event.target.value || 1) }
                                : currentItem,
                            ),
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Forma</Label>
                      <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                        <p>{resolvedProduct?.payment_method || item.payment_method}</p>
                        <p className="text-xs text-muted-foreground">{resolvedProduct?.billing_type || item.billing_type}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={4} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveDeal} disabled={upsertDealMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
