import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  selectRotatingBroadcastMessage,
} from '../_shared/broadcastDispatch.ts';
import { resolveRequestCors } from '../_shared/cors.ts';
import { validateServiceInvocationAuth } from '../_shared/invocationAuth.ts';

type ClaimedRecipientRow = {
  recipient_id: string;
  campaign_id: string;
  whatsapp_instance_id: string | null;
  instance_name: string | null;
  messages: unknown;
  interval_seconds: number | null;
  dispatch_order: number;
  recipient_name: string | null;
  recipient_phone: string;
  attempt_count: number;
  max_attempts: number;
};

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function getSupabaseEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('missing_supabase_env');
  }
  return { supabaseUrl, supabaseServiceRoleKey };
}

function getServiceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function getEvolutionEnv() {
  const baseUrl = String(Deno.env.get('EVOLUTION_API_URL') || '').trim().replace(/\/+$/, '');
  const apiKey = String(Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  if (!baseUrl || !apiKey) {
    throw new Error('missing_evolution_env');
  }
  return { baseUrl, apiKey };
}

function resolveEvolutionRequestConfig() {
  const timeoutMs = clamp(asNumber(Deno.env.get('EVOLUTION_REQUEST_TIMEOUT_MS'), 12_000), 1_000, 60_000);
  const maxRetries = clamp(asNumber(Deno.env.get('EVOLUTION_REQUEST_MAX_RETRIES'), 2), 0, 5);
  const baseBackoffMs = clamp(asNumber(Deno.env.get('EVOLUTION_REQUEST_BACKOFF_MS'), 350), 100, 10_000);
  return { timeoutMs, maxRetries, baseBackoffMs };
}

function isRetryableEvolutionStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRetryableEvolutionNetworkError(error: unknown): boolean {
  if (isAbortError(error)) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('fetch')
    || message.includes('network')
    || message.includes('connection')
    || message.includes('timed out')
    || message.includes('econnreset')
    || message.includes('econnrefused')
    || message.includes('enotfound')
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evolutionRequest(endpoint: string, options: RequestInit = {}) {
  const { baseUrl, apiKey } = getEvolutionEnv();
  const { timeoutMs, maxRetries, baseBackoffMs } = resolveEvolutionRequestConfig();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('apikey', apiKey);

      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: abortController.signal,
      });

      const payload = await response.json().catch(() => null);
      if (response.ok) {
        return payload;
      }

      const errorMessage = `evolution_request_failed:${response.status}:${JSON.stringify(payload)}`;
      if (attempt < maxRetries && isRetryableEvolutionStatus(response.status)) {
        console.warn('[internal-crm-broadcast-worker] evolution_request_retry_status', {
          endpoint,
          status: response.status,
          attempt: attempt + 1,
          maxRetries,
        });
        await wait(baseBackoffMs * (2 ** attempt));
        continue;
      }

      throw new Error(errorMessage);
    } catch (error) {
      if (attempt < maxRetries && isRetryableEvolutionNetworkError(error)) {
        console.warn('[internal-crm-broadcast-worker] evolution_request_retry_network', {
          endpoint,
          reason: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxRetries,
        });
        await wait(baseBackoffMs * (2 ** attempt));
        continue;
      }

      if (isAbortError(error)) {
        throw new Error(`evolution_request_timeout:${timeoutMs}`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new Error('evolution_request_exhausted_retries');
}

async function markRecipientSuccess(
  schemaClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
) {
  const { error } = await schemaClient
    .from('broadcast_recipients')
    .update({
      status: 'sent',
      last_attempt_at: new Date().toISOString(),
      last_error: null,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) throw error;
}

async function markRecipientFailure(
  schemaClient: ReturnType<typeof createClient>,
  row: ClaimedRecipientRow,
  errorMessage: string,
) {
  const safeMessage = String(errorMessage || 'broadcast_dispatch_failed').slice(0, 900);
  const shouldRetry = Number(row.attempt_count || 0) < Number(row.max_attempts || 3);
  const retryDelayMinutes = Math.min(60, Math.pow(2, Math.max(0, Number(row.attempt_count || 1) - 1)));
  const nextAttemptAt = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();

  const { error } = await schemaClient
    .from('broadcast_recipients')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      last_attempt_at: new Date().toISOString(),
      last_error: safeMessage,
      next_attempt_at: shouldRetry ? nextAttemptAt : null,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.recipient_id);

  if (error) throw error;
}

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) return json(500, { ok: false, code: 'missing_allowed_origin' }, corsHeaders);
    if (!cors.originAllowed) return json(403, { ok: false, code: 'forbidden_origin' }, corsHeaders);
    return new Response('ok', { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) return json(500, { ok: false, code: 'missing_allowed_origin' }, corsHeaders);
  if (!cors.originAllowed) return json(403, { ok: false, code: 'forbidden_origin' }, corsHeaders);

  try {
    const { supabaseServiceRoleKey } = getSupabaseEnv();
    const invocationAuth = validateServiceInvocationAuth(req, {
      serviceRoleKey: supabaseServiceRoleKey,
      internalApiKey: String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim(),
    });

    if (!invocationAuth.ok) {
      return json(invocationAuth.status, { ok: false, code: invocationAuth.code }, corsHeaders);
    }

    const payload = await req.json().catch(() => ({}));
    const campaignId = asString(payload?.campaign_id);
    const batchSize = Math.max(1, Math.min(200, asNumber(payload?.batch_size, 20)));
    const serviceClient = getServiceClient();
    const schemaClient = serviceClient.schema('internal_crm');

    const { error: staleError } = await schemaClient.rpc('broadcast_requeue_stale_recipients', {
      p_stale_minutes: 5,
    });
    if (staleError) {
      console.warn('[internal-crm-broadcast-worker] stale_requeue_warning', staleError.message);
    }

    const { data: claimedRows, error: claimError } = await schemaClient.rpc('broadcast_claim_recipients', {
      p_limit: batchSize,
      p_campaign_id: campaignId,
    });

    if (claimError) {
      throw new Error(`claim_failed:${claimError.message}`);
    }

    const jobs = Array.isArray(claimedRows) ? (claimedRows as ClaimedRecipientRow[]) : [];
    if (jobs.length === 0) {
      return json(200, { ok: true, claimed: 0, processed: 0, sent: 0, failed: 0 }, corsHeaders);
    }

    const summary = {
      ok: true,
      claimed: jobs.length,
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ recipient_id: string; campaign_id: string; error: string }>,
    };
    const affectedCampaignIds = new Set<string>();

    for (const job of jobs) {
      affectedCampaignIds.add(job.campaign_id);

      try {
        const phone = normalizePhone(job.recipient_phone);
        if (!phone) throw new Error('invalid_recipient_phone');
        if (!job.instance_name) throw new Error('missing_whatsapp_instance_name');

        const message = selectRotatingBroadcastMessage(job.messages, job.dispatch_order);
        const personalisedMessage = message.replace(/\{\{name\}\}/g, job.recipient_name || 'contato');

        await evolutionRequest(`/message/sendText/${job.instance_name}`, {
          method: 'POST',
          body: JSON.stringify({
            number: phone,
            text: personalisedMessage,
          }),
        });

        await markRecipientSuccess(schemaClient, job);
        summary.processed += 1;
        summary.sent += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'send_failed';
        await markRecipientFailure(schemaClient, job, errorMessage);
        summary.processed += 1;
        summary.failed += 1;
        summary.errors.push({
          recipient_id: job.recipient_id,
          campaign_id: job.campaign_id,
          error: errorMessage,
        });
      }
    }

    for (const affectedCampaignId of affectedCampaignIds) {
      const { error: refreshError } = await schemaClient.rpc('broadcast_refresh_campaign_progress', {
        p_campaign_id: affectedCampaignId,
      });
      if (refreshError) {
        console.warn('[internal-crm-broadcast-worker] refresh_campaign_progress_warning', {
          campaignId: affectedCampaignId,
          error: refreshError.message,
        });
      }
    }

    return json(200, summary, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error';
    return json(500, { ok: false, code: 'worker_failed', message }, corsHeaders);
  }
});
