import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { evolutionApi } from '@/lib/evolutionApi';
import {
  buildUpsertLeadCanonicalPayload,
  doesLeadBelongToOrg,
} from '@/lib/multiOrgLeadScoping';
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
}

export interface BroadcastCampaignInput {
  name: string;
  messages: string[];
  instance_name: string;
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

const clampIntervalSeconds = (value: number | undefined): number => {
  const candidate = Number(value ?? 15);
  if (!Number.isFinite(candidate)) return 15;
  return Math.max(10, Math.round(candidate));
};

const sanitizeMessages = (messages: unknown): string[] => {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
};

const computeDispatchDelayMs = (intervalSeconds: number): number => {
  const base = Math.max(intervalSeconds, 10);
  const jitter = base * 0.3;
  const min = base - jitter;
  const max = base + jitter;
  const seconds = min + Math.random() * (max - min);
  return Math.max(1000, Math.round(seconds * 1000));
};

const toBroadcastCampaign = (row: CampaignRow): BroadcastCampaign => ({
  id: String(row.id),
  org_id: String(row.org_id),
  user_id: String(row.user_id),
  name: String(row.name || ''),
  messages: sanitizeMessages(row.messages),
  instance_name: String(row.instance_name || ''),
  interval_seconds: Number(row.interval_seconds || 15),
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

const isMissingColumnError = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  return /column/i.test(String(error.message || '')) && /not exist|schema cache/i.test(String(error.message || ''));
};

export function useBroadcasts() {
  const { user, orgId } = useAuth();

  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>([]);
  const [recipientsByCampaign, setRecipientsByCampaign] = useState<Record<string, BroadcastRecipient[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const campaignMapRef = useRef<Map<string, BroadcastCampaign>>(new Map());
  const campaignTickInFlightRef = useRef<Set<string>>(new Set());

  const clearCampaignTimer = useCallback((campaignId: string) => {
    const timer = timersRef.current.get(campaignId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(campaignId);
    }
  }, []);

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

    const counts = await getCampaignRecipientCounts(campaignId);
    const current = campaignMapRef.current.get(campaignId);

    const updatePayload: Record<string, unknown> = {
      total_recipients: counts.total,
      sent_count: counts.sent,
      failed_count: counts.failed,
      updated_at: new Date().toISOString(),
    };

    if (current?.status === 'running' && counts.pending === 0 && counts.sending === 0) {
      updatePayload.status = 'completed';
      updatePayload.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('broadcast_campaigns')
      .update(updatePayload)
      .eq('id', campaignId)
      .eq('org_id', orgId);

    if (updateError) throw updateError;
  }, [getCampaignRecipientCounts, orgId]);

  const fetchCampaigns = useCallback(async () => {
    if (!orgId) {
      setCampaigns([]);
      setRecipientsByCampaign({});
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: campaignsError } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (campaignsError) {
      setError(campaignsError.message || 'Falha ao carregar campanhas');
      setIsLoading(false);
      throw campaignsError;
    }

    const mappedCampaigns = (data || []).map((row) => toBroadcastCampaign(row as CampaignRow));
    setCampaigns(mappedCampaigns);
    setIsLoading(false);

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
    setRecipientsByCampaign((previous) => ({ ...previous, [campaignId]: mappedRecipients }));

    return mappedRecipients;
  }, []);

  const upsertLeadForRecipient = useCallback(async (
    campaign: BroadcastCampaign,
    recipient: BroadcastRecipient,
  ): Promise<number | null> => {
    if (!user || !orgId) return null;

    const normalizedPhone = normalizePhone(recipient.phone);
    if (!normalizedPhone) return null;

    let leadId: number | null = null;

    const { data: rpcData, error: rpcError } = await supabase
      .rpc('upsert_lead_canonical', buildUpsertLeadCanonicalPayload({
        userId: user.id,
        orgId,
        instanceName: campaign.instance_name,
        phoneE164: normalizedPhone,
        telefone: normalizedPhone,
        name: recipient.name,
        pushName: recipient.name,
        source: campaign.source_channel || 'cold_list',
      }))
      .maybeSingle();

    if (!rpcError && rpcData) {
      const rpcLeadId = Number((rpcData as Record<string, unknown>).id || 0) || null;
      if (rpcLeadId) {
        const { data: rpcLead } = await supabase
          .from('leads')
          .select('id, org_id')
          .eq('id', rpcLeadId)
          .maybeSingle();

        if (doesLeadBelongToOrg(rpcLead, orgId)) {
          leadId = rpcLeadId;
        } else {
          console.warn('Discarding cross-org lead returned by upsert_lead_canonical', {
            orgId,
            rpcLeadId,
            rpcLeadOrgId: rpcLead?.org_id ?? null,
            campaignId: campaign.id,
            recipientId: recipient.id,
          });
        }
      }
    }

    if (!leadId) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('org_id', orgId)
        .or(`phone_e164.eq.${normalizedPhone},telefone.eq.${normalizedPhone}`)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingLead?.id) {
        leadId = Number(existingLead.id);
      }
    }

    if (!leadId) {
      const baseInsertPayload: Record<string, unknown> = {
        org_id: orgId,
        user_id: user.id,
        assigned_to_user_id: user.id,
        nome: recipient.name || normalizedPhone,
        telefone: normalizedPhone,
        phone_e164: normalizedPhone,
        email: recipient.email || null,
        canal: campaign.source_channel || 'cold_list',
        status_pipeline: campaign.pipeline_stage || 'novo_lead',
        consumo_kwh: 0,
        valor_estimado: 0,
        observacoes: '',
        instance_name: campaign.instance_name,
        ai_enabled: true,
      };

      let insertResult = await supabase
        .from('leads')
        .insert(baseInsertPayload)
        .select('id')
        .single();

      if (insertResult.error && isMissingColumnError(insertResult.error)) {
        const fallbackPayload = {
          org_id: orgId,
          user_id: user.id,
          assigned_to_user_id: user.id,
          nome: recipient.name || normalizedPhone,
          telefone: normalizedPhone,
          email: recipient.email || null,
          canal: campaign.source_channel || 'cold_list',
          status_pipeline: campaign.pipeline_stage || 'novo_lead',
          consumo_kwh: 0,
          valor_estimado: 0,
          observacoes: '',
        };

        insertResult = await supabase
          .from('leads')
          .insert(fallbackPayload)
          .select('id')
          .single();
      }

      if (insertResult.error) throw insertResult.error;
      leadId = Number(insertResult.data?.id || 0) || null;
    }

    if (leadId) {
      const fullUpdatePayload: Record<string, unknown> = {
        status_pipeline: campaign.pipeline_stage || 'novo_lead',
        canal: campaign.source_channel || 'cold_list',
        ai_enabled: true,
        ai_paused_reason: null,
        ai_paused_at: null,
        phone_e164: normalizedPhone,
        telefone: normalizedPhone,
        instance_name: campaign.instance_name,
        assigned_to_user_id: user.id,
      };

      let updateResult = await supabase
        .from('leads')
        .update(fullUpdatePayload)
        .eq('id', leadId)
        .eq('org_id', orgId)
        .select('id')
        .maybeSingle();

      if (updateResult.error && isMissingColumnError(updateResult.error)) {
        updateResult = await supabase
          .from('leads')
          .update({
            status_pipeline: campaign.pipeline_stage || 'novo_lead',
            canal: campaign.source_channel || 'cold_list',
          })
          .eq('id', leadId)
          .eq('org_id', orgId)
          .select('id')
          .maybeSingle();
      }

      if (updateResult.error) {
        // Keep dispatch flow alive: lead exists and was upserted already.
        console.warn('Broadcast lead update warning:', updateResult.error.message || updateResult.error);
      }
    }

    return leadId;
  }, [orgId, user]);

