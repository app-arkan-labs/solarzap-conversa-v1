import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInMinutes, format, isValid } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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
  actionsScrollTop?: number;
  onActionsScroll?: (scrollTop: number) => void;
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
  syncLockUntil: number;
};

type TextEditorField = 'title' | 'location';

type TextEditorState = {
  leadId: string;
  field: TextEditorField;
  label: string;
  value: string;
  multiline: boolean;
  placeholder: string;
} | null;

const GRID_TEMPLATE_COLUMNS =
  'minmax(0,1.15fr) minmax(0,1.28fr) minmax(0,0.62fr) minmax(0,1fr) minmax(0,0.58fr) minmax(0,0.9fr) minmax(0,0.74fr) minmax(0,0.74fr) minmax(0,0.56fr)';
const GRID_HEADER_CLASS = 'h-[54px]';
const GRID_ROW_CLASS = 'h-[72px]';
const DEFAULT_DURATION = '30';
const PAST_GRACE_MS = 2 * 60 * 1000;
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
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (!isValid(parsed)) return null;
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
};

export function ConversationActionsSheet({
  conversations,
  appointments,
  nextActionByLeadId,
  selectedConversationId = null,
  onSelectConversation,
  actionsScrollTop = 0,
  onActionsScroll,
  onSaveRow,
}: ConversationActionsSheetProps) {
  const { user, role, orgId } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, ActionSheetDraft>>({});
  const [textEditor, setTextEditor] = useState<TextEditorState>(null);
  const [textEditorValue, setTextEditorValue] = useState('');
  const [responsibleOptions, setResponsibleOptions] = useState<ResponsibleOption[]>([]);
  const [isLoadingResponsibles, setIsLoadingResponsibles] = useState(false);
  const saveLocksRef = useRef<Set<string>>(new Set());
  const actionsScrollRef = useRef<HTMLDivElement | null>(null);
  const actionsScrollSyncRef = useRef(false);
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

  useEffect(() => {
    if (!actionsScrollRef.current) return;

    const element = actionsScrollRef.current;
    if (Math.abs(element.scrollTop - actionsScrollTop) < 1) return;

    actionsScrollSyncRef.current = true;
    element.scrollTop = actionsScrollTop;

    const timeoutId = window.setTimeout(() => {
      actionsScrollSyncRef.current = false;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [actionsScrollTop]);

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
      syncLockUntil: 0,
    };
  }, [appointmentsById, currentUserId, nextActionByLeadId, sortedAppointmentsByLeadId]);

  useEffect(() => {
    setDrafts((currentDrafts) => {
      const nextDrafts: Record<string, ActionSheetDraft> = {};

      for (const conversation of conversations) {
        const leadId = String(conversation.contact.id);
        const freshDraft = buildDraftForConversation(conversation);
        const currentDraft = currentDrafts[leadId];

        if (!currentDraft) {
          nextDrafts[leadId] = freshDraft;
          continue;
        }

        // Preserve local edits while user is filling the sheet.
        const now = Date.now();
        if (currentDraft.isDirty || currentDraft.isSaving || currentDraft.syncLockUntil > now) {
          nextDrafts[leadId] = {
            ...currentDraft,
            appointmentId: freshDraft.appointmentId,
            nextActionTaskId: freshDraft.nextActionTaskId,
            lastActionTitle: freshDraft.lastActionTitle,
            lastActionMeta: freshDraft.lastActionMeta,
          };
          continue;
        }

        nextDrafts[leadId] = freshDraft;
      }

      return nextDrafts;
    });
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

  const openTextEditor = useCallback((
    conversation: Conversation,
    field: TextEditorField,
  ) => {
    const leadId = String(conversation.contact.id);
    const draft = drafts[leadId];
    if (!draft) return;

    onSelectConversation?.(conversation);

    const isTitleField = field === 'title';
    const nextValue = isTitleField ? draft.title : draft.location;

    setTextEditor({
      leadId,
      field,
      label: isTitleField ? 'Proxima Acao' : 'Local',
      value: nextValue,
      multiline: isTitleField,
      placeholder: isTitleField ? 'Descreva a proxima acao' : 'Informe o local',
    });
    setTextEditorValue(nextValue);
  }, [drafts, onSelectConversation]);

  const handleCloseTextEditor = useCallback(() => {
    setTextEditor(null);
    setTextEditorValue('');
  }, []);

  const handleSaveTextEditor = useCallback(() => {
    if (!textEditor) return;
    handleFieldChange(textEditor.leadId, textEditor.field, textEditorValue);
    handleCloseTextEditor();
  }, [handleCloseTextEditor, handleFieldChange, textEditor, textEditorValue]);

  const handleSave = useCallback(async (conversation: Conversation) => {
    const leadId = String(conversation.contact.id);
    const draft = drafts[leadId];
    if (!draft || draft.isSaving) return;
    if (saveLocksRef.current.has(leadId)) return;

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

    if (startAt.getTime() < Date.now() - PAST_GRACE_MS) {
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

    saveLocksRef.current.add(leadId);
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
        syncLockUntil: Date.now() + 5000,
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
    } finally {
      saveLocksRef.current.delete(leadId);
    }
  }, [currentUserId, drafts, onSaveRow, toast, updateDraft]);

  const handleGridScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (actionsScrollSyncRef.current) return;
    onActionsScroll?.(event.currentTarget.scrollTop);
  }, [onActionsScroll]);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="min-w-0 flex flex-1 min-h-0 flex-col">
          <div
            ref={actionsScrollRef}
            className="flex-1 min-h-0 overflow-auto custom-scrollbar"
            onScroll={handleGridScroll}
          >
            <div className="w-full">
              <div
                className={cn(
                  'sticky top-0 z-10 grid border-b border-border/60 bg-background px-2',
                  GRID_HEADER_CLASS,
                )}
                style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
              >
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ultima Acao</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Proxima Acao</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipo</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data / Hora</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Duracao</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Responsavel</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Local</div>
                <div className="flex items-center border-r border-border/60 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Etapa</div>
                <div className="flex items-center px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Salvar</div>
              </div>

              {conversations.map((conversation) => {
                const leadId = String(conversation.contact.id);
                const draft = drafts[leadId];
                const stage = PIPELINE_STAGES[conversation.contact.pipelineStage];
              const isSelected = selectedConversationId === conversation.id;
              const hasTitle = draft?.title.trim().length > 0;
              const hasLocation = draft?.location.trim().length > 0;

              if (!draft) return null;

                return (
                  <div
                    key={conversation.id}
                    className={cn(
                      'grid border-b border-border/50 bg-background px-2',
                      GRID_ROW_CLASS,
                      draft.isDirty && 'bg-primary/[0.045]',
                      isSelected && 'bg-muted/20',
                    )}
                    style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
                  >
                  <div className="min-w-0 flex h-full flex-col justify-center border-r border-border/60 px-3 py-2">
                    <p className="line-clamp-2 text-sm font-medium text-foreground">{draft.lastActionTitle}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{draft.lastActionMeta || 'Sem historico'}</p>
                  </div>

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openTextEditor(conversation, 'title')}
                      className={cn(
                        'flex h-9 w-full items-center rounded-md border px-3 text-left text-xs transition-colors',
                        hasTitle
                          ? 'border-input bg-background/80 text-foreground hover:border-primary/35'
                          : 'border-dashed border-border/80 bg-background/45 text-muted-foreground hover:border-primary/35 hover:text-foreground',
                      )}
                    >
                      <span className="truncate">{hasTitle ? draft.title : 'Adicionar proxima acao'}</span>
                    </button>
                  </div>

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <select
                      value={draft.type}
                      onFocus={() => onSelectConversation?.(conversation)}
                      onChange={(event) => handleFieldChange(leadId, 'type', event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <option key={`${leadId}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <Input
                      type="datetime-local"
                      value={draft.dateTime}
                      onFocus={() => onSelectConversation?.(conversation)}
                      onChange={(event) => handleFieldChange(leadId, 'dateTime', event.target.value)}
                      className="h-9 bg-background/80 text-xs"
                    />
                  </div>

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <select
                      value={draft.duration}
                      onFocus={() => onSelectConversation?.(conversation)}
                      onChange={(event) => handleFieldChange(leadId, 'duration', event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {DURATION_OPTIONS.map((value) => (
                        <option key={`${leadId}-duration-${value}`} value={value}>
                          {value} min
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <select
                      value={draft.responsibleUserId}
                      onFocus={() => onSelectConversation?.(conversation)}
                      onChange={(event) => handleFieldChange(leadId, 'responsibleUserId', event.target.value)}
                      disabled={isLoadingResponsibles}
                      className="h-9 w-full rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openTextEditor(conversation, 'location')}
                      className={cn(
                        'flex h-9 w-full items-center rounded-md border px-3 text-left text-xs transition-colors',
                        hasLocation
                          ? 'border-input bg-background/80 text-foreground hover:border-primary/35'
                          : 'border-dashed border-border/80 bg-background/45 text-muted-foreground hover:border-primary/35 hover:text-foreground',
                      )}
                    >
                      <span className="truncate">{hasLocation ? draft.location : 'Adicionar local'}</span>
                    </button>
                  </div>

                  <div className="min-w-0 flex h-full items-center border-r border-border/60 px-3 py-2">
                    <Badge variant="secondary" className="max-w-full truncate text-[11px]">
                      {stage.icon} {stage.title}
                    </Badge>
                  </div>

                  <div className="flex h-full items-center justify-center px-3 py-2">
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
          </div>
        </div>
      </div>

      <Dialog open={Boolean(textEditor)} onOpenChange={(open) => (!open ? handleCloseTextEditor() : undefined)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{textEditor?.label || 'Editar campo'}</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            {textEditor?.multiline ? (
              <Textarea
                value={textEditorValue}
                onChange={(event) => setTextEditorValue(event.target.value)}
                placeholder={textEditor?.placeholder}
                className="min-h-[140px] resize-none"
                autoFocus
              />
            ) : (
              <Input
                value={textEditorValue}
                onChange={(event) => setTextEditorValue(event.target.value)}
                placeholder={textEditor?.placeholder}
                className="h-11"
                autoFocus
              />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseTextEditor}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveTextEditor}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
