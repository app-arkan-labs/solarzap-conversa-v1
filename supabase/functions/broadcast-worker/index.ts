import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
import { recordUsage } from '../_shared/billing.ts';

type ClaimedRecipientRow = {
  recipient_id: string;
  campaign_id: string;
  org_id: string;
  user_id: string;
  assigned_to_user_id: string | null;
  lead_client_type: string;
  instance_name: string;
  source_channel: string;
  pipeline_stage: string;
  ai_enabled: boolean;
  messages: unknown;
  recipient_name: string;
  recipient_phone: string;
  recipient_email: string | null;
  interval_seconds: number | null;
  attempt_count: number;
  max_attempts: number;
};

type InvocationScope = {
  mode: 'service_role' | 'internal_key' | 'authenticated_user';
  orgId: string | null;
  campaignId: string | null;
  userId: string | null;
};

function jsonResponse(body: Record<string, unknown>, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractBearerToken(authHeader: string): string {
  const trimmed = authHeader.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isServiceRoleBearerToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return String(payload?.role || '') === 'service_role';
}

function normalizePhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function sanitizeMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

function clampIntervalSeconds(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3600, Math.round(value)));
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  return /column/i.test(String(error.message || '')) && /not exist|schema cache/i.test(String(error.message || ''));
}

async function resolveAuthenticatedScope(
  authorizationHeader: string,
  body: Record<string, unknown>,
  supabaseUrl: string,
  supabaseAnonKey: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<InvocationScope> {
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorizationHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user?.id) {
    throw new Error('unauthorized');
  }

  const requestedCampaignId = String(body.campaign_id || '').trim();
  if (requestedCampaignId) {
    const { data: campaign, error: campaignError } = await serviceClient
      .from('broadcast_campaigns')
      .select('id, org_id')
      .eq('id', requestedCampaignId)
      .maybeSingle();

    if (campaignError || !campaign?.org_id) {
      throw new Error('campaign_not_found');
    }

    const { data: membership, error: membershipError } = await serviceClient
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', campaign.org_id)
      .maybeSingle();

    if (membershipError || !membership?.org_id) {
      throw new Error('forbidden_campaign_scope');
    }

    return {
      mode: 'authenticated_user',
      userId: user.id,
      orgId: String(campaign.org_id),
      campaignId: requestedCampaignId,
    };
  }

  const requestedOrgId = String(body.org_id || '').trim();
  if (requestedOrgId) {
    const { data: membership, error: membershipError } = await serviceClient
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', requestedOrgId)
      .maybeSingle();

    if (membershipError || !membership?.org_id) {
      throw new Error('forbidden_org_scope');
    }

    return {
      mode: 'authenticated_user',
      userId: user.id,
      orgId: requestedOrgId,
      campaignId: null,
    };
  }

  const { data: membership, error: membershipError } = await serviceClient
    .from('organization_members')
    .select('org_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.org_id) {
    throw new Error('organization_membership_not_found');
  }

  return {
    mode: 'authenticated_user',
    userId: user.id,
    orgId: String(membership.org_id),
    campaignId: null,
  };
}

