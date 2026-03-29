import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  TokenBadge,
  formatDateOnly,
  formatDateTime,
} from '@/modules/internal-crm/components/InternalCrmUi';
import { InternalCrmAppointmentModal } from '@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal';
import { InternalCrmCalendarFilters } from '@/modules/internal-crm/components/calendar/InternalCrmCalendarFilters';
import { InternalCrmEventFeedbackModal } from '@/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal';
import { useInternalCrmCalendar } from '@/modules/internal-crm/hooks/useInternalCrmCalendar';
import type { InternalCrmAppointment } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date): string {
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatHourMinute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function buildCalendarCells(anchorDate: Date): Array<Date | null> {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const startDay = (firstDay.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];

  for (let index = 0; index < startDay; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function defaultStartAtForDay(day: Date): string {
  const defaultStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0, 0, 0);
  return defaultStart.toISOString();
}

export function InternalCrmCalendarView() {
  const { toast } = useToast();
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<InternalCrmAppointment | null>(null);
  const [feedbackAppointment, setFeedbackAppointment] = useState<InternalCrmAppointment | null>(null);
  const [defaultStartAt, setDefaultStartAt] = useState<string | null>(null);

  const calendarModule = useInternalCrmCalendar({
    monthAnchor,
    status: statusFilter === 'all' ? undefined : statusFilter,
    client_id: clientFilter === 'all' ? undefined : clientFilter,
  });

  const appointments = calendarModule.appointmentsQuery.data?.appointments || [];
  const clients = calendarModule.clientsQuery.data?.clients || [];

  const calendarCells = useMemo(() => buildCalendarCells(monthAnchor), [monthAnchor]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, InternalCrmAppointment[]>();

    for (const appointment of appointments) {
      const startDate = new Date(appointment.start_at);
      if (Number.isNaN(startDate.getTime())) continue;
      const key = toDateKey(startDate);
      const list = map.get(key) || [];
      list.push(appointment);
      map.set(key, list);
    }

    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
      );
    }

    return map;
  }, [appointments]);

  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    return [...appointments]
      .filter((appointment) => new Date(appointment.start_at).getTime() >= now - 24 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 12);
  }, [appointments]);

  function shiftMonth(offset: number) {
    setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function openCreateAppointment(day?: Date) {
    setEditingAppointment(null);
    setDefaultStartAt(day ? defaultStartAtForDay(day) : new Date().toISOString());
    setAppointmentModalOpen(true);
  }

  function openEditAppointment(appointment: InternalCrmAppointment) {
    setEditingAppointment(appointment);
    setDefaultStartAt(null);
    setAppointmentModalOpen(true);
  }

  async function handleSaveAppointment(payload: Record<string, unknown>) {
    try {
      await calendarModule.upsertAppointmentMutation.mutateAsync({
        action: 'upsert_appointment',
        ...payload,
      });
      toast({ title: 'Compromisso salvo', description: 'Agenda atualizada com sucesso.' });
      setAppointmentModalOpen(false);
      setEditingAppointment(null);
      setDefaultStartAt(null);
    } catch {
      toast({
        title: 'Falha ao salvar compromisso',
        description: 'Nao foi possivel salvar o evento no calendario interno.',
        variant: 'destructive',
      });
    }
  }

  async function handleSaveFeedback(payload: { status: InternalCrmAppointment['status']; notes: string }) {
    if (!feedbackAppointment) return;

    try {
      await calendarModule.upsertAppointmentMutation.mutateAsync({
        action: 'upsert_appointment',
        appointment_id: feedbackAppointment.id,
        client_id: feedbackAppointment.client_id,
        deal_id: feedbackAppointment.deal_id,
        owner_user_id: feedbackAppointment.owner_user_id,
        title: feedbackAppointment.title,
        appointment_type: feedbackAppointment.appointment_type,
        status: payload.status,
        start_at: feedbackAppointment.start_at,
        end_at: feedbackAppointment.end_at,
        location: feedbackAppointment.location,
        notes: payload.notes || feedbackAppointment.notes,
      });

      toast({ title: 'Feedback registrado', description: 'Status e observacoes atualizados.' });
      setFeedbackModalOpen(false);
      setFeedbackAppointment(null);
    } catch {
      toast({
        title: 'Falha ao registrar feedback',
        description: 'Nao foi possivel atualizar este compromisso.',
        variant: 'destructive',
      });
    }
  }

  const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendarios"
        subtitle="Controle de demos, reunioes e follow-ups para nao deixar oportunidades esfriar."
        icon={CalendarDays}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm font-semibold">{formatMonthLabel(monthAnchor)}</p>

        <Button variant="outline" onClick={() => setMonthAnchor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Voltar para mes atual
        </Button>
      </div>

      <InternalCrmCalendarFilters
        status={statusFilter}
        onStatusChange={setStatusFilter}
        clientId={clientFilter}
        onClientIdChange={setClientFilter}
        clients={clients}
        onCreateAppointment={() => openCreateAppointment()}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>Visao mensal</span>
              {calendarModule.appointmentsQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {weekdayLabels.map((label) => (
                <div key={label} className="rounded-md bg-muted/40 py-1 text-center text-xs font-medium text-muted-foreground">
                  {label}
                </div>
              ))}

              {calendarCells.map((day, index) => {
                const dateKey = day ? toDateKey(day) : `empty-${index}`;
                const dayAppointments = day ? appointmentsByDate.get(dateKey) || [] : [];
                const isToday =
                  day &&
                  toDateKey(day) === toDateKey(new Date());

                return (
                  <div
                    key={`${dateKey}-${index}`}
                    className={cn(
                      'min-h-[130px] rounded-lg border p-2',
                      day ? 'cursor-pointer border-border/70 hover:bg-accent/35' : 'border-transparent bg-muted/20',
                    )}
                    onClick={() => {
                      if (day) openCreateAppointment(day);
                    }}
                  >
                    {day ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className={cn('text-xs font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                            {day.getDate()}
                          </p>
                          {dayAppointments.length > 0 ? (
                            <span className="text-[11px] text-muted-foreground">{dayAppointments.length}</span>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-1">
                          {dayAppointments.slice(0, 3).map((appointment) => (
                            <button
                              key={appointment.id}
                              className="w-full rounded-md border border-border/60 px-2 py-1 text-left text-[11px] hover:bg-background"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditAppointment(appointment);
                              }}
                            >
                              <p className="font-medium">{formatHourMinute(appointment.start_at)}</p>
                              <p className="truncate text-muted-foreground">{appointment.title}</p>
                            </button>
                          ))}

                          {dayAppointments.length > 3 ? (
                            <p className="text-[11px] text-muted-foreground">+{dayAppointments.length - 3} compromisso(s)</p>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agenda e feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {calendarModule.appointmentsQuery.isError ? (
              <p className="rounded-xl border border-dashed border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
                Falha ao carregar compromissos deste periodo.
              </p>
            ) : null}

            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum compromisso relevante para este periodo.</p>
            ) : (
              upcomingAppointments.map((appointment) => (
                <div key={appointment.id} className="space-y-2 rounded-xl border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{appointment.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {appointment.client_company_name || 'Cliente nao identificado'}
                      </p>
                    </div>
                    <TokenBadge token={appointment.status} />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(appointment.start_at)}
                    {appointment.end_at ? ` ate ${formatDateOnly(appointment.end_at)}` : ''}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditAppointment(appointment)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFeedbackAppointment(appointment);
                        setFeedbackModalOpen(true);
                      }}
                    >
                      <ClipboardCheck className="mr-2 h-3.5 w-3.5" />
                      Registrar feedback
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <InternalCrmAppointmentModal
        open={appointmentModalOpen}
        onOpenChange={(open) => {
          setAppointmentModalOpen(open);
          if (!open) {
            setEditingAppointment(null);
            setDefaultStartAt(null);
          }
        }}
        appointment={editingAppointment}
        clients={clients}
        defaultStartAt={defaultStartAt}
        isSubmitting={calendarModule.upsertAppointmentMutation.isPending}
        onSave={handleSaveAppointment}
      />

      <InternalCrmEventFeedbackModal
        open={feedbackModalOpen}
        onOpenChange={(open) => {
          setFeedbackModalOpen(open);
          if (!open) setFeedbackAppointment(null);
        }}
        appointment={feedbackAppointment}
        isSubmitting={calendarModule.upsertAppointmentMutation.isPending}
        onSave={handleSaveFeedback}
      />
    </div>
  );
}
