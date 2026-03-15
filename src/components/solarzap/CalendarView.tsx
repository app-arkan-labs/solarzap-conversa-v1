import React, { Component, ReactNode, useMemo, useState } from 'react';
import { Appointment, Contact } from '@/types/solarzap';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, Video, Calendar as CalendarIcon, Clock, MapPin, Archive, History, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { AppointmentModal } from './AppointmentModal';
import { format, isSameDay, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarFilters, CalendarFilterState } from './calendar/CalendarFilters';
import { EventFeedbackModal } from './calendar/EventFeedbackModal';
import { EventArchiveModal } from './calendar/EventArchiveModal';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from './PageHeader';
import { LeadScopeSelect, type LeadScopeValue } from './LeadScopeSelect';
import type { MemberDto } from '@/lib/orgAdminClient';
import { useBillingBlocker } from '@/contexts/BillingBlockerContext';
import { buildTabBlocker } from '@/lib/billingBlocker';
import { partitionDayEvents } from '@/lib/calendarDayEvents';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

type CalendarAppointmentErrorBoundaryProps = {
  children: ReactNode;
  onError: () => void;
};

type CalendarAppointmentErrorBoundaryState = {
  hasError: boolean;
};

class CalendarAppointmentErrorBoundary extends Component<
  CalendarAppointmentErrorBoundaryProps,
  CalendarAppointmentErrorBoundaryState
> {
  state: CalendarAppointmentErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CalendarAppointmentErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[calendar-appointment-modal-error]', error, errorInfo);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface CalendarViewProps {
  contacts?: Contact[];
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  leadScopeLoading?: boolean;
  currentUserId?: string | null;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  call: 'bg-blue-500',
  chamada: 'bg-blue-500',
  visit: 'bg-orange-500',
  visita: 'bg-orange-500',
  installation: 'bg-red-500',
  instalacao: 'bg-red-500',
  meeting: 'bg-purple-500',
  reuniao: 'bg-purple-500',
  other: 'bg-gray-500'
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  call: 'Ligação',
  chamada: 'Ligação',
  visit: 'Visita Técnica',
  visita: 'Visita Técnica',
  installation: 'Instalação',
  instalacao: 'Instalação',
  meeting: 'Reunião',
  reuniao: 'Reunião',
  other: 'Outro'
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  canceled: 'Cancelado',
  completed: 'Concluído',
  rescheduled: 'Reagendado'
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  canceled: 'bg-red-100 text-red-700',
  completed: 'bg-muted text-foreground/80',
  rescheduled: 'bg-orange-100 text-orange-700'
};

