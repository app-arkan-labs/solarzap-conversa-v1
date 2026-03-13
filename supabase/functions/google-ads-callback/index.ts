import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type OAuthState = {
  user_id: string;
  org_id: string;
  redirect_url: string;
  nonce?: string;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function createRedirectResponse(status: 'success' | 'error', message: string, baseUrl?: string): Response {
  const fallbackUrl = cleanString(Deno.env.get('SITE_URL')) || 'http://localhost:5173';
  const redirectBase = cleanString(baseUrl) || fallbackUrl;
  const url = `${redirectBase}/?google_ads_status=${status}&message=${encodeURIComponent(message)}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
    },
  });
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      return createRedirectResponse('error', `OAuth error: ${oauthError}`);
    }

    if (!code || !state) {
      return createRedirectResponse('error', 'Missing code or state');
    }

    let stateData: OAuthState;
    try {
      const parsed = JSON.parse(atob(state));
      stateData = parsed as OAuthState;
    } catch {
      return createRedirectResponse('error', 'Invalid state');
    }

    if (!stateData.user_id || !stateData.org_id || !stateData.redirect_url) {
      return createRedirectResponse('error', 'State missing required fields');
    }

    const supabaseUrl = cleanString(Deno.env.get('SUPABASE_URL'));
    const serviceRoleKey = cleanString(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const clientId = cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_ID'));
    const clientSecret = cleanString(Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'));

    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
      return createRedirectResponse('error', 'Google Ads credentials not configured', stateData.redirect_url);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/google-ads-callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await parseJson(tokenResponse);

    const accessToken = cleanString(tokenData.access_token);
    const refreshToken = cleanString(tokenData.refresh_token);

    if (!tokenResponse.ok || !accessToken) {
      return createRedirectResponse('error', 'Token exchange failed', stateData.redirect_url);
    }

    if (!refreshToken) {
      return createRedirectResponse(
        'error',
        'Missing refresh token. Reconnect with prompt=consent and access_type=offline.',
        stateData.redirect_url,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing } = await admin
      .from('ad_platform_credentials')
      .select('google_refresh_token_vault_id')
      .eq('org_id', stateData.org_id)
      .eq('platform', 'google_ads')
      .maybeSingle();

    const { data: vaultRow, error: vaultError } = await admin
      .schema('vault')
      .from('secrets')
      .insert({
        name: `google_ads_refresh_token_${stateData.org_id}_${Date.now()}`,
        secret: refreshToken,
        description: 'Google Ads OAuth refresh token',
      })
      .select('id')
      .single();

    if (vaultError || !vaultRow?.id) {
      return createRedirectResponse('error', 'Failed to store refresh token', stateData.redirect_url);
    }

    let accountEmail: string | null = null;
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => null);

    if (userInfoResponse?.ok) {
      const userInfo = asRecord(await userInfoResponse.json().catch(() => ({})));
      accountEmail = cleanString(userInfo.email);
    }

    const { error: upsertError } = await admin.from('ad_platform_credentials').upsert(
      {
        org_id: stateData.org_id,
        platform: 'google_ads',
        google_refresh_token_vault_id: String(vaultRow.id),
        google_ads_connected_at: new Date().toISOString(),
        google_ads_account_email: accountEmail,
      },
      { onConflict: 'org_id,platform' },
    );

    if (upsertError) {
      return createRedirectResponse('error', 'Failed to save Google Ads connection', stateData.redirect_url);
    }

    const previousVaultId = cleanString(existing?.google_refresh_token_vault_id);
    if (previousVaultId && previousVaultId !== String(vaultRow.id)) {
      await admin.schema('vault').from('secrets').delete().eq('id', previousVaultId).catch(() => null);
    }

    return createRedirectResponse('success', 'connected', stateData.redirect_url);
  } catch {
    return createRedirectResponse('error', 'Integration failed');
  }
});
