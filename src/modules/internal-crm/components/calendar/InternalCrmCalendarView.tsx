import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { InternalCrmAppointmentModal } from '@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal';
import { InternalCrmCalendarFilters } from '@/modules/internal-crm/components/calendar/InternalCrmCalendarFilters';
import { InternalCrmEventFeedbackModal } from '@/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal';
import { InternalCrmEventArchiveModal } from '@/modules/internal-crm/components/calendar/InternalCrmEventArchiveModal';
import { useInternalCrmCalendar } from '@/modules/internal-crm/hooks/useInternalCrmCalendar';
import type {
  InternalCrmAppointment,
  InternalCrmClientSummary,
  InternalCrmDealSummary,
} from '@/modules/internal-crm/types';
import {
  appendAppointmentIfMissing,
  appendDealSummaryIfMissing,
  buildAutoDealTitle,
  deriveDealStageFromAppointmentStatus,
  getOpenDealsForClient,
  patchAppointmentInList,
  patchClientStageInList,
  patchDealSummaryInList,
} from '@/modules/internal-crm/lib/commercialFlow';
import { cn } from '@/lib/utils';

/* ── Constants ────────────────────────────────────── */

const EVENT_TYPE_COLORS: Record<string, string> = {
  call: 'bg-blue-500',
  demo: 'bg-indigo-500',
  meeting: 'bg-purple-500',
  visit: 'bg-orange-500',
  other: 'bg-gray-500',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  call: 'Ligação',
  demo: 'Demonstração',
  meeting: 'Reunião',
  visit: 'Visita',
  other: 'Outro',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  done: 'Realizado',
  canceled: 'Cancelado',
  no_show: 'Não Compareceu',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  done: 'bg-muted text-foreground/80',
  canceled: 'bg-red-100 text-red-700',
  no_show: 'bg-orange-100 text-orange-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ── Helpers ──────────────────────────────────────── */

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonthLabel(date: Date): string {
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtHour(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function buildCalendarWeeks(anchorDate: Date): Array<Array<Date | null>> {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDay.getDay(); // 0=Sun

  const cells: Array<Date | null> = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function partitionDayEvents<T>(events: T[], maxVisible: number): { visible: T[]; hiddenCount: number } {
  return events.length <= maxVisible
    ? { visible: events, hiddenCount: 0 }
    : { visible: events.slice(0, maxVisible), hiddenCount: events.length - maxVisible };
}

function defaultStartAtForDay(day: Date): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0, 0, 0).toISOString();
}

function getDisplayStatus(appointment: InternalCrmAppointment): { label: string; colorClass: string } {
  if (appointment.status === 'scheduled' && new Date(appointment.start_at).getTime() < Date.now()) {
    return { label: 'Pendente', colorClass: STATUS_COLORS.pending };
  }
  return {
    label: STATUS_LABELS[appointment.status] || appointment.status,
    colorClass: STATUS_COLORS[appointment.status] || 'bg-muted',
  };
}

function buildCalendarDealPayload(input: {
  clientId: string;
  companyName?: string | null;
  contactName?: string | null;
  ownerUserId?: string | null;
  stageCode?: string | null;
}) {
  return {
    action: 'upsert_deal' as const,
    client_id: input.clientId,
    title: buildAutoDealTitle({
      companyName: input.companyName,
      contactName: input.contactName,
    }),
    owner_user_id: input.ownerUserId || null,
    stage_code: input.stageCode || 'novo_lead',
    probability: 5,
    notes: null,
    items: [],
  };
}

/* ── ErrorBoundary ────────────────────────────────── */

class CalendarErrorBoundary extends Component<{ children: ReactNode; onError?: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_: Error, info: ErrorInfo) { console.error('[CalendarErrorBoundary]', _, info); this.props.onError?.(); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Ocorreu um erro. Recarregue a página.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Main Component ───────────────────────────────── */

export function InternalCrmCalendarView() {
  const { toast } = useToast();
  const isMobile = useMobileViewport();
  const queryClient = useQueryClient();

  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [filters, setFilters] = useState({ type: 'all', status: 'all', clientId: 'all' });
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<InternalCrmAppointment | null>(null);
  const [feedbackAppointment, setFeedbackAppointment] = useState<InternalCrmAppointment | null>(null);
  const [defaultStartAt, setDefaultStartAt] = useState<string | null>(null);

  // Mobile drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'upcoming' | 'past' | 'day'>('upcoming');
  const [drawerDayKey, setDrawerDayKey] = useState<string | null>(null);

  // Google Calendar toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google_calendar');
    const message = params.get('message');
    if (!googleStatus) return;

    toast({
      title: googleStatus === 'connected' ? 'Google Calendar conectado' : 'Falha na conexão Google Calendar',
      description: message || (googleStatus === 'connected' ? 'Sincronização habilitada.' : 'Não foi possível concluir.'),
      variant: googleStatus === 'connected' ? 'default' : 'destructive',
    });

    params.delete('google_calendar');
    params.delete('message');
    const nextQuery = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`);
  }, [toast]);

  const calendarModule = useInternalCrmCalendar({
    monthAnchor,
    status: filters.status === 'all' ? undefined : filters.status,
    client_id: filters.clientId === 'all' ? undefined : filters.clientId,
  });

  const appointments = calendarModule.appointmentsQuery.data?.appointments || [];
  const clients = calendarModule.clientsQuery.data?.clients || [];
  const openDeals = calendarModule.dealsQuery.data?.deals || [];
  const googleCalendarStatus = calendarModule.googleCalendarQuery.data;
  const isGoogleConnected = Boolean(googleCalendarStatus?.connected);
  const googleEmail = googleCalendarStatus?.connection?.account_email || '';

  // Filter by type locally (backend doesn't filter by type)
  const filteredAppointments = useMemo(() => {
    if (filters.type === 'all') return appointments;
    return appointments.filter((a) => a.appointment_type === filters.type);
  }, [appointments, filters.type]);

  const weeks = useMemo(() => buildCalendarWeeks(monthAnchor), [monthAnchor]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, InternalCrmAppointment[]>();
    for (const apt of filteredAppointments) {
      const d = new Date(apt.start_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      const list = map.get(key) || [];
      list.push(apt);
      map.set(key, list);
    }
    for (const [k, list] of map.entries()) {
      map.set(k, [...list].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
    }
    return map;
  }, [filteredAppointments]);

  const now = Date.now();
  const upcomingAppointments = useMemo(
    () => filteredAppointments
      .filter((a) => !['done', 'canceled', 'no_show'].includes(a.status) && new Date(a.start_at).getTime() >= now - 24 * 3600000)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [filteredAppointments, now],
  );

  const pastAppointments = useMemo(
    () => filteredAppointments
      .filter((a) => !['done', 'canceled', 'no_show'].includes(a.status) && new Date(a.start_at).getTime() < now - 24 * 3600000)
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
    [filteredAppointments, now],
  );

  function shiftMonth(offset: number) {
    setMonthAnchor((c) => new Date(c.getFullYear(), c.getMonth() + offset, 1));
  }

  function openCreate(day?: Date) {
    setEditingAppointment(null);
    setDefaultStartAt(day ? defaultStartAtForDay(day) : new Date().toISOString());
    setAppointmentModalOpen(true);
  }

  function openEdit(apt: InternalCrmAppointment) {
    setEditingAppointment(apt);
    setDefaultStartAt(null);
    setAppointmentModalOpen(true);
  }

  function openFeedback(apt: InternalCrmAppointment) {
    setFeedbackAppointment(apt);
    setFeedbackModalOpen(true);
  }

  function patchCalendarCachesFromAppointment(appointment: InternalCrmAppointment) {
    const nextStage = deriveDealStageFromAppointmentStatus(appointment.status);

    queryClient.setQueriesData(
      { queryKey: ['internal-crm', 'appointments'], exact: false },
      (previous: { ok: true; appointments: InternalCrmAppointment[] } | undefined) => {
        if (!previous?.appointments) return previous;
        const nextAppointments = patchAppointmentInList(previous.appointments, appointment) || appendAppointmentIfMissing(previous.appointments, appointment) || previous.appointments;
        return {
          ...previous,
          appointments: nextAppointments,
        };
      },
    );

    if (!appointment.deal_id || !nextStage) return;

    queryClient.setQueriesData(
      { queryKey: ['internal-crm', 'deals'], exact: false },
      (previous: { ok: true; deals: InternalCrmDealSummary[] } | undefined) => {
        if (!previous?.deals) return previous;
        return {
          ...previous,
          deals: previous.deals.map((deal) =>
            deal.id === appointment.deal_id
              ? {
                  ...deal,
                  stage_code: nextStage,
                  updated_at: new Date().toISOString(),
                }
              : deal,
          ),
        };
      },
    );

    queryClient.setQueriesData(
      { queryKey: ['internal-crm', 'clients'], exact: false },
      (previous: { ok: true; clients: InternalCrmClientSummary[] } | undefined) => {
        if (!previous?.clients) return previous;
        return {
          ...previous,
          clients: patchClientStageInList(previous.clients, appointment.client_id, nextStage) || previous.clients,
        };
      },
    );
  }

  async function ensureOpenDealForClient(input: {
    clientId: string;
    preferredDealId?: string | null;
    preferredTitle?: string | null;
    stageCode?: string | null;
  }) {
    const selectedClient = clients.find((client) => client.id === input.clientId);
    const clientDeals = getOpenDealsForClient(openDeals, input.clientId);
    if (input.preferredDealId) return input.preferredDealId;
    if (clientDeals.length === 1) return clientDeals[0].id;
    if (clientDeals.length > 1) return null;

    const created = await calendarModule.upsertDealMutation.mutateAsync(
      {
        ...buildCalendarDealPayload({
          clientId: input.clientId,
          companyName: selectedClient?.company_name,
          contactName: selectedClient?.primary_contact_name,
          ownerUserId: selectedClient?.owner_user_id,
          stageCode: input.stageCode,
        }),
        ...(input.preferredTitle ? { title: input.preferredTitle } : {}),
      },
    ) as { deal?: InternalCrmDealSummary };

    const createdDeal = created.deal;
    if (createdDeal?.id) {
      queryClient.setQueriesData(
        { queryKey: ['internal-crm', 'deals'], exact: false },
        (previous: { ok: true; deals: InternalCrmDealSummary[] } | undefined) => {
          if (!previous?.deals) return previous;
          return {
            ...previous,
            deals: appendDealSummaryIfMissing(previous.deals, createdDeal) || previous.deals,
          };
        },
      );
    }
    return createdDeal?.id || null;
  }

  function handleDayClick(day: Date | null) {
    if (!day) return;
    if (isMobile) {
      setDrawerDayKey(toDateKey(day));
      setDrawerMode('day');
      setDrawerOpen(true);
    } else {
      openCreate(day);
    }
  }

  async function handleSaveAppointment(payload: Record<string, unknown>) {
    try {
      const clientId = String(payload.client_id || '');
      if (!clientId) {
        toast({ title: 'Selecione um cliente', variant: 'destructive' });
        return;
      }

      const appointmentStage = deriveDealStageFromAppointmentStatus(String(payload.status || 'scheduled'));
      const resolvedDealId = await ensureOpenDealForClient({
        clientId,
        preferredDealId: String(payload.deal_id || ''),
        preferredTitle: String(payload.new_deal_title || ''),
        stageCode: appointmentStage,
      });

      if (!resolvedDealId) {
        toast({
          title: 'Selecione um deal',
          description: 'Este cliente possui mais de um deal aberto. Escolha qual deve ser vinculado.',
          variant: 'destructive',
        });
        return;
      }

      const result = (await calendarModule.upsertAppointmentMutation.mutateAsync({
        action: 'upsert_appointment',
        ...payload,
        deal_id: resolvedDealId,
      })) as { ok: true; appointment: InternalCrmAppointment };

      patchCalendarCachesFromAppointment({
        ...result.appointment,
        deal_id: resolvedDealId,
      });

      let googleWarn = false;
      if (isGoogleConnected && result.appointment?.id) {
        try {
          await calendarModule.syncAppointmentGoogleMutation.mutateAsync({
            action: 'sync_appointment_google_calendar',
            appointment_id: result.appointment.id,
          });
        } catch { googleWarn = true; }
      }

      toast({
        title: 'Compromisso salvo',
        description: googleWarn ? 'Salvo, mas falha ao sincronizar com Google.' : 'Agenda atualizada.',
      });
      setAppointmentModalOpen(false);
      setEditingAppointment(null);
      setDefaultStartAt(null);
    } catch (error) {
      toast({ title: 'Falha ao salvar', description: 'Não foi possível salvar o compromisso.', variant: 'destructive' });
    }
  }

  async function handleDeleteAppointment(appointmentId: string) {
    try {
      await calendarModule.deleteAppointmentMutation.mutateAsync({
        action: 'delete_appointment',
        appointment_id: appointmentId,
      });
      toast({ title: 'Agendamento excluído' });
      setAppointmentModalOpen(false);
      setEditingAppointment(null);
    } catch {
      toast({ title: 'Falha ao excluir', description: 'Não foi possível excluir o agendamento.', variant: 'destructive' });
    }
  }

  async function handleSaveFeedback(payload: { status: InternalCrmAppointment['status']; notes: string }) {
    if (!feedbackAppointment) return;
    try {
      const result = await calendarModule.upsertAppointmentMutation.mutateAsync({
        action: 'upsert_appointment',
        appointment_id: feedbackAppointment.id,
        client_id: feedbackAppointment.client_id,
        deal_id: feedbackAppointment.deal_id,
        title: feedbackAppointment.title,
        appointment_type: feedbackAppointment.appointment_type,
        status: payload.status,
        start_at: feedbackAppointment.start_at,
        end_at: feedbackAppointment.end_at,
        location: feedbackAppointment.location,
        notes: payload.notes || feedbackAppointment.notes,
      }) as { ok: true; appointment: InternalCrmAppointment };
      patchCalendarCachesFromAppointment(result.appointment);
      toast({ title: 'Feedback registrado' });
      setFeedbackModalOpen(false);
      setFeedbackAppointment(null);
    } catch {
      toast({ title: 'Falha ao registrar feedback', variant: 'destructive' });
    }
  }

  async function handleConnectGoogle() {
    try {
      const r = (await calendarModule.googleCalendarActionMutation.mutateAsync({
        action: 'get_google_calendar_oauth_url',
        redirect_url: window.location.origin,
      })) as { ok: true; auth_url: string };
      if (r.auth_url) window.location.href = r.auth_url;
    } catch {
      toast({ title: 'Falha ao conectar', variant: 'destructive' });
    }
  }

  async function handleDisconnectGoogle() {
    try {
      await calendarModule.googleCalendarActionMutation.mutateAsync({ action: 'disconnect_google_calendar' });
      toast({ title: 'Google Calendar desconectado' });
    } catch {
      toast({ title: 'Falha ao desconectar', variant: 'destructive' });
    }
  }

  async function handleImportGoogle() {
    try {
      const r = (await calendarModule.importGoogleEventsMutation.mutateAsync({
        action: 'import_google_calendar_events',
        date_from: calendarModule.params.date_from,
        date_to: calendarModule.params.date_to,
      })) as { ok: true; imported_count: number; updated_count: number };
      toast({ title: 'Agenda importada', description: `${r.imported_count} novo(s), ${r.updated_count} atualizado(s).` });
    } catch {
      toast({ title: 'Falha ao importar', variant: 'destructive' });
    }
  }

  /* ── Sidebar Event Card ──────────────────────────── */

  function renderEventCard(evt: InternalCrmAppointment, showDate = true) {
    const ds = getDisplayStatus(evt);
    return (
      <div
        key={evt.id}
        className="group relative cursor-pointer rounded-xl border p-3 transition-all hover:border-primary/50 hover:shadow-md"
        onClick={() => openEdit(evt)}
      >
        <div className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-full', EVENT_TYPE_COLORS[evt.appointment_type] || 'bg-gray-400')} />
        <div className="pl-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary/80 uppercase">
              {EVENT_TYPE_LABELS[evt.appointment_type] || evt.appointment_type}
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', ds.colorClass)}>
              {ds.label}
            </span>
          </div>
          <p className="font-semibold text-sm">{evt.title}</p>
          {evt.client_company_name && (
            <p className="text-xs text-muted-foreground">{evt.client_company_name}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {showDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {fmtShortDate(evt.start_at)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {fmtHour(evt.start_at)}
            </span>
            {evt.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> <span className="truncate max-w-[100px]">{evt.location}</span>
              </span>
            )}
          </div>
          {/* Quick action buttons on hover */}
          <div className="flex gap-1.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); openEdit(evt); }}>
              <Pencil className="mr-1 h-3 w-3" />Editar
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); openFeedback(evt); }}>
              <ClipboardCheck className="mr-1 h-3 w-3" />Feedback
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Drawer events ───────────────────────────────── */

  const drawerEvents = useMemo(() => {
    if (drawerMode === 'upcoming') return upcomingAppointments;
    if (drawerMode === 'past') return pastAppointments;
    if (drawerMode === 'day' && drawerDayKey) return appointmentsByDate.get(drawerDayKey) || [];
    return [];
  }, [drawerMode, drawerDayKey, upcomingAppointments, pastAppointments, appointmentsByDate]);

  const drawerTitle = drawerMode === 'upcoming'
    ? 'Próximos Eventos'
    : drawerMode === 'past'
      ? 'Eventos Passados'
      : drawerDayKey
        ? (() => {
          const [y, m, d] = drawerDayKey.split('-').map(Number);
          return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
        })()
        : 'Eventos';

  /* ── Render ──────────────────────────────────────── */

  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-muted/30">
      {/* Header */}
      <PageHeader
        title="Calendário"
        subtitle="Gestão de Agenda"
        icon={CalendarDays}
        actionContent={
          <div className="flex items-center gap-2">
            {isGoogleConnected ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Badge variant="secondary" className="mr-2 bg-green-100 text-green-700 text-[10px]">Google ✓</Badge>
                    {googleEmail ? googleEmail.split('@')[0] : 'Conectado'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void handleImportGoogle()}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Importar eventos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleDisconnectGoogle()} className="text-destructive">
                    <Unlink className="mr-2 h-3.5 w-3.5" /> Desconectar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void handleConnectGoogle()} disabled={calendarModule.googleCalendarActionMutation.isPending}>
                {calendarModule.googleCalendarActionMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-2 h-3.5 w-3.5" />}
                Conectar Google
              </Button>
            )}
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo Agendamento
            </Button>
          </div>
        }
        mobileToolbar={
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="mr-1 h-4 w-4" /> Novo
          </Button>
        }
      />

      {/* Navigation + Filters */}
      <div className="relative px-4 py-3 sm:px-6 border-b border-border/50 flex flex-wrap items-center gap-3 min-h-[56px]">
        <InternalCrmCalendarFilters filters={filters} onFiltersChange={setFilters} clients={clients} />

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold capitalize min-w-[140px] text-center">{formatMonthLabel(monthAnchor)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setMonthAnchor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Hoje
          </Button>
        </div>

        {calendarModule.appointmentsQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Mobile quick-access buttons */}
      {isMobile && (
        <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2.5 bg-background">
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setDrawerMode('upcoming'); setDrawerOpen(true); }}>
            Próximos ({upcomingAppointments.length})
          </Button>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setDrawerMode('past'); setDrawerOpen(true); }}>
            Passados ({pastAppointments.length})
          </Button>
        </div>
      )}

      {/* Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col min-w-0 bg-card/92 p-3 sm:p-4">
          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[11px] font-bold uppercase text-muted-foreground py-1.5">{d}</div>
            ))}
          </div>

          {/* Weeks */}
          <div className="flex-1 grid overflow-hidden rounded-xl border shadow-sm" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map((day, di) => {
                  const key = day ? toDateKey(day) : `e-${wi}-${di}`;
                  const dayEvents = day ? appointmentsByDate.get(key) || [] : [];
                  const isToday = day && key === todayKey;
                  const { visible, hiddenCount } = partitionDayEvents(dayEvents, isMobile ? 2 : 4);

                  return (
                    <div
                      key={key}
                      className={cn(
                        'group min-h-0 p-1.5 sm:p-2 border-r last:border-r-0 overflow-hidden transition-colors',
                        day ? 'cursor-pointer hover:bg-accent/60' : 'bg-muted/20',
                      )}
                      onClick={() => handleDayClick(day)}
                    >
                      {day && (
                        <>
                          <div className="flex items-center justify-between mb-0.5">
                            <span
                              className={cn(
                                'w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold',
                                isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                              )}
                            >
                              {day.getDate()}
                            </span>
                            {dayEvents.length > 0 && !isMobile && (
                              <span className="text-[10px] text-muted-foreground">{dayEvents.length}</span>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {visible.map((evt) => (
                              <div
                                key={evt.id}
                                className={cn(
                                  'truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white cursor-pointer',
                                  EVENT_TYPE_COLORS[evt.appointment_type] || 'bg-gray-500',
                                )}
                                onClick={(e) => { e.stopPropagation(); openEdit(evt); }}
                                title={`${fmtHour(evt.start_at)} ${evt.title}`}
                              >
                                {fmtHour(evt.start_at)} {evt.client_company_name || evt.title}
                              </div>
                            ))}
                            {hiddenCount > 0 && (
                              <div className="text-[10px] text-muted-foreground text-center">+{hiddenCount} mais</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="w-96 border-l bg-card/84 flex flex-col">
            {/* Upcoming */}
            <div className="flex-1 flex flex-col min-h-0 border-b">
              <div className="px-5 py-3.5 border-b sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Próximos Eventos
                  <span className="text-xs text-muted-foreground font-normal">({upcomingAppointments.length})</span>
                </h2>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {upcomingAppointments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">Nenhum evento próximo</p>
                  ) : (
                    upcomingAppointments.slice(0, 20).map((evt) => renderEventCard(evt))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Past */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-5 py-3.5 border-b sticky top-0 z-10 bg-card/95 backdrop-blur-sm flex items-center justify-between">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" /> Eventos Passados
                  <span className="text-xs text-muted-foreground font-normal">({pastAppointments.length})</span>
                </h2>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setArchiveModalOpen(true)}>
                  <Archive className="mr-1 h-3 w-3" /> Arquivo
                </Button>
              </div>
              <div className="border-b bg-primary/10 px-5 py-2 text-center text-[11px] text-primary">
                Clique para registrar o feedback dos eventos
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {pastAppointments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">Nenhum evento passado pendente</p>
                  ) : (
                    pastAppointments.slice(0, 20).map((evt) => renderEventCard(evt))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>{drawerTitle}</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="px-4 pb-4 flex-1">
            {drawerMode === 'day' && (
              <Button size="sm" className="w-full mb-3" onClick={() => {
                setDrawerOpen(false);
                if (drawerDayKey) {
                  const [y, m, d] = drawerDayKey.split('-').map(Number);
                  openCreate(new Date(y, m - 1, d));
                }
              }}>
                <Plus className="mr-1.5 h-4 w-4" /> Novo agendamento neste dia
              </Button>
            )}
            <div className="space-y-2">
              {drawerEvents.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum evento</p>
              ) : (
                drawerEvents.map((evt) => renderEventCard(evt))
              )}
            </div>
            {drawerMode === 'past' && (
              <Button variant="outline" className="w-full mt-3" onClick={() => { setDrawerOpen(false); setArchiveModalOpen(true); }}>
                <Archive className="mr-1.5 h-4 w-4" /> Abrir arquivo
              </Button>
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Modals */}
      <CalendarErrorBoundary onError={() => { setAppointmentModalOpen(false); setEditingAppointment(null); }}>
        <InternalCrmAppointmentModal
          open={appointmentModalOpen}
          onOpenChange={(open) => {
            setAppointmentModalOpen(open);
            if (!open) { setEditingAppointment(null); setDefaultStartAt(null); }
          }}
          appointment={editingAppointment}
          clients={clients}
          deals={openDeals}
          defaultStartAt={defaultStartAt}
          isSubmitting={calendarModule.upsertAppointmentMutation.isPending}
          onSave={handleSaveAppointment}
          onDelete={handleDeleteAppointment}
        />
      </CalendarErrorBoundary>

      <InternalCrmEventFeedbackModal
        open={feedbackModalOpen}
        onOpenChange={(open) => { setFeedbackModalOpen(open); if (!open) setFeedbackAppointment(null); }}
        appointment={feedbackAppointment}
        isSubmitting={calendarModule.upsertAppointmentMutation.isPending}
        onSave={handleSaveFeedback}
      />

      <InternalCrmEventArchiveModal
        open={archiveModalOpen}
        onOpenChange={setArchiveModalOpen}
        appointments={filteredAppointments}
        onEdit={openEdit}
      />
    </div>
  );
}
