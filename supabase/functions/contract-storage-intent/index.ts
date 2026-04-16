import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';

const asString = (value: unknown, max = 512): string => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : '';
};

const clampInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 140) || 'contrato.pdf';

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!cors.originAllowed) {
      return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!cors.originAllowed) {
    return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return new Response(JSON.stringify({ error: 'missing_supabase_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orgId = asString(body?.orgId, 80);
    const contractId = asString(body?.contractId, 80) || 'draft';
    const artifactKind = asString(body?.artifactKind, 80) || 'pdf';
    const fileName = asString(body?.fileName, 220);
    const sizeBytes = clampInt(body?.sizeBytes, 0, 0, 50 * 1024 * 1024);
    const mimeType = asString(body?.mimeType, 120) || 'application/pdf';

    if (!orgId || !fileName || sizeBytes <= 0) {
      return new Response(
        JSON.stringify({ error: 'missing_org_or_file_metadata' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('org_id')
      .eq('org_id', orgId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (membershipError) {
      return new Response(
        JSON.stringify({ error: 'membership_lookup_failed', detail: membershipError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!membership?.org_id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bucketName = 'contracts';
    const { data: bucket, error: bucketError } = await admin.storage.getBucket(bucketName);
    if (!bucket || bucketError) {
      const { error: createError } = await admin.storage.createBucket(bucketName, {
        public: false,
      });
      if (
        createError &&
        !String(createError.message || '').toLowerCase().includes('already exists')
      ) {
        throw createError;
      }
    } else if (bucket.public) {
      try {
        await admin.storage.updateBucket(bucketName, { public: false });
      } catch {
        // noop
      }
    }

    const safeName = sanitizeFileName(fileName);
    const path = `${orgId}/${contractId}/${artifactKind}/${Date.now()}_${safeName}`;

    const { data: uploadData, error: uploadError } = await admin.storage
      .from(bucketName)
      .createSignedUploadUrl(path);

    if (uploadError) throw uploadError;

    return new Response(
      JSON.stringify({
        bucket: bucketName,
        path,
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        mimeType,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('contract-storage-intent error:', error);
    return new Response(JSON.stringify({ error: 'internal_error', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
