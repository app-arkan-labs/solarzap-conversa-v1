import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInMinutes, format, isValid } from 'date-fns';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthUserDisplayName, getMemberDisplayName } from '@/lib/memberDisplayName';
import { listMembers } from '@/lib/orgAdminClient';
import { cn } from '@/lib/utils';
import type { Appointment, AppointmentType, Conversation, LeadTask } from '@/types/solarzap';
import { PIPELINE_STAGES } from '@/types/solarzap';

type ConversationActionsSheetProps = {
  conversations: Conversation[];
  appointments: Appointment[];
  nextActionByLeadId: Map<string, LeadTask>;
  selectedConversationId?: string | null;
  onSelectConversation?: (conversation: Conversation) => void;
  onClose: () => void;
  onSaveRow: (input: {
    contact: Conversation['contact'];
    appointmentId?: string | null;
    nextActionTaskId?: string | null;
    title: string;
    type: AppointmentType;
    startAt: Date;
    durationMinutes: number;
    location?: string;
    responsibleUserId: string;
    notes?: string | null;
  }) => Promise<Appointment>;
};

type ResponsibleOption = {
  id: string;
  label: string;
};

type ActionSheetDraft = {
  appointmentId: string | null;
  nextActionTaskId: string | null;
  lastActionTitle: string;
  lastActionMeta: string;
  title: string;
  type: AppointmentType;
  dateTime: string;
  duration: string;
  responsibleUserId: string;
  location: string;
  notes: string;
  isDirty: boolean;
  isSaving: boolean;
};

const GRID_TEMPLATE_COLUMNS = '220px 240px 240px 132px 168px 112px 176px 176px 156px 108px';
const DEFAULT_DURATION = '30';
const DURATION_OPTIONS = ['15', '30', '45', '60', '90', '120'];
const TYPE_OPTIONS: Array<{ value: AppointmentType; label: string }> = [
  { value: 'other', label: 'Outro' },
  { value: 'chamada', label: 'Chamada' },
  { value: 'reuniao', label: 'Reuniao' },
  { value: 'visita', label: 'Visita' },
  { value: 'instalacao', label: 'Instalacao' },
];

const normalizeAppointmentType = (value: unknown): AppointmentType => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (raw === 'call') return 'chamada';
  if (raw === 'visit') return 'visita';
  if (raw === 'meeting') return 'reuniao';
  if (raw === 'installation') return 'instalacao';
  if (raw === 'chamada' || raw === 'visita' || raw === 'reuniao' || raw === 'instalacao' || raw === 'other') {
    return raw;
  }

  return 'other';
};

const toDateTimeInputValue = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!isValid(date)) return '';
  return format(date, "yyyy-MM-dd'T'HH:mm");
};

const formatShortDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!isValid(date)) return '';
  return format(date, 'dd/MM HH:mm');
};

const getDurationMinutes = (appointment: Appointment | null): string => {
  if (!appointment) return DEFAULT_DURATION;

  const start = new Date(appointment.start_at);
  const end = new Date(appointment.end_at);
  if (!isValid(start) || !isValid(end)) return DEFAULT_DURATION;

  const diff = differenceInMinutes(end, start);
  return Number.isFinite(diff) && diff > 0 ? String(diff) : DEFAULT_DURATION;
};

const parseDateTimeInput = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return isValid(parsed) ? parsed : null;
};