async function resolveInvocationScope(
  req: Request,
  body: Record<string, unknown>,
  supabaseUrl: string,
  supabaseAnonKey: string,
  serviceRoleKey: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<InvocationScope> {
  const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const internalHeader = String(req.headers.get('x-internal-api-key') || '').trim();
  const internalKey = String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim();
  const bearerToken = extractBearerToken(authorizationHeader);

  if (internalHeader && internalKey && internalHeader === internalKey) {
    return {
      mode: 'internal_key',
      userId: null,
      orgId: String(body.org_id || '').trim() || null,
      campaignId: String(body.campaign_id || '').trim() || null,
    };
  }

  if (bearerToken && (bearerToken === serviceRoleKey || isServiceRoleBearerToken(bearerToken))) {
    return {
      mode: 'service_role',
      userId: null,
      orgId: String(body.org_id || '').trim() || null,
      campaignId: String(body.campaign_id || '').trim() || null,
    };
  }

  if (!authorizationHeader.trim()) {
    throw new Error('missing_auth');
  }

  return resolveAuthenticatedScope(
    authorizationHeader,
    body,
    supabaseUrl,
    supabaseAnonKey,
    serviceClient,
  );
}

function pickRandomMessage(messages: unknown): string {
  const pool = sanitizeMessages(messages);
  if (pool.length === 0) {
    throw new Error('campaign_messages_empty');
  }
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

async function upsertLeadForRecipient(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
): Promise<number | null> {
  const normalizedPhone = normalizePhone(row.recipient_phone);
  if (!normalizedPhone) return null;

  const assigneeUserId = String(row.assigned_to_user_id || row.user_id || '').trim();
  const ownerUserId = assigneeUserId || String(row.user_id || '').trim();
  if (!ownerUserId) return null;

  let leadId: number | null = null;

  const { data: canonicalData, error: canonicalError } = await serviceClient
    .rpc('upsert_lead_canonical', {
      p_user_id: ownerUserId,
      p_org_id: row.org_id,
      p_instance_name: row.instance_name,
      p_phone_e164: normalizedPhone,
      p_telefone: normalizedPhone,
      p_name: row.recipient_name || normalizedPhone,
      p_push_name: row.recipient_name || normalizedPhone,
      p_source: row.source_channel || 'cold_list',
    })
    .maybeSingle();

  if (!canonicalError && canonicalData) {
    const candidate = Number((canonicalData as Record<string, unknown>).id || 0) || null;
    if (candidate) {
      const { data: lead } = await serviceClient
        .from('leads')
        .select('id, org_id')
        .eq('id', candidate)
        .eq('org_id', row.org_id)
        .maybeSingle();
      if (lead?.id) {
        leadId = Number(lead.id);
      }
    }
  }

  if (!leadId) {
    const { data: existingLead } = await serviceClient
      .from('leads')
      .select('id')
      .eq('org_id', row.org_id)
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
      org_id: row.org_id,
      user_id: ownerUserId,
      assigned_to_user_id: ownerUserId,
      nome: row.recipient_name || normalizedPhone,
      telefone: normalizedPhone,
      phone_e164: normalizedPhone,
      email: row.recipient_email || null,
      canal: row.source_channel || 'cold_list',
      status_pipeline: row.pipeline_stage || 'novo_lead',
      tipo_cliente: String(row.lead_client_type || 'residencial').trim() || 'residencial',
      consumo_kwh: 0,
      valor_estimado: 0,
      observacoes: '',
      instance_name: row.instance_name,
      ai_enabled: true,
    };

    let insertResult = await serviceClient
      .from('leads')
      .insert(baseInsertPayload)
      .select('id')
      .single();

    if (insertResult.error && isMissingColumnError(insertResult.error)) {
      insertResult = await serviceClient
        .from('leads')
        .insert({
          org_id: row.org_id,
          user_id: ownerUserId,
          assigned_to_user_id: ownerUserId,
          nome: row.recipient_name || normalizedPhone,
          telefone: normalizedPhone,
          email: row.recipient_email || null,
          canal: row.source_channel || 'cold_list',
          status_pipeline: row.pipeline_stage || 'novo_lead',
          consumo_kwh: 0,
          valor_estimado: 0,
          observacoes: '',
        })
        .select('id')
        .single();
    }

    if (insertResult.error) {
      throw insertResult.error;
    }

    leadId = Number(insertResult.data?.id || 0) || null;
  }

  if (leadId) {
    let updateResult = await serviceClient
      .from('leads')
      .update({
        status_pipeline: row.pipeline_stage || 'novo_lead',
        canal: row.source_channel || 'cold_list',
        ai_enabled: true,
        ai_paused_reason: null,
        ai_paused_at: null,
        phone_e164: normalizedPhone,
        telefone: normalizedPhone,
        instance_name: row.instance_name,
        assigned_to_user_id: ownerUserId,
      })
      .eq('id', leadId)
      .eq('org_id', row.org_id)
      .select('id')
      .maybeSingle();

    if (updateResult.error && isMissingColumnError(updateResult.error)) {
      updateResult = await serviceClient
        .from('leads')
        .update({
          status_pipeline: row.pipeline_stage || 'novo_lead',
          canal: row.source_channel || 'cold_list',
        })
        .eq('id', leadId)
        .eq('org_id', row.org_id)
        .select('id')
        .maybeSingle();
    }

    if (updateResult.error) {
      console.warn('[broadcast-worker] lead_update_warning', {
        leadId,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        error: updateResult.error.message,
      });
    }
  }

  return leadId;
}

async function sendWhatsAppViaProxy(
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  row: ClaimedRecipientRow,
  number: string,
  text: string,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (internalApiKey) {
    headers['x-internal-api-key'] = internalApiKey;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/evolution-proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'send-text',
      payload: {
        orgId: row.org_id,
        instanceName: row.instance_name,
        number,
        text,
      },
    }),
  });

  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  if (!response.ok) {
    throw new Error(`proxy_http_${response.status}:${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  const success = typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).success !== false;
  if (!success) {
    throw new Error(`proxy_failed:${JSON.stringify(parsed)}`);
  }

  return parsed as Record<string, unknown>;
}

async function insertOutboundInteraction(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  leadId: number | null,
  message: string,
  waMessageId: string | null,
) {
  const normalizedPhone = normalizePhone(row.recipient_phone);
  const remoteJid = normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : null;

  const { error } = await serviceClient
    .from('interacoes')
    .insert({
      org_id: row.org_id,
      user_id: row.assigned_to_user_id || row.user_id,
      lead_id: leadId,
      mensagem: message,
      tipo: 'mensagem_vendedor',
      wa_from_me: true,
      instance_name: row.instance_name,
      phone_e164: normalizedPhone,
      remote_jid: remoteJid,
      wa_message_id: waMessageId,
    });

  if (error) {
    throw error;
  }
}

async function markRecipientSuccess(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  leadId: number | null,
) {
  const { error } = await serviceClient
    .from('broadcast_recipients')
    .update({
      status: 'sent',
      lead_id: leadId,
      sent_at: new Date().toISOString(),
      error_message: null,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) {
    throw error;
  }
}

async function markRecipientFailure(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  errorMessage: string,
  leadId: number | null,
) {
  const safeMessage = String(errorMessage || 'broadcast_dispatch_failed').slice(0, 900);
  const shouldRetry = Number(row.attempt_count || 0) < Number(row.max_attempts || 3);
  const retryDelayMinutes = Math.min(60, Math.pow(2, Math.max(0, Number(row.attempt_count || 1) - 1)));
  const nextAttemptAt = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();

  const { error } = await serviceClient
    .from('broadcast_recipients')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      lead_id: leadId,
      error_message: safeMessage,
      sent_at: shouldRetry ? null : new Date().toISOString(),
      next_attempt_at: shouldRetry ? nextAttemptAt : null,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) {
    throw error;
  }
}

async function markRecipientDeferredByInterval(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  nextAttemptAt: string,
) {
  const restoredAttemptCount = Math.max(0, Number(row.attempt_count || 0) - 1);
  const { error } = await serviceClient
    .from('broadcast_recipients')
    .update({
      status: 'pending',
      error_message: null,
      processing_started_at: null,
      next_attempt_at: nextAttemptAt,
      attempt_count: restoredAttemptCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) {
    throw error;
  }
}

async function processClaimedRecipient(
  serviceClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  row: ClaimedRecipientRow,
) {
  let leadId: number | null = null;

  try {
    const normalizedPhone = normalizePhone(row.recipient_phone);
    if (!normalizedPhone) {
      throw new Error('invalid_recipient_phone');
    }

    const message = pickRandomMessage(row.messages);
    leadId = await upsertLeadForRecipient(serviceClient, row);
    const sendResponse = await sendWhatsAppViaProxy(
      supabaseUrl,
      serviceRoleKey,
      internalApiKey,
      row,
      normalizedPhone,
      message,
    );

    const sendData = (sendResponse.data || {}) as Record<string, unknown>;
    const key = (sendData.key || {}) as Record<string, unknown>;
    const waMessageId = key.id ? String(key.id) : null;

    await insertOutboundInteraction(serviceClient, row, leadId, message, waMessageId);
    await markRecipientSuccess(serviceClient, row, leadId);

    try {
      await recordUsage(serviceClient, {
        orgId: row.org_id,
        userId: row.assigned_to_user_id || row.user_id,
        leadId,
        eventType: 'broadcast_credit_consumed',
        quantity: 1,
        source: 'broadcast-worker',
        metadata: {
          campaign_id: row.campaign_id,
          recipient_id: row.recipient_id,
        },
      });
    } catch (usageError) {
      console.warn('[broadcast-worker] usage_metering_warning', {
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        error: usageError instanceof Error ? usageError.message : String(usageError),
      });
    }

    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markRecipientFailure(serviceClient, row, message, leadId);
    return { success: false as const, error: message };
  }
}

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req, {
    allowHeaders: 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
  });
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return jsonResponse(
        { success: false, code: 'missing_allowed_origin', error: 'ALLOWED_ORIGINS/ALLOWED_ORIGIN nao configurados.' },
        corsHeaders,
        500,
      );
    }
    if (!cors.originAllowed) {
      return jsonResponse({ success: false, code: 'origin_not_allowed', error: 'Origin nao permitida.' }, corsHeaders, 403);
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return jsonResponse(
      { success: false, code: 'missing_allowed_origin', error: 'ALLOWED_ORIGINS/ALLOWED_ORIGIN nao configurados.' },
      corsHeaders,
      500,
    );
  }

  if (!cors.originAllowed) {
    return jsonResponse({ success: false, code: 'origin_not_allowed', error: 'Origin nao permitida.' }, corsHeaders, 403);
  }

  try {
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
    const supabaseAnonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
    const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const internalApiKey = String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim();

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'missing_supabase_env' }, corsHeaders, 500);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const batchSizeRaw = Number(body.batch_size || body.batchSize || 20);
    const batchSize = Number.isFinite(batchSizeRaw)
      ? Math.max(1, Math.min(200, Math.round(batchSizeRaw)))
      : 20;

    const scope = await resolveInvocationScope(
      req,
      body,
      supabaseUrl,
      supabaseAnonKey,
      serviceRoleKey,
      serviceClient,
    );

    const { error: staleError } = await serviceClient.rpc('broadcast_requeue_stale_recipients', {
      p_stale_minutes: 5,
    });
    if (staleError) {
      console.warn('[broadcast-worker] stale_requeue_warning', staleError.message);
    }

    const { data: claimedRows, error: claimError } = await serviceClient.rpc('broadcast_claim_recipients', {
      p_limit: batchSize,
      p_org_id: scope.orgId,
      p_campaign_id: scope.campaignId,
    });

    if (claimError) {
      throw new Error(`claim_failed:${claimError.message}`);
    }

    const jobs = Array.isArray(claimedRows) ? (claimedRows as ClaimedRecipientRow[]) : [];
    if (jobs.length === 0) {
      return jsonResponse({
        success: true,
        claimed: 0,
        processed: 0,
        sent: 0,
        failed: 0,
        scope: {
          mode: scope.mode,
          org_id: scope.orgId,
          campaign_id: scope.campaignId,
          user_id: scope.userId,
        },
      }, corsHeaders, 200);
    }

    const summary = {
      success: true,
      claimed: jobs.length,
      processed: 0,
      sent: 0,
      failed: 0,
      deferred: 0,
      errors: [] as Array<{ recipient_id: string; campaign_id: string; error: string }>,
    };

    const affectedCampaignIds = new Set<string>();
    const nextAvailableByCampaign = new Map<string, number>();
    for (const job of jobs) {
      affectedCampaignIds.add(job.campaign_id);
      const intervalSeconds = clampIntervalSeconds(job.interval_seconds);
      const nowMs = Date.now();
      const nextAvailableAtMs = nextAvailableByCampaign.get(job.campaign_id) ?? nowMs;

      if (intervalSeconds > 0 && nowMs < nextAvailableAtMs) {
        await markRecipientDeferredByInterval(
          serviceClient,
          job,
          new Date(nextAvailableAtMs).toISOString(),
        );
        summary.deferred += 1;
        continue;
      }

      const outcome = await processClaimedRecipient(
        serviceClient,
        supabaseUrl,
        serviceRoleKey,
        internalApiKey,
        job,
      );

      if (intervalSeconds > 0) {
        const anchorMs = Math.max(nowMs, nextAvailableAtMs);
        nextAvailableByCampaign.set(job.campaign_id, anchorMs + (intervalSeconds * 1000));
      }

      summary.processed += 1;
      if (outcome.success) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
        summary.errors.push({
          recipient_id: job.recipient_id,
          campaign_id: job.campaign_id,
          error: String(outcome.error || 'unknown_dispatch_error'),
        });
      }
    }

    for (const campaignId of affectedCampaignIds) {
      const { error: refreshError } = await serviceClient.rpc('broadcast_refresh_campaign_progress', {
        p_campaign_id: campaignId,
      });
      if (refreshError) {
        console.warn('[broadcast-worker] refresh_campaign_progress_warning', {
          campaignId,
          error: refreshError.message,
        });
      }
    }

    return jsonResponse(summary, corsHeaders, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authError = /unauthorized|missing_auth|forbidden/i.test(message);
    return jsonResponse(
      { success: false, error: message },
      corsHeaders,
      authError ? 401 : 500,
    );
  }
});
