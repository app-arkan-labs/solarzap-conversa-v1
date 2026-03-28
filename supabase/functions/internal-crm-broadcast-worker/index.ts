import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
import { validateServiceInvocationAuth } from '../_shared/invocationAuth.ts';

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

async function evolutionRequest(endpoint: string, options: RequestInit = {}) {
  const { baseUrl, apiKey } = getEvolutionEnv();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`evolution_request_failed:${response.status}:${JSON.stringify(payload)}`);
  }
  return payload;
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
    const batchSize = Math.max(1, Math.min(50, asNumber(payload?.batch_size, 20)));
    const serviceClient = getServiceClient();
    const schema = serviceClient.schema('internal_crm');

    let campaignQuery = schema
      .from('broadcast_campaigns')
      .select('id, name, whatsapp_instance_id, messages, status, sent_count, failed_count')
      .eq('status', 'running')
      .order('updated_at', { ascending: true });

    if (campaignId) {
      campaignQuery = campaignQuery.eq('id', campaignId);
    }

    const { data: campaigns, error: campaignsError } = await campaignQuery.limit(10);
    if (campaignsError) {
      throw campaignsError;
    }

    const processedRecipients: string[] = [];

    for (const campaign of campaigns || []) {
      if (!campaign.whatsapp_instance_id) continue;

      const [{ data: instance }, { data: recipients, error: recipientsError }] = await Promise.all([
        schema.from('whatsapp_instances').select('id, instance_name, status').eq('id', campaign.whatsapp_instance_id).maybeSingle(),
        schema
          .from('broadcast_recipients')
          .select('id, recipient_name, recipient_phone, status, attempt_count')
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(batchSize),
      ]);

      if (recipientsError || !instance?.instance_name) {
        continue;
      }

      const messages = Array.isArray(campaign.messages) ? campaign.messages.map((item) => String(item || '').trim()).filter(Boolean) : [];
      const messageToSend = messages[0] || `Ola! Seguimos com a campanha ${campaign.name}.`;

      for (const recipient of recipients || []) {
        const phone = normalizePhone(recipient.recipient_phone);
        if (!phone) {
          await schema.from('broadcast_recipients').update({
            status: 'failed',
            attempt_count: asNumber(recipient.attempt_count, 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: 'invalid_phone',
            updated_at: new Date().toISOString(),
          }).eq('id', recipient.id);

          await schema.from('broadcast_campaigns').update({
            failed_count: asNumber(campaign.failed_count, 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', campaign.id);
          continue;
        }

        try {
          await evolutionRequest(`/message/sendText/${instance.instance_name}`, {
            method: 'POST',
            body: JSON.stringify({
              number: phone,
              text: messageToSend.replace(/\{\{name\}\}/g, recipient.recipient_name || 'contato'),
            }),
          });

          await schema.from('broadcast_recipients').update({
            status: 'sent',
            attempt_count: asNumber(recipient.attempt_count, 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq('id', recipient.id);

          await schema.from('broadcast_campaigns').update({
            sent_count: asNumber(campaign.sent_count, 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', campaign.id);

          processedRecipients.push(String(recipient.id));
        } catch (error) {
          await schema.from('broadcast_recipients').update({
            status: 'failed',
            attempt_count: asNumber(recipient.attempt_count, 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: error instanceof Error ? error.message : 'send_failed',
            updated_at: new Date().toISOString(),
          }).eq('id', recipient.id);

          await schema.from('broadcast_campaigns').update({
            failed_count: asNumber(campaign.failed_count, 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', campaign.id);
        }
      }
    }

    return json(200, { ok: true, processed_recipients: processedRecipients }, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error';
    return json(500, { ok: false, code: 'worker_failed', message }, corsHeaders);
  }
});
