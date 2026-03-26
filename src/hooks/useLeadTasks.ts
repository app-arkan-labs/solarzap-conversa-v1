import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { LeadTask } from '@/types/solarzap';
import { buildLeadActionMaps, normalizeLeadTaskKind } from '@/lib/leadNextActions';

let leadTasksSupportExtendedColumns: boolean | null = null;

const EXTENDED_SELECT =
  'id, org_id, user_id, lead_id, title, notes, due_at, status, priority, channel, created_by, created_at, updated_at, task_kind, completed_at, completed_by, result_summary, linked_appointment_id, metadata';
const FALLBACK_SELECT =
  'id, org_id, user_id, lead_id, title, notes, due_at, status, priority, channel, created_by, created_at, updated_at';

type LeadTaskRow = {
  id: string;
  org_id: string;
  user_id: string;
  lead_id: number;
  title: string;
  notes?: string | null;
  due_at?: string | null;
  status: string;
  priority?: string | null;
  channel?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  task_kind?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  result_summary?: string | null;
  linked_appointment_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type UseLeadTasksOptions = {
  leadIds?: Array<string | number>;
  enabled?: boolean;
};

type UpsertLeadTaskInput = {
  leadId: number;
  title: string;
  notes?: string | null;
  dueAt?: Date | null;
  priority?: LeadTask['priority'];
  channel?: LeadTask['channel'];
  userId?: string | null;
  linkedAppointmentId?: string | null;
};

type UpdateLeadTaskInput = {
  taskId: string;
  title?: string;
  notes?: string | null;
  dueAt?: Date | null;
  priority?: LeadTask['priority'];
  channel?: LeadTask['channel'];
  userId?: string | null;
};

type LinkLeadTaskAppointmentInput = {
  taskId: string;
  appointmentId: string | null;
  dueAt?: Date | null;
  channel?: LeadTask['channel'];
};

const isMissingColumnError = (error: { code?: string; message?: string } | null | undefined) =>
  Boolean(
    error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        /schema cache/i.test(error.message || '') ||
        /column/i.test(error.message || '')),
  );

const mapLeadTask = (row: LeadTaskRow): LeadTask => ({
  id: String(row.id),
  orgId: String(row.org_id),
  userId: String(row.user_id),
  leadId: Number(row.lead_id),
  title: String(row.title || ''),
  notes: row.notes || null,
  dueAt: row.due_at || null,
  status: row.status === 'done' || row.status === 'canceled' ? row.status : 'open',
  priority: row.priority === 'low' || row.priority === 'high' ? row.priority : 'medium',
  channel:
    row.channel === 'whatsapp' || row.channel === 'call' || row.channel === 'email' || row.channel === 'other'
      ? row.channel
      : null,
  createdBy: String(row.created_by || ''),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
  taskKind: normalizeLeadTaskKind(row.task_kind, row.created_by),
  completedAt: row.completed_at || null,
  completedBy: row.completed_by || null,
  resultSummary: row.result_summary || null,
  linkedAppointmentId: row.linked_appointment_id || null,
  metadata: row.metadata || null,
});

const mapLeadTasks = (data: unknown): LeadTask[] => {
  if (!Array.isArray(data)) return [];
  return (data as LeadTaskRow[]).map(mapLeadTask);
};

