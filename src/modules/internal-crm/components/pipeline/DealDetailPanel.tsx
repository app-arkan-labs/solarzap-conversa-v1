import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  CircleX,
  FileText,
  MessageSquare,
  Phone,
  Save,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  formatCurrencyBr,
  formatDateTime,
  TokenBadge,
} from '@/modules/internal-crm/components/InternalCrmUi';
import { AssignOwnerSelect } from '@/modules/internal-crm/components/pipeline/AssignOwnerSelect';
import {
  centsToReaisInput,
  getDealPrimaryBillingType,
  getDealPrimaryValueCents,
  getDealSummaryLabel,
  reaisInputToCents,
} from '@/modules/internal-crm/components/pipeline/dealCatalog';
import { getInternalCrmStageColor, getInternalCrmStageLabel } from '@/modules/internal-crm/components/pipeline/stageCatalog';
import type { InternalCrmMember, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';
import type { InternalCrmPipelineBoardCard } from '@/modules/internal-crm/hooks/useInternalCrmPipelineBoard';
import { cn } from '@/lib/utils';

const TRACKING_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'utm_source', label: 'UTM Source' },
  { key: 'utm_medium', label: 'UTM Medium' },
  { key: 'utm_campaign', label: 'UTM Campaign' },
  { key: 'gclid', label: 'GCLID' },
  { key: 'fbclid', label: 'FBCLID' },
  { key: 'landing_page_url', label: 'Landing Page' },
];

type DealDetailQuickSaveInput = {
  dealId: string;
  title: string;
  stageCode: string;
  ownerUserId: string;
  notes: string;
  valueCents: number;
  billingType: 'one_time' | 'recurring';
};

type DealDetailPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: InternalCrmPipelineBoardCard | null;
  products: InternalCrmProduct[];
  stages: InternalCrmStage[];
  members?: InternalCrmMember[];
  onSaveQuickEdit: (input: DealDetailQuickSaveInput) => Promise<void>;
  onOpenClient: () => void;
  onOpenConversation: () => void;
  onOpenComments: () => void;
  onCall: () => void;
  onScheduleMeeting: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onDeleteDeal: () => void;
  onOpenCheckout: () => void;
  onOpenAdvanced: () => void;
  isSaving: boolean;
};

function getPaymentStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'Pago';
  if (normalized === 'pending') return 'Pendente';
  if (normalized === 'failed') return 'Falhou';
  if (normalized === 'processing') return 'Processando';
  return normalized ? normalized : 'Pendente';
}

function trackingEntriesFromCard(card: InternalCrmPipelineBoardCard | null) {
  const attribution =
    typeof card?.deal?.commercial_context?.attribution === 'object' && card?.deal?.commercial_context?.attribution
      ? (card.deal.commercial_context.attribution as Record<string, unknown>)
      : {};

  return TRACKING_FIELDS
    .map((field) => {
      const value = attribution[field.key];
      if (typeof value !== 'string' || !value.trim()) return null;
      return { ...field, value: value.trim() };
    })
    .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));
}

