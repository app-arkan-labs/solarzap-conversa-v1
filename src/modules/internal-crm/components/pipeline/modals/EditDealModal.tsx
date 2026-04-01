import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AssignOwnerSelect } from '@/modules/internal-crm/components/pipeline/AssignOwnerSelect';
import type { InternalCrmClientSummary, InternalCrmMember, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';
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
  { value: 'mentoria_1000_1_encontro', label: 'Mentoria R$1000 · 1 encontro' },
  { value: 'mentoria_1500_4_encontros', label: 'Mentoria R$1500 · 4 encontros' },
  { value: 'mentoria_2000_premium', label: 'Mentoria R$2000 · premium' },
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

function humanizeToken(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

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
  const productByCode = new Map(props.products.map((product) => [product.product_code, product]));
  const offerOptions = Array.from(
    new Map(
      [
        ...props.products.map((product) => [product.product_code, product.name] as const),
        ...EXTRA_OFFER_CODES.map((offerCode) => [offerCode, humanizeToken(offerCode)] as const),
      ],
    ).entries(),
  ).map(([value, label]) => ({ value, label }));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar deal interno' : 'Novo deal interno'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize a oportunidade, o estado comercial e os gatilhos da esteira ARKAN.'
              : 'Cadastre uma oportunidade comercial e associe os itens vendidos.'}
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
              placeholder="Ex: Software + mentoria ARKAN"
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

          <div className="space-y-2">
            <Label>Probabilidade (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={props.draft.probability}
              onChange={(event) => props.onDraftChange({ ...props.draft, probability: Number(event.target.value || 0) })}
            />
          </div>

          <AssignOwnerSelect
            ownerUserId={props.ownerUserId}
            onOwnerUserIdChange={props.onOwnerUserIdChange}
            members={props.members}
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Estado comercial ARKAN</p>
            <p className="text-xs text-muted-foreground">Controle a oferta atual, o produto fechado e os status de upsell/downsell.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Oferta principal</Label>
              <Select
                value={props.draft.primary_offer_code || NONE_VALUE}
                onValueChange={(value) =>
                  props.onDraftChange({ ...props.draft, primary_offer_code: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a oferta" />
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
                  props.onDraftChange({ ...props.draft, closed_product_code: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
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
              <Label>Variante da mentoria</Label>
              <Select
                value={props.draft.mentorship_variant || NONE_VALUE}
                onValueChange={(value) =>
                  props.onDraftChange({ ...props.draft, mentorship_variant: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a variante" />
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

            <div className="space-y-2">
              <Label>Proxima oferta</Label>
              <Select
                value={props.draft.next_offer_code || NONE_VALUE}
                onValueChange={(value) =>
                  props.onDraftChange({ ...props.draft, next_offer_code: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a proxima oferta" />
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
          </div>

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
        </div>

        <div className="space-y-4 rounded-2xl border border-border/70 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Contexto de automacao</p>
            <p className="text-xs text-muted-foreground">Esses campos alimentam lembretes, upsells e tarefas automaticas do blueprint.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Sessoes concluidas</Label>
              <Input
                type="number"
                min={0}
                value={props.draft.mentorship_sessions_completed}
                onChange={(event) =>
                  props.onDraftChange({ ...props.draft, mentorship_sessions_completed: event.target.value })
                }
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Ultima oferta recusada</Label>
              <Select
                value={props.draft.last_declined_offer_code || NONE_VALUE}
                onValueChange={(value) =>
                  props.onDraftChange({ ...props.draft, last_declined_offer_code: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a oferta recusada" />
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

            <div className="space-y-2 xl:col-span-2">
              <Label>Link de agendamento</Label>
              <Input
                value={props.draft.scheduling_link}
                onChange={(event) => props.onDraftChange({ ...props.draft, scheduling_link: event.target.value })}
                placeholder="https://cal.com/..."
              />
            </div>

            <div className="space-y-2 xl:col-span-2">
              <Label>Link da reuniao</Label>
              <Input
                value={props.draft.meeting_link}
                onChange={(event) => props.onDraftChange({ ...props.draft, meeting_link: event.target.value })}
                placeholder="https://meet.google.com/..."
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Itens do deal</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                props.onDraftChange({
                  ...props.draft,
                  items: [
                    ...props.draft.items,
                    {
                      product_code: '',
                      billing_type: 'one_time',
                      payment_method: 'manual',
                      unit_price_cents: 0,
                      quantity: 1,
                    },
                  ],
                })
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Adicionar item
            </Button>
          </div>

          <div className="space-y-3">
            {props.draft.items.map((item, index) => {
              const selectedProduct = productByCode.get(item.product_code);
              return (
                <div key={`${item.product_code}-${index}`} className="grid gap-3 rounded-xl border border-border/70 p-3 md:grid-cols-[1.8fr_1fr_0.7fr_auto]">
                  <div className="space-y-2">
                    <Label>Produto</Label>
                    <Select
                      value={item.product_code}
                      onValueChange={(value) => {
                        const product = productByCode.get(value);
                        props.onDraftChange({
                          ...props.draft,
                          items: props.draft.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  product_code: value,
                                  billing_type: product?.billing_type || 'one_time',
                                  payment_method: product?.payment_method || 'manual',
                                  unit_price_cents: product?.price_cents || 0,
                                  quantity: entry.quantity,
                                }
                              : entry,
                          ),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.products.map((product) => (
                          <SelectItem key={product.product_code} value={product.product_code}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProduct ? (
                      <p className="text-xs text-muted-foreground">
                        Forma: {selectedProduct.payment_method} · Tipo: {selectedProduct.billing_type}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Preco (centavos)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.unit_price_cents}
                      onChange={(event) =>
                        props.onDraftChange({
                          ...props.draft,
                          items: props.draft.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, unit_price_cents: Number(event.target.value || 0) }
                              : entry,
                          ),
                        })
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
                        props.onDraftChange({
                          ...props.draft,
                          items: props.draft.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, quantity: Number(event.target.value || 1) }
                              : entry,
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        props.onDraftChange({
                          ...props.draft,
                          items:
                            props.draft.items.length > 1
                              ? props.draft.items.filter((_, entryIndex) => entryIndex !== index)
                              : props.draft.items,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notas</Label>
          <Textarea
            rows={4}
            value={props.draft.notes}
            onChange={(event) => props.onDraftChange({ ...props.draft, notes: event.target.value })}
            placeholder="Contexto da negociacao, objeções e próximos passos"
          />
        </div>

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
