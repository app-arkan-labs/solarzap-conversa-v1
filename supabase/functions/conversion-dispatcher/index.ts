import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildDeliveryUpdatePatch,
  resolvePlatformEventNameFromStageMap,
  resolveGoogleClickId,
  type DeliveryDispatchResult,
  type DispatcherPlatform,
} from '../_shared/conversionDispatcher.ts';

const ALLOWED_ORIGIN = (Deno.env.get('ALLOWED_ORIGIN') || '').trim();
const ALLOW_WILDCARD_CORS = String(Deno.env.get('ALLOW_WILDCARD_CORS') || '').trim().toLowerCase() === 'true';
if (!ALLOWED_ORIGIN && !ALLOW_WILDCARD_CORS) {
  throw new Error('Missing ALLOWED_ORIGIN env (or set ALLOW_WILDCARD_CORS=true)');
}

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ConversionDeliveryRow = {
  id: string;
  conversion_event_id: string;
  org_id: string;
  platform: DispatcherPlatform;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  updated_at: string;
};

type ConversionEventRow = {
  id: string;
  org_id: string;
  lead_id: number;
  crm_stage: string;
  event_name: string;
  event_value: number | null;
  event_currency: string | null;
  occurred_at: string;
};

type LeadAttributionRow = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbc: string | null;
  fbp: string | null;
  session_id: string | null;
  user_email_sha256: string | null;
  user_phone_sha256: string | null;
  user_ip: string | null;
  user_agent: string | null;
};

type OrgTrackingSettingsRow = {
  tracking_enabled: boolean | null;
  meta_capi_enabled: boolean | null;
  google_ads_enabled: boolean | null;
  ga4_enabled: boolean | null;
  google_validate_only: boolean | null;
  stage_event_map: Record<string, unknown> | null;
};

type PlatformCredentialsRow = {
  platform: DispatcherPlatform;
  enabled: boolean | null;
  meta_pixel_id: string | null;
  meta_access_token_vault_id: string | null;
  meta_test_event_code: string | null;
  google_mcc_id: string | null;
  google_customer_id: string | null;
  google_conversion_action_id: string | null;
  google_client_id: string | null;
  google_client_secret_vault_id: string | null;
  google_refresh_token_vault_id: string | null;
  google_developer_token_vault_id: string | null;
  ga4_measurement_id: string | null;
  ga4_api_secret_vault_id: string | null;
};

type InvocationAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 403;
      code: 'missing_auth' | 'forbidden' | 'invalid_authorization' | 'internal_key_not_configured';
    };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function extractBearerToken(authorizationHeader: string): string {
  const trimmed = authorizationHeader.trim();
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

function validateInvocationAuth(req: Request): InvocationAuthResult {
  const internalApiKey = (Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim();
  const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const internalHeader = (req.headers.get('x-internal-api-key') || '').trim();
  const bearerToken = extractBearerToken(authorizationHeader);

  if (bearerToken && (bearerToken === SUPABASE_SERVICE_ROLE_KEY || isServiceRoleBearerToken(bearerToken))) {
    return { ok: true };
  }

  if (internalHeader) {
    if (!internalApiKey) return { ok: false, status: 403, code: 'internal_key_not_configured' };
    if (internalHeader === internalApiKey) return { ok: true };
  }

  if (!authorizationHeader.trim() && !internalHeader) {
    return { ok: false, status: 401, code: 'missing_auth' };
  }

  if (authorizationHeader.trim() && !bearerToken) {
    return { ok: false, status: 401, code: 'invalid_authorization' };
  }

  return { ok: false, status: 403, code: 'forbidden' };
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toJsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function parseRequestBody(req: Request): Promise<Record<string, unknown>> {
  return req.json().catch(() => ({}));
}

function isPlatformEnabled(platform: DispatcherPlatform, settings: OrgTrackingSettingsRow): boolean {
  if (settings.tracking_enabled !== true) return false;
  if (platform === 'meta') return settings.meta_capi_enabled === true;
  if (platform === 'google_ads') return settings.google_ads_enabled === true;
  return settings.ga4_enabled === true;
}

function toGoogleDateTime(occurredAt: string): string {
  const date = new Date(occurredAt);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}+00:00`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchVaultSecret(vaultId: string | null | undefined, cache: Map<string, string | null>): Promise<string | null> {
  const cleanedId = cleanString(vaultId);
  if (!cleanedId) return null;

  if (cache.has(cleanedId)) return cache.get(cleanedId) || null;

  const { data, error } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('secret')
    .eq('id', cleanedId)
    .maybeSingle();

  if (error || !data?.secret) {
    cache.set(cleanedId, null);
    return null;
  }

  const value = String(data.secret);
  cache.set(cleanedId, value);
  return value;
}

async function dispatchMetaCapi(params: {
  event: ConversionEventRow;
  attribution: LeadAttributionRow | null;
  credentials: PlatformCredentialsRow;
  mappedEventName: string;
  vaultCache: Map<string, string | null>;
}): Promise<DeliveryDispatchResult> {
  const pixelId = cleanString(params.credentials.meta_pixel_id);
  const accessToken = await fetchVaultSecret(params.credentials.meta_access_token_vault_id, params.vaultCache);
  if (!pixelId || !accessToken) {
    return { status: 'failed', error: 'meta_missing_credentials' };
  }

  const eventTime = Math.floor(new Date(params.event.occurred_at).getTime() / 1000);
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: params.mappedEventName,
        event_time: Number.isFinite(eventTime) ? eventTime : Math.floor(Date.now() / 1000),
        event_id: `${params.event.id}:meta`,
        action_source: 'system_generated',
        user_data: {
          em: params.attribution?.user_email_sha256 ? [params.attribution.user_email_sha256] : undefined,
          ph: params.attribution?.user_phone_sha256 ? [params.attribution.user_phone_sha256] : undefined,
          client_ip_address: params.attribution?.user_ip || undefined,
          client_user_agent: params.attribution?.user_agent || undefined,
          fbc: params.attribution?.fbc || undefined,
          fbp: params.attribution?.fbp || undefined,
        },
        custom_data: {
          lead_id: String(params.event.lead_id),
          crm_stage: params.event.crm_stage,
          value: params.event.event_value || 0,
          currency: params.event.event_currency || 'BRL',
        },
      },
    ],
  };

  const testEventCode = cleanString(params.credentials.meta_test_event_code);
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    return { status: 'failed', error: `meta_http_${response.status}`, response: responseBody };
  }

  if (
    responseBody &&
    typeof responseBody === 'object' &&
    (responseBody as Record<string, unknown>).error
  ) {
    return { status: 'failed', error: 'meta_response_error', response: responseBody };
  }

  return { status: 'sent', response: responseBody };
}

async function refreshGoogleAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const payload = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });

  const responseBody = (await parseResponseBody(response)) as Record<string, unknown> | null;
  if (!response.ok || !responseBody?.access_token) {
    throw new Error(`google_oauth_${response.status}`);
  }

  return String(responseBody.access_token);
}

async function dispatchGoogleAds(params: {
  event: ConversionEventRow;
  attribution: LeadAttributionRow | null;
  credentials: PlatformCredentialsRow;
  mappedEventName: string;
  validateOnly: boolean;
  vaultCache: Map<string, string | null>;
}): Promise<DeliveryDispatchResult> {
  const clickId = resolveGoogleClickId({
    gclid: params.attribution?.gclid || null,
    gbraid: params.attribution?.gbraid || null,
    wbraid: params.attribution?.wbraid || null,
  });

  if (!clickId) {
    return { status: 'skipped', reason: 'no_click_id' };
  }

  const customerId = cleanString(params.credentials.google_customer_id);
  const conversionActionId = cleanString(params.credentials.google_conversion_action_id);
  const clientId = cleanString(params.credentials.google_client_id) || cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_ID')) || null;
  const clientSecret =
    (await fetchVaultSecret(params.credentials.google_client_secret_vault_id, params.vaultCache)) ||
    cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')) ||
    null;
  const refreshToken = await fetchVaultSecret(params.credentials.google_refresh_token_vault_id, params.vaultCache);
  const developerToken =
    (await fetchVaultSecret(params.credentials.google_developer_token_vault_id, params.vaultCache)) ||
    cleanString(Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')) ||
    null;

  if (!customerId || !conversionActionId || !clientId || !clientSecret || !refreshToken || !developerToken) {
    return { status: 'failed', error: 'google_missing_credentials' };
  }

  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken({
      clientId,
      clientSecret,
      refreshToken,
    });
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'google_oauth_failed' };
  }

  const conversion: Record<string, unknown> = {
    conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
    conversionDateTime: toGoogleDateTime(params.event.occurred_at),
    conversionValue: Number(params.event.event_value || 0),
    currencyCode: cleanString(params.event.event_currency) || 'BRL',
    orderId: `${params.event.id}:google_ads:${params.mappedEventName}`,
  };
  conversion[clickId.type] = clickId.value;

  const requestPayload = {
    conversions: [conversion],
    partialFailure: true,
    validateOnly: params.validateOnly,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
  };

  const loginCustomerId = cleanString(params.credentials.google_mcc_id)?.replace(/\D/g, '');
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  const response = await fetch(`https://googleads.googleapis.com/v18/customers/${customerId}:uploadClickConversions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestPayload),
  });

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    return { status: 'failed', error: `google_http_${response.status}`, response: responseBody };
  }

  if (
    responseBody &&
    typeof responseBody === 'object' &&
    (responseBody as Record<string, unknown>).partialFailureError
  ) {
    const partialFailure = (responseBody as Record<string, unknown>).partialFailureError as Record<string, unknown>;
    const partialCode = Number(partialFailure?.code || 0);
    if (partialCode > 0) {
      return { status: 'failed', error: 'google_partial_failure', response: responseBody };
    }
  }

  return { status: 'sent', response: responseBody };
}

