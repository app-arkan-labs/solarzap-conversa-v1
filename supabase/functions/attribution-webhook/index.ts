import { createClient } from 'npm:@supabase/supabase-js@2';
import { applyLeadAttribution } from '../_shared/trackingAttribution.ts';
import {
  type AttributionWebhookRepo,
  handleAttributionWebhook,
  type OrgTrackingSettingsRow,
  type RateLimitResult,
} from '../_shared/attributionWebhookService.ts';
import { resolveLeadCanonicalId } from '../_shared/leadCanonical.ts';
import { fetchVaultSecret } from '../_shared/vault.ts';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN');
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env');
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL env');
}

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toRateLimitResult(raw: unknown): RateLimitResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    remaining: Number(row.remaining || 0),
    limit_per_minute: Number(row.limit_per_minute || 0),
    current_count: Number(row.current_count || 0),
  };
}

function rolePriority(role: string | null | undefined): number {
  if (role === 'owner') return 1;
  if (role === 'admin') return 2;
  if (role === 'user') return 3;
  if (role === 'consultant') return 4;
  return 10;
}

const repo: AttributionWebhookRepo = {
  async getOrgSettingsByPublicKey(key) {
    const { data, error } = await supabase
      .from('org_tracking_settings')
      .select(
        'org_id, rate_limit_per_minute, recaptcha_enabled, recaptcha_secret_vault_id, force_channel_overwrite, auto_channel_attribution, blocklist_ips, blocklist_phones',
      )
      .eq('webhook_public_key', key)
      .maybeSingle();

    if (error || !data?.org_id) return null;
    return data as OrgTrackingSettingsRow;
  },

  async consumeRateLimit(orgId) {
    const { data, error } = await supabase.rpc('tracking_consume_webhook_rate_limit', {
      p_org_id: orgId,
    });
    if (error) return null;

    const firstRow = Array.isArray(data) ? data[0] : data;
    return toRateLimitResult(firstRow);
  },

  async resolveOrgPrimaryUserId(orgId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, role, created_at')
      .eq('org_id', orgId)
      .limit(100);

    if (error || !data || data.length < 1) return null;

    const sorted = [...data].sort((a, b) => {
      const priorityDiff = rolePriority(String(a.role || '')) - rolePriority(String(b.role || ''));
      if (priorityDiff !== 0) return priorityDiff;

      const aTime = new Date(String(a.created_at || '')).getTime();
      const bTime = new Date(String(b.created_at || '')).getTime();
      return aTime - bTime;
    });

    const first = sorted[0];
    return typeof first?.user_id === 'string' ? first.user_id : null;
  },

  async findLeadByPhone(orgId, phoneE164) {
    const byE164 = await supabase
      .from('leads')
      .select('id')
      .eq('org_id', orgId)
      .eq('phone_e164', phoneE164)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!byE164.error && byE164.data?.id) {
      return { id: Number(byE164.data.id) };
    }

    const byTelefone = await supabase
      .from('leads')
      .select('id')
      .eq('org_id', orgId)
      .eq('telefone', phoneE164)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!byTelefone.error && byTelefone.data?.id) {
      return { id: Number(byTelefone.data.id) };
    }

    return null;
  },

  async createLead(input) {
    const { orgId, userId, phoneE164, email, name } = input;

    const resolvedLead = await resolveLeadCanonicalId({
      supabase,
      userId,
      orgId,
      instanceName: 'attribution-webhook',
      phoneE164,
      telefone: phoneE164,
      name,
      pushName: name,
      source: 'webhook',
      channel: 'other',
    });

    if (!resolvedLead.leadId) {
      console.error('[attribution-webhook] failed to resolve lead for payload', {
        orgId,
        userId,
        phoneE164,
        method: resolvedLead.method,
        error: resolvedLead.error,
      });
      return null;
    }

    if (email) {
      await supabase
        .from('leads')
        .update({ email })
        .eq('id', resolvedLead.leadId)
        .eq('org_id', orgId);
    }

    return { id: resolvedLead.leadId };
  },

  async patchLead(orgId, leadId, patch) {
    const updatePayload: Record<string, unknown> = {};
    if (patch.name) updatePayload.nome = patch.name;
    if (patch.email) updatePayload.email = patch.email;
    if (Object.keys(updatePayload).length < 1) return;

    await supabase.from('leads').update(updatePayload).eq('id', leadId).eq('org_id', orgId);
  },

  async getSecretByVaultId(vaultId) {
    return fetchVaultSecret(supabase, vaultId);
  },
};

async function verifyRecaptcha(input: { secret: string; token: string; remoteIp: string | null }): Promise<boolean> {
  const body = new URLSearchParams({
    secret: input.secret,
    response: input.token,
  });

  if (input.remoteIp) {
    body.set('remoteip', input.remoteIp);
  }

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) return false;

  const payload = (await response.json()) as Record<string, unknown>;
  return payload.success === true;
}

Deno.serve(async (req: Request) =>
  handleAttributionWebhook(req, {
    allowedOrigin: ALLOWED_ORIGIN,
    repo,
    applyAttribution: (input) => applyLeadAttribution(supabase, input),
    verifyRecaptcha,
  }),
);

