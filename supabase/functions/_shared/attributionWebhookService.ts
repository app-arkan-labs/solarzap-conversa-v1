import type { AttributionApplyResult, AttributionInput } from './trackingAttribution.ts';
import {
  buildRawQueryString,
  cleanPayloadString,
  extractClientIp,
  extractRecaptchaToken,
  isBlockedBySettings,
  isHoneypotTriggered,
  normalizeEmail,
  normalizePhoneE164,
  parseWebhookPayload,
  pickPayloadValue,
} from './attributionWebhook.ts';

export type OrgTrackingSettingsRow = {
  org_id: string;
  rate_limit_per_minute: number | null;
  recaptcha_enabled: boolean | null;
  recaptcha_secret_vault_id: string | null;
  force_channel_overwrite: boolean | null;
  auto_channel_attribution: boolean | null;
  blocklist_ips?: unknown;
  blocklist_phones?: unknown;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit_per_minute: number;
  current_count: number;
};

export type LeadReference = {
  id: number;
};

export type LeadCreateInput = {
  orgId: string;
  userId: string;
  phoneE164: string;
  email: string | null;
  name: string | null;
};

export type LeadPatchInput = {
  name?: string | null;
  email?: string | null;
};

export interface AttributionWebhookRepo {
  getOrgSettingsByPublicKey(key: string): Promise<OrgTrackingSettingsRow | null>;
  consumeRateLimit(orgId: string): Promise<RateLimitResult | null>;
  resolveOrgPrimaryUserId(orgId: string): Promise<string | null>;
  findLeadByPhone(orgId: string, phoneE164: string): Promise<LeadReference | null>;
  createLead(input: LeadCreateInput): Promise<LeadReference | null>;
  patchLead(orgId: string, leadId: number, patch: LeadPatchInput): Promise<void>;
  getSecretByVaultId(vaultId: string): Promise<string | null>;
}

export type RecaptchaVerifyInput = {
  secret: string;
  token: string;
  remoteIp: string | null;
};

export type AttributionWebhookDeps = {
  allowedOrigin: string;
  repo: AttributionWebhookRepo;
  applyAttribution: (input: AttributionInput) => Promise<AttributionApplyResult>;
  verifyRecaptcha: (input: RecaptchaVerifyInput) => Promise<boolean>;
};