async function dispatchGa4(params: {
  event: ConversionEventRow;
  attribution: LeadAttributionRow | null;
  credentials: PlatformCredentialsRow;
  mappedEventName: string;
  vaultCache: Map<string, string | null>;
}): Promise<DeliveryDispatchResult> {
  const measurementId = cleanString(params.credentials.ga4_measurement_id);
  const apiSecret = await fetchVaultSecret(params.credentials.ga4_api_secret_vault_id, params.vaultCache);
  if (!measurementId || !apiSecret) {
    return { status: 'failed', error: 'ga4_missing_credentials' };
  }

  const eventParams: Record<string, unknown> = {
    lead_id: String(params.event.lead_id),
    crm_stage: params.event.crm_stage,
  };

  if (params.event.event_value !== null && params.event.event_value !== undefined) {
    eventParams.value = Number(params.event.event_value);
    eventParams.currency = cleanString(params.event.event_currency) || 'BRL';
  }

  const payload = {
    client_id: cleanString(params.attribution?.session_id) || `lead.${params.event.lead_id}`,
    user_id: String(params.event.lead_id),
    events: [
      {
        name: params.mappedEventName,
        params: eventParams,
      },
    ],
  };

  const response = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    return { status: 'failed', error: `ga4_http_${response.status}`, response: responseBody };
  }

  return {
    status: 'sent',
    response: {
      status: response.status,
      body: responseBody,
    },
  };
}

