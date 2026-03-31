import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, CircleX, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDealSummary, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';

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

function formatProductLabel(product: InternalCrmProduct): string {
  const price = formatCurrencyBr(product.price_cents);
  const suffix = product.billing_type === 'recurring' ? '/mês' : '';
  return `${product.name} (${price}${suffix})`;
}

type DealDetailPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: InternalCrmDealSummary | null;
  products: InternalCrmProduct[];
  stages: InternalCrmStage[];
  onSaveNotes: (dealId: string, notes: string) => Promise<void>;
  onMoveToStage: (dealId: string, stageCode: string) => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onOpenCheckout: () => void;
  isSaving: boolean;
};

export function DealDetailPanel(props: DealDetailPanelProps) {
  const { deal } = props;
  const [localNotes, setLocalNotes] = useState('');

  useEffect(() => {
    setLocalNotes(deal?.notes || '');
  }, [deal?.id, deal?.notes]);

  if (!deal) return null;

  const stageColor = STAGE_COLORS[deal.stage_code || ''] || '#9E9E9E';
  const stageLabel = STAGE_LABELS[deal.stage_code || ''] || deal.stage_code || '-';
  const totalCents = deal.one_time_total_cents + deal.mrr_cents;

  const currentProduct = deal.items?.[0];
  const productName = currentProduct
    ? props.products.find((p) => p.product_code === currentProduct.product_code)?.name || currentProduct.product_code
    : 'Nenhum produto';

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg">{deal.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{deal.client_company_name || 'Sem empresa'}</p>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Etapa atual com badge colorido */}
          <div className="space-y-2">
            <Label>Etapa</Label>
            <div className="flex items-center gap-2">
              <Badge style={{ backgroundColor: stageColor, color: '#fff' }} className="border-0">
                {stageLabel}
              </Badge>
            </div>
            <Select
              value={deal.stage_code || ''}
              onValueChange={(v) => props.onMoveToStage(deal.id, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Mover para etapa..." />
              </SelectTrigger>
              <SelectContent>
                {props.stages.map((s) => (
                  <SelectItem key={s.stage_code} value={s.stage_code}>
                    {STAGE_LABELS[s.stage_code] || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Produto e Valor */}
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-sm font-medium">Produto / Plano</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Produto</span>
                <span className="font-medium">{productName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor Total</span>
                <span className="font-semibold text-foreground">{formatCurrencyBr(totalCents)}</span>
              </div>
              {deal.mrr_cents > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Recorrente</span>
                  <span className="font-medium">{formatCurrencyBr(deal.mrr_cents)}/mês</span>
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              rows={4}
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              placeholder="Adicione notas sobre este lead..."
            />
            {localNotes !== (deal.notes || '') && (
              <Button
                size="sm"
                onClick={() => props.onSaveNotes(deal.id, localNotes)}
                disabled={props.isSaving}
              >
                Salvar Nota
              </Button>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Ações</p>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={props.onMarkWon}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Fechou Contrato
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={props.onMarkLost}
              >
                <CircleX className="mr-2 h-4 w-4" />
                Não Fechou
              </Button>
            </div>
            {deal.payment_method === 'stripe' && (
              <Button variant="outline" className="w-full gap-2" onClick={props.onOpenCheckout}>
                <Wallet className="h-4 w-4" />
                Gerar Checkout
              </Button>
            )}
          </div>

          {/* Info adicional */}
          <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-4 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Criado em</span>
              <span>{new Date(deal.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span>Última atualização</span>
              <span>{new Date(deal.updated_at).toLocaleDateString('pt-BR')}</span>
            </div>
            {deal.lost_reason && (
              <div className="mt-2">
                <span className="font-medium text-rose-600">Motivo:</span> {deal.lost_reason}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
