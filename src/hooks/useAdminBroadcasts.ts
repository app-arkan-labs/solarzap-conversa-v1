/**
 * useAdminBroadcasts – 100 % mirror of useBroadcasts but targeting
 * public.admin_broadcast_campaigns / admin_broadcast_recipients.
 *
 * No billing checks, no org_id scoping – only owner_user_id + system_admin RLS.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AdminBroadcastCampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'canceled';
export type AdminBroadcastRecipientStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface AdminBroadcastCampaign {
  id: string;
  owner_user_id: string;
  name: string;
  messages: string[];
  instance_name: string;
  interval_seconds: number;
  status: AdminBroadcastCampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminBroadcastRecipient {
  id: string;
  campaign_id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: AdminBroadcastRecipientStatus;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface AdminBroadcastRecipientInput {
  name: string;
  phone: string;
  email?: string;
}

export interface AdminBroadcastCampaignInput {
  name: string;
  messages: string[];
  instance_name: string;
  interval_seconds?: number;
  recipients?: AdminBroadcastRecipientInput[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type CampaignRow = Record<string, unknown>;
type RecipientRow = Record<string, unknown>;

const POLLING_MS = 5_000;
const SENDING_RECIPIENT_STATES: AdminBroadcastRecipientStatus[] = ['pending', 'sending'];

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
  return messages.map((e) => String(e ?? '').trim()).filter((e) => e.length > 0);
};

const toAdminCampaign = (row: CampaignRow): AdminBroadcastCampaign => ({
  id: String(row.id),
  owner_user_id: String(row.owner_user_id || ''),
  name: String(row.name || ''),
  messages: sanitizeMessages(row.messages),
  instance_name: String(row.instance_name || ''),
  interval_seconds: Number(row.interval_seconds || 15),
  status: String(row.status || 'draft') as AdminBroadcastCampaignStatus,
  total_recipients: Number(row.total_recipients || 0),
  sent_count: Number(row.sent_count || 0),
  failed_count: Number(row.failed_count || 0),
  started_at: row.started_at ? String(row.started_at) : null,
  completed_at: row.completed_at ? String(row.completed_at) : null,
  created_at: String(row.created_at || ''),
  updated_at: String(row.updated_at || ''),
});

const toAdminRecipient = (row: RecipientRow): AdminBroadcastRecipient => ({
  id: String(row.id),
  campaign_id: String(row.campaign_id),
  name: String(row.name || ''),
  phone: String(row.phone || ''),
  email: row.email == null ? null : String(row.email),
  status: String(row.status || 'pending') as AdminBroadcastRecipientStatus,
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

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAdminBroadcasts() {
  const { user } = useAuth();

  const [campaigns, setCampaigns] = useState<AdminBroadcastCampaign[]>([]);
  const [recipientsByCampaign, setRecipientsByCampaign] = useState<Record<string, AdminBroadcastRecipient[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  /* ── helpers ──────────────────────────────────────────────── */

  const countRecipients = useCallback(async (campaignId: string, status?: AdminBroadcastRecipientStatus): Promise<number> => {
    let query = supabase
      .from('admin_broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);
    if (status) query = query.eq('status', status);
    const { count, error: e } = await query;
    if (e) throw e;
    return Number(count || 0);
  }, []);

  const getCampaignRecipientCounts = useCallback(async (campaignId: string) => {
    const [total, sent, failed, pending, sending] = await Promise.all([
      countRecipients(campaignId),
      countRecipients(campaignId, 'sent'),
      countRecipients(campaignId, 'failed'),
      countRecipients(campaignId, 'pending'),
      countRecipients(campaignId, 'sending'),
    ]);
    return { total, sent, failed, pending, sending };
  }, [countRecipients]);

  const fetchCampaignById = useCallback(async (campaignId: string): Promise<AdminBroadcastCampaign | null> => {
    const { data, error: e } = await supabase
      .from('admin_broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (e) throw e;
    if (!data) return null;
    return toAdminCampaign(data as CampaignRow);
  }, []);

  const refreshCampaignProgress = useCallback(async (campaignId: string) => {
    const { error: rpcError } = await supabase.rpc('admin_broadcast_refresh_campaign_progress', {
      p_campaign_id: campaignId,
    });

    if (!rpcError) return;
    if (!isSchemaMismatchError(rpcError)) throw rpcError;

    // fallback
    const counts = await getCampaignRecipientCounts(campaignId);
    const campaign = await fetchCampaignById(campaignId);
    const payload: Record<string, unknown> = {
      total_recipients: counts.total,
      sent_count: counts.sent,
      failed_count: counts.failed,
      updated_at: new Date().toISOString(),
    };
    if (campaign?.status === 'running' && counts.pending === 0 && counts.sending === 0) {
      payload.status = 'completed';
      payload.completed_at = new Date().toISOString();
    }
    const { error: updateError } = await supabase
      .from('admin_broadcast_campaigns')
      .update(payload)
      .eq('id', campaignId);
    if (updateError) throw updateError;
  }, [fetchCampaignById, getCampaignRecipientCounts]);

  /* ── CRUD ─────────────────────────────────────────────────── */

  const fetchCampaigns = useCallback(async () => {
    if (!user) {
      if (isMountedRef.current) { setCampaigns([]); setRecipientsByCampaign({}); }
      return [];
    }
    if (isMountedRef.current) { setIsLoading(true); setError(null); }

    const { data, error: e } = await supabase
      .from('admin_broadcast_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (e) {
      if (isMountedRef.current) { setError(e.message); setIsLoading(false); }
      throw e;
    }

    const mapped = (data || []).map((r) => toAdminCampaign(r as CampaignRow));
    if (isMountedRef.current) { setCampaigns(mapped); setIsLoading(false); }
    return mapped;
  }, [user]);

  const fetchCampaignRecipients = useCallback(async (campaignId: string) => {
    const { data, error: e } = await supabase
      .from('admin_broadcast_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (e) throw e;
    const mapped = (data || []).map((r) => toAdminRecipient(r as RecipientRow));
    if (isMountedRef.current) {
      setRecipientsByCampaign((prev) => ({ ...prev, [campaignId]: mapped }));
    }
    return mapped;
  }, []);

  const addRecipients = useCallback(async (campaignId: string, recipients: AdminBroadcastRecipientInput[]) => {
    if (!recipients.length) {
      await refreshCampaignProgress(campaignId);
      await fetchCampaigns();
      return 0;
    }
    const dedupe = new Map<string, { campaign_id: string; name: string; phone: string; email: string | null }>();
    for (const r of recipients) {
      const phone = normalizePhone(r.phone);
      if (!phone) continue;
      dedupe.set(phone, {
        campaign_id: campaignId,
        name: String(r.name || phone).trim() || phone,
        phone,
        email: r.email?.trim() || null,
      });
    }
    const rows = Array.from(dedupe.values());
    const chunkSize = 500;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const { error: insertError } = await supabase
        .from('admin_broadcast_recipients')
        .upsert(chunk, { onConflict: 'campaign_id,phone', ignoreDuplicates: true });
      if (insertError) throw insertError;
    }
    await refreshCampaignProgress(campaignId);
    await fetchCampaignRecipients(campaignId);
    await fetchCampaigns();
    return rows.length;
  }, [fetchCampaignRecipients, fetchCampaigns, refreshCampaignProgress]);

  const createCampaign = useCallback(async (input: AdminBroadcastCampaignInput): Promise<AdminBroadcastCampaign> => {
    if (!user) throw new Error('Usuário não autenticado');

    const messages = sanitizeMessages(input.messages);
    if (messages.length < 1) throw new Error('Informe ao menos 1 mensagem para a campanha');

    const payload = {
      owner_user_id: user.id,
      name: String(input.name || '').trim(),
      messages,
      instance_name: String(input.instance_name || '').trim(),
      interval_seconds: clampIntervalSeconds(input.interval_seconds),
      status: 'draft' as AdminBroadcastCampaignStatus,
    };

    if (!payload.name) throw new Error('Nome da campanha é obrigatório');
    if (!payload.instance_name) throw new Error('Selecione uma instância de WhatsApp');

    const { data, error: createError } = await supabase
      .from('admin_broadcast_campaigns')
      .insert(payload)
      .select('*')
      .single();
    if (createError) throw createError;

    const created = toAdminCampaign(data as CampaignRow);

    if (Array.isArray(input.recipients) && input.recipients.length > 0) {
      await addRecipients(created.id, input.recipients);
    } else {
      await refreshCampaignProgress(created.id);
      await fetchCampaigns();
    }

    return (await fetchCampaignById(created.id)) || created;
  }, [addRecipients, fetchCampaignById, fetchCampaigns, refreshCampaignProgress, user]);

  /* ── Status transitions ───────────────────────────────────── */

  const setCampaignStatus = useCallback(async (
    campaignId: string,
    status: AdminBroadcastCampaignStatus,
    extra: Record<string, unknown> = {},
  ) => {
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...extra };
    if (status === 'running') {
      payload.started_at = (extra.started_at as string | undefined) || new Date().toISOString();
      payload.completed_at = null;
    }
    if (status === 'completed' || status === 'canceled') {
      payload.completed_at = new Date().toISOString();
    }
    const { error: e } = await supabase
      .from('admin_broadcast_campaigns')
      .update(payload)
      .eq('id', campaignId);
    if (e) throw e;
  }, []);

  const invokeWorker = useCallback(async (campaignId: string) => {
    try {
      await supabase.functions.invoke('admin-broadcast-worker', {
        body: { campaign_id: campaignId, batch_size: 20 },
      });
    } catch {
      // worker might not be deployed yet – continue silently
    }
  }, []);

  const startCampaign = useCallback(async (campaignId: string) => {
    const campaign = await fetchCampaignById(campaignId);
    if (!campaign) throw new Error('Campanha não encontrada');

    if (sanitizeMessages(campaign.messages).length < 1) {
      throw new Error('A campanha precisa ter ao menos 1 mensagem para iniciar');
    }

    // reset stuck 'sending' recipients
    let resetResult = await supabase
      .from('admin_broadcast_recipients')
      .update({ status: 'pending', error_message: null, processing_started_at: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId)
      .eq('status', 'sending');

    if (resetResult.error && isSchemaMismatchError(resetResult.error)) {
      resetResult = await supabase
        .from('admin_broadcast_recipients')
        .update({ status: 'pending', error_message: null })
        .eq('campaign_id', campaignId)
        .eq('status', 'sending');
    }
    if (resetResult.error) throw resetResult.error;

    await refreshCampaignProgress(campaignId);
    const counts = await getCampaignRecipientCounts(campaignId);

    if (counts.pending === 0 && counts.sending === 0) {
      await setCampaignStatus(campaignId, 'completed');
      await fetchCampaigns();
      return;
    }

    await setCampaignStatus(campaignId, 'running');
    await fetchCampaigns();

    // kick-off a first worker invocation
    void invokeWorker(campaignId);
  }, [fetchCampaignById, fetchCampaigns, getCampaignRecipientCounts, invokeWorker, refreshCampaignProgress, setCampaignStatus]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    await setCampaignStatus(campaignId, 'paused');
    await fetchCampaigns();
  }, [fetchCampaigns, setCampaignStatus]);

  const resumeCampaign = useCallback(async (campaignId: string) => {
    await startCampaign(campaignId);
  }, [startCampaign]);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    let skipResult = await supabase
      .from('admin_broadcast_recipients')
      .update({ status: 'skipped', error_message: 'Campanha cancelada pelo usuário', processing_started_at: null, updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId)
      .in('status', SENDING_RECIPIENT_STATES);

    if (skipResult.error && isSchemaMismatchError(skipResult.error)) {
      skipResult = await supabase
        .from('admin_broadcast_recipients')
        .update({ status: 'skipped', error_message: 'Campanha cancelada pelo usuário' })
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
    const { error: delRec } = await supabase
      .from('admin_broadcast_recipients')
      .delete()
      .eq('campaign_id', campaignId);
    if (delRec) throw delRec;

    const { error: delCam } = await supabase
      .from('admin_broadcast_campaigns')
      .delete()
      .eq('id', campaignId);
    if (delCam) throw delCam;

    if (isMountedRef.current) {
      setRecipientsByCampaign((prev) => { const n = { ...prev }; delete n[campaignId]; return n; });
    }
    await fetchCampaigns();
  }, [fetchCampaigns]);

  /* ── Lifecycle & polling ──────────────────────────────────── */

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  useEffect(() => {
    if (!user) {
      if (isMountedRef.current) { setCampaigns([]); setRecipientsByCampaign({}); setError(null); setIsLoading(false); }
      return;
    }
    void fetchCampaigns();
    const interval = setInterval(() => { void fetchCampaigns(); }, POLLING_MS);
    return () => { clearInterval(interval); };
  }, [fetchCampaigns, user]);

  // Periodically invoke worker for running campaigns
  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === 'running');
    if (!hasRunning) return;

    const interval = setInterval(() => {
      for (const c of campaigns) {
        if (c.status === 'running') {
          void invokeWorker(c.id);
        }
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [campaigns, invokeWorker]);

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
