/**
 * admin-broadcast-worker
 * ─────────────────────────────────────────────────────────────
 * Mirrors broadcast-worker but targets:
 *   public.admin_broadcast_campaigns
 *   public.admin_broadcast_recipients
 *
 * No org_id, no billing, no lead upsert.
 * Uses evolution-proxy edge function for message delivery.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';

type ClaimedRecipientRow = {
  recipient_id: string;
  campaign_id: string;
  owner_user_id: string;
  instance_name: string;
  messages: unknown;
  interval_seconds: number | null;
  recipient_name: string;
  recipient_phone: string;
  recipient_email: string | null;
  attempt_count: number;
  max_attempts: number;
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

function pickRandomMessage(messages: unknown): string {
  const pool = sanitizeMessages(messages);
  if (pool.length === 0) {
    throw new Error('campaign_messages_empty');
  }
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

/* ── Auth resolution ────────────────────────────────────────── */

type InvocationScope = {
  mode: 'service_role' | 'internal_key' | 'authenticated_admin';
  userId: string | null;
  campaignId: string | null;
};

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
  const campaignId = String(body.campaign_id || '').trim() || null;

  // Internal key auth
  if (internalHeader && internalKey && internalHeader === internalKey) {
    return { mode: 'internal_key', userId: null, campaignId };
  }

  // Service role auth
  if (bearerToken && (bearerToken === serviceRoleKey || isServiceRoleBearerToken(bearerToken))) {
    return { mode: 'service_role', userId: null, campaignId };
  }

  // Authenticated user (must be system_admin)
  if (!authorizationHeader.trim()) {
    throw new Error('missing_auth');
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorizationHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user?.id) {
    throw new Error('unauthorized');
  }

  // Verify system admin
  const { data: adminRow, error: adminError } = await serviceClient
    .from('_admin_system_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    throw new Error('forbidden_not_admin');
  }

  return { mode: 'authenticated_admin', userId: user.id, campaignId };
}

/* ── Sending via evolution-proxy ────────────────────────────── */

async function sendWhatsAppViaProxy(
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  instanceName: string,
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
        instanceName,
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

/* ── Recipient status helpers ───────────────────────────────── */

async function markRecipientSuccess(
  serviceClient: ReturnType<typeof createClient>,
  recipientId: string,
) {
  const { error } = await serviceClient
    .from('admin_broadcast_recipients')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      error_message: null,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recipientId);

  if (error) throw error;
}

async function markRecipientFailure(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  errorMessage: string,
) {
  const safeMessage = String(errorMessage || 'broadcast_dispatch_failed').slice(0, 900);
  const shouldRetry = Number(row.attempt_count || 0) < Number(row.max_attempts || 3);
  const retryDelayMinutes = Math.min(60, Math.pow(2, Math.max(0, Number(row.attempt_count || 1) - 1)));
  const nextAttemptAt = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();

  const { error } = await serviceClient
    .from('admin_broadcast_recipients')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      error_message: safeMessage,
      sent_at: shouldRetry ? null : new Date().toISOString(),
      next_attempt_at: shouldRetry ? nextAttemptAt : null,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) throw error;
}

async function markRecipientDeferredByInterval(
  serviceClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  nextAttemptAt: string,
) {
  const restoredAttemptCount = Math.max(0, Number(row.attempt_count || 0) - 1);
  const { error } = await serviceClient
    .from('admin_broadcast_recipients')
    .update({
      status: 'pending',
      error_message: null,
      processing_started_at: null,
      next_attempt_at: nextAttemptAt,
      attempt_count: restoredAttemptCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) throw error;
}

/* ── Process a single claimed recipient ─────────────────────── */

async function processClaimedRecipient(
  serviceClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  row: ClaimedRecipientRow,
) {
  try {
    const phone = normalizePhone(row.recipient_phone);
    if (!phone) throw new Error('invalid_recipient_phone');

    const message = pickRandomMessage(row.messages);
    const personalised = message.replace(/\{\{name\}\}/g, row.recipient_name || 'contato');

    await sendWhatsAppViaProxy(
      supabaseUrl,
      serviceRoleKey,
      internalApiKey,
      row.instance_name,
      phone,
      personalised,
    );

    await markRecipientSuccess(serviceClient, row.recipient_id);
    return { success: true as const };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await markRecipientFailure(serviceClient, row, msg);
    return { success: false as const, error: msg };
  }
}

/* ── Main handler ───────────────────────────────────────────── */

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req, {
    allowHeaders: 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
  });
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return jsonResponse({ success: false, code: 'missing_allowed_origin' }, corsHeaders, 500);
    }
    if (!cors.originAllowed) {
      return jsonResponse({ success: false, code: 'origin_not_allowed' }, corsHeaders, 403);
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return jsonResponse({ success: false, code: 'missing_allowed_origin' }, corsHeaders, 500);
  }
  if (!cors.originAllowed) {
    return jsonResponse({ success: false, code: 'origin_not_allowed' }, corsHeaders, 403);
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

    // Requeue stale 'sending' recipients
    const { error: staleError } = await serviceClient.rpc('admin_broadcast_requeue_stale_recipients', {
      p_stale_minutes: 5,
    });
    if (staleError) {
      console.warn('[admin-broadcast-worker] stale_requeue_warning', staleError.message);
    }

    // Claim a batch of pending recipients
    const { data: claimedRows, error: claimError } = await serviceClient.rpc('admin_broadcast_claim_recipients', {
      p_limit: batchSize,
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

      // Respect interval between messages
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

    // Refresh progress counters for affected campaigns
    for (const campaignId of affectedCampaignIds) {
      const { error: refreshError } = await serviceClient.rpc('admin_broadcast_refresh_campaign_progress', {
        p_campaign_id: campaignId,
      });
      if (refreshError) {
        console.warn('[admin-broadcast-worker] refresh_campaign_progress_warning', {
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
