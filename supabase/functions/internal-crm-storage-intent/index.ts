import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';

const VIDEO_LIMIT_BYTES = 90 * 1024 * 1024;
const DELIVERY_BUCKET = 'internal-crm-chat-delivery';
const ATTACHMENT_BUCKET = 'internal-crm-chat-attachments';

const WRITER_ROLES = new Set(['owner', 'sales', 'cs', 'ops']);

const asString = (value: unknown, max = 240): string =>
  String(value ?? '').trim().slice(0, max);

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const sanitizePathPart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\/{2,}/g, '/');

const sanitizeFileName = (value: string): string =>
  value.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 140) || 'arquivo';

const normalizeKind = (value: unknown): 'image' | 'video' | 'audio' | 'document' => {
  const normalized = asString(value, 32).toLowerCase();
  if (normalized === 'image') return 'image';
  if (normalized === 'video') return 'video';
  if (normalized === 'audio') return 'audio';
  return 'document';
};

const resolveMediaVariant = (
  input: {
    kind: 'image' | 'video' | 'audio' | 'document';
    mimeType: string;
    fileName: string;
    explicitVariant: string;
    isVoiceNote: boolean;
    preferSticker: boolean;
  },
): 'standard' | 'gif' | 'sticker' | 'voice_note' => {
  const explicit = input.explicitVariant.toLowerCase();
  if (explicit === 'gif') return 'gif';
  if (explicit === 'sticker') return 'sticker';
  if (explicit === 'voice_note') return 'voice_note';
  if (input.isVoiceNote && input.kind === 'audio') return 'voice_note';

  const lowerMime = input.mimeType.toLowerCase();
  const lowerName = input.fileName.toLowerCase();
  const isGif = lowerMime === 'image/gif' || lowerName.endsWith('.gif');
  if (isGif) return 'gif';

  const isStickerLike = input.kind === 'image' && (
    input.preferSticker ||
    lowerMime === 'image/webp' ||
    lowerName.endsWith('.webp')
  );
  if (isStickerLike) return 'sticker';

  return 'standard';
};

const resolveSendMode = (
  kind: 'image' | 'video' | 'audio' | 'document',
  sizeBytes: number,
): 'image' | 'video' | 'audio' | 'document' => {
  if (kind === 'video') {
    return sizeBytes <= VIDEO_LIMIT_BYTES ? 'video' : 'document';
  }
  return kind;
};

async function ensurePublicBucket(
  admin: ReturnType<typeof createClient>,
  bucketName: string,
) {
  const { data: bucket, error } = await admin.storage.getBucket(bucketName);
  if (!bucket || error) {
    const { error: createError } = await admin.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: '2GB',
      allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*', 'text/*'],
    });
    if (createError && !String(createError.message || '').toLowerCase().includes('already exists')) {
      throw createError;
    }
    return;
  }

  if (!bucket.public) {
    const { error: updateError } = await admin.storage.updateBucket(bucketName, { public: true });
    if (updateError) throw updateError;
  }
}

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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: 'missing_supabase_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authorizationHeader = req.headers.get('Authorization') || '';
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorizationHeader } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminMembership, error: adminMembershipError } = await admin
      .from('_admin_system_admins')
      .select('crm_role')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (adminMembershipError) {
      return new Response(JSON.stringify({ error: 'crm_membership_lookup_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const crmRole = asString(adminMembership?.crm_role, 32).toLowerCase();
    if (!WRITER_ROLES.has(crmRole)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const fileName = asString(body?.fileName, 220);
    const mimeType = asString(body?.mimeType, 160) || 'application/octet-stream';
    const sizeBytes = clampInt(body?.sizeBytes, 0, 0, 2 * 1024 * 1024 * 1024);
    const kind = normalizeKind(body?.kind);
    const conversationId = asString(body?.conversationId || body?.conversation_id, 120) || 'general';
    const explicitVariant = asString(body?.mediaVariant || body?.media_variant, 32);
    const isVoiceNote = body?.isVoiceNote === true;
    const preferSticker = body?.preferSticker === true;

    if (!fileName || sizeBytes <= 0) {
      return new Response(JSON.stringify({ error: 'missing_fileName_or_size' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sendMode = resolveSendMode(kind, sizeBytes);
    const mediaVariant = resolveMediaVariant({
      kind,
      mimeType,
      fileName,
      explicitVariant,
      isVoiceNote,
      preferSticker,
    });

    await ensurePublicBucket(admin, DELIVERY_BUCKET);
    await ensurePublicBucket(admin, ATTACHMENT_BUCKET);

    const finalName = sanitizeFileName(fileName);
    const path = sanitizePathPart(
      `${authData.user.id}/crm-internal/${conversationId}/${Date.now()}_${finalName}`,
    );

    const { data: uploadData, error: uploadError } = await admin.storage
      .from(DELIVERY_BUCKET)
      .createSignedUploadUrl(path);

    if (uploadError) throw uploadError;

    const { data: publicData } = admin.storage
      .from(DELIVERY_BUCKET)
      .getPublicUrl(path);

    return new Response(JSON.stringify({
      ok: true,
      bucket: DELIVERY_BUCKET,
      fallbackBucket: ATTACHMENT_BUCKET,
      path,
      uploadUrl: uploadData.signedUrl,
      token: uploadData.token,
      publicUrl: publicData.publicUrl,
      deliveryUrl: publicData.publicUrl,
      sendMode,
      mediaVariant,
      originalKind: kind,
      fileName: finalName,
      mimeType,
      sizeBytes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('internal-crm-storage-intent error:', error);
    return new Response(JSON.stringify({ error: 'internal_error', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
