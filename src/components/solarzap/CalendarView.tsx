import React, { Component, ReactNode, useState, useMemo } from 'react';
import { Appointment, Contact } from '@/types/solarzap';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, Video, Calendar as CalendarIcon, Clock, MapPin, Archive, History, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useLeads } from '@/hooks/domain/useLeads';
import { AppointmentModal } from './AppointmentModal';
import { format, isSameDay, parseISO, startOfDay, endOfDay, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarFilters, CalendarFilterState } from './calendar/CalendarFilters';
import { EventFeedbackModal } from './calendar/EventFeedbackModal';
import { EventArchiveModal } from './calendar/EventArchiveModal';
import { useToast } from '@/hooks/use-toast';

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
  completed: 'bg-slate-100 text-slate-700',
  rescheduled: 'bg-orange-100 text-orange-700'
};

export function CalendarView({ contacts: propContacts }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { appointments, isLoading } = useAppointments();
  const { contacts: hookContacts } = useLeads();
  const contacts = hookContacts.length > 0 ? hookContacts : (propContacts || []);
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
    return applyFilters(appointments, mainFilters);
  }, [appointments, mainFilters]);

  // --- Sidebar Logic ---
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date();

    // Split all non-completed appointments first based on time
    const allActive = appointments.filter(a => a.status !== 'completed'); // Base filter

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
  }, [appointments, upcomingFilters, pastFilters]);


  const getContactName = (item: Appointment) => {
    if (item.leads?.nome) return item.leads.nome;
    return contacts.find(c => c.id === String(item.lead_id))?.name || 'Cliente';
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
    setSelectedAppointment(undefined);
    setModalDate(new Date());
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
      setSelectedAppointment(evt);
      setModalDate(undefined);
      setAppointmentModalOpen(true);
    }
  };

  const handleDayClick = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(9, 0, 0, 0);
    setSelectedAppointment(undefined);
    setModalDate(date);
    setAppointmentModalOpen(true);
  };

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
        className="group relative p-3 bg-white rounded-xl border border-border/60 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
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
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-primary/10 via-background to-purple-500/10 border-b px-6 py-5 shadow-sm z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Calendário</h1>
              <p className="text-sm text-muted-foreground">Gestão de Agenda</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCreateEvent} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2 font-semibold h-10">
              <Plus className="w-4 h-4" />
              Novo Agendamento
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Calendar Grid */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Main Filters & Navigation Bar */}
          <div className="relative px-6 py-4 border-b border-border/50 flex items-center min-h-[72px]">

            {/* Left: Filter Toggle & Filters */}
            <div className="flex items-center gap-4 z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "h-9 w-9 p-0 rounded-lg border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all text-xs",
                  showFilters && "border-primary text-primary bg-primary/5 shadow-sm ring-2 ring-primary/10"
                )}
                title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
              >
                <Filter className="w-4 h-4" />
              </Button>

              {showFilters && (
                <div className="animate-in fade-in slide-in-from-left-2 duration-300 origin-left">
                  <CalendarFilters filters={mainFilters} onChange={setMainFilters} className="w-full sm:w-auto bg-white p-0.5 rounded-lg" />
                </div>
              )}
            </div>

            {/* Navigation - Centered when filters closed, Right when open */}
            <div className={cn(
              "flex items-center gap-4 transition-all duration-500 ease-in-out",
              showFilters ? "ml-auto translate-x-0" : "absolute left-1/2 -translate-x-1/2"
            )}>
              <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-primary">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-lg font-bold capitalize min-w-[160px] text-center text-slate-800 tracking-tight">
                {monthName}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-primary">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>



          <div className="flex-1 flex flex-col p-6 overflow-auto">
            {/* Days Header */}
            <div className="grid grid-cols-7 mb-4">
              {daysOfWeek.map(day => (
                <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {day}
                </div>
              ))}
            </div>

            {/* Weeks Grid */}
            <div className="flex-1 grid grid-rows-6 border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0 h-full">
                  {week.map((day, dayIndex) => {
                    const dayEvents = day ? getEventsForDate(day) : [];
                    return (
                      <div
                        key={dayIndex}
                        onClick={() => day && handleDayClick(day)}
                        className={cn(
                          "p-2 border-r border-slate-100 last:border-r-0 relative transition-colors h-full min-h-[100px] group",
                          day ? "cursor-pointer hover:bg-slate-50" : "bg-slate-50/50"
                        )}
                      >
                        {day && (
                          <>
                            <div className="flex justify-between items-start mb-2">
                              <span className={cn(
                                "text-sm font-semibold w-8 h-8 flex items-center justify-center rounded-full transition-all",
                                isToday(day)
                                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30 scale-110'
                                  : 'text-slate-600 group-hover:bg-white group-hover:shadow-sm'
                              )}>
                                {day}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {dayEvents.slice(0, 4).map(event => (
                                <div
                                  key={event.id}
                                  onClick={(e) => handleEventClick(event, e)}
                                  className={cn(
                                    EVENT_TYPE_COLORS[event.type] || 'bg-primary',
                                    "text-white text-[10px] px-2 py-1 rounded-[4px] truncate shadow-sm",
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
                              {dayEvents.length > 4 && (
                                <div className="text-[10px] text-slate-400 font-medium text-center py-0.5">
                                  +{dayEvents.length - 4} mais
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

        {/* Sidebar - Split View */}
        <div className="w-96 border-l border-border bg-slate-50 flex flex-col shadow-[0_0_15px_rgba(0,0,0,0.03)] z-30">

          {/* Top: Upcoming Events */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-border/60 bg-white">
            <div className="px-5 py-4 border-b border-border/50 bg-white sticky top-0 z-10 flex items-center justify-start gap-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Próximos Eventos
              </h2>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-primary">
                    <Filter className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-2">
                  <CalendarFilters filters={upcomingFilters} onChange={setUpcomingFilters} className="flex-col items-stretch gap-2 [&_button]:w-full [&_button]:justify-start" />
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
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
            <div className="px-5 py-3 border-b border-border/50 flex justify-between items-center bg-slate-100/50">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2.5">
                  <History className="w-4 h-4 text-orange-500" />
                  Eventos Passados
                </h2>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-primary">
                      <Filter className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-2">
                    <CalendarFilters filters={pastFilters} onChange={setPastFilters} className="flex-col items-stretch gap-2 [&_button]:w-full [&_button]:justify-start" />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setArchiveModalOpen(true)}
                className="h-7 text-xs gap-1.5 text-slate-600 hover:text-primary hover:bg-white"
              >
                <Archive className="w-3.5 h-3.5" />
                Arquivo
              </Button>
            </div>

            <div className="px-5 py-2.5 bg-yellow-50/50 text-yellow-700/80 text-xs border-b border-yellow-100/50 leading-relaxed font-medium text-center">
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
        </div>
      </div>

      {/* Modals */}
      <CalendarAppointmentErrorBoundary
        key={`appt-${appointmentModalOpen ? 'open' : 'closed'}-${selectedAppointment?.id ?? 'new'}-${modalDate?.getTime() ?? 'none'}`}
        onError={handleAppointmentModalError}
      >
        <AppointmentModal
          isOpen={appointmentModalOpen}
          onClose={() => setAppointmentModalOpen(false)}
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
      />
    </div>
  );
}
