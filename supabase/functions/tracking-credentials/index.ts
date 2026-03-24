import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_ANON_KEY = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY env');
}

type TrackingPlatform = 'meta' | 'google_ads' | 'ga4';

const createJsonResponse = (corsHeaders: Record<string, string>) =>
  (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asPlatform(value: unknown): TrackingPlatform | null {
  if (value === 'meta' || value === 'google_ads' || value === 'ga4') return value;
  return null;
}

async function fetchVaultSecret(admin: ReturnType<typeof createClient>, vaultId: string | null | undefined) {
  const id = cleanString(vaultId);
  if (!id) return null;
  const { data, error } = await admin.schema('vault').from('decrypted_secrets').select('decrypted_secret').eq('id', id).maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  return String(data.decrypted_secret);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

type GoogleAdsAuthContextResult =
  | {
      ok: true;
      accessToken: string;
      developerToken: string;
      refreshToken: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      details?: unknown;
    };

async function resolveGoogleAdsAuthContext(
  admin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<GoogleAdsAuthContextResult> {
  const { data: creds } = await admin
    .from('ad_platform_credentials')
    .select('google_refresh_token_vault_id')
    .eq('org_id', orgId)
    .eq('platform', 'google_ads')
    .maybeSingle();

  const refreshVaultId = cleanString(creds?.google_refresh_token_vault_id);
  if (!refreshVaultId) {
    return { ok: false, status: 400, error: 'not_connected' };
  }

  const refreshToken = await fetchVaultSecret(admin, refreshVaultId);
  if (!refreshToken) {
    return { ok: false, status: 400, error: 'missing_refresh_token' };
  }

  const clientId = cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_ID'));
  const clientSecret = cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'));
  const developerToken = cleanString(Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN'));
  if (!clientId || !clientSecret || !developerToken) {
    return { ok: false, status: 500, error: 'missing_global_google_config' };
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = asRecord(await parseJsonResponse(tokenResponse));
  const accessToken = cleanString(tokenData.access_token);
  if (!tokenResponse.ok || !accessToken) {
    return {
      ok: false,
      status: 400,
      error: 'oauth_token_refresh_failed',
      details: tokenData,
    };
  }

  return {
    ok: true,
    accessToken,
    developerToken,
    refreshToken,
  };
}

async function createVaultSecret(params: {
  admin: ReturnType<typeof createClient>;
  orgId: string;
  platform: TrackingPlatform;
  field: string;
  secretValue: string | null | undefined;
}) {
  const secretValue = cleanString(params.secretValue);
  if (!secretValue) return null;

  const secretName = `tracking_${params.platform}_${params.field}_${params.orgId}_${Date.now()}`;
  const { data, error } = await params.admin
    .schema('vault')
    .rpc('create_secret', {
      new_secret: secretValue,
      new_name: secretName,
      new_description: `Tracking ${params.platform} credential (${params.field})`,
    });

  if (error || !data) {
    throw new Error(`vault_insert_failed:${error?.message || 'unknown'}`);
  }

  return String(data);
}

async function resolveAuthenticatedUser(req: Request): Promise<{ userId: string | null; error?: string }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  if (!authHeader.trim()) {
    return { userId: null, error: 'missing_authorization' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.id) {
    return { userId: null, error: 'unauthenticated' };
  }

  return { userId: user.id };
}

async function assertOrgMembership(admin: ReturnType<typeof createClient>, orgId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  return !error && !!data?.org_id;
}

async function upsertPlatformCredentials(params: {
  admin: ReturnType<typeof createClient>;
  orgId: string;
  platform: TrackingPlatform;
  enabled: boolean;
  metadata: Record<string, unknown>;
  secrets: Record<string, unknown>;
}) {
  const { admin, orgId, platform, enabled, metadata, secrets } = params;

  const { data: existing } = await admin
    .from('ad_platform_credentials')
    .select(
      'meta_access_token_vault_id, google_client_secret_vault_id, google_refresh_token_vault_id, google_developer_token_vault_id, ga4_api_secret_vault_id',
    )
    .eq('org_id', orgId)
    .eq('platform', platform)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    org_id: orgId,
    platform,
    enabled,
  };

  if (platform === 'meta') {
    payload.meta_pixel_id = cleanString(metadata.meta_pixel_id);
    payload.meta_test_event_code = cleanString(metadata.meta_test_event_code);
    payload.meta_access_token_vault_id =
      (await createVaultSecret({
        admin,
        orgId,
        platform,
        field: 'access_token',
        secretValue: cleanString(secrets.meta_access_token),
      })) ||
      existing?.meta_access_token_vault_id ||
      null;
  }

  if (platform === 'google_ads') {
    payload.google_mcc_id = cleanString(metadata.google_mcc_id);
    payload.google_customer_id = cleanString(metadata.google_customer_id);
    payload.google_conversion_action_id = cleanString(metadata.google_conversion_action_id);
    payload.google_client_id = cleanString(metadata.google_client_id);
    payload.google_client_secret_vault_id =
      (await createVaultSecret({
        admin,
        orgId,
        platform,
        field: 'client_secret',
        secretValue: cleanString(secrets.google_client_secret),
      })) ||
      existing?.google_client_secret_vault_id ||
      null;
    payload.google_refresh_token_vault_id =
      (await createVaultSecret({
        admin,
        orgId,
        platform,
        field: 'refresh_token',
        secretValue: cleanString(secrets.google_refresh_token),
      })) ||
      existing?.google_refresh_token_vault_id ||
      null;
    payload.google_developer_token_vault_id =
      (await createVaultSecret({
        admin,
        orgId,
        platform,
        field: 'developer_token',
        secretValue: cleanString(secrets.google_developer_token),
      })) ||
      existing?.google_developer_token_vault_id ||
      null;
  }

  if (platform === 'ga4') {
    payload.ga4_measurement_id = cleanString(metadata.ga4_measurement_id);
    payload.ga4_api_secret_vault_id =
      (await createVaultSecret({
        admin,
        orgId,
        platform,
        field: 'api_secret',
        secretValue: cleanString(secrets.ga4_api_secret),
      })) ||
      existing?.ga4_api_secret_vault_id ||
      null;
  }

  const { data, error } = await admin
    .from('ad_platform_credentials')
    .upsert(payload, { onConflict: 'org_id,platform' })
    .select(
      'id, org_id, platform, enabled, meta_pixel_id, meta_test_event_code, google_mcc_id, google_customer_id, google_conversion_action_id, google_client_id, ga4_measurement_id',
    )
    .single();

  if (error || !data) {
    throw new Error(`credentials_upsert_failed:${error?.message || 'unknown'}`);
  }

  const settingsPatch: Record<string, unknown> = {};
  if (platform === 'meta') settingsPatch.meta_capi_enabled = enabled;
  if (platform === 'google_ads') settingsPatch.google_ads_enabled = enabled;
  if (platform === 'ga4') settingsPatch.ga4_enabled = enabled;

  if (Object.keys(settingsPatch).length > 0) {
    await admin
      .from('org_tracking_settings')
      .upsert(
        {
          org_id: orgId,
          ...settingsPatch,
        },
        { onConflict: 'org_id' },
      );
  }

  return data;
}

async function testPlatformConnection(params: {
  admin: ReturnType<typeof createClient>;
  orgId: string;
  platform: TrackingPlatform;
  validateOnly: boolean;
}) {
  const { admin, orgId, platform, validateOnly } = params;

  const { data: credentials, error } = await admin
    .from('ad_platform_credentials')
    .select(
      'meta_pixel_id, meta_access_token_vault_id, meta_test_event_code, google_mcc_id, google_customer_id, google_conversion_action_id, google_client_id, google_client_secret_vault_id, google_refresh_token_vault_id, google_developer_token_vault_id, ga4_measurement_id, ga4_api_secret_vault_id',
    )
    .eq('org_id', orgId)
    .eq('platform', platform)
    .maybeSingle();

  if (error || !credentials) {
    throw new Error('missing_platform_credentials');
  }

  if (platform === 'meta') {
    const pixelId = cleanString(credentials.meta_pixel_id);
    const accessToken = await fetchVaultSecret(admin, credentials.meta_access_token_vault_id);
    if (!pixelId || !accessToken) throw new Error('meta_missing_credentials');

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(pixelId)}?fields=id&access_token=${encodeURIComponent(accessToken)}`,
    );
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`meta_http_${response.status}:${body.slice(0, 200)}`);
    }

    return { ok: true, platform, validate_only: validateOnly, response: body.slice(0, 500) };
  }

  if (platform === 'google_ads') {
    const clientId = cleanString(credentials.google_client_id) || cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_ID'));
    const clientSecret =
      (await fetchVaultSecret(admin, credentials.google_client_secret_vault_id)) ||
      cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'));
    const refreshToken = await fetchVaultSecret(admin, credentials.google_refresh_token_vault_id);
    const developerToken =
      (await fetchVaultSecret(admin, credentials.google_developer_token_vault_id)) ||
      cleanString(Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN'));
    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error('google_missing_credentials');
    }

    const tokenPayload = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenPayload.toString(),
    });

    const tokenRaw = await tokenResponse.text();
    const tokenJson = (() => {
      try {
        return JSON.parse(tokenRaw) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new Error(`google_oauth_${tokenResponse.status}`);
    }

    const accessToken = String(tokenJson.access_token);
    const response = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`google_http_${response.status}:${body.slice(0, 200)}`);
    }

    return { ok: true, platform, validate_only: validateOnly, response: body.slice(0, 500) };
  }

  const measurementId = cleanString(credentials.ga4_measurement_id);
  const apiSecret = await fetchVaultSecret(admin, credentials.ga4_api_secret_vault_id);
  if (!measurementId || !apiSecret) throw new Error('ga4_missing_credentials');

  const response = await fetch(
    `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'tracking-debug',
        events: [{ name: 'tracking_connection_test' }],
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`ga4_http_${response.status}:${body.slice(0, 200)}`);
  }

  return { ok: true, platform, validate_only: validateOnly, response: body.slice(0, 500) };
}

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;
  const jsonResponse = createJsonResponse(corsHeaders);

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return jsonResponse(500, { success: false, error: 'missing_allowed_origin' });
    }
    if (!cors.originAllowed) {
      return jsonResponse(403, { success: false, error: 'origin_not_allowed' });
    }
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return jsonResponse(500, { success: false, error: 'missing_allowed_origin' });
  }

  if (!cors.originAllowed) {
    return jsonResponse(403, { success: false, error: 'origin_not_allowed' });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'method_not_allowed' });
  }

  try {
    const auth = await resolveAuthenticatedUser(req);
    if (!auth.userId) {
      return jsonResponse(401, { success: false, error: auth.error || 'unauthenticated' });
    }

    const body = asRecord(await req.json().catch(() => ({})));
    const action = cleanString(body.action);
    const orgId = cleanString(body.org_id);
    const platform = asPlatform(body.platform);
    const validateOnly = body.validate_only === true || body.validateOnly === true;

    if (!action || !orgId) {
      return jsonResponse(400, { success: false, error: 'missing_action_or_org_id' });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const isMember = await assertOrgMembership(admin, orgId, auth.userId);
    if (!isMember) {
      return jsonResponse(403, { success: false, error: 'forbidden' });
    }

    if (action === 'upsert_platform_credentials') {
      if (!platform) {
        return jsonResponse(400, { success: false, error: 'invalid_platform' });
      }

      const metadata = asRecord(body.metadata);
      const secrets = asRecord(body.secrets);
      const enabled = body.enabled === true;

      const result = await upsertPlatformCredentials({
        admin,
        orgId,
        platform,
        enabled,
        metadata,
        secrets,
      });

      return jsonResponse(200, { success: true, data: result });
    }

    if (action === 'test_platform_connection') {
      if (!platform) {
        return jsonResponse(400, { success: false, error: 'invalid_platform' });
      }

      const result = await testPlatformConnection({
        admin,
        orgId,
        platform,
        validateOnly,
      });

      return jsonResponse(200, { success: true, data: result });
    }

    if (action === 'list_accessible_customers') {
      const authContext = await resolveGoogleAdsAuthContext(admin, orgId);
      if (!authContext.ok) {
        return jsonResponse(authContext.status, {
          success: false,
          error: authContext.error,
          ...(authContext.details ? { details: authContext.details } : {}),
        });
      }

      const response = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authContext.accessToken}`,
          'developer-token': authContext.developerToken,
        },
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        return jsonResponse(400, { success: false, error: 'google_api_error', details: data });
      }

      return jsonResponse(200, { success: true, data });
    }

    if (action === 'account_hierarchy') {
      const loginCustomerId = cleanString(body.login_customer_id);
      if (!loginCustomerId) {
        return jsonResponse(400, { success: false, error: 'missing_login_customer_id' });
      }

      const authContext = await resolveGoogleAdsAuthContext(admin, orgId);
      if (!authContext.ok) {
        return jsonResponse(authContext.status, {
          success: false,
          error: authContext.error,
          ...(authContext.details ? { details: authContext.details } : {}),
        });
      }

      const normalizedLoginCustomerId = loginCustomerId.replace(/\D/g, '');
      if (!normalizedLoginCustomerId) {
        return jsonResponse(400, { success: false, error: 'invalid_login_customer_id' });
      }

      const query =
        "SELECT customer_client.client_customer, customer_client.level, customer_client.manager, customer_client.descriptive_name, customer_client.id, customer_client.status FROM customer_client WHERE customer_client.status = 'ENABLED'";
      const response = await fetch(
        `https://googleads.googleapis.com/v18/customers/${normalizedLoginCustomerId}/googleAds:search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authContext.accessToken}`,
            'developer-token': authContext.developerToken,
            'login-customer-id': normalizedLoginCustomerId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        },
      );
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        return jsonResponse(400, { success: false, error: 'google_api_error', details: data });
      }

      const payload = asRecord(data);
      const results = Array.isArray(payload.results) ? payload.results : [];
      const customers = results.map((rawResult) => {
        const result = asRecord(rawResult);
        const customerClient = asRecord(result.customerClient ?? result.customer_client);
        const managerRaw = customerClient.manager;
        return {
          customerId: cleanString(customerClient.id) || '',
          descriptiveName: cleanString(customerClient.descriptiveName ?? customerClient.descriptive_name) || '',
          isManager: managerRaw === true || String(managerRaw || '').toLowerCase() === 'true',
          level: Number(customerClient.level || 0),
          status: cleanString(customerClient.status) || '',
        };
      });

      return jsonResponse(200, { success: true, data: { customers } });
    }

    if (action === 'list_conversion_actions') {
      const customerId = cleanString(body.customer_id);
      const loginCustomerId = cleanString(body.login_customer_id);
      if (!customerId) {
        return jsonResponse(400, { success: false, error: 'missing_customer_id' });
      }

      const authContext = await resolveGoogleAdsAuthContext(admin, orgId);
      if (!authContext.ok) {
        return jsonResponse(authContext.status, {
          success: false,
          error: authContext.error,
          ...(authContext.details ? { details: authContext.details } : {}),
        });
      }

      const normalizedCustomerId = customerId.replace(/\D/g, '');
      if (!normalizedCustomerId) {
        return jsonResponse(400, { success: false, error: 'invalid_customer_id' });
      }

      const query =
        "SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category FROM conversion_action WHERE conversion_action.status = 'ENABLED'";
      const headers: Record<string, string> = {
        Authorization: `Bearer ${authContext.accessToken}`,
        'developer-token': authContext.developerToken,
        'Content-Type': 'application/json',
      };
      const normalizedLoginCustomerId = loginCustomerId?.replace(/\D/g, '') || '';
      if (normalizedLoginCustomerId) {
        headers['login-customer-id'] = normalizedLoginCustomerId;
      }

      const response = await fetch(
        `https://googleads.googleapis.com/v18/customers/${normalizedCustomerId}/googleAds:search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ query }),
        },
      );
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        return jsonResponse(400, { success: false, error: 'google_api_error', details: data });
      }

      const payload = asRecord(data);
      const results = Array.isArray(payload.results) ? payload.results : [];
      const conversionActions = results.map((rawResult) => {
        const result = asRecord(rawResult);
        const conversionAction = asRecord(result.conversionAction ?? result.conversion_action);
        return {
          id: cleanString(conversionAction.id) || '',
          name: cleanString(conversionAction.name) || '',
          status: cleanString(conversionAction.status) || '',
          type: cleanString(conversionAction.type) || '',
          category: cleanString(conversionAction.category) || '',
        };
      });

      return jsonResponse(200, { success: true, data: { conversionActions } });
    }

    if (action === 'save_ads_selection') {
      const loginCustomerId = cleanString(body.login_customer_id);
      const customerId = cleanString(body.customer_id);
      const conversionActionId = cleanString(body.conversion_action_id);

      if (!customerId || !conversionActionId) {
        return jsonResponse(400, { success: false, error: 'missing_customer_or_conversion_action' });
      }

      const { error } = await admin.from('ad_platform_credentials').upsert(
        {
          org_id: orgId,
          platform: 'google_ads',
          google_mcc_id: loginCustomerId,
          google_customer_id: customerId,
          google_conversion_action_id: conversionActionId,
        },
        { onConflict: 'org_id,platform' },
      );

      if (error) {
        return jsonResponse(500, { success: false, error: 'save_failed', details: error.message });
      }

      return jsonResponse(200, { success: true });
    }

    if (action === 'disconnect_google_ads') {
      const { data: creds } = await admin
        .from('ad_platform_credentials')
        .select('google_refresh_token_vault_id')
        .eq('org_id', orgId)
        .eq('platform', 'google_ads')
        .maybeSingle();

      const currentVaultId = cleanString(creds?.google_refresh_token_vault_id);

      await admin
        .from('ad_platform_credentials')
        .update({
          google_refresh_token_vault_id: null,
          google_ads_connected_at: null,
          google_ads_account_email: null,
          google_mcc_id: null,
          google_customer_id: null,
          google_conversion_action_id: null,
          enabled: false,
        })
        .eq('org_id', orgId)
        .eq('platform', 'google_ads');

      await admin
        .from('org_tracking_settings')
        .upsert(
          {
            org_id: orgId,
            google_ads_enabled: false,
          },
          { onConflict: 'org_id' },
        );

      if (currentVaultId) {
        const token = await fetchVaultSecret(admin, currentVaultId);
        if (token) {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: 'POST',
          }).catch(() => null);
        }

        await admin.schema('vault').from('secrets').delete().eq('id', currentVaultId).catch(() => null);
      }

      return jsonResponse(200, { success: true });
    }

    return jsonResponse(400, { success: false, error: 'unsupported_action' });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

