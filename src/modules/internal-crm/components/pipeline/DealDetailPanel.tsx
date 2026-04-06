import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleX, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDealSummary, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';

const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  respondeu: 'Respondeu',
  agendou_reuniao: 'Reunião Agendada',
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
  agendou_reuniao: '#3F51B5',
  chamada_agendada: '#3F51B5',
  chamada_realizada: '#4CAF50',
  nao_compareceu: '#F44336',
  negociacao: '#FFC107',
  fechou: '#8BC34A',
  nao_fechou: '#607D8B',
};

const TRACKING_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'utm_source', label: 'UTM Source' },
  { key: 'utm_medium', label: 'UTM Medium' },
  { key: 'utm_campaign', label: 'UTM Campaign' },
  { key: 'utm_content', label: 'UTM Content' },
  { key: 'utm_term', label: 'UTM Term' },
  { key: 'gclid', label: 'GCLID' },
  { key: 'fbclid', label: 'FBCLID' },
  { key: 'fbc', label: 'FBC' },
  { key: 'fbp', label: 'FBP' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'landing_page_url', label: 'Landing Page' },
  { key: 'referrer_url', label: 'Referrer' },
];

function trackingEntriesFromDeal(deal: InternalCrmDealSummary | null) {
  const attribution = typeof deal?.commercial_context?.attribution === 'object' && deal?.commercial_context?.attribution
    ? deal.commercial_context.attribution as Record<string, unknown>
    : {};

  return TRACKING_FIELDS
    .map((field) => {
      const value = attribution[field.key];
      if (typeof value !== 'string' || !value.trim()) return null;
      return { ...field, value: value.trim() };
    })
    .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));
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

  const trackingEntries = useMemo(() => trackingEntriesFromDeal(deal), [deal]);

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
          <div className="space-y-2">
            <Label>Etapa</Label>
            <div className="flex items-center gap-2">
              <Badge style={{ backgroundColor: stageColor, color: '#fff' }} className="border-0">
                {stageLabel}
              </Badge>
            </div>
            <Select
              value={deal.stage_code || ''}
              onValueChange={(value) => props.onMoveToStage(deal.id, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Mover para etapa..." />
              </SelectTrigger>
              <SelectContent>
                {props.stages.map((stage) => (
                  <SelectItem key={stage.stage_code} value={stage.stage_code}>
                    {STAGE_LABELS[stage.stage_code] || stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              {deal.mrr_cents > 0 ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Recorrente</span>
                  <span className="font-medium">{formatCurrencyBr(deal.mrr_cents)}/mês</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              rows={4}
              value={localNotes}
              onChange={(event) => setLocalNotes(event.target.value)}
              placeholder="Adicione notas sobre este lead..."
            />
            {localNotes !== (deal.notes || '') ? (
              <Button
                size="sm"
                onClick={() => props.onSaveNotes(deal.id, localNotes)}
                disabled={props.isSaving}
              >
                Salvar Nota
              </Button>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Tracking do Lead</p>
              {trackingEntries.length > 0 ? (
                <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-700">
                  {trackingEntries.length} campos
                </Badge>
              ) : null}
            </div>
            {trackingEntries.length > 0 ? (
              <div className="space-y-2">
                {trackingEntries.map((entry) => (
                  <div key={entry.key} className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      {entry.label}
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-foreground">
                      {entry.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum dado de tracking foi encontrado neste deal.
              </p>
            )}
          </div>

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
            {deal.payment_method === 'stripe' ? (
              <Button variant="outline" className="w-full gap-2" onClick={props.onOpenCheckout}>
                <Wallet className="h-4 w-4" />
                Gerar Checkout
              </Button>
            ) : null}
          </div>

          <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-4 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Criado em</span>
              <span>{new Date(deal.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span>Última atualização</span>
              <span>{new Date(deal.updated_at).toLocaleDateString('pt-BR')}</span>
            </div>
            {deal.lost_reason ? (
              <div className="mt-2">
                <span className="font-medium text-rose-600">Motivo:</span> {deal.lost_reason}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
