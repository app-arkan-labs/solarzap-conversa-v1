import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AssignOwnerSelect } from '@/modules/internal-crm/components/pipeline/AssignOwnerSelect';
import {
  buildSimpleDealItem,
  centsToReaisInput,
  humanizeInternalCrmToken,
  reaisInputToCents,
} from '@/modules/internal-crm/components/pipeline/dealCatalog';
import type {
  InternalCrmClientSummary,
  InternalCrmMember,
  InternalCrmProduct,
  InternalCrmStage,
} from '@/modules/internal-crm/types';
import type { DealDraft } from '@/modules/internal-crm/components/pipeline/types';

const NONE_VALUE = '__none__';
const EXTRA_OFFER_CODES = [
  'upgrade_mentoria_500',
  'solarzap_plan',
  'landing_page',
  'trafego_pago',
  'landing_page_after_mentoria_declined',
  'trafego_after_lp_declined',
];
const MENTORSHIP_VARIANT_OPTIONS = [
  { value: 'mentoria_1000_1_encontro', label: 'Mentoria R$1000 - 1 encontro' },
  { value: 'mentoria_1500_4_encontros', label: 'Mentoria R$1500 - 4 encontros' },
  { value: 'mentoria_2000_premium', label: 'Mentoria R$2000 - premium' },
  { value: 'mentoria_3x1000_pos_software', label: 'Mentoria 3x R$1000 pos-software' },
  { value: 'mentoria_4x1200_pos_trial', label: 'Mentoria 4x R$1200 pos-trial' },
];
const SOFTWARE_STATUS_OPTIONS = [
  { value: 'not_offered', label: 'Nao ofertado' },
  { value: 'offered', label: 'Ofertado' },
  { value: 'accepted', label: 'Aceito' },
  { value: 'declined', label: 'Recusado' },
  { value: 'trial_offered', label: 'Trial ofertado' },
  { value: 'trial_active', label: 'Trial ativo' },
  { value: 'trial_declined', label: 'Trial recusado' },
  { value: 'signed', label: 'Assinado' },
];
const LANDING_PAGE_STATUS_OPTIONS = [
  { value: 'not_offered', label: 'Nao ofertado' },
  { value: 'offered', label: 'Ofertado' },
  { value: 'accepted', label: 'Aceito' },
  { value: 'declined', label: 'Recusado' },
  { value: 'in_delivery', label: 'Em entrega' },
  { value: 'delivered', label: 'Entregue' },
];
const TRAFFIC_STATUS_OPTIONS = [
  { value: 'not_offered', label: 'Nao ofertado' },
  { value: 'offered', label: 'Ofertado' },
  { value: 'accepted', label: 'Aceito' },
  { value: 'declined', label: 'Recusado' },
  { value: 'active', label: 'Ativo' },
];
const TRIAL_STATUS_OPTIONS = [
  { value: 'not_offered', label: 'Nao ofertado' },
  { value: 'offered', label: 'Ofertado' },
  { value: 'accepted', label: 'Aceito' },
  { value: 'expired', label: 'Expirado' },
  { value: 'converted', label: 'Convertido' },
  { value: 'declined', label: 'Recusado' },
];

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoDateTimeValue(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function getPrimaryItem(draft: DealDraft) {
  const fallbackBillingType = draft.items[0]?.billing_type === 'recurring' ? 'recurring' : 'one_time';
  const fallbackValueCents = Number(draft.items[0]?.unit_price_cents || 0);
  return (
    draft.items.find((item) => item.product_code.trim().length > 0 || Number(item.unit_price_cents || 0) > 0) ||
    {
      ...buildSimpleDealItem({
        valueCents: fallbackValueCents,
        billingType: fallbackBillingType,
      }),
    }
  );
}

function replaceQuickPricing(
  draft: DealDraft,
  next: Partial<{ billingType: 'one_time' | 'recurring'; valueCents: number }>,
): DealDraft {
  const current = getPrimaryItem(draft);
  const billingType = next.billingType || current.billing_type;
  const valueCents = next.valueCents ?? Number(current.unit_price_cents || 0);
  const replacement = buildSimpleDealItem({
    valueCents,
    billingType,
    paymentMethod: current.payment_method,
  });

  return {
    ...draft,
    items: [
      {
        product_code: replacement.product_code,
        billing_type: replacement.billing_type,
        payment_method: replacement.payment_method,
        unit_price_cents: replacement.unit_price_cents,
        quantity: replacement.quantity,
      },
    ],
  };
}

type EditDealModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: DealDraft;
  onDraftChange: (draft: DealDraft) => void;
  clients: InternalCrmClientSummary[];
  stages: InternalCrmStage[];
  products: InternalCrmProduct[];
  members?: InternalCrmMember[];
  ownerUserId: string;
  onOwnerUserIdChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
};

