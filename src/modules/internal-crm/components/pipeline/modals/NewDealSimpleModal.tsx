import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
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
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import { getVisibleInternalCrmProducts } from '@/modules/internal-crm/components/pipeline/dealCatalog';
import { getInternalCrmStageLabel } from '@/modules/internal-crm/components/pipeline/stageCatalog';
import type { InternalCrmClientSummary, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'indicacao', label: 'Indicacao' },
];

const DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1h' },
  { value: '90', label: '1h30' },
  { value: '120', label: '2h' },
];

export type NewDealData = {
  client_mode: 'existing' | 'create';
  client_id: string;
  title: string;
  product_code: string;
  stage_code: string;
  notes: string;
  new_client: {
    company_name: string;
    primary_contact_name: string;
    primary_phone: string;
    primary_email: string;
    source_channel: string;
  };
  appointment: {
    date: string;
    time: string;
    duration_minutes: number;
    location: string;
    notes: string;
  };
};

type NewDealSimpleModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: InternalCrmClientSummary[];
  stages: InternalCrmStage[];
  products: InternalCrmProduct[];
  onSave: (data: NewDealData) => Promise<void>;
  isSaving: boolean;
};

function formatProductLabel(product: InternalCrmProduct): string {
  const price = formatCurrencyBr(product.price_cents);
  const suffix = product.billing_type === 'recurring' ? '/mes' : '';
  return `${product.name} (${price}${suffix})`;
}

function buildEmptyState() {
  return {
    clientMode: 'existing' as const,
    clientId: '',
    title: '',
    productCode: '',
    stageCode: 'novo_lead',
    notes: '',
    newClient: {
      company_name: '',
      primary_contact_name: '',
      primary_phone: '',
      primary_email: '',
      source_channel: 'manual',
    },
    appointment: {
      date: '',
      time: '10:00',
      duration_minutes: 60,
      location: '',
      notes: '',
    },
  };
}

export function NewDealSimpleModal(props: NewDealSimpleModalProps) {
  const [state, setState] = useState(buildEmptyState);
  const visibleProducts = useMemo(() => getVisibleInternalCrmProducts(props.products), [props.products]);
  const requiresAppointment = state.stageCode === 'chamada_agendada';

  useEffect(() => {
    if (props.open) return;
    setState(buildEmptyState());
  }, [props.open]);

  useEffect(() => {
    if (!requiresAppointment) {
      setState((current) => ({
        ...current,
        appointment: {
          date: '',
          time: '10:00',
          duration_minutes: 60,
          location: '',
          notes: '',
        },
      }));
    }
  }, [requiresAppointment]);

  const canSaveBase =
    state.title.trim().length > 0 &&
    (
      (state.clientMode === 'existing' && state.clientId.trim().length > 0) ||
      (
        state.clientMode === 'create' &&
        state.newClient.company_name.trim().length > 0 &&
        state.newClient.primary_contact_name.trim().length > 0
      )
    );

  const canSave = canSaveBase && (!requiresAppointment || (state.appointment.date && state.appointment.time));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Novo Deal
          </DialogTitle>
          <DialogDescription>
            Crie o deal, o contato e o agendamento no mesmo fluxo quando precisar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Como voce quer criar?</Label>
            <Select
              value={state.clientMode}
              onValueChange={(value) => setState((current) => ({ ...current, clientMode: value as 'existing' | 'create' }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="existing">Cliente existente</SelectItem>
                <SelectItem value="create">Criar contato agora</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {state.clientMode === 'existing' ? (
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={state.clientId} onValueChange={(value) => setState((current) => ({ ...current, clientId: value }))}>
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
          ) : (
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input
                  value={state.newClient.company_name}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      newClient: { ...current.newClient, company_name: event.target.value },
                    }))
                  }
                  placeholder="Ex: ARKAN"
                />
              </div>

              <div className="space-y-2">
                <Label>Contato principal</Label>
                <Input
                  value={state.newClient.primary_contact_name}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      newClient: { ...current.newClient, primary_contact_name: event.target.value },
                    }))
                  }
                  placeholder="Nome da pessoa"
                />
              </div>

              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={state.newClient.primary_phone}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      newClient: { ...current.newClient, primary_phone: event.target.value },
                    }))
                  }
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={state.newClient.primary_email}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      newClient: { ...current.newClient, primary_email: event.target.value },
                    }))
                  }
                  placeholder="contato@empresa.com"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Origem</Label>
                <Select
                  value={state.newClient.source_channel}
                  onValueChange={(value) =>
                    setState((current) => ({
                      ...current,
                      newClient: { ...current.newClient, source_channel: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Titulo do deal</Label>
              <Input
                value={state.title}
                onChange={(event) => setState((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ex: Reuniao ARKAN - Joao"
              />
            </div>

            <div className="space-y-2">
              <Label>Etapa inicial</Label>
              <Select
                value={state.stageCode}
                onValueChange={(value) => setState((current) => ({ ...current, stageCode: value }))}
              >
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

            <div className="space-y-2">
              <Label>Produto / Plano</Label>
              <Select
                value={state.productCode || '__none__'}
                onValueChange={(value) => setState((current) => ({ ...current, productCode: value === '__none__' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um produto (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem produto definido</SelectItem>
                  {visibleProducts.map((product) => (
                    <SelectItem key={product.product_code} value={product.product_code}>
                      {formatProductLabel(product)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {requiresAppointment ? (
            <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Agendamento obrigatorio</p>
                <p className="text-xs text-muted-foreground">
                  Deal em Reuniao Agendada precisa sair daqui ja com data e hora.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={state.appointment.date}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        appointment: { ...current.appointment, date: event.target.value },
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Horario</Label>
                  <Input
                    type="time"
                    value={state.appointment.time}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        appointment: { ...current.appointment, time: event.target.value },
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Duracao</Label>
                  <Select
                    value={String(state.appointment.duration_minutes)}
                    onValueChange={(value) =>
                      setState((current) => ({
                        ...current,
                        appointment: { ...current.appointment, duration_minutes: Number(value) || 60 },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Local / Link</Label>
                  <Input
                    value={state.appointment.location}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        appointment: { ...current.appointment, location: event.target.value },
                      }))
                    }
                    placeholder="Google Meet, telefone ou endereco"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Observacoes do agendamento</Label>
                  <Textarea
                    rows={3}
                    value={state.appointment.notes}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        appointment: { ...current.appointment, notes: event.target.value },
                      }))
                    }
                    placeholder="Pontos para essa reuniao"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Notas do deal</Label>
            <Textarea
              rows={3}
              value={state.notes}
              onChange={(event) => setState((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Observacoes do lead (opcional)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              void props.onSave({
                client_mode: state.clientMode,
                client_id: state.clientId,
                title: state.title,
                product_code: state.productCode,
                stage_code: state.stageCode,
                notes: state.notes,
                new_client: state.newClient,
                appointment: state.appointment,
              })
            }
            disabled={props.isSaving || !canSave}
          >
            Salvar deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