async function processDelivery(
  delivery: ConversionDeliveryRow,
  validateOnlyFromRequest: boolean,
  vaultCache: Map<string, string | null>,
): Promise<DeliveryDispatchResult> {
  const { data: event, error: eventError } = await supabase
    .from('conversion_events')
    .select('id, org_id, lead_id, crm_stage, event_name, event_value, event_currency, occurred_at')
    .eq('id', delivery.conversion_event_id)
    .maybeSingle();

  if (eventError || !event?.id) {
    return { status: 'failed', error: 'missing_conversion_event' };
  }

  const { data: settings, error: settingsError } = await supabase
    .from('org_tracking_settings')
    .select('tracking_enabled, meta_capi_enabled, google_ads_enabled, ga4_enabled, google_validate_only, stage_event_map')
    .eq('org_id', delivery.org_id)
    .maybeSingle();

  if (settingsError || !settings) {
    return { status: 'disabled', reason: 'missing_tracking_settings' };
  }

  if (!isPlatformEnabled(delivery.platform, settings as OrgTrackingSettingsRow)) {
    return { status: 'disabled', reason: 'platform_disabled' };
  }

  const { data: credentials } = await supabase
    .from('ad_platform_credentials')
    .select(
      'platform, enabled, meta_pixel_id, meta_access_token_vault_id, meta_test_event_code, google_mcc_id, google_customer_id, google_conversion_action_id, google_client_id, google_client_secret_vault_id, google_refresh_token_vault_id, google_developer_token_vault_id, ga4_measurement_id, ga4_api_secret_vault_id',
    )
    .eq('org_id', delivery.org_id)
    .eq('platform', delivery.platform)
    .maybeSingle();

  if (!credentials || credentials.enabled !== true) {
    return { status: 'disabled', reason: 'platform_not_configured' };
  }

  const { data: attribution } = await supabase
    .from('lead_attribution')
    .select('gclid, gbraid, wbraid, fbc, fbp, session_id, user_email_sha256, user_phone_sha256, user_ip, user_agent')
    .eq('org_id', delivery.org_id)
    .eq('lead_id', event.lead_id)
    .maybeSingle();

  const fallbackEventName = cleanString(event.event_name) || event.crm_stage;
  const mappedMetaEventName = resolvePlatformEventNameFromStageMap({
    stageEventMap: settings.stage_event_map as Record<string, unknown> | null,
    crmStage: event.crm_stage,
    platform: 'meta',
    fallbackEventName,
  });
  const mappedGoogleEventName = resolvePlatformEventNameFromStageMap({
    stageEventMap: settings.stage_event_map as Record<string, unknown> | null,
    crmStage: event.crm_stage,
    platform: 'google_ads',
    fallbackEventName,
  });
  const mappedGa4EventName = resolvePlatformEventNameFromStageMap({
    stageEventMap: settings.stage_event_map as Record<string, unknown> | null,
    crmStage: event.crm_stage,
    platform: 'ga4',
    fallbackEventName,
  });

  if (delivery.platform === 'meta') {
    if (!mappedMetaEventName) return { status: 'skipped', reason: 'event_not_mapped' };
    return dispatchMetaCapi({
      event: event as ConversionEventRow,
      attribution: (attribution || null) as LeadAttributionRow | null,
      credentials: credentials as PlatformCredentialsRow,
      mappedEventName: mappedMetaEventName,
      vaultCache,
    });
  }

  if (delivery.platform === 'google_ads') {
    if (!mappedGoogleEventName) return { status: 'skipped', reason: 'event_not_mapped' };
    const validateOnly = validateOnlyFromRequest || settings.google_validate_only === true;
    return dispatchGoogleAds({
      event: event as ConversionEventRow,
      attribution: (attribution || null) as LeadAttributionRow | null,
      credentials: credentials as PlatformCredentialsRow,
      mappedEventName: mappedGoogleEventName,
      validateOnly,
      vaultCache,
    });
  }

  if (!mappedGa4EventName) return { status: 'skipped', reason: 'event_not_mapped' };
  return dispatchGa4({
    event: event as ConversionEventRow,
    attribution: (attribution || null) as LeadAttributionRow | null,
    credentials: credentials as PlatformCredentialsRow,
    mappedEventName: mappedGa4EventName,
    vaultCache,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return toJsonResponse(405, { success: false, error: 'method_not_allowed' });
  }

  const auth = validateInvocationAuth(req);
  if (!auth.ok) {
    return toJsonResponse(auth.status, {
      success: false,
      error: auth.code,
    });
  }

  try {
    const body = await parseRequestBody(req);
    const url = new URL(req.url);
    const validateOnlyFromRequest =
      url.searchParams.get('validate_only') === '1' || body.validate_only === true || body.validateOnly === true;

    const batchSize = Math.max(1, Math.min(200, Number(body.batchSize || 50)));

    await supabase.rpc('tracking_requeue_stale_deliveries').catch(() => null);

    const { data: claimRows, error: claimError } = await supabase.rpc('tracking_claim_delivery_batch', {
      p_batch_size: batchSize,
    });

    if (claimError) {
      throw new Error(`claim_failed:${claimError.message}`);
    }

    const deliveries = Array.isArray(claimRows) ? (claimRows as ConversionDeliveryRow[]) : [];
    const vaultCache = new Map<string, string | null>();

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let disabled = 0;

    for (const delivery of deliveries) {
      let result: DeliveryDispatchResult;

      try {
        result = await processDelivery(delivery, validateOnlyFromRequest, vaultCache);
      } catch (error) {
        result = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const patch = buildDeliveryUpdatePatch(delivery, result, Date.now());
      await supabase.from('conversion_deliveries').update(patch).eq('id', delivery.id);

      if (result.status === 'sent') sent += 1;
      if (result.status === 'failed') failed += 1;
      if (result.status === 'skipped') skipped += 1;
      if (result.status === 'disabled') disabled += 1;
    }

    return toJsonResponse(200, {
      success: true,
      claimed: deliveries.length,
      sent,
      failed,
      skipped,
      disabled,
      validate_only: validateOnlyFromRequest,
    });
  } catch (error) {
    return toJsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