export function ConversationActionsSheet({
  conversations,
  appointments,
  nextActionByLeadId,
  selectedConversationId = null,
  onSelectConversation,
  onClose,
  onSaveRow,
}: ConversationActionsSheetProps) {
  const { user, role, orgId } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, ActionSheetDraft>>({});
  const [responsibleOptions, setResponsibleOptions] = useState<ResponsibleOption[]>([]);
  const [isLoadingResponsibles, setIsLoadingResponsibles] = useState(false);
  const isAdminOrOwner = role === 'owner' || role === 'admin';
  const currentUserId = typeof user?.id === 'string' ? user.id : '';
  const currentUserLabel = useMemo(() => {
    const displayName = getAuthUserDisplayName(user);
    if (displayName.trim().length > 0) return displayName;

    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    return email.length > 0 ? email : 'Conta ativa';
  }, [user]);

  const appointmentsById = useMemo(() => {
    const nextMap = new Map<string, Appointment>();
    for (const appointment of appointments) {
      nextMap.set(String(appointment.id), appointment);
    }
    return nextMap;
  }, [appointments]);

  const sortedAppointmentsByLeadId = useMemo(() => {
    const nextMap = new Map<string, Appointment[]>();

    for (const appointment of appointments) {
      const leadId = String(appointment.lead_id);
      const list = nextMap.get(leadId) || [];
      list.push(appointment);
      nextMap.set(leadId, list);
    }

    for (const [leadId, leadAppointments] of nextMap.entries()) {
      leadAppointments.sort((left, right) => {
        const rightTime = new Date(right.start_at).getTime();
        const leftTime = new Date(left.start_at).getTime();
        return rightTime - leftTime;
      });
      nextMap.set(leadId, leadAppointments);
    }

    return nextMap;
  }, [appointments]);

  useEffect(() => {
    let active = true;
    const fallbackOptions = currentUserId ? [{ id: currentUserId, label: currentUserLabel }] : [];

    if (!isAdminOrOwner || !orgId) {
      setResponsibleOptions(fallbackOptions);
      setIsLoadingResponsibles(false);
      return;
    }

    const loadResponsibles = async () => {
      setIsLoadingResponsibles(true);
      try {
        const response = await listMembers(orgId);
        if (!active) return;

        const optionsById = new Map<string, ResponsibleOption>();
        if (currentUserId) {
          optionsById.set(currentUserId, { id: currentUserId, label: currentUserLabel });
        }

        for (const member of response.members || []) {
          const memberId = String(member.user_id || '').trim();
          if (!memberId || optionsById.has(memberId)) continue;
          optionsById.set(memberId, {
            id: memberId,
            label: getMemberDisplayName(member),
          });
        }

        const nextOptions = Array.from(optionsById.values());
        setResponsibleOptions(nextOptions.length > 0 ? nextOptions : fallbackOptions);
      } catch (error) {
        if (!active) return;
        console.warn('[conversation-actions-sheet] failed to load responsibles', error);
        setResponsibleOptions(fallbackOptions);
      } finally {
        if (active) {
          setIsLoadingResponsibles(false);
        }
      }
    };

    void loadResponsibles();
    return () => {
      active = false;
    };
  }, [currentUserId, currentUserLabel, isAdminOrOwner, orgId]);

  const buildDraftForConversation = useCallback((conversation: Conversation): ActionSheetDraft => {
    const leadId = String(conversation.contact.id);
    const nextAction = nextActionByLeadId.get(leadId) || null;
    const linkedAppointment = nextAction?.linkedAppointmentId
      ? appointmentsById.get(String(nextAction.linkedAppointmentId)) || null
      : null;

    const candidateAppointments = sortedAppointmentsByLeadId.get(leadId) || [];
    const now = Date.now();
    const lastPastAppointment = candidateAppointments.find((appointment) => {
      if (linkedAppointment && String(appointment.id) === String(linkedAppointment.id)) return false;
      return new Date(appointment.start_at).getTime() <= now;
    }) || null;
    const lastAnyAppointment = candidateAppointments.find((appointment) => {
      if (linkedAppointment && String(appointment.id) === String(linkedAppointment.id)) return false;
      return true;
    }) || null;
    const lastAppointment = lastPastAppointment || lastAnyAppointment;

    const responsibleUserId =
      linkedAppointment?.user_id ||
      nextAction?.userId ||
      conversation.contact.assignedToUserId ||
      currentUserId;

    return {
      appointmentId: linkedAppointment ? String(linkedAppointment.id) : null,
      nextActionTaskId: nextAction?.id || null,
      lastActionTitle: lastAppointment?.title?.trim() || 'Sem agendamento',
      lastActionMeta: lastAppointment ? formatShortDateTime(lastAppointment.start_at) : '',
      title: linkedAppointment?.title?.trim() || nextAction?.title?.trim() || '',
      type: normalizeAppointmentType(linkedAppointment?.type || 'other'),
      dateTime: toDateTimeInputValue(linkedAppointment?.start_at || nextAction?.dueAt || null),
      duration: getDurationMinutes(linkedAppointment),
      responsibleUserId,
      location: linkedAppointment?.location?.trim() || '',
      notes: linkedAppointment?.notes?.trim() || nextAction?.notes?.trim() || '',
      isDirty: false,
      isSaving: false,
    };
  }, [appointmentsById, currentUserId, nextActionByLeadId, sortedAppointmentsByLeadId]);

  useEffect(() => {
    const nextDrafts: Record<string, ActionSheetDraft> = {};

    for (const conversation of conversations) {
      nextDrafts[String(conversation.contact.id)] = buildDraftForConversation(conversation);
    }

    setDrafts(nextDrafts);
  }, [buildDraftForConversation, conversations]);

  useEffect(() => {
    if (responsibleOptions.length === 0) return;

    const optionIds = new Set(responsibleOptions.map((option) => option.id));
    const fallbackResponsible = currentUserId || responsibleOptions[0]?.id || '';

    setDrafts((currentDrafts) => {
      let changed = false;
      const nextDrafts: Record<string, ActionSheetDraft> = {};

      for (const [leadId, draft] of Object.entries(currentDrafts)) {
        const nextResponsible = optionIds.has(draft.responsibleUserId)
          ? draft.responsibleUserId
          : fallbackResponsible;

        if (nextResponsible !== draft.responsibleUserId) {
          changed = true;
        }

        nextDrafts[leadId] = {
          ...draft,
          responsibleUserId: nextResponsible,
        };
      }

      return changed ? nextDrafts : currentDrafts;
    });
  }, [currentUserId, responsibleOptions]);

  const updateDraft = useCallback((leadId: string, updater: (draft: ActionSheetDraft) => ActionSheetDraft) => {
    setDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[leadId];
      if (!currentDraft) return currentDrafts;

      return {
        ...currentDrafts,
        [leadId]: updater(currentDraft),
      };
    });
  }, []);

  const handleFieldChange = useCallback((
    leadId: string,
    field: keyof Pick<ActionSheetDraft, 'title' | 'type' | 'dateTime' | 'duration' | 'responsibleUserId' | 'location'>,
    value: string,
  ) => {
    updateDraft(leadId, (draft) => ({
      ...draft,
      [field]: field === 'type' ? normalizeAppointmentType(value) : value,
      isDirty: true,
    }));
  }, [updateDraft]);

  const handleSave = useCallback(async (conversation: Conversation) => {
    const leadId = String(conversation.contact.id);
    const draft = drafts[leadId];
    if (!draft || draft.isSaving) return;

    const title = draft.title.trim();
    if (!title) {
      toast({
        title: 'Proxima acao sem titulo',
        description: 'Preencha a coluna de Proxima Acao antes de salvar.',
        variant: 'destructive',
      });
      return;
    }

    const startAt = parseDateTimeInput(draft.dateTime);
    if (!startAt) {
      toast({
        title: 'Data e hora invalidas',
        description: `Defina Data / Hora para ${conversation.contact.name}.`,
        variant: 'destructive',
      });
      return;
    }

    if (startAt.getTime() < Date.now()) {
      toast({
        title: 'Agendamento no passado',
        description: 'A Proxima Acao precisa ficar em uma data futura.',
        variant: 'destructive',
      });
      return;
    }

    const durationMinutes = Number.parseInt(draft.duration, 10);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      toast({
        title: 'Duracao invalida',
        description: 'Escolha uma duracao valida para salvar o evento.',
        variant: 'destructive',
      });
      return;
    }

    const responsibleUserId = String(draft.responsibleUserId || '').trim() || currentUserId;
    if (!responsibleUserId) {
      toast({
        title: 'Responsavel ausente',
        description: 'Selecione um responsavel para continuar.',
        variant: 'destructive',
      });
      return;
    }

    updateDraft(leadId, (currentDraft) => ({
      ...currentDraft,
      isSaving: true,
    }));

    try {
      const savedAppointment = await onSaveRow({
        contact: conversation.contact,
        appointmentId: draft.appointmentId,
        nextActionTaskId: draft.nextActionTaskId,
        title,
        type: normalizeAppointmentType(draft.type),
        startAt,
        durationMinutes,
        location: draft.location.trim(),
        responsibleUserId,
        notes: draft.notes || null,
      });

      updateDraft(leadId, (currentDraft) => ({
        ...currentDraft,
        appointmentId: String(savedAppointment.id),
        title: savedAppointment.title || title,
        type: normalizeAppointmentType(savedAppointment.type || draft.type),
        dateTime: toDateTimeInputValue(savedAppointment.start_at || startAt),
        duration: getDurationMinutes(savedAppointment),
        responsibleUserId: savedAppointment.user_id || responsibleUserId,
        location: savedAppointment.location || draft.location,
        isDirty: false,
        isSaving: false,
      }));
    } catch (error) {
      console.error('[conversation-actions-sheet] failed to save row', {
        leadId,
        error,
      });

      updateDraft(leadId, (currentDraft) => ({
        ...currentDraft,
        isSaving: false,
      }));

      toast({
        title: 'Erro ao salvar acao',
        description: error instanceof Error ? error.message : 'Nao foi possivel salvar o agendamento.',
        variant: 'destructive',
      });
    }
  }, [currentUserId, drafts, onSaveRow, toast, updateDraft]);

  return (
    <div className="border-b border-border/60 bg-card/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Planilha de acoes</p>
          <p className="text-xs text-muted-foreground">
            {conversations.length} lead(s) visiveis com salvamento direto no calendario.
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
          Fechar
        </Button>
      </div>

      <ScrollArea className="h-[340px] w-full">
        <div className="min-w-[1680px]">
          <div
            className="sticky top-0 z-20 grid border-b border-border/60 bg-background/95 backdrop-blur-sm"
            style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
          >
            <div className="sticky left-0 z-30 border-r border-border/60 bg-background/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Lead
            </div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ultima Acao</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Proxima Acao</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipo</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data / Hora</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Duracao</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Responsavel</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Local</div>
            <div className="border-r border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Etapa</div>
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Salvar</div>
          </div>

          {conversations.map((conversation) => {
            const leadId = String(conversation.contact.id);
            const draft = drafts[leadId];
            const stage = PIPELINE_STAGES[conversation.contact.pipelineStage];
            const isSelected = selectedConversationId === conversation.id;

            if (!draft) return null;

            return (
              <div
                key={conversation.id}
                className={cn(
                  'grid border-b border-border/50 bg-card/20',
                  draft.isDirty && 'bg-primary/[0.04]',
                  isSelected && 'bg-muted/35',
                )}
                style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
              >
                <div className="sticky left-0 z-10 flex min-h-[72px] items-center border-r border-border/60 bg-inherit px-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => onSelectConversation?.(conversation)}
                  >
                    <p className="truncate text-sm font-medium text-foreground">{conversation.contact.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {conversation.contact.company || conversation.contact.phone}
                    </p>
                  </button>
                </div>

                <div className="flex min-h-[72px] flex-col justify-center border-r border-border/60 px-3 py-2">
                  <p className="line-clamp-2 text-sm font-medium text-foreground">{draft.lastActionTitle}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{draft.lastActionMeta || 'Sem historico'}</p>
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <Input
                    value={draft.title}
                    onChange={(event) => handleFieldChange(leadId, 'title', event.target.value)}
                    placeholder="Titulo do agendamento"
                    className="h-8 bg-background/80 text-xs"
                  />
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <select
                    value={draft.type}
                    onChange={(event) => handleFieldChange(leadId, 'type', event.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TYPE_OPTIONS.map((option) => (
                      <option key={`${leadId}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <Input
                    type="datetime-local"
                    value={draft.dateTime}
                    onChange={(event) => handleFieldChange(leadId, 'dateTime', event.target.value)}
                    className="h-8 bg-background/80 text-xs"
                  />
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <select
                    value={draft.duration}
                    onChange={(event) => handleFieldChange(leadId, 'duration', event.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {DURATION_OPTIONS.map((value) => (
                      <option key={`${leadId}-duration-${value}`} value={value}>
                        {value} min
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <select
                    value={draft.responsibleUserId}
                    onChange={(event) => handleFieldChange(leadId, 'responsibleUserId', event.target.value)}
                    disabled={isLoadingResponsibles}
                    className="h-8 w-full rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {responsibleOptions.length === 0 ? (
                      <option value="">Sem responsavel</option>
                    ) : null}
                    {responsibleOptions.map((option) => (
                      <option key={`${leadId}-responsible-${option.id}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <Input
                    value={draft.location}
                    onChange={(event) => handleFieldChange(leadId, 'location', event.target.value)}
                    placeholder="Local"
                    className="h-8 bg-background/80 text-xs"
                  />
                </div>

                <div className="flex min-h-[72px] items-center border-r border-border/60 px-3 py-2">
                  <Badge variant="secondary" className="max-w-full truncate text-[11px]">
                    {stage.icon} {stage.title}
                  </Badge>
                </div>

                <div className="flex min-h-[72px] items-center justify-center px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={draft.isDirty ? 'default' : 'outline'}
                    className="h-8 min-w-[84px] text-xs"
                    disabled={
                      draft.isSaving ||
                      (!draft.isDirty && Boolean(draft.appointmentId)) ||
                      (!draft.isDirty && !draft.appointmentId && (!draft.title.trim() || !draft.dateTime))
                    }
                    onClick={() => void handleSave(conversation)}
                  >
                    {draft.isSaving ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Salvando
                      </>
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
