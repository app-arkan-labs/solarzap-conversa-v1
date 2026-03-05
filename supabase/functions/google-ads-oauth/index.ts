import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const ALLOWED_ORIGIN = (Deno.env.get('ALLOWED_ORIGIN') || '').trim();
const ALLOW_WILDCARD_CORS = String(Deno.env.get('ALLOW_WILDCARD_CORS') || '').trim().toLowerCase() === 'true';
if (!ALLOWED_ORIGIN && !ALLOW_WILDCARD_CORS) {
  throw new Error('Missing ALLOWED_ORIGIN env (or set ALLOW_WILDCARD_CORS=true)');
}

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_ANON_KEY = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const GOOGLE_ADS_CLIENT_ID = (Deno.env.get('GOOGLE_ADS_CLIENT_ID') || '').trim();
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY env');
}
if (!GOOGLE_ADS_CLIENT_ID) {
  throw new Error('Missing GOOGLE_ADS_CLIENT_ID env');
}

const callbackUrl = `${SUPABASE_URL}/functions/v1/google-ads-callback`;

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function resolveRedirectOrigin(req: Request): string {
  const origin = cleanString(req.headers.get('origin'));
  if (origin) return origin;

  const referer = cleanString(req.headers.get('referer'));
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return referer;
    }
  }

  return cleanString(Deno.env.get('SITE_URL')) || 'http://localhost:5173';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(405, { success: false, error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.trim()) {
      return jsonResponse(401, { success: false, error: 'missing_authorization' });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user?.id) {
      return jsonResponse(401, { success: false, error: 'unauthenticated' });
    }

    let payload: Record<string, unknown> = {};
    if (req.method === 'POST') {
      payload = asRecord(await req.json().catch(() => ({})));
    }

    const url = new URL(req.url);
    const orgId =
      cleanString(payload.org_id) ||
      cleanString(payload.orgId) ||
      cleanString(url.searchParams.get('orgId')) ||
      cleanString(url.searchParams.get('org_id'));

    if (!orgId) {
      return jsonResponse(400, { success: false, error: 'missing_org_id' });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: membership } = await admin
      .from('organization_members')
      .select('org_id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership?.org_id) {
      return jsonResponse(403, { success: false, error: 'forbidden' });
    }

    const statePayload = {
      user_id: user.id,
      org_id: orgId,
      redirect_url: resolveRedirectOrigin(req),
      nonce: crypto.randomUUID(),
    };
    const state = btoa(JSON.stringify(statePayload));

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/adwords',
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString()}`;

    return jsonResponse(200, { authUrl });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
