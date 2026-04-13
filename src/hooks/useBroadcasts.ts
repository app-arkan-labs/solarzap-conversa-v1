import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { normalizeImportedClientType } from '@/utils/importClientType';
import { clampBroadcastTimerSeconds } from '@/utils/broadcastTimer';
import type { ClientType } from '@/types/solarzap';
import { useBillingBlocker } from '@/contexts/BillingBlockerContext';
import {
  BillingInterruptionError,
  buildLimitBlockerForKey,
  isUnlimitedBillingBypass,
} from '@/lib/billingBlocker';
import type {
  BroadcastCampaign,
  BroadcastCampaignStatus,
  BroadcastRecipient,
  BroadcastRecipientStatus,
} from '@/types/broadcast';

type CampaignRow = Record<string, unknown>;
type RecipientRow = Record<string, unknown>;

export interface BroadcastRecipientInput {
  name: string;
  phone: string;
  email?: string;
  assigned_to_user_id?: string;
}

export interface BroadcastCampaignInput {
  name: string;
  messages: string[];
  instance_name: string;
  assigned_to_user_id?: string;
  assigned_to_user_ids?: string[];
  lead_client_type?: ClientType;
  interval_seconds?: number;
  source_channel?: string;
  pipeline_stage?: string;
  ai_enabled?: boolean;
  recipients?: BroadcastRecipientInput[];
}

interface CampaignRecipientCounts {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  sending: number;
}

const POLLING_MS = 5000;
const SENDING_RECIPIENT_STATES: BroadcastRecipientStatus[] = ['pending', 'sending'];

const normalizePhone = (value: string): string => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
};

const sanitizeMessages = (messages: unknown): string[] => {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
};

const normalizeAssigneeIds = (value: unknown, fallback?: string | null): string[] => {
  const values = Array.isArray(value) ? value : [];
  const normalized = values
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);

  if (normalized.length === 0 && fallback) {
    const fallbackId = String(fallback).trim();
    if (fallbackId.length > 0) normalized.push(fallbackId);
  }

  return Array.from(new Set(normalized));
};

const normalizeCampaignClientType = (value: unknown): ClientType => (
  normalizeImportedClientType(value) || 'residencial'
);

const toBroadcastCampaign = (row: CampaignRow): BroadcastCampaign => ({
  id: String(row.id),
  org_id: String(row.org_id),
  user_id: String(row.user_id || ''),
  assigned_to_user_id: row.assigned_to_user_id == null ? null : String(row.assigned_to_user_id),
  assigned_to_user_ids: normalizeAssigneeIds(row.assigned_to_user_ids, row.assigned_to_user_id == null ? null : String(row.assigned_to_user_id)),
  lead_client_type: normalizeCampaignClientType(row.lead_client_type),
  name: String(row.name || ''),
  messages: sanitizeMessages(row.messages),
  instance_name: String(row.instance_name || ''),
  interval_seconds: clampBroadcastTimerSeconds(Number(row.interval_seconds || 60)),
  status: String(row.status || 'draft') as BroadcastCampaignStatus,
  total_recipients: Number(row.total_recipients || 0),
  sent_count: Number(row.sent_count || 0),
  failed_count: Number(row.failed_count || 0),
  source_channel: String(row.source_channel || 'cold_list'),
  pipeline_stage: String(row.pipeline_stage || 'novo_lead'),
  ai_enabled: Boolean(row.ai_enabled ?? true),
  started_at: row.started_at ? String(row.started_at) : null,
  completed_at: row.completed_at ? String(row.completed_at) : null,
  created_at: String(row.created_at || ''),
  updated_at: String(row.updated_at || ''),
});

const toBroadcastRecipient = (row: RecipientRow): BroadcastRecipient => ({
  id: String(row.id),
  campaign_id: String(row.campaign_id),
  lead_id: row.lead_id == null ? null : Number(row.lead_id),
  name: String(row.name || ''),
  phone: String(row.phone || ''),
  email: row.email == null ? null : String(row.email),
  status: String(row.status || 'pending') as BroadcastRecipientStatus,
  error_message: row.error_message == null ? null : String(row.error_message),
  sent_at: row.sent_at == null ? null : String(row.sent_at),
  created_at: String(row.created_at || ''),
});

const isSchemaMismatchError = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204' || code === '42883') return true;
  return /column|function|schema cache/i.test(String(error.message || ''));
};