export function EditDealModal(props: EditDealModalProps) {
  const isEditing = Boolean(props.draft.id);
  const primaryItem = getPrimaryItem(props.draft);
  const quickValue = centsToReaisInput(Number(primaryItem.unit_price_cents || 0));
  const offerOptions = Array.from(
    new Map(
      [
        ...props.products.map((product) => [product.product_code, product.name] as const),
        ...EXTRA_OFFER_CODES.map((offerCode) => [offerCode, humanizeInternalCrmToken(offerCode)] as const),
      ],
    ).entries(),
  ).map(([value, label]) => ({ value, label }));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar deal interno' : 'Novo deal interno'}</DialogTitle>
          <DialogDescription>
            Fluxo simplificado: defina valor, etapa e responsavel. Os campos tecnicos ficam recolhidos em "Avancado".
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select
              value={props.draft.client_id}
              onValueChange={(value) => props.onDraftChange({ ...props.draft, client_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {props.clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Titulo</Label>
            <Input
              value={props.draft.title}
              onChange={(event) => props.onDraftChange({ ...props.draft, title: event.target.value })}
              placeholder="Ex: Oportunidade ARKAN - Cliente"
            />
          </div>

          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select
              value={props.draft.stage_code}
              onValueChange={(value) => props.onDraftChange({ ...props.draft, stage_code: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.stages.map((stage) => (
                  <SelectItem key={stage.stage_code} value={stage.stage_code}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AssignOwnerSelect
            ownerUserId={props.ownerUserId}
            onOwnerUserIdChange={props.onOwnerUserIdChange}
            members={props.members}
          />

          <div className="space-y-2">
            <Label>Valor do lead (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={quickValue}
              onChange={(event) =>
                props.onDraftChange(
                  replaceQuickPricing(props.draft, {
                    valueCents: reaisInputToCents(event.target.value),
                  }),
                )
              }
              placeholder="Ex: 1497.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo do valor</Label>
            <Select
              value={primaryItem.billing_type}
              onValueChange={(value) =>
                props.onDraftChange(
                  replaceQuickPricing(props.draft, {
                    billingType: value as 'one_time' | 'recurring',
                  }),
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">Valor unico</SelectItem>
                <SelectItem value="recurring">Valor mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Notas</Label>
            <Textarea
              rows={4}
              value={props.draft.notes}
              onChange={(event) => props.onDraftChange({ ...props.draft, notes: event.target.value })}
              placeholder="Contexto da negociacao, objecoes e proximo passo"
            />
            <p className="text-xs text-muted-foreground">
              Nao precisa selecionar produto para definir o valor. Use a secao avancada apenas quando houver necessidade real.
            </p>
          </div>
        </div>

        <Accordion type="multiple" className="rounded-2xl border border-border/70 px-4">
          <AccordionItem value="comercial">
            <AccordionTrigger className="text-sm font-semibold">Avancado: referencia comercial</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Oferta principal</Label>
                  <Select
                    value={props.draft.primary_offer_code || NONE_VALUE}
                    onValueChange={(value) =>
                      props.onDraftChange({
                        ...props.draft,
                        primary_offer_code: value === NONE_VALUE ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nao definida" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Nao definida</SelectItem>
                      {offerOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Produto fechado</Label>
                  <Select
                    value={props.draft.closed_product_code || NONE_VALUE}
                    onValueChange={(value) =>
                      props.onDraftChange({
                        ...props.draft,
                        closed_product_code: value === NONE_VALUE ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nao definido" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Nao definido</SelectItem>
                      {props.products.map((product) => (
                        <SelectItem key={product.product_code} value={product.product_code}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Probabilidade (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={props.draft.probability}
                    onChange={(event) =>
                      props.onDraftChange({ ...props.draft, probability: Number(event.target.value || 0) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Variante da mentoria</Label>
                  <Select
                    value={props.draft.mentorship_variant || NONE_VALUE}
                    onValueChange={(value) =>
                      props.onDraftChange({
                        ...props.draft,
                        mentorship_variant: value === NONE_VALUE ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nao definida" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Nao definida</SelectItem>
                      {MENTORSHIP_VARIANT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="automacao">
            <AccordionTrigger className="text-sm font-semibold">Avancado: automacao e esteira</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Software</Label>
                  <Select
                    value={props.draft.software_status}
                    onValueChange={(value) => props.onDraftChange({ ...props.draft, software_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOFTWARE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Landing Page</Label>
                  <Select
                    value={props.draft.landing_page_status}
                    onValueChange={(value) => props.onDraftChange({ ...props.draft, landing_page_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANDING_PAGE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Trafego</Label>
                  <Select
                    value={props.draft.traffic_status}
                    onValueChange={(value) => props.onDraftChange({ ...props.draft, traffic_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAFFIC_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Trial</Label>
                  <Select
                    value={props.draft.trial_status}
                    onValueChange={(value) => props.onDraftChange({ ...props.draft, trial_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIAL_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label>Sessoes concluidas</Label>
                  <Input
                    type="number"
                    min={0}
                    value={props.draft.mentorship_sessions_completed}
                    onChange={(event) =>
                      props.onDraftChange({
                        ...props.draft,
                        mentorship_sessions_completed: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ultima oferta recusada</Label>
                  <Select
                    value={props.draft.last_declined_offer_code || NONE_VALUE}
                    onValueChange={(value) =>
                      props.onDraftChange({
                        ...props.draft,
                        last_declined_offer_code: value === NONE_VALUE ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Nenhuma</SelectItem>
                      {offerOptions.map((option) => (
                        <SelectItem key={`declined-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fim do trial</Label>
                  <Input
                    type="datetime-local"
                    value={toDateTimeLocalValue(props.draft.trial_ends_at)}
                    onChange={(event) =>
                      props.onDraftChange({
                        ...props.draft,
                        trial_ends_at: event.target.value ? toIsoDateTimeValue(event.target.value) : '',
                      })
                    }
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="agenda">
            <AccordionTrigger className="text-sm font-semibold">Avancado: agenda e proximas ofertas</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label>Proxima oferta</Label>
                  <Select
                    value={props.draft.next_offer_code || NONE_VALUE}
                    onValueChange={(value) =>
                      props.onDraftChange({
                        ...props.draft,
                        next_offer_code: value === NONE_VALUE ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem proxima oferta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Sem proxima oferta</SelectItem>
                      {offerOptions.map((option) => (
                        <SelectItem key={`next-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Proxima oferta em</Label>
                  <Input
                    type="datetime-local"
                    value={toDateTimeLocalValue(props.draft.next_offer_at)}
                    onChange={(event) =>
                      props.onDraftChange({
                        ...props.draft,
                        next_offer_at: event.target.value ? toIsoDateTimeValue(event.target.value) : '',
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Link de agendamento</Label>
                  <Input
                    value={props.draft.scheduling_link}
                    onChange={(event) =>
                      props.onDraftChange({ ...props.draft, scheduling_link: event.target.value })
                    }
                    placeholder="https://cal.com/..."
                  />
                </div>

                <div className="space-y-2 md:col-span-2 xl:col-span-2">
                  <Label>Link da reuniao</Label>
                  <Input
                    value={props.draft.meeting_link}
                    onChange={(event) => props.onDraftChange({ ...props.draft, meeting_link: event.target.value })}
                    placeholder="https://meet.google.com/..."
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={props.onSave} disabled={props.isSaving}>
            <Save className="mr-1.5 h-4 w-4" />
            {isEditing ? 'Salvar alteracoes' : 'Salvar deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