export function DealDetailPanel(props: DealDetailPanelProps) {
  const { card } = props;
  const deal = card?.deal || null;
  const [title, setTitle] = useState('');
  const [stageCode, setStageCode] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [valueReais, setValueReais] = useState('');
  const [billingType, setBillingType] = useState<'one_time' | 'recurring'>('one_time');

  useEffect(() => {
    if (!deal || !card) {
      setTitle('');
      setStageCode('');
      setOwnerUserId('');
      setNotes('');
      setValueReais('');
      setBillingType('one_time');
      return;
    }

    setTitle(deal.title || '');
    setStageCode(deal.stage_code || card.stageCode || 'novo_lead');
    setOwnerUserId(card.ownerUserId || deal.owner_user_id || '');
    setNotes(deal.notes || '');
    setValueReais(centsToReaisInput(getDealPrimaryValueCents(deal)));
    setBillingType(getDealPrimaryBillingType(deal));
  }, [card, deal]);

  const trackingEntries = useMemo(() => trackingEntriesFromCard(card), [card]);

  if (!deal || !card) return null;

  const currentValueCents = reaisInputToCents(valueReais);
  const initialValueCents = getDealPrimaryValueCents(deal);
  const initialBillingType = getDealPrimaryBillingType(deal);
  const stageColor = getInternalCrmStageColor(stageCode || deal.stage_code);
  const stageLabel = getInternalCrmStageLabel(stageCode || deal.stage_code);
  const referenceLabel = getDealSummaryLabel(deal, props.products);
  const nextAppointmentLabel = card.nextAppointment?.start_at ? formatDateTime(card.nextAppointment.start_at) : null;
  const hasQuickChanges =
    title.trim() !== (deal.title || '').trim() ||
    stageCode !== (deal.stage_code || '') ||
    ownerUserId !== (card.ownerUserId || deal.owner_user_id || '') ||
    notes !== (deal.notes || '') ||
    currentValueCents !== initialValueCents ||
    billingType !== initialBillingType;

  const quickActions = [
    {
      id: 'conversation',
      label: 'Conversa',
      icon: MessageSquare,
      className: 'bg-indigo-500 hover:bg-indigo-600 text-white',
      onClick: props.onOpenConversation,
    },
    {
      id: 'call',
      label: 'Ligar',
      icon: Phone,
      className: 'bg-blue-500 hover:bg-blue-600 text-white',
      onClick: props.onCall,
    },
    {
      id: 'schedule',
      label: 'Reuniao',
      icon: Calendar,
      className: 'bg-violet-500 hover:bg-violet-600 text-white',
      onClick: props.onScheduleMeeting,
    },
    {
      id: 'checkout',
      label: 'Checkout',
      icon: Wallet,
      className: 'bg-emerald-500 hover:bg-emerald-600 text-white',
      onClick: props.onOpenCheckout,
      disabled: currentValueCents <= 0 || hasQuickChanges,
    },
    {
      id: 'client',
      label: 'Cliente',
      icon: Building2,
      className: 'bg-slate-700 hover:bg-slate-800 text-white',
      onClick: props.onOpenClient,
    },
    {
      id: 'advanced',
      label: 'Avancado',
      icon: SlidersHorizontal,
      className: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
      onClick: props.onOpenAdvanced,
    },
  ];

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/60 bg-muted/20 px-6 py-5">
            <SheetTitle className="pr-10 text-xl tracking-tight">{deal.title}</SheetTitle>
            <SheetDescription>
              {card.companyName || 'Sem empresa'}
              {card.contactName ? ` - ${card.contactName}` : ''}
            </SheetDescription>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge style={{ backgroundColor: stageColor, color: '#fff' }} className="border-0">
                {stageLabel}
              </Badge>
              {card.sourceLabel ? <TokenBadge token={card.sourceChannel} label={card.sourceLabel} /> : null}
              <TokenBadge token={deal.payment_status} label={getPaymentStatusLabel(deal.payment_status)} />
              {trackingEntries.length > 0 ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Tracking
                </Badge>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="text-3xl font-semibold tracking-tight text-foreground">
                {formatCurrencyBr(currentValueCents || initialValueCents)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {billingType === 'recurring' ? 'Valor mensal' : 'Valor pontual'}
                {' - '}
                {card.daysInStage === 1 ? '1 dia nesta etapa' : `${card.daysInStage} dias nesta etapa`}
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Acoes rapidas</p>
                  <p className="text-xs text-muted-foreground">
                    O clique no card agora vira o centro da operacao.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={props.onOpenComments}>
                  <FileText className="h-4 w-4" />
                  Notas completas
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.id}
                      type="button"
                      variant="secondary"
                      className={cn('h-auto min-h-16 flex-col gap-2 py-3 text-xs font-medium', action.className)}
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </Button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Edicao rapida</p>
                  <p className="text-xs text-muted-foreground">
                    Ajuste valor, etapa e responsavel sem selecionar produto.
                  </p>
                </div>
                {referenceLabel ? (
                  <Badge variant="outline" className="max-w-[180px] truncate">
                    {referenceLabel}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="deal-title-inline">Titulo do deal</Label>
                  <Input
                    id="deal-title-inline"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex: Oportunidade ARKAN - Cliente"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deal-value-inline">Valor do lead (R$)</Label>
                  <Input
                    id="deal-value-inline"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={valueReais}
                    onChange={(event) => setValueReais(event.target.value)}
                    placeholder="Ex: 1497.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo do valor</Label>
                  <Select value={billingType} onValueChange={(value) => setBillingType(value as 'one_time' | 'recurring')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_time">Valor unico</SelectItem>
                      <SelectItem value="recurring">Valor mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Etapa</Label>
                  <Select value={stageCode} onValueChange={setStageCode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {props.stages.map((stage) => (
                        <SelectItem key={stage.stage_code} value={stage.stage_code}>
                          {getInternalCrmStageLabel(stage.stage_code, stage.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <AssignOwnerSelect
                  ownerUserId={ownerUserId}
                  onOwnerUserIdChange={setOwnerUserId}
                  members={props.members}
                />

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="deal-notes-inline">Resumo rapido</Label>
                  <Textarea
                    id="deal-notes-inline"
                    rows={4}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Contexto, objecoes e proximo passo."
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {hasQuickChanges
                    ? 'Salve as alteracoes antes de abrir checkout ou avancar para a proxima acao.'
                    : 'Se precisar de produto, trial, upsell ou automacao, use "Avancado".'}
                </p>
                <Button
                  type="button"
                  className="gap-2 self-start sm:self-auto"
                  onClick={() =>
                    void props.onSaveQuickEdit({
                      dealId: deal.id,
                      title,
                      stageCode,
                      ownerUserId,
                      notes,
                      valueCents: currentValueCents,
                      billingType,
                    })
                  }
                  disabled={props.isSaving || !title.trim() || !hasQuickChanges}
                >
                  <Save className="h-4 w-4" />
                  Salvar alteracoes
                </Button>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                <p className="text-sm font-semibold text-foreground">Ritmo comercial</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Responsavel atual</span>
                    <span className="text-right font-medium text-foreground">
                      {card.owner?.display_name || 'Nao definido'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Proxima tarefa</span>
                    <span className="text-right font-medium text-foreground">
                      {card.nextTask?.title || 'Sem tarefa aberta'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Proximo compromisso</span>
                    <span className="text-right font-medium text-foreground">
                      {nextAppointmentLabel || 'Sem agenda'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Ultima conversa</span>
                    <span className="max-w-[60%] text-right text-sm font-medium text-foreground">
                      {card.lastMessagePreview || 'Sem conversa registrada'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Tracking resumido</p>
                  {trackingEntries.length > 0 ? (
                    <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-700">
                      {trackingEntries.length} campos
                    </Badge>
                  ) : null}
                </div>
                {trackingEntries.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {trackingEntries.slice(0, 4).map((entry) => (
                      <div key={entry.key} className="rounded-xl border border-emerald-100 bg-white/90 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          {entry.label}
                        </div>
                        <div className="mt-1 break-all text-xs text-foreground">{entry.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Nenhum dado de tracking foi encontrado neste lead.
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Acoes de fechamento</p>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={props.onDeleteDeal}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir deal
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={props.onMarkWon}>
                  <CheckCircle2 className="h-4 w-4" />
                  Fechou contrato
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={props.onMarkLost}
                >
                  <CircleX className="h-4 w-4" />
                  Nao fechou
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-muted/10 p-4 text-xs text-muted-foreground">
              <div className="flex justify-between gap-3">
                <span>Criado em</span>
                <span>{formatDateTime(deal.created_at)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span>Ultima atualizacao</span>
                <span>{formatDateTime(deal.updated_at)}</span>
              </div>
              {deal.lost_reason ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                  <span className="font-medium">Motivo registrado:</span> {deal.lost_reason}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { DealDetailQuickSaveInput };