  const pickRandomMessage = useCallback((campaign: BroadcastCampaign): string => {
    const messagePool = sanitizeMessages(campaign.messages);
    if (messagePool.length < 1) {
      throw new Error('A campanha precisa ter pelo menos 1 mensagem');
    }
    const index = Math.floor(Math.random() * messagePool.length);
    return messagePool[index];
  }, []);

  const claimNextPendingRecipient = useCallback(async (campaignId: string): Promise<BroadcastRecipient | null> => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const { data: candidate, error: candidateError } = await supabase
        .from('broadcast_recipients')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (candidateError) throw candidateError;
      if (!candidate) return null;

      const { data: claimed, error: claimError } = await supabase
        .from('broadcast_recipients')
        .update({ status: 'sending', error_message: null })
        .eq('id', candidate.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

      if (claimError) throw claimError;
      if (claimed) return toBroadcastRecipient(claimed as RecipientRow);
    }

    return null;
  }, []);

  const markRecipientStatus = useCallback(async (
    recipientId: string,
    payload: {
      status: BroadcastRecipientStatus;
      lead_id?: number | null;
      error_message?: string | null;
      sent_at?: string | null;
    },
  ) => {
    const { error: recipientError } = await supabase
      .from('broadcast_recipients')
      .update(payload)
      .eq('id', recipientId);

    if (recipientError) throw recipientError;
  }, []);

  const insertOutboundInteraction = useCallback(async (
    campaign: BroadcastCampaign,
    recipient: BroadcastRecipient,
    leadId: number | null,
    message: string,
    waMessageId: string | null,
  ) => {
    if (!orgId || !user) return;

    const normalizedPhone = normalizePhone(recipient.phone);
    const remoteJid = normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : null;

    const { error: interactionError } = await supabase
      .from('interacoes')
      .insert({
        org_id: orgId,
        user_id: user.id,
        lead_id: leadId,
        mensagem: message,
        tipo: 'mensagem_vendedor',
        wa_from_me: true,
        instance_name: campaign.instance_name,
        phone_e164: normalizedPhone,
        remote_jid: remoteJid,
        wa_message_id: waMessageId,
      });

    if (interactionError) throw interactionError;
  }, [orgId, user]);

  const dispatchRecipient = useCallback(async (campaign: BroadcastCampaign, recipient: BroadcastRecipient) => {
    const normalizedPhone = normalizePhone(recipient.phone);
    if (!normalizedPhone) {
      await markRecipientStatus(recipient.id, {
        status: 'failed',
        error_message: 'Telefone invalido para envio',
      });
      return;
    }

    const selectedMessage = pickRandomMessage(campaign);
    let leadId: number | null = null;

    try {
      leadId = await upsertLeadForRecipient(campaign, recipient);

      const response = await evolutionApi.sendMessage(
        campaign.instance_name,
        normalizedPhone,
        selectedMessage,
        undefined,
        { orgId: orgId || undefined },
      );

      if (!response.success) {
        throw new Error(response.error || 'Falha ao enviar via Evolution API');
      }

      const waMessageId = response.data?.key?.id || null;

      await insertOutboundInteraction(campaign, recipient, leadId, selectedMessage, waMessageId);

      await markRecipientStatus(recipient.id, {
        status: 'sent',
        lead_id: leadId,
        sent_at: new Date().toISOString(),
        error_message: null,
      });
    } catch (dispatchError) {
      const message = dispatchError instanceof Error ? dispatchError.message : 'Erro desconhecido no disparo';
      await markRecipientStatus(recipient.id, {
        status: 'failed',
        lead_id: leadId,
        error_message: message,
      });
    }
  }, [insertOutboundInteraction, markRecipientStatus, orgId, pickRandomMessage, upsertLeadForRecipient]);

  const scheduleCampaignTick = useCallback((campaignId: string, delayMs: number, tickFn: (id: string) => Promise<void>) => {
    clearCampaignTimer(campaignId);
    const timeout = setTimeout(() => {
      timersRef.current.delete(campaignId);
      void tickFn(campaignId);
    }, delayMs);
    timersRef.current.set(campaignId, timeout);
  }, [clearCampaignTimer]);

  const processCampaignTick = useCallback(async (campaignId: string) => {
    if (!orgId) return;
    if (campaignTickInFlightRef.current.has(campaignId)) return;

    campaignTickInFlightRef.current.add(campaignId);

    try {
      const latestCampaign = await fetchCampaignById(campaignId);
      if (!latestCampaign || latestCampaign.status !== 'running') {
        clearCampaignTimer(campaignId);
        return;
      }

      const claimedRecipient = await claimNextPendingRecipient(campaignId);

      if (!claimedRecipient) {
        await refreshCampaignProgress(campaignId);
        await fetchCampaigns();
        clearCampaignTimer(campaignId);
        return;
      }

      await dispatchRecipient(latestCampaign, claimedRecipient);
      await refreshCampaignProgress(campaignId);
      await fetchCampaignRecipients(campaignId);
      const updatedCampaign = await fetchCampaignById(campaignId);

      if (updatedCampaign?.status === 'running') {
        const delay = computeDispatchDelayMs(clampIntervalSeconds(updatedCampaign.interval_seconds));
        scheduleCampaignTick(campaignId, delay, processCampaignTick);
      } else {
        clearCampaignTimer(campaignId);
      }

      await fetchCampaigns();
    } finally {
      campaignTickInFlightRef.current.delete(campaignId);
    }
  }, [
    claimNextPendingRecipient,
    clearCampaignTimer,
    dispatchRecipient,
    fetchCampaignById,
    fetchCampaignRecipients,
    fetchCampaigns,
    orgId,
    refreshCampaignProgress,
    scheduleCampaignTick,
  ]);

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
      p_limit_key: 'broadcasts_monthly',
      p_quantity: 1,
    });
    if (limitError) {
      throw new Error(`Falha ao validar limite do plano: ${limitError.message}`);
    }

    const limitRow = Array.isArray(limitData) ? limitData[0] : limitData;
    if (!limitRow?.allowed || limitRow?.access_state === 'blocked') {
      throw new Error('Limite mensal de disparos atingido. Faça upgrade para continuar.');
    }

    const campaignPayload = {
      org_id: orgId,
      user_id: user.id,
      name: String(input.name || '').trim(),
      messages,
      instance_name: String(input.instance_name || '').trim(),
      interval_seconds: clampIntervalSeconds(input.interval_seconds),
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
  }, [addRecipients, fetchCampaignById, fetchCampaigns, orgId, refreshCampaignProgress, user]);

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

  const startCampaign = useCallback(async (campaignId: string) => {
    if (!orgId) return;

    const campaign = await fetchCampaignById(campaignId);
    if (!campaign) throw new Error('Campanha nao encontrada');

    const messagePool = sanitizeMessages(campaign.messages);
    if (messagePool.length < 1) {
      throw new Error('A campanha precisa ter ao menos 1 mensagem para iniciar');
    }

    const { error: markSendingError } = await supabase
      .from('broadcast_recipients')
      .update({
        status: 'failed',
        error_message: 'Envio interrompido antes de confirmacao. Retomado sem duplicidade.',
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'sending');

    if (markSendingError) throw markSendingError;

    await refreshCampaignProgress(campaignId);

    const counts = await getCampaignRecipientCounts(campaignId);
    if (counts.pending === 0 && counts.sending === 0) {
      await setCampaignStatus(campaignId, 'completed');
      await fetchCampaigns();
      clearCampaignTimer(campaignId);
      return;
    }

    await setCampaignStatus(campaignId, 'running');
    await fetchCampaigns();

    scheduleCampaignTick(campaignId, 250, processCampaignTick);
  }, [
    clearCampaignTimer,
    fetchCampaignById,
    fetchCampaigns,
    getCampaignRecipientCounts,
    orgId,
    processCampaignTick,
    refreshCampaignProgress,
    scheduleCampaignTick,
    setCampaignStatus,
  ]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    await setCampaignStatus(campaignId, 'paused');
    clearCampaignTimer(campaignId);
    await fetchCampaigns();
  }, [clearCampaignTimer, fetchCampaigns, setCampaignStatus]);

  const resumeCampaign = useCallback(async (campaignId: string) => {
    await startCampaign(campaignId);
  }, [startCampaign]);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    clearCampaignTimer(campaignId);

    const { error: skipError } = await supabase
      .from('broadcast_recipients')
      .update({ status: 'skipped', error_message: 'Campanha cancelada pelo usuario' })
      .eq('campaign_id', campaignId)
      .in('status', SENDING_RECIPIENT_STATES);

    if (skipError) throw skipError;

    await refreshCampaignProgress(campaignId);
    await setCampaignStatus(campaignId, 'canceled');
    await fetchCampaignRecipients(campaignId);
    await fetchCampaigns();
  }, [clearCampaignTimer, fetchCampaignRecipients, fetchCampaigns, refreshCampaignProgress, setCampaignStatus]);

  const deleteCampaign = useCallback(async (campaignId: string) => {
    if (!orgId) return;

    clearCampaignTimer(campaignId);

    const { error: deleteError } = await supabase
      .from('broadcast_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('org_id', orgId);

    if (deleteError) throw deleteError;

    setRecipientsByCampaign((previous) => {
      const next = { ...previous };
      delete next[campaignId];
      return next;
    });

    await fetchCampaigns();
  }, [clearCampaignTimer, fetchCampaigns, orgId]);

  const campaignsById = useMemo(() => {
    const map = new Map<string, BroadcastCampaign>();
    campaigns.forEach((campaign) => {
      map.set(campaign.id, campaign);
    });
    return map;
  }, [campaigns]);

  useEffect(() => {
    campaignMapRef.current = campaignsById;
  }, [campaignsById]);

  useEffect(() => {
    if (!user || !orgId) {
      setCampaigns([]);
      setRecipientsByCampaign({});
      setError(null);
      setIsLoading(false);
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

  useEffect(() => {
    const runningCampaignIds = new Set(campaigns.filter((campaign) => campaign.status === 'running').map((campaign) => campaign.id));

    campaigns
      .filter((campaign) => campaign.status === 'running')
      .forEach((campaign) => {
        if (!timersRef.current.has(campaign.id)) {
          scheduleCampaignTick(campaign.id, 300, processCampaignTick);
        }
      });

    for (const campaignId of Array.from(timersRef.current.keys())) {
      if (!runningCampaignIds.has(campaignId)) {
        clearCampaignTimer(campaignId);
      }
    }
  }, [campaigns, clearCampaignTimer, processCampaignTick, scheduleCampaignTick]);

  useEffect(() => () => {
    Array.from(timersRef.current.keys()).forEach((campaignId) => {
      clearCampaignTimer(campaignId);
    });
  }, [clearCampaignTimer]);

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