const normalizeLeadIds = (leadIds: Array<string | number> | undefined): number[] =>
  Array.from(
    new Set(
      (leadIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);

export function useLeadTasks(options: UseLeadTasksOptions = {}) {
  const { orgId, user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = options.enabled !== false;
  const leadIds = useMemo(() => normalizeLeadIds(options.leadIds), [options.leadIds]);
  const leadIdsKey = useMemo(() => leadIds.join(','), [leadIds]);

  const queryKey = useMemo(
    () => ['lead-tasks', orgId ?? null, user?.id ?? null, leadIdsKey, enabled] as const,
    [enabled, leadIdsKey, orgId, user?.id],
  );

  useEffect(() => {
    if (!orgId || !enabled) return;

    const channel = supabase
      .channel(`lead-tasks-realtime-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_tasks',
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, orgId, queryClient]);

  const tasksQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!orgId || !enabled || leadIds.length === 0) return [] as LeadTask[];

      const runQuery = async (selectColumns: string) => {
        let query = supabase
          .from('lead_tasks')
          .select(selectColumns)
          .eq('org_id', orgId)
          .in('lead_id', leadIds)
          .order('updated_at', { ascending: false });
        return query;
      };

      if (leadTasksSupportExtendedColumns !== false) {
        const { data, error } = await runQuery(EXTENDED_SELECT);
        if (!error) {
          leadTasksSupportExtendedColumns = true;
          return mapLeadTasks(data);
        }
        if (!isMissingColumnError(error)) {
          throw error;
        }
        leadTasksSupportExtendedColumns = false;
      }

      const { data, error } = await runQuery(FALLBACK_SELECT);
      if (error) throw error;
      return mapLeadTasks(data);
    },
    enabled: Boolean(orgId) && Boolean(user) && enabled,
    staleTime: 15_000,
    placeholderData: [],
  });

  const createNextAction = useCallback(
    async (input: UpsertLeadTaskInput) => {
      if (!orgId || !user) throw new Error('Organizacao ou usuario ausente');

      const basePayload = {
        org_id: orgId,
        user_id: (input.userId || user.id).trim(),
        lead_id: Number(input.leadId),
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        due_at: input.dueAt ? input.dueAt.toISOString() : null,
        status: 'open',
        priority: input.priority || 'medium',
        channel: input.channel || null,
      };

      if (leadTasksSupportExtendedColumns !== false) {
        const { error } = await supabase.from('lead_tasks').insert({
          ...basePayload,
          created_by: 'manual',
          task_kind: 'next_action',
          linked_appointment_id: input.linkedAppointmentId || null,
          metadata: {},
        });

        if (!error) {
          leadTasksSupportExtendedColumns = true;
          queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
          return;
        }

        if (!isMissingColumnError(error)) {
          if (error.code === '23505') {
            throw new Error('Este lead ja possui uma proxima acao ativa.');
          }
          throw error;
        }

        leadTasksSupportExtendedColumns = false;
      }

      const { error } = await supabase.from('lead_tasks').insert({
        ...basePayload,
        created_by: 'manual_next_action',
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Este lead ja possui uma proxima acao ativa.');
        }
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
    },
    [orgId, queryClient, user],
  );

  const updateNextAction = useCallback(
    async (input: UpdateLeadTaskInput) => {
      if (!orgId || !user) throw new Error('Organizacao ou usuario ausente');

      const basePayload = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.dueAt !== undefined ? { due_at: input.dueAt ? input.dueAt.toISOString() : null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.channel !== undefined ? { channel: input.channel || null } : {}),
        ...(input.userId !== undefined ? { user_id: input.userId || user.id } : {}),
      };

      if (leadTasksSupportExtendedColumns !== false) {
        const { error } = await supabase
          .from('lead_tasks')
          .update(basePayload)
          .eq('id', input.taskId)
          .eq('org_id', orgId);

        if (!error) {
          queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
          return;
        }

        if (!isMissingColumnError(error)) throw error;
        leadTasksSupportExtendedColumns = false;
      }

      const { error } = await supabase
        .from('lead_tasks')
        .update(basePayload)
        .eq('id', input.taskId)
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
    },
    [orgId, queryClient, user],
  );

  const completeNextAction = useCallback(
    async (task: LeadTask, resultSummary: string) => {
      if (!orgId || !user) throw new Error('Organizacao ou usuario ausente');

      const trimmedResult = resultSummary.trim();
      if (!trimmedResult) throw new Error('Informe o resultado da acao.');

      if (leadTasksSupportExtendedColumns !== false) {
        const { error } = await supabase
          .from('lead_tasks')
          .update({
            status: 'done',
            completed_at: new Date().toISOString(),
            completed_by: user.id,
            result_summary: trimmedResult,
          })
          .eq('id', task.id)
          .eq('org_id', orgId);

        if (!error) {
          await supabase.from('comentarios_leads').insert({
            org_id: orgId,
            lead_id: task.leadId,
            texto: `[Acao concluida] ${task.title}: ${trimmedResult}`,
            autor: 'Vendedor',
          });
          queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
          return;
        }

        if (!isMissingColumnError(error)) throw error;
        leadTasksSupportExtendedColumns = false;
      }

      const nextNotes = [task.notes?.trim(), `Resultado: ${trimmedResult}`].filter(Boolean).join('\n\n');
      const { error } = await supabase
        .from('lead_tasks')
        .update({
          status: 'done',
          notes: nextNotes || null,
        })
        .eq('id', task.id)
        .eq('org_id', orgId);
      if (error) throw error;

      await supabase.from('comentarios_leads').insert({
        org_id: orgId,
        lead_id: task.leadId,
        texto: `[Acao concluida] ${task.title}: ${trimmedResult}`,
        autor: 'Vendedor',
      });

      queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
    },
    [orgId, queryClient, user],
  );

  const cancelNextAction = useCallback(
    async (taskId: string) => {
      if (!orgId || !user) throw new Error('Organizacao ou usuario ausente');

      const { error } = await supabase
        .from('lead_tasks')
        .update({ status: 'canceled' })
        .eq('id', taskId)
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
    },
    [orgId, queryClient, user],
  );

  const linkNextActionToAppointment = useCallback(
    async (input: LinkLeadTaskAppointmentInput) => {
      if (!orgId || !user) throw new Error('Organizacao ou usuario ausente');

      const extendedPayload = {
        linked_appointment_id: input.appointmentId,
        ...(input.dueAt !== undefined ? { due_at: input.dueAt ? input.dueAt.toISOString() : null } : {}),
        ...(input.channel !== undefined ? { channel: input.channel || null } : {}),
      };

      const fallbackPayload = {
        ...(input.dueAt !== undefined ? { due_at: input.dueAt ? input.dueAt.toISOString() : null } : {}),
        ...(input.channel !== undefined ? { channel: input.channel || null } : {}),
      };

      if (leadTasksSupportExtendedColumns !== false) {
        const { error } = await supabase
          .from('lead_tasks')
          .update(extendedPayload)
          .eq('id', input.taskId)
          .eq('org_id', orgId);

        if (!error) {
          queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
          return;
        }

        if (!isMissingColumnError(error)) throw error;
        leadTasksSupportExtendedColumns = false;
      }

      const { error } = await supabase
        .from('lead_tasks')
        .update(fallbackPayload)
        .eq('id', input.taskId)
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', orgId] });
    },
    [orgId, queryClient, user],
  );

  const actionMaps = useMemo(() => buildLeadActionMaps(tasksQuery.data || []), [tasksQuery.data]);

  return {
    tasks: tasksQuery.data || [],
    isLoading: tasksQuery.isLoading,
    nextActionByLeadId: actionMaps.nextActionByLeadId,
    lastActionByLeadId: actionMaps.lastActionByLeadId,
    createNextAction,
    updateNextAction,
    completeNextAction,
    cancelNextAction,
    linkNextActionToAppointment,
  };
}