export function CalendarView({
  contacts: propContacts,
  canViewTeam = false,
  leadScope = 'mine',
  onLeadScopeChange,
  leadScopeMembers = [],
  leadScopeLoading = false,
  currentUserId = null,
}: CalendarViewProps) {
  const isMobileViewport = useMobileViewport();
  const { billing, openBillingBlocker } = useBillingBlocker();
  const [currentDate, setCurrentDate] = useState(new Date());
  const readScope = canViewTeam && leadScope !== 'mine' ? 'org' : 'mine';
  const { appointments } = useAppointments({ readScope });
  const contacts = propContacts || [];
  const contactByLeadId = useMemo(
    () => new Map(contacts.map((contact) => [String(contact.id), contact])),
    [contacts],
  );
  const scopedAppointments = useMemo(
    () => appointments.filter((appointment) => contactByLeadId.has(String(appointment.lead_id))),
    [appointments, contactByLeadId],
  );
  const { toast } = useToast();

  // Filter States - Independent for each section
  const [mainFilters, setMainFilters] = useState<CalendarFilterState>({});
  const [upcomingFilters, setUpcomingFilters] = useState<CalendarFilterState>({});
  const [pastFilters, setPastFilters] = useState<CalendarFilterState>({});
  const [showFilters, setShowFilters] = useState(false);

  // Modals State
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | undefined>(undefined);
  const [modalDate, setModalDate] = useState<Date | undefined>(undefined);

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackEvent, setFeedbackEvent] = useState<Appointment | undefined>(undefined);

  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileDrawerMode, setMobileDrawerMode] = useState<'day' | 'upcoming' | 'past'>('upcoming');
  const [mobileSelectedDate, setMobileSelectedDate] = useState<Date | null>(null);

  const handleAppointmentModalError = () => {
    setAppointmentModalOpen(false);
    setSelectedAppointment(undefined);
    setModalDate(undefined);
    toast({
      title: 'Erro ao abrir agendamento',
      description: 'Ocorreu um erro. Tente novamente.',
      variant: 'destructive',
    });
  };

  // --- Filtering Helper ---
  const applyFilters = (list: Appointment[], currentFilters: CalendarFilterState) => {
    return list.filter(appt => {
      if (appt.status === 'completed') return false; // Default exclusion for active views

      // Type Filter
      if (currentFilters.type && appt.type !== currentFilters.type) return false;

      // Lead Source Filter
      if (currentFilters.channel) {
        const contact = contactByLeadId.get(String(appt.lead_id));
        if (!contact || contact.channel !== currentFilters.channel) return false;
      }

      // Client Filter
      if (currentFilters.clientId && String(appt.lead_id) !== currentFilters.clientId) return false;

      // Date Range Filter
      const apptDate = parseISO(appt.start_at);
      if (currentFilters.startDate) {
        if (apptDate < startOfDay(currentFilters.startDate)) return false;
      }
      if (currentFilters.endDate) {
        if (apptDate > endOfDay(currentFilters.endDate)) return false;
      }

      return true;
    });
  };

  // --- Main Calendar Logic ---
  const filteredAppointments = useMemo(() => {
    return applyFilters(scopedAppointments, mainFilters);
  }, [mainFilters, scopedAppointments]);

  // --- Sidebar Logic ---
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date();

    // Split all non-completed appointments first based on time
    const allActive = scopedAppointments.filter(a => a.status !== 'completed'); // Base filter

    const upcoming = allActive.filter(a => {
      const t = parseISO(a.start_at).getTime();
      return t >= now.getTime();
    });

    const past = allActive.filter(a => {
      const t = parseISO(a.start_at).getTime();
      return t < now.getTime();
    });

    // Apply independent filters
    const filteredUpcoming = applyFilters(upcoming, upcomingFilters); // Re-applies status check but redundant is fine
    const filteredPast = applyFilters(past, pastFilters);

    filteredUpcoming.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    filteredPast.sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

    return { upcomingEvents: filteredUpcoming, pastEvents: filteredPast };
  }, [pastFilters, scopedAppointments, upcomingFilters]);


  const getContactName = (item: Appointment) => {
    if (item.leads?.nome) return item.leads.nome;
    return contactByLeadId.get(String(item.lead_id))?.name || 'Cliente';
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startingDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const getEventsForDate = (day: number) => {
    const date = new Date(year, month, day);
    return filteredAppointments.filter(e => isSameDay(parseISO(e.start_at), date));
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const calendarDays: (number | null)[] = [];
  for (let i = startingDayOfWeek - 1; i >= 0; i--) calendarDays.push(null);
  for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) weeks.push(calendarDays.slice(i, i + 7));

  // --- Handlers ---

  const handleCreateEvent = () => {
    const blocker = buildTabBlocker('calendario', billing);
    if (blocker) {
      openBillingBlocker(blocker);
      return;
    }
    setSelectedAppointment(undefined);
    setModalDate(new Date());
    setAppointmentModalOpen(true);
  };

  const openCreateEventForDate = (date: Date) => {
    const blocker = buildTabBlocker('calendario', billing);
    if (blocker) {
      openBillingBlocker(blocker);
      return;
    }

    const nextDate = new Date(date);
    const now = new Date();
    const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    nextDate.setHours(now.getHours(), roundedMinutes, 0, 0);
    setSelectedAppointment(undefined);
    setModalDate(nextDate);
    setAppointmentModalOpen(true);
  };

  const handleEventClick = (evt: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    const apptDate = parseISO(evt.start_at);
    const now = new Date();

    if (apptDate.getTime() < now.getTime()) {
      setFeedbackEvent(evt);
      setFeedbackModalOpen(true);
    } else {
      const blocker = buildTabBlocker('calendario', billing);
      if (blocker) {
        openBillingBlocker(blocker);
        return;
      }
      setSelectedAppointment(evt);
      setModalDate(undefined);
      setAppointmentModalOpen(true);
    }
  };

  const handleDayClick = (day: number) => {
    const blocker = buildTabBlocker('calendario', billing);
    if (blocker) {
      openBillingBlocker(blocker);
      return;
    }
    const date = new Date(year, month, day);
    if (isMobileViewport) {
      setMobileSelectedDate(date);
      setMobileDrawerMode('day');
      setMobileDrawerOpen(true);
      return;
    }
    const now = new Date();
    // Use next rounded 15-min slot instead of hardcoded 9:00
    const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    date.setHours(now.getHours(), roundedMinutes, 0, 0);
    setSelectedAppointment(undefined);
    setModalDate(date);
    setAppointmentModalOpen(true);
  };

  const mobileDayEvents = useMemo(() => {
    if (!mobileSelectedDate) return [] as Appointment[];
    return filteredAppointments.filter((event) => isSameDay(parseISO(event.start_at), mobileSelectedDate));
  }, [filteredAppointments, mobileSelectedDate]);

  const mobileDrawerTitle = mobileDrawerMode === 'day'
    ? mobileSelectedDate
      ? format(mobileSelectedDate, "dd 'de' MMMM", { locale: ptBR })
      : 'Eventos do dia'
    : mobileDrawerMode === 'upcoming'
      ? 'Próximos eventos'
      : 'Eventos passados';

  const mobileDrawerEvents = mobileDrawerMode === 'day'
    ? mobileDayEvents
    : mobileDrawerMode === 'upcoming'
      ? upcomingEvents
      : pastEvents;

  const renderSidebarEvent = (event: Appointment) => {
    const isPast = new Date(event.start_at) < new Date() && event.status !== 'completed';
    // User requested "Agendado" instead of "scheduled".
    // Also, effectively handle "Past Scheduled" events as "Pendente" to avoid confusion.

    let displayStatus = STATUS_LABELS[event.status] || event.status;
    let statusColor = STATUS_COLORS[event.status] || "bg-gray-100 text-gray-700";

    if (isPast && event.status === 'scheduled') {
      displayStatus = "Pendente";
      statusColor = "bg-yellow-100 text-yellow-700";
    }

    return (
      <div
        key={event.id}
        onClick={(e) => handleEventClick(event, e)}
        className="group relative cursor-pointer rounded-xl border border-border/60 bg-card/96 p-3 transition-all hover:border-primary/50 hover:shadow-md"
      >
        <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${EVENT_TYPE_COLORS[event.type] || 'bg-primary'}`} />
        <div className="pl-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary/80 uppercase tracking-wider">
              {EVENT_TYPE_LABELS[event.type]}
            </span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              statusColor
            )}>
              {displayStatus}
            </span>
          </div>
          <div className="font-semibold text-sm text-foreground/90 line-clamp-1 group-hover:text-primary transition-colors">
            {event.title}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {format(parseISO(event.start_at), 'dd/MM HH:mm')}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span className="max-w-[80px] truncate">{event.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  };

  return (
    <div className="flex-1 flex flex-col bg-muted/30 h-full overflow-hidden">
      <PageHeader
        title="Calendário"
        subtitle="Gestão de Agenda"
        icon={CalendarIcon}
        className="z-20"
        actionContent={
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {canViewTeam && onLeadScopeChange ? (
              <LeadScopeSelect
                value={leadScope}
                onChange={onLeadScopeChange}
                members={leadScopeMembers}
                loading={leadScopeLoading}
                currentUserId={currentUserId}
                testId="calendar-owner-scope-trigger"
              />
            ) : null}
            <Button data-testid="calendar-create-appointment" onClick={handleCreateEvent} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2 font-semibold h-10 w-full sm:w-auto">
              <Plus className="w-4 h-4" />
              Novo Agendamento
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Calendar Grid */}
        <div className="flex-1 flex flex-col min-w-0 bg-card/92 backdrop-blur-sm">

          {/* Main Filters & Navigation Bar */}
          <div className="relative px-4 py-4 sm:px-6 border-b border-border/50 flex min-h-[72px] flex-wrap items-center gap-3">

            {/* Left: Filter Toggle & Filters */}
            <div className="flex items-center gap-3 z-10 min-w-0 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "h-9 w-9 p-0 rounded-lg border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all text-xs",
                  showFilters && "border-primary text-primary bg-primary/5 shadow-sm ring-2 ring-primary/10"
                )}
                title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
              >
                <Filter className="w-4 h-4" />
              </Button>

              {showFilters && (
                <div className="animate-in fade-in slide-in-from-left-2 duration-300 origin-left max-w-full">
                  <CalendarFilters
                    filters={mainFilters}
                    onChange={setMainFilters}
                    contacts={contacts}
                    className="w-full sm:w-auto bg-card/92 p-0.5 rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Navigation - Centered when filters closed, Right when open */}
            <div className={cn(
              "flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-4 transition-all duration-500 ease-in-out",
              showFilters || isMobileViewport ? "ml-auto translate-x-0" : "absolute left-1/2 -translate-x-1/2"
            )}>
              <button onClick={prevMonth} className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-primary">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="min-w-[110px] flex-1 text-center text-base font-bold capitalize tracking-tight text-foreground sm:min-w-[160px] sm:flex-none sm:text-lg">
                {monthName}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-primary">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {isMobileViewport && (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-border/50 bg-background/80 px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Button
                variant={mobileDrawerMode === 'upcoming' ? 'default' : 'outline'}
                size="sm"
                className="h-9 shrink-0 rounded-full"
                onClick={() => {
                  setMobileDrawerMode('upcoming');
                  setMobileDrawerOpen(true);
                }}
              >
                Próximos ({upcomingEvents.length})
              </Button>
              <Button
                variant={mobileDrawerMode === 'past' ? 'default' : 'outline'}
                size="sm"
                className="h-9 shrink-0 rounded-full"
                onClick={() => {
                  setMobileDrawerMode('past');
                  setMobileDrawerOpen(true);
                }}
              >
                Passados ({pastEvents.length})
              </Button>
            </div>
          )}
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="min-w-[540px] sm:min-w-[640px] md:min-w-0">
              {/* Days Header */}
              <div className="mb-4 grid grid-cols-7">
                {daysOfWeek.map(day => (
                  <div key={day} className="text-center text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:text-xs sm:tracking-widest">
                    {day}
                  </div>
                ))}
              </div>

              {/* Weeks Grid */}
              <div className="flex-1 grid grid-rows-6 overflow-hidden rounded-xl border border-border bg-card/94 shadow-sm">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid h-full grid-cols-7 border-b border-border/60 last:border-b-0">
                  {week.map((day, dayIndex) => {
                    const dayEvents = day ? getEventsForDate(day) : [];
                    const dayEventPartition = partitionDayEvents(dayEvents, 4);
                    return (
                      <div
                        key={dayIndex}
                        onClick={() => day && handleDayClick(day)}
                        className={cn(
                          "group relative h-full min-h-[88px] border-r border-border/60 p-2 transition-colors last:border-r-0 sm:min-h-[100px]",
                          day ? "cursor-pointer hover:bg-accent/60" : "bg-muted/30"
                        )}
                      >
                        {day && (
                          <>
                            <div className="flex justify-between items-start mb-2">
                              <span className={cn(
                                "text-sm font-semibold w-8 h-8 flex items-center justify-center rounded-full transition-all",
                                isToday(day)
                                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30 scale-110'
                                  : 'text-foreground/80 group-hover:bg-card group-hover:shadow-sm'
                              )}>
                                {day}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {dayEventPartition.visible.map(event => (
                                <div
                                  key={event.id}
                                  onClick={(e) => handleEventClick(event, e)}
                                  className={cn(
                                    EVENT_TYPE_COLORS[event.type] || 'bg-primary',
                                    "truncate rounded-[4px] px-1.5 py-1 text-[9px] text-white shadow-sm sm:px-2 sm:text-[10px]",
                                    "hover:brightness-110 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer"
                                  )}
                                  title={`${event.title} - ${format(parseISO(event.start_at), 'HH:mm')}`}
                                >
                                  {['reuniao', 'meeting', 'chamada', 'call'].includes(event.type) && (
                                    <Video className="w-3 h-3 flex-shrink-0" />
                                  )}
                                  <span className="truncate font-medium">
                                    {format(parseISO(event.start_at), 'HH:mm')} {getContactName(event)}
                                  </span>
                                </div>
                              ))}
                              {dayEventPartition.hiddenCount > 0 && (
                                <div className="text-[10px] text-muted-foreground font-medium text-center py-0.5">
                                  +{dayEventPartition.hiddenCount} mais
                                </div>
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
          </div>
        </div>

        {/* Sidebar - Split View */}
        {!isMobileViewport && <div className="w-96 border-l border-border bg-card/84 flex flex-col shadow-[0_0_15px_rgba(0,0,0,0.03)] dark:shadow-[0_0_18px_rgba(2,6,23,0.28)] z-30 backdrop-blur-sm">

          {/* Top: Upcoming Events */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-border/60 bg-card/92">
            <div className="px-5 py-4 border-b border-border/50 bg-card/92 sticky top-0 z-10 flex items-center justify-start gap-4">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Próximos Eventos
              </h2>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary">
                    <Filter className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-2">
                  <CalendarFilters
                    filters={upcomingFilters}
                    onChange={setUpcomingFilters}
                    contacts={contacts}
                    className="flex-col items-stretch gap-2 [&_button]:w-full [&_button]:justify-start"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-3.5">
                {upcomingEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-muted-foreground space-y-2">
                    <CalendarIcon className="w-8 h-8 opacity-20" />
                    <p className="text-sm">Sem eventos futuros.</p>
                  </div>
                ) : (
                  upcomingEvents.map(renderSidebarEvent)
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Bottom: Past Events */}
          <div className="flex-1 flex min-h-0 flex-col bg-muted/25">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/35 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <h2 className="flex items-center gap-2.5 text-sm font-bold text-foreground/84">
                  <History className="w-4 h-4 text-orange-500" />
                  Eventos Passados
                </h2>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary">
                      <Filter className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-2">
                    <CalendarFilters
                      filters={pastFilters}
                      onChange={setPastFilters}
                      contacts={contacts}
                      className="flex-col items-stretch gap-2 [&_button]:w-full [&_button]:justify-start"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setArchiveModalOpen(true)}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-card hover:text-primary"
              >
                <Archive className="w-3.5 h-3.5" />
                Arquivo
              </Button>
            </div>

            <div className="border-b border-primary/15 bg-primary/10 px-5 py-2.5 text-center text-xs font-medium leading-relaxed text-primary/88">
              Clique para registrar o feedback dos eventos
            </div>

            <ScrollArea className="flex-1">
              <div className="p-5 space-y-3.5">
                {pastEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-muted-foreground space-y-2 opacity-60">
                    <p className="text-sm">Nenhum evento recente.</p>
                  </div>
                ) : (
                  pastEvents.map(renderSidebarEvent)
                )}
              </div>
            </ScrollArea>
          </div>
        </div>}
      </div>

      <Drawer open={isMobileViewport && mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{mobileDrawerTitle}</DrawerTitle>
            <DrawerDescription>
              {mobileDrawerMode === 'day'
                ? 'Toque em um evento para abrir ações ou crie um novo compromisso nesta data.'
                : 'Navegue pelos eventos da agenda sem ocupar a lateral no mobile.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-6">
            {mobileDrawerMode === 'day' && mobileSelectedDate ? (
              <Button className="w-full gap-2" onClick={() => openCreateEventForDate(mobileSelectedDate)}>
                <Plus className="h-4 w-4" />
                Novo agendamento neste dia
              </Button>
            ) : null}

            {mobileDrawerEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum evento encontrado nesta visualização.
              </div>
            ) : (
              mobileDrawerEvents.map((event) => renderSidebarEvent(event))
            )}

            {mobileDrawerMode === 'past' ? (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setArchiveModalOpen(true);
                }}
              >
                <Archive className="h-4 w-4" />
                Abrir arquivo completo
              </Button>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Modals */}
      <CalendarAppointmentErrorBoundary
        key={`appt-${appointmentModalOpen ? 'open' : 'closed'}-${selectedAppointment?.id ?? 'new'}-${modalDate?.getTime() ?? 'none'}`}
        onError={handleAppointmentModalError}
      >
        <AppointmentModal
          isOpen={appointmentModalOpen}
          onClose={() => setAppointmentModalOpen(false)}
          contacts={contacts}
          initialData={selectedAppointment}
          defaultDate={modalDate}
        />
      </CalendarAppointmentErrorBoundary>

      <EventFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        appointment={feedbackEvent}
      />

      <EventArchiveModal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        appointments={scopedAppointments}
        contacts={contacts}
      />
    </div>
  );
}
