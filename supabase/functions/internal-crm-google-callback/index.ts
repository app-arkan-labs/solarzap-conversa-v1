import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type CallbackState = {
  source?: string;
  user_id?: string;
  redirect_url?: string;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resolveOrigin(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}

function createRedirectResponse(status: 'connected' | 'error', message: string, origin: string): Response {
  const url = `${origin}/admin/crm/calendar?google_calendar=${status}&message=${encodeURIComponent(message)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

function normalizeProviderConfig(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) {
    const first = input.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    return asRecord(first);
  }
  return asRecord(input);
}

async function resolveGoogleOAuthConfig(serviceClient: ReturnType<typeof createClient>) {
  const envClientId = asString(Deno.env.get('GOOGLE_CLIENT_ID')) || asString(Deno.env.get('GOOGLE_ADS_CLIENT_ID'));
  const envClientSecret =
    asString(Deno.env.get('GOOGLE_CLIENT_SECRET')) || asString(Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'));

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  const { data, error } = await serviceClient.rpc('get_provider_config', { p_provider: 'google' });
  if (error) {
    throw new Error('google_provider_config_failed');
  }

  const config = normalizeProviderConfig(data);
  const clientId = envClientId || asString(config.client_id) || asString(config.app_id);
  const clientSecret = envClientSecret || asString(config.client_secret) || asString(config.app_secret);

  if (!clientId || !clientSecret) {
    throw new Error('google_provider_config_missing');
  }

  return { clientId, clientSecret };
}

Deno.serve(async (req) => {
  const siteUrl = asString(Deno.env.get('SITE_URL')) || 'http://localhost:5173';
  const fallbackOrigin = resolveOrigin(siteUrl, 'http://localhost:5173');

  try {
    const url = new URL(req.url);
    const code = asString(url.searchParams.get('code'));
    const stateRaw = asString(url.searchParams.get('state'));
    const oauthError = asString(url.searchParams.get('error'));

    if (oauthError) {
      return createRedirectResponse('error', `OAuth error: ${oauthError}`, fallbackOrigin);
    }

    if (!code || !stateRaw) {
      return createRedirectResponse('error', 'Missing code or state', fallbackOrigin);
    }

    let stateData: CallbackState;
    try {
      stateData = asRecord(JSON.parse(atob(stateRaw))) as CallbackState;
    } catch {
      return createRedirectResponse('error', 'Invalid state payload', fallbackOrigin);
    }

    const source = asString(stateData.source);
    const userId = asString(stateData.user_id);
    const redirectOrigin = resolveOrigin(asString(stateData.redirect_url), fallbackOrigin);

    if (source !== 'internal_crm_google_calendar' || !userId) {
      return createRedirectResponse('error', 'State validation failed', redirectOrigin);
    }

    const supabaseUrl = asString(Deno.env.get('SUPABASE_URL'));
    const serviceRoleKey = asString(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!supabaseUrl || !serviceRoleKey) {
      return createRedirectResponse('error', 'Supabase env missing', redirectOrigin);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { clientId, clientSecret } = await resolveGoogleOAuthConfig(serviceClient);
    const redirectUri = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/internal-crm-google-callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenPayload = asRecord(await tokenResponse.json().catch(() => ({})));
    const accessToken = asString(tokenPayload.access_token);
    const refreshTokenFromOAuth = asString(tokenPayload.refresh_token);

    if (!tokenResponse.ok || !accessToken) {
      return createRedirectResponse('error', 'Token exchange failed', redirectOrigin);
    }

    const { data: existingConnection } = await serviceClient
      .schema('internal_crm')
      .from('google_calendar_connections')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle();

    const refreshToken = refreshTokenFromOAuth || asString(existingConnection?.refresh_token);
    if (!refreshToken) {
      return createRedirectResponse('error', 'Missing refresh token. Reconnect with consent.', redirectOrigin);
    }

    const expiresInSeconds = Math.max(60, Number(tokenPayload.expires_in || 3600));
    const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    let accountEmail: string | null = null;
    let accountName: string | null = null;
    if (userInfoResponse?.ok) {
      const userInfo = asRecord(await userInfoResponse.json().catch(() => ({})));
      accountEmail = asString(userInfo.email);
      accountName = asString(userInfo.name);
    }

    const { error: upsertError } = await serviceClient
      .schema('internal_crm')
      .from('google_calendar_connections')
      .upsert(
        {
          user_id: userId,
          account_email: accountEmail,
          account_name: accountName,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          scope: asString(tokenPayload.scope),
          calendar_id: 'primary',
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (upsertError) {
      return createRedirectResponse('error', 'Failed to persist Google connection', redirectOrigin);
    }

    return createRedirectResponse('connected', 'Google Calendar conectado com sucesso', redirectOrigin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected callback error';
    return createRedirectResponse('error', message, fallbackOrigin);
  }
});
