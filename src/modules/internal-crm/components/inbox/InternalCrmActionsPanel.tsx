import { Building2, CalendarClock, CheckCheck, ClipboardList, Loader2, PlugZap, QrCode, Rocket, ShieldCheck, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TokenBadge, formatCurrencyBr, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
  InternalCrmWhatsappInstance,
} from '@/modules/internal-crm/types';

type InternalCrmActionsPanelProps = {
  conversation: InternalCrmConversationSummary | null;
  detail: InternalCrmClientDetail | null;
  instance: InternalCrmWhatsappInstance | null;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
  onProvision: (dealId?: string) => void;
  onConnectInstance: () => void;
  onOpenInstanceDialog: () => void;
  isProvisioning?: boolean;
  isUpdatingStatus?: boolean;
  isConnectingInstance?: boolean;
};

function getRecordValue(record: Record<string, unknown>, key: string) {
  return record[key];
}

function normalizeAppointments(detail: InternalCrmClientDetail | null) {
  return (detail?.appointments || []).map((appointment, index) => {
    const record = appointment as Record<string, unknown>;
    return {
      id: String(getRecordValue(record, 'id') || `appointment-${index}`),
      title: String(getRecordValue(record, 'title') || 'Compromisso'),
      type: String(getRecordValue(record, 'appointment_type') || 'other'),
      status: String(getRecordValue(record, 'status') || 'scheduled'),
      startAt: typeof getRecordValue(record, 'start_at') === 'string' ? String(getRecordValue(record, 'start_at')) : null,
    };
  });
}