export function useBroadcasts() {
  const { user, orgId } = useAuth();
  const { billing, openBillingBlocker } = useBillingBlocker();

  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>([]);
  const [recipientsByCampaign, setRecipientsByCampaign] = useState<Record<string, BroadcastRecipient[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const countRecipients = useCallback(async (campaignId: string, status?: BroadcastRecipientStatus): Promise<number> => {
    let query = supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    if (status) {
      query = query.eq('status', status);
    }

    const { count, error: countError } = await query;
    if (countError) throw countError;
    return Number(count || 0);
  }, []);

  const getCampaignRecipientCounts = useCallback(async (campaignId: string): Promise<CampaignRecipientCounts> => {
    const [total, sent, failed, pending, sending] = await Promise.all([
      countRecipients(campaignId),
      countRecipients(campaignId, 'sent'),
      countRecipients(campaignId, 'failed'),
      countRecipients(campaignId, 'pending'),
      countRecipients(campaignId, 'sending'),
    ]);

    return { total, sent, failed, pending, sending };
  }, [countRecipients]);

  const fetchCampaignById = useCallback(async (campaignId: string): Promise<BroadcastCampaign | null> => {
    if (!orgId) return null;
    const { data, error: fetchError } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!data) return null;

    return toBroadcastCampaign(data as CampaignRow);
  }, [orgId]);

  const refreshCampaignProgress = useCallback(async (campaignId: string) => {
    if (!orgId) return;

    const { error: rpcError } = await supabase.rpc('broadcast_refresh_campaign_progress', {
      p_campaign_id: campaignId,
    });

    if (!rpcError) return;
    if (!isSchemaMismatchError(rpcError)) {
      throw rpcError;
    }

    // Compatibility fallback while migration is not applied.
    const counts = await getCampaignRecipientCounts(campaignId);
    const campaign = await fetchCampaignById(campaignId);
    const updatePayload: Record<string, unknown> = {
      total_recipients: counts.total,
      sent_count: counts.sent,
      failed_count: counts.failed,
      updated_at: new Date().toISOString(),
    };

    if (campaign?.status === 'running' && counts.pending === 0 && counts.sending === 0) {
      updatePayload.status = 'completed';
      updatePayload.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('broadcast_campaigns')
      .update(updatePayload)
      .eq('id', campaignId)
      .eq('org_id', orgId);

    if (updateError) throw updateError;
  }, [fetchCampaignById, getCampaignRecipientCounts, orgId]);

  const fetchCampaigns = useCallback(async () => {
    if (!orgId) {
      if (isMountedRef.current) {
        setCampaigns([]);
        setRecipientsByCampaign({});
      }
      return [];
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    const { data, error: campaignsError } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (campaignsError) {
      if (isMountedRef.current) {
        setError(campaignsError.message || 'Falha ao carregar campanhas');
        setIsLoading(false);
      }
      throw campaignsError;
    }

    const mappedCampaigns = (data || []).map((row) => toBroadcastCampaign(row as CampaignRow));
    if (isMountedRef.current) {
      setCampaigns(mappedCampaigns);
      setIsLoading(false);
    }

    return mappedCampaigns;
  }, [orgId]);

  const fetchCampaignRecipients = useCallback(async (campaignId: string) => {
    const { data, error: recipientsError } = await supabase
      .from('broadcast_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    if (recipientsError) throw recipientsError;

    const mappedRecipients = (data || []).map((row) => toBroadcastRecipient(row as RecipientRow));
    if (isMountedRef.current) {
      setRecipientsByCampaign((previous) => ({ ...previous, [campaignId]: mappedRecipients }));
    }

    return mappedRecipients;
  }, []);

  const addRecipients = useCallback(async (campaignId: string, recipients: BroadcastRecipientInput[]) => {
    if (!recipients.length) {
      await refreshCampaignProgress(campaignId);
      await fetchCampaigns();
      return 0;
    }

    const dedupe = new Map<string, { campaign_id: string; name: string; phone: string; email: string | null }>();

    for (const recipient of recipients) {
      const normalizedPhone = normalizePhone(recipient.phone);
      if (!normalizedPhone) continue;
      dedupe.set(normalizedPhone, {
        campaign_id: campaignId,
        name: String(recipient.name || normalizedPhone).trim() || normalizedPhone,
        phone: normalizedPhone,
        email: recipient.email?.trim() || null,
      });
    }

    const rows = Array.from(dedupe.values());
    const chunkSize = 500;

    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const { error: insertError } = await supabase
        .from('broadcast_recipients')
        .upsert(chunk, { onConflict: 'campaign_id,phone', ignoreDuplicates: true });

      if (insertError) throw insertError;
    }

    await refreshCampaignProgress(campaignId);
    await fetchCampaignRecipients(campaignId);
    await fetchCampaigns();

    return rows.length;
  }, [fetchCampaignRecipients, fetchCampaigns, refreshCampaignProgress]);

  const createCampaign = useCallback(async (input: BroadcastCampaignInput): Promise<BroadcastCampaign> => {
    if (!user || !orgId) {
      throw new Error('Usuario nao autenticado na organizacao ativa');
    }

    const messages = sanitizeMessages(input.messages);
    if (messages.length < 1) {
      throw new Error('Informe ao menos 1 mensagem para a campanha');
    }

    const { data: limitData, error: limitError } = await supabase.rpc('check_plan_limit', {
      p_org_id: orgId,
      p_limit_key: 'max_campaigns_month',
      p_quantity: 1,
    });
    if (limitError) {
      throw new Error(`Falha ao validar limite do plano: ${limitError.message}`);
    }

    const limitRow = Array.isArray(limitData) ? limitData[0] : limitData;
    if (!limitRow?.allowed && !isUnlimitedBillingBypass(billing)) {
      openBillingBlocker(buildLimitBlockerForKey('max_campaigns_month', billing, 'broadcasts'));
      throw new BillingInterruptionError('Bloqueado por billing em campanhas de disparo');
    }

    const recipientCount = Array.isArray(input.recipients) ? input.recipients.length : 0;
    if (recipientCount > 0) {
      const { data: creditsData, error: creditsError } = await supabase.rpc('check_plan_limit', {
        p_org_id: orgId,
        p_limit_key: 'monthly_broadcast_credits',
        p_quantity: recipientCount,
      });

      if (creditsError) {
        throw new Error(`Falha ao validar creditos de disparo: ${creditsError.message}`);
      }

      const creditsRow = Array.isArray(creditsData) ? creditsData[0] : creditsData;
      if (!creditsRow?.allowed && !isUnlimitedBillingBypass(billing)) {
        openBillingBlocker(buildLimitBlockerForKey('monthly_broadcast_credits', billing, 'broadcasts'));
        throw new BillingInterruptionError('Bloqueado por billing em creditos de disparo');
      }
    }

    const normalizedAssigneeIds = normalizeAssigneeIds(
      input.assigned_to_user_ids,
      input.assigned_to_user_id || user.id,
    );
    const primaryAssigneeId = normalizedAssigneeIds[0] || user.id;

    const campaignPayload = {
      org_id: orgId,
      user_id: user.id,
      assigned_to_user_id: primaryAssigneeId,
      assigned_to_user_ids: normalizedAssigneeIds,
      lead_client_type: normalizeCampaignClientType(input.lead_client_type),
      name: String(input.name || '').trim(),
      messages,
      instance_name: String(input.instance_name || '').trim(),
      interval_seconds: clampBroadcastTimerSeconds(input.interval_seconds ?? undefined),
      status: 'draft' as BroadcastCampaignStatus,
      source_channel: input.source_channel || 'cold_list',
      pipeline_stage: input.pipeline_stage || 'novo_lead',
      ai_enabled: input.ai_enabled ?? true,
    };

    if (!campaignPayload.name) throw new Error('Nome da campanha e obrigatorio');
    if (!campaignPayload.instance_name) throw new Error('Selecione uma instancia de WhatsApp');

    const { data, error: createError } = await supabase
      .from('broadcast_campaigns')
      .insert(campaignPayload)
      .select('*')
      .single();

    if (createError) throw createError;

    const createdCampaign = toBroadcastCampaign(data as CampaignRow);

    if (Array.isArray(input.recipients) && input.recipients.length > 0) {
      await addRecipients(createdCampaign.id, input.recipients);
    } else {
      await refreshCampaignProgress(createdCampaign.id);
      await fetchCampaigns();
    }

    const latest = await fetchCampaignById(createdCampaign.id);
    return latest || createdCampaign;
  }, [addRecipients, billing, fetchCampaignById, fetchCampaigns, openBillingBlocker, orgId, refreshCampaignProgress, user]);

  const setCampaignStatus = useCallback(async (
    campaignId: string,
    status: BroadcastCampaignStatus,
    extraPayload: Record<string, unknown> = {},
  ) => {
    if (!orgId) return;

    const payload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      ...extraPayload,
    };

    if (status === 'running') {
      payload.started_at = (extraPayload.started_at as string | undefined) || new Date().toISOString();
      payload.completed_at = null;
      payload.next_dispatch_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'canceled') {
      payload.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('broadcast_campaigns')
      .update(payload)
      .eq('id', campaignId)
      .eq('org_id', orgId);

    if (updateError) throw updateError;
  }, [orgId]);

  const invokeWorker = useCallback(async (campaignId: string) => {
    try {
      await supabase.functions.invoke('broadcast-worker', {
        body: { campaign_id: campaignId, batch_size: 1 },
      });
    } catch {
      // Cron handles the steady-state dispatch; a missed kick-off should not block the UI.
    }
  }, []);

  const startCampaign = useCallback(async (campaignId: string) => {
    if (!orgId) return;

    const campaign = await fetchCampaignById(campaignId);
    if (!campaign) throw new Error('Campanha nao encontrada');

    const messagePool = sanitizeMessages(campaign.messages);
    if (messagePool.length < 1) {
      throw new Error('A campanha precisa ter ao menos 1 mensagem para iniciar');
    }

    const resetSendingPayload = {
      status: 'pending' as BroadcastRecipientStatus,
      error_message: null,
      processing_started_at: null,
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let resetSendingResult = await supabase
      .from('broadcast_recipients')
      .update(resetSendingPayload)
      .eq('campaign_id', campaignId)
      .eq('status', 'sending');

    if (resetSendingResult.error && isSchemaMismatchError(resetSendingResult.error)) {
      resetSendingResult = await supabase
        .from('broadcast_recipients')
        .update({
          status: 'pending',
          error_message: null,
        })
        .eq('campaign_id', campaignId)
        .eq('status', 'sending');
    }

    if (resetSendingResult.error) throw resetSendingResult.error;

    await refreshCampaignProgress(campaignId);
    const counts = await getCampaignRecipientCounts(campaignId);

    if (counts.pending === 0 && counts.sending === 0) {
      await setCampaignStatus(campaignId, 'completed');
      await fetchCampaigns();
      return;
    }

    await setCampaignStatus(campaignId, 'running');
    await fetchCampaigns();
    void invokeWorker(campaignId);
  }, [fetchCampaignById, fetchCampaigns, getCampaignRecipientCounts, invokeWorker, orgId, refreshCampaignProgress, setCampaignStatus]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    await setCampaignStatus(campaignId, 'paused');
    await fetchCampaigns();
  }, [fetchCampaigns, setCampaignStatus]);

  const resumeCampaign = useCallback(async (campaignId: string) => {
    await startCampaign(campaignId);
  }, [startCampaign]);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    let skipResult = await supabase
      .from('broadcast_recipients')
      .update({
        status: 'skipped',
        error_message: 'Campanha cancelada pelo usuario',
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .in('status', SENDING_RECIPIENT_STATES);

    if (skipResult.error && isSchemaMismatchError(skipResult.error)) {
      skipResult = await supabase
        .from('broadcast_recipients')
        .update({
          status: 'skipped',
          error_message: 'Campanha cancelada pelo usuario',
        })
        .eq('campaign_id', campaignId)
        .in('status', SENDING_RECIPIENT_STATES);
    }

    if (skipResult.error) throw skipResult.error;

    await refreshCampaignProgress(campaignId);
    await setCampaignStatus(campaignId, 'canceled');
    await fetchCampaignRecipients(campaignId);
    await fetchCampaigns();
  }, [fetchCampaignRecipients, fetchCampaigns, refreshCampaignProgress, setCampaignStatus]);

  const deleteCampaign = useCallback(async (campaignId: string) => {
    if (!orgId) return;

    const { error: deleteRecipientsError } = await supabase
      .from('broadcast_recipients')
      .delete()
      .eq('campaign_id', campaignId);

    if (deleteRecipientsError) throw deleteRecipientsError;

    const { error: deleteError } = await supabase
      .from('broadcast_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('org_id', orgId);

    if (deleteError) throw deleteError;

    if (isMountedRef.current) {
      setRecipientsByCampaign((previous) => {
        const next = { ...previous };
        delete next[campaignId];
        return next;
      });
    }

    await fetchCampaigns();
  }, [fetchCampaigns, orgId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user || !orgId) {
      if (isMountedRef.current) {
        setCampaigns([]);
        setRecipientsByCampaign({});
        setError(null);
        setIsLoading(false);
      }
      return;
    }

    void fetchCampaigns();

    const interval = setInterval(() => {
      void fetchCampaigns();
    }, POLLING_MS);

    return () => {
      clearInterval(interval);
    };
  }, [fetchCampaigns, orgId, user]);

  return {
    campaigns,
    recipientsByCampaign,
    isLoading,
    error,
    refreshCampaigns: fetchCampaigns,
    fetchCampaignRecipients,
    createCampaign,
    addRecipients,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    deleteCampaign,
  };
}