function jsonResponse(status: number, body: Record<string, unknown>, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function noContentResponse(status: number, corsHeaders: Record<string, string>): Response {
  return new Response(null, { status, headers: corsHeaders });
}

function buildCorsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-szap-org-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function resolveLeadName(payload: Record<string, string | null>): string | null {
  return pickPayloadValue(payload, ['name', 'nome', 'full_name']);
}

function resolveAttributionInput(params: {
  orgId: string;
  leadId: number;
  payload: Record<string, string | null>;
  phoneE164: string;
  email: string | null;
  clientIp: string | null;
  userAgent: string | null;
}): AttributionInput {
  const { orgId, leadId, payload, phoneE164, email, clientIp, userAgent } = params;

  const rawQuerystring =
    cleanPayloadString(payload.raw_querystring) ||
    cleanPayloadString(payload._szap_qs) ||
    buildRawQueryString(payload);

  return {
    orgId,
    leadId,
    messageText: pickPayloadValue(payload, ['message', 'mensagem', 'note', 'notes']),
    utm_source: cleanPayloadString(payload.utm_source),
    utm_medium: cleanPayloadString(payload.utm_medium),
    utm_campaign: cleanPayloadString(payload.utm_campaign),
    utm_content: cleanPayloadString(payload.utm_content),
    utm_term: cleanPayloadString(payload.utm_term),
    raw_querystring: rawQuerystring,
    gclid: cleanPayloadString(payload.gclid),
    gbraid: cleanPayloadString(payload.gbraid),
    wbraid: cleanPayloadString(payload.wbraid),
    fbclid: cleanPayloadString(payload.fbclid),
    fbc: cleanPayloadString(payload._szap_fbc) || cleanPayloadString(payload.fbc),
    fbp: cleanPayloadString(payload._szap_fbp) || cleanPayloadString(payload.fbp),
    ttclid: cleanPayloadString(payload.ttclid),
    msclkid: cleanPayloadString(payload.msclkid),
    session_id: cleanPayloadString(payload.session_id) || cleanPayloadString(payload._szap_sid),
    landing_page_url: cleanPayloadString(payload.landing_page_url) || cleanPayloadString(payload._szap_lp),
    referrer_url: cleanPayloadString(payload.referrer_url) || cleanPayloadString(payload._szap_ref),
    user_email: email,
    user_phone: phoneE164,
    user_ip: clientIp,
    user_agent: userAgent,
  };
}

function normalizeRateLimitResult(raw: RateLimitResult | null): RateLimitResult {
  if (!raw) {
    return {
      allowed: false,
      remaining: 0,
      limit_per_minute: 0,
      current_count: 0,
    };
  }

  return {
    allowed: raw.allowed === true,
    remaining: Number(raw.remaining || 0),
    limit_per_minute: Number(raw.limit_per_minute || 0),
    current_count: Number(raw.current_count || 0),
  };
}

export async function handleAttributionWebhook(req: Request, deps: AttributionWebhookDeps): Promise<Response> {
  const corsHeaders = buildCorsHeaders(deps.allowedOrigin);

  if (req.method === 'OPTIONS') {
    return noContentResponse(200, corsHeaders);
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' }, corsHeaders);
  }

  try {
    const payload = await parseWebhookPayload(req);
    const orgKey = cleanPayloadString(req.headers.get('x-szap-org-key'));

    if (!orgKey) {
      return jsonResponse(401, { error: 'missing_org_key' }, corsHeaders);
    }

    const settings = await deps.repo.getOrgSettingsByPublicKey(orgKey);
    if (!settings?.org_id) {
      return jsonResponse(401, { error: 'invalid_org_key' }, corsHeaders);
    }

    const rateLimit = normalizeRateLimitResult(await deps.repo.consumeRateLimit(settings.org_id));
    if (!rateLimit.allowed) {
      return jsonResponse(
        429,
        {
          error: 'rate_limited',
          limit_per_minute: rateLimit.limit_per_minute,
          current_count: rateLimit.current_count,
        },
        corsHeaders,
      );
    }

    if (isHoneypotTriggered(payload)) {
      return noContentResponse(204, corsHeaders);
    }

    const clientIp = extractClientIp(req);
    const phoneE164 = normalizePhoneE164(pickPayloadValue(payload, ['phone', 'telefone', 'phone_e164']));
    const email = normalizeEmail(pickPayloadValue(payload, ['email']));
    const leadName = resolveLeadName(payload);

    if (!phoneE164) {
      return jsonResponse(422, { error: 'invalid_phone' }, corsHeaders);
    }

    const blockedCheck = isBlockedBySettings(settings, { ip: clientIp, phone: phoneE164 });
    if (blockedCheck.blocked) {
      return jsonResponse(403, { error: 'blocked_request', blocked_by: blockedCheck.reason }, corsHeaders);
    }

    if (settings.recaptcha_enabled === true) {
      const recaptchaToken = extractRecaptchaToken(payload);
      if (!recaptchaToken) {
        return jsonResponse(400, { error: 'missing_recaptcha_token' }, corsHeaders);
      }

      if (!settings.recaptcha_secret_vault_id) {
        return jsonResponse(500, { error: 'missing_recaptcha_secret' }, corsHeaders);
      }

      const recaptchaSecret = await deps.repo.getSecretByVaultId(settings.recaptcha_secret_vault_id);
      if (!recaptchaSecret) {
        return jsonResponse(500, { error: 'missing_recaptcha_secret' }, corsHeaders);
      }

      const recaptchaValid = await deps.verifyRecaptcha({
        secret: recaptchaSecret,
        token: recaptchaToken,
        remoteIp: clientIp,
      });

      if (!recaptchaValid) {
        return jsonResponse(400, { error: 'invalid_recaptcha' }, corsHeaders);
      }
    }

    let leadRef = await deps.repo.findLeadByPhone(settings.org_id, phoneE164);

    if (!leadRef?.id) {
      const orgUserId = await deps.repo.resolveOrgPrimaryUserId(settings.org_id);
      if (!orgUserId) {
        return jsonResponse(422, { error: 'org_without_members' }, corsHeaders);
      }

      leadRef = await deps.repo.createLead({
        orgId: settings.org_id,
        userId: orgUserId,
        phoneE164,
        email,
        name: leadName,
      });
    }

    if (!leadRef?.id) {
      return jsonResponse(500, { error: 'lead_upsert_failed' }, corsHeaders);
    }

    await deps.repo.patchLead(settings.org_id, leadRef.id, {
      email,
      name: leadName,
    });

    const attributionResult = await deps.applyAttribution(
      resolveAttributionInput({
        orgId: settings.org_id,
        leadId: leadRef.id,
        payload,
        phoneE164,
        email,
        clientIp,
        userAgent: cleanPayloadString(req.headers.get('user-agent')),
      }),
    );

    return jsonResponse(
      200,
      {
        lead_id: leadRef.id,
        attribution_id: attributionResult.attribution_id,
        channel_inferred: attributionResult.inferred_channel,
      },
      corsHeaders,
    );
  } catch (error) {
    console.error('attribution-webhook failed:', error);
    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
}