function humanizeToken(value: string | null | undefined) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function InternalCrmActionsPanel(props: InternalCrmActionsPanelProps) {
  const detail = props.detail;
  const openDeals = (detail?.deals || []).filter((deal) => deal.status === 'open');
  const openTasks = (detail?.tasks || []).filter((task) => task.status === 'open');
  const appointments = normalizeAppointments(detail);
  const quickActions = [
    {
      id: 'open',
      label: 'Reabrir',
      icon: ShieldCheck,
      className: 'bg-sky-500 hover:bg-sky-600 text-white',
      onClick: () => props.onUpdateStatus('open'),
      disabled: props.isUpdatingStatus,
    },
    {
      id: 'resolved',
      label: 'Resolver',
      icon: CheckCheck,
      className: 'bg-emerald-500 hover:bg-emerald-600 text-white',
      onClick: () => props.onUpdateStatus('resolved'),
      disabled: props.isUpdatingStatus,
    },
    {
      id: 'archived',
      label: 'Arquivar',
      icon: Archive,
      className: 'bg-zinc-700 hover:bg-zinc-800 text-white',
      onClick: () => props.onUpdateStatus('archived'),
      disabled: props.isUpdatingStatus,
    },
    {
      id: 'provision',
      label: 'Provisionar',
      icon: Rocket,
      className: 'bg-primary hover:bg-primary/90 text-primary-foreground',
      onClick: () => props.onProvision(openDeals[0]?.id),
      disabled: !detail?.client.id || props.isProvisioning,
    },
    {
      id: 'qr',
      label: 'Atualizar QR',
      icon: QrCode,
      className: 'bg-orange-500 hover:bg-orange-600 text-white',
      onClick: props.onConnectInstance,
      disabled: !props.instance?.id || props.isConnectingInstance,
    },
    {
      id: 'instance',
      label: 'Nova Instancia',
      icon: PlugZap,
      className: 'bg-indigo-500 hover:bg-indigo-600 text-white',
      onClick: props.onOpenInstanceDialog,
      disabled: false,
    },
  ];

  if (!props.conversation) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Selecione uma conversa para abrir o painel operacional.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/95">
      <div className="border-b border-border/70 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Painel operacional</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Gestão rápida da conversa</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0">
          <section className="border-b border-border/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <div>
                <p className="text-sm font-semibold text-foreground">STATUS</p>
                <p className="text-xs text-muted-foreground">Ações rápidas no mesmo fluxo da conversa.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    variant="secondary"
                    className={action.className}
                    onClick={action.onClick}
                    disabled={action.disabled}
                  >
                    {action.disabled && ['open', 'resolved', 'provision', 'qr'].includes(action.id) ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="mr-1.5 h-4 w-4" />
                    )}
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="border-b border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              Resumo do cliente
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="text-muted-foreground">Empresa:</span> {detail?.client.company_name || props.conversation.client_company_name || '-'}</p>
              <p><span className="text-muted-foreground">Contato:</span> {detail?.client.primary_contact_name || props.conversation.primary_contact_name || '-'}</p>
              <p><span className="text-muted-foreground">Telefone:</span> {detail?.client.primary_phone || props.conversation.primary_phone || '-'}</p>
              <p><span className="text-muted-foreground">Email:</span> {detail?.client.primary_email || props.conversation.primary_email || '-'}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <TokenBadge
                  token={detail?.client.lifecycle_status || props.conversation.lifecycle_status}
                  label={humanizeToken(detail?.client.lifecycle_status || props.conversation.lifecycle_status)}
                />
                {detail?.client.current_stage_code || props.conversation.current_stage_code ? (
                  <TokenBadge
                    token={detail?.client.current_stage_code || props.conversation.current_stage_code}
                    label={humanizeToken(detail?.client.current_stage_code || props.conversation.current_stage_code)}
                  />
                ) : null}
              </div>
              <p><span className="text-muted-foreground">Próxima ação:</span> {detail?.client.next_action || props.conversation.next_action || '-'}</p>
              <p><span className="text-muted-foreground">Quando:</span> {formatDateTime(detail?.client.next_action_at || props.conversation.next_action_at)}</p>
            </div>
          </section>

          <section className="border-b border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ClipboardList className="h-4 w-4 text-primary" />
              Tarefas abertas
            </div>
            <div className="mt-3 space-y-2">
              {openTasks.slice(0, 4).map((task) => (
                <div key={task.id} className="rounded-2xl border border-border/70 bg-background px-3 py-3 text-sm">
                  <p className="font-medium text-foreground">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(task.due_at)}</p>
                </div>
              ))}
              {openTasks.length === 0 ? <p className="text-sm text-muted-foreground">Sem tarefas abertas.</p> : null}
            </div>
          </section>

          <section className="border-b border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Agenda vinculada
            </div>
            <div className="mt-3 space-y-2">
              {appointments.slice(0, 3).map((appointment) => (
                <div key={appointment.id} className="rounded-2xl border border-border/70 bg-background px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{appointment.title}</p>
                    <TokenBadge token={appointment.status} label={appointment.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <TokenBadge token={appointment.type} label={humanizeToken(appointment.type)} />
                    <span className="text-xs text-muted-foreground">{formatDateTime(appointment.startAt)}</span>
                  </div>
                </div>
              ))}
              {appointments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum compromisso vinculado.</p> : null}
            </div>
          </section>

          <section className="border-b border-border/70 p-4">
            <div className="text-sm font-semibold text-foreground">Deals abertos</div>
            <div className="mt-3 space-y-2">
              {openDeals.slice(0, 3).map((deal) => (
                <div key={deal.id} className="rounded-2xl border border-border/70 bg-background px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{deal.title}</p>
                    {deal.stage_code ? <TokenBadge token={deal.stage_code} label={humanizeToken(deal.stage_code)} /> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    One-time {formatCurrencyBr(deal.one_time_total_cents)} · MRR {formatCurrencyBr(deal.mrr_cents)}
                  </p>
                </div>
              ))}
              {openDeals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum deal aberto para este cliente.</p> : null}
            </div>
          </section>

          <section className="border-b border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PlugZap className="h-4 w-4 text-primary" />
              Instância do canal
            </div>
            <div className="mt-3 space-y-3 rounded-3xl border border-border/70 bg-background p-4 text-sm">
              <div>
                <p className="font-medium text-foreground">{props.instance?.display_name || 'Nenhuma instância selecionada'}</p>
                <p className="text-xs text-muted-foreground">{props.instance?.instance_name || 'Cadastre ou conecte uma instância interna.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {props.instance ? <TokenBadge token={props.instance.status} label={humanizeToken(props.instance.status)} /> : null}
                {props.instance ? <TokenBadge token={props.instance.ai_enabled ? 'healthy' : 'pending'} label={props.instance.ai_enabled ? 'IA ativa' : 'IA inativa'} /> : null}
              </div>
              <div className="grid gap-2">
                <Button variant="outline" onClick={props.onConnectInstance} disabled={!props.instance?.id || props.isConnectingInstance}>
                  {props.isConnectingInstance ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />}
                  Conectar / atualizar QR
                </Button>
                <Button variant="outline" onClick={props.onOpenInstanceDialog}>
                  Nova instância interna
                </Button>
              </div>
              {props.instance?.qr_code_base64 ? (
                <div className="rounded-2xl border border-border/70 bg-white p-3">
                  <img src={props.instance.qr_code_base64} alt={`QR ${props.instance.display_name}`} className="mx-auto h-40 w-40 object-contain" />
                </div>
              ) : null}
            </div>
          </section>

          <section className="p-4">
            <div className="text-sm font-semibold text-foreground">Provisionamento</div>
            <div className="mt-3 space-y-3 rounded-3xl border border-border/70 bg-background p-4 text-sm">
              <TokenBadge
                token={detail?.app_link?.provisioning_status || 'pending'}
                label={humanizeToken(detail?.app_link?.provisioning_status || 'pending')}
              />
              <p className="text-muted-foreground">
                {detail?.app_link?.linked_public_org_id
                  ? `Organizacao vinculada: ${detail.app_link.linked_public_org_id}`
                  : 'Cliente ainda nao vinculado a uma organizacao publica.'}
              </p>
              <Button onClick={() => props.onProvision(openDeals[0]?.id)} disabled={!detail?.client.id || props.isProvisioning}>
                {props.isProvisioning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}
                Provisionar agora
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
