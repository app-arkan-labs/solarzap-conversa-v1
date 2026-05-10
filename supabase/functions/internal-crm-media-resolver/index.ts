import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
import { validateServiceInvocationAuth } from '../_shared/invocationAuth.ts';

const DELIVERY_BUCKET = 'internal-crm-chat-delivery';
const ATTACHMENT_BUCKET = 'internal-crm-chat-attachments';
const FETCH_RETRY_ATTEMPTS = 3;
const EVOLUTION_FETCH_TIMEOUT_MS = 12_000;
const RETRY_PENDING_BATCH_DEFAULT = 25;
const RETRY_PENDING_MIN_AGE_SECONDS_DEFAULT = 30;
const RETRY_PENDING_MAX_ATTEMPTS_DEFAULT = 5;

type InternalCrmMessageRow = {
  id: string;
  conversation_id: string | null;
  body: string | null;
  message_type: string;
  attachment_url: string | null;
  attachment_ready: boolean;
  attachment_mimetype: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_error: boolean | null;
  attachment_error_message: string | null;
  attachment_attempt_count: number;
  attachment_last_attempt_at: string | null;
  wa_message_id: string | null;
  remote_jid: string | null;
  whatsapp_instance_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type MediaFetchResult = {
  base64: string | null;
  mimeType: string | null;
  strategy: string;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const asString = (value: unknown, max = 240): string =>
  String(value ?? '').trim().slice(0, max);

const asPositiveInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const shortErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.trim().slice(0, 180) || 'unknown_error';
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = EVOLUTION_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const decodeBase64 = (base64: string): Uint8Array => {
  const binary = atob(base64.replace(/^data:.*;base64,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const sanitizePathPart = (value: string): string =>
  String(value || '').replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\/{2,}/g, '/');

const extensionFromMime = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();
  if (!normalized) return 'bin';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('pdf')) return 'pdf';
  return 'bin';
};

const perfNow = (): number => {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
};

const crmSchema = (admin: ReturnType<typeof createClient>) => admin.schema('internal_crm');

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

async function transcribeAudioWithOpenAI(base64Audio: string, mimeType: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;

  try {
    const bytes = decodeBase64(base64Audio);
    const audioBlob = new Blob([bytes], { type: mimeType || 'audio/ogg' });
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('language', 'pt');
    form.append('response_format', 'json');
    form.append('file', audioBlob, `audio.${extensionFromMime(mimeType || '')}`);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[internal-crm-media-resolver] transcription_failed', { status: response.status, errText });
      return null;
    }

    const payload = await response.json().catch(() => ({}));
    const text = asString((payload as Record<string, unknown>)?.text, 4_000);
    return text || null;
  } catch (error) {
    console.warn('[internal-crm-media-resolver] transcription_exception', shortErrorMessage(error));
    return null;
  }
}

const firstNestedString = (
  value: unknown,
  keyNames: string[],
  max = 240,
  depth = 0,
): string => {
  if (depth > 5) return '';
  if (isRecord(value)) {
    for (const key of keyNames) {
      const direct = value[key];
      if (typeof direct === 'string' && direct.trim()) {
        return asString(direct, max);
      }
    }

    for (const item of Object.values(value)) {
      const nested = firstNestedString(item, keyNames, max, depth + 1);
      if (nested) return nested;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstNestedString(item, keyNames, max, depth + 1);
      if (nested) return nested;
    }
  }

  return '';
};

const extractEvolutionBase64 = (payload: unknown): string =>
  firstNestedString(payload, ['base64'], 50_000_000);

const extractEvolutionMimeType = (payload: unknown): string =>
  firstNestedString(payload, ['mimetype', 'mimeType', 'contentType'], 180);

const normalizeEvolutionMessagePayload = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return null;

  const data = asRecord(record.data);
  if (Object.keys(data).length > 0 && (isRecord(data.key) || isRecord(data.message))) {
    return data;
  }

  const nestedMessage = asRecord(record.message);
  if (Object.keys(nestedMessage).length > 0 && (isRecord(nestedMessage.key) || isRecord(nestedMessage.message))) {
    return nestedMessage;
  }

  if (isRecord(record.key) || isRecord(record.message)) {
    return record;
  }

  return null;
};

const collectEvolutionMessageCandidates = (
  inputMessage: unknown,
  rowMetadata: Record<string, unknown>,
): Array<{ strategy: string; message: Record<string, unknown> }> => {
  const rawCandidates: Array<{ strategy: string; value: unknown }> = [
    { strategy: 'request_full_payload', value: inputMessage },
    { strategy: 'metadata_media_resolver_message', value: rowMetadata.media_resolver_message },
    { strategy: 'metadata_data_payload', value: rowMetadata.data },
    { strategy: 'metadata_evolution_message', value: rowMetadata.evolution_message },
  ];

  const seen = new Set<string>();
  const candidates: Array<{ strategy: string; message: Record<string, unknown> }> = [];
  for (const candidate of rawCandidates) {
    const message = normalizeEvolutionMessagePayload(candidate.value);
    if (!message) continue;
    const key = JSON.stringify({
      id: asString(asRecord(message.key).id, 180),
      remoteJid: asString(asRecord(message.key).remoteJid, 180),
      messageType: asString(message.messageType, 80),
      keys: Object.keys(asRecord(message.message)).sort(),
    });
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ strategy: candidate.strategy, message });
  }

  return candidates;
};

async function postEvolutionMediaRequest(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceName: string,
  strategy: string,
  body: Record<string, unknown>,
): Promise<MediaFetchResult> {
  const response = await fetchWithTimeout(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let payload: unknown = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    return {
      base64: null,
      mimeType: null,
      strategy,
      error: `${response.status}:${responseText.slice(0, 160)}`,
    };
  }

  const base64 = extractEvolutionBase64(payload);
  return {
    base64: base64 || null,
    mimeType: extractEvolutionMimeType(payload) || null,
    strategy,
    ...(base64 ? {} : { error: 'ok_without_base64' }),
  };
}

async function fetchMediaBase64(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceName: string,
  waMessageId: string,
  evolutionMessages: Array<{ strategy: string; message: Record<string, unknown> }>,
): Promise<MediaFetchResult> {
  const errors: string[] = [];
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    const getBase64Strategies: Array<{ strategy: string; body: Record<string, unknown> }> = [
      ...evolutionMessages.map((item) => ({
        strategy: item.strategy,
        body: { message: item.message, convertToMp4: false },
      })),
      {
        strategy: 'key_id_only',
        body: { message: { key: { id: waMessageId } }, convertToMp4: false },
      },
    ];

    for (const item of getBase64Strategies) {
      try {
        const result = await postEvolutionMediaRequest(
          evolutionUrl,
          evolutionApiKey,
          instanceName,
          item.strategy,
          item.body,
        );
        if (result.base64) return result;
        errors.push(`${item.strategy}:${result.error || 'no_base64'}`);
      } catch (error) {
        errors.push(`${item.strategy}:${shortErrorMessage(error)}`);
        console.warn('[internal-crm-media-resolver] get_base64_strategy_failed', {
          instanceName,
          waMessageId: waMessageId.slice(0, 8),
          attempt,
          strategy: item.strategy,
          error: shortErrorMessage(error),
        });
      }
    }

    try {
      const urlB = `${evolutionUrl}/chat/findMessage/${instanceName}`;
      const responseB = await fetchWithTimeout(urlB, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
        body: JSON.stringify({ sessionId: instanceName, messageId: waMessageId }),
      });

      if (responseB.ok) {
        const data = await responseB.json().catch(() => ({}));
        const base64 = extractEvolutionBase64(data);
        if (base64) {
          return {
            base64,
            mimeType: extractEvolutionMimeType(data) || null,
            strategy: 'find_message',
          };
        }
        errors.push('find_message:ok_without_base64');
      } else {
        const text = await responseB.text();
        errors.push(`find_message:${responseB.status}:${text.slice(0, 160)}`);
      }
    } catch (error) {
      console.warn('[internal-crm-media-resolver] strategy_b_failed', {
        instanceName,
        waMessageId: waMessageId.slice(0, 8),
        attempt,
        error: shortErrorMessage(error),
      });
      errors.push(`find_message:${shortErrorMessage(error)}`);
    }

    if (attempt < FETCH_RETRY_ATTEMPTS) {
      await delay(800 * (2 ** (attempt - 1)));
    }
  }

  return {
    base64: null,
    mimeType: null,
    strategy: 'exhausted',
    error: errors.slice(-6).join(' | ') || 'not_attempted',
  };
}

async function loadMessageRow(
  admin: ReturnType<typeof createClient>,
  input: { messageId?: string | null; waMessageId?: string | null },
): Promise<InternalCrmMessageRow | null> {
  const schema = crmSchema(admin);
  if (input.messageId) {
    const { data, error } = await schema
      .from('messages')
      .select('*')
      .eq('id', input.messageId)
      .maybeSingle();
    if (error) throw error;
    return (data as InternalCrmMessageRow | null) || null;
  }

  if (input.waMessageId) {
    const { data, error } = await schema
      .from('messages')
      .select('*')
      .eq('wa_message_id', input.waMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as InternalCrmMessageRow | null) || null;
  }

  return null;
}

async function updateMessageRow(
  admin: ReturnType<typeof createClient>,
  messageId: string,
  changes: Record<string, unknown>,
) {
  return await crmSchema(admin)
    .from('messages')
    .update(changes)
    .eq('id', messageId);
}

async function resolveInstanceNameForMessage(
  admin: ReturnType<typeof createClient>,
  row: InternalCrmMessageRow,
  explicitInstanceName?: string | null,
): Promise<string> {
  const metadata = asRecord(row.metadata);
  const directName =
    asString(explicitInstanceName, 180)
    || asString(metadata.instance_name, 180)
    || asString(metadata.instanceName, 180)
    || asString(asRecord(metadata.data).instance, 180);

  if (directName) return directName;

  const instanceId = asString(row.whatsapp_instance_id, 120);
  if (!instanceId) return '';

  const { data } = await crmSchema(admin)
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('id', instanceId)
    .maybeSingle();

  return asString(asRecord(data).instance_name, 180);
}

const resolveAttachmentType = (
  messageType: string,
  mimeType: string,
  mediaVariant: string,
): 'image' | 'video' | 'audio' | 'document' => {
  const normalizedType = messageType.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();
  const normalizedVariant = mediaVariant.toLowerCase();

  if (normalizedVariant === 'sticker') return 'image';
  if (normalizedType === 'image') return 'image';
  if (normalizedType === 'video') return 'video';
  if (normalizedType === 'audio') return 'audio';
  if (normalizedType === 'document') return 'document';

  if (normalizedMime.includes('image')) return 'image';
  if (normalizedMime.includes('video')) return 'video';
  if (normalizedMime.includes('audio')) return 'audio';
  return 'document';
};

const resolvePlaceholderBody = (
  attachmentType: 'image' | 'video' | 'audio' | 'document',
  mediaVariant: string,
): string => {
  const normalizedVariant = mediaVariant.toLowerCase();
  if (normalizedVariant === 'sticker') return 'Sticker recebido';
  if (normalizedVariant === 'gif') return 'GIF recebido';
  if (attachmentType === 'image') return 'Imagem recebida';
  if (attachmentType === 'video') return 'Video recebido';
  if (attachmentType === 'audio') return 'Audio recebido';
  return 'Documento recebido';
};

async function resolveSingleMedia(
  admin: ReturnType<typeof createClient>,
  evolutionUrl: string,
  evolutionApiKey: string,
  input: {
    messageId?: string | null;
    waMessageId?: string | null;
    instanceName?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    messageType?: string | null;
    mediaVariant?: string | null;
    evolutionMessage?: Record<string, unknown> | null;
    maxAttempts?: number;
  },
) {
  const row = await loadMessageRow(admin, {
    messageId: input.messageId,
    waMessageId: input.waMessageId,
  });
  if (!row?.id) {
    throw new Error('message_not_found');
  }

  const waMessageId = asString(input.waMessageId || row.wa_message_id, 180);
  const instanceName = await resolveInstanceNameForMessage(admin, row, input.instanceName);
  const mimeType = asString(input.mimeType || row.attachment_mimetype, 180) || 'application/octet-stream';
  const fileName = asString(input.fileName || row.attachment_name, 220) || `${row.message_type}.${extensionFromMime(mimeType)}`;
  const mediaVariant = asString(input.mediaVariant || asRecord(row.metadata).media_variant, 32) || 'standard';
  const messageType = asString(input.messageType || row.message_type, 32) || row.message_type;
  const maxAttempts = asPositiveInt(input.maxAttempts, RETRY_PENDING_MAX_ATTEMPTS_DEFAULT, 1, 15);
  const rowMetadata = asRecord(row.metadata);
  const evolutionMessages = collectEvolutionMessageCandidates(input.evolutionMessage, rowMetadata);

  if (!waMessageId) throw new Error('wa_message_id_missing');
  if (!instanceName) throw new Error('instance_name_missing');

  const attemptCount = asPositiveInt(row.attachment_attempt_count || 0, 0, 0, 999) + 1;
  await updateMessageRow(admin, row.id, {
    attachment_ready: false,
    attachment_error: false,
    attachment_error_message: 'RESOLVER_STARTED',
    attachment_attempt_count: attemptCount,
    attachment_last_attempt_at: new Date().toISOString(),
  });

  const mediaFetchStartedAt = perfNow();
  const media = await fetchMediaBase64(evolutionUrl, evolutionApiKey, instanceName, waMessageId, evolutionMessages);
  if (!media?.base64) {
    const finalizeAsReady = attemptCount >= maxAttempts;
    await updateMessageRow(admin, row.id, {
      attachment_error: true,
      attachment_error_message: `FATAL_NO_BASE64:${media?.error || 'unknown'}`,
      ...(finalizeAsReady ? { attachment_ready: true } : {}),
    });
    return {
      success: false,
      code: 'FATAL_NO_BASE64',
      messageId: row.id,
      attempts: attemptCount,
      strategy: media?.strategy || 'unknown',
    };
  }

  await ensurePublicBucket(admin, DELIVERY_BUCKET);
  await ensurePublicBucket(admin, ATTACHMENT_BUCKET);

  const uploadStartedAt = perfNow();
  const bytes = decodeBase64(media.base64);
  const fileSize = bytes.length;
  const resolvedMimeType = media.mimeType || mimeType;
  const storagePath = sanitizePathPart(`${row.id}/${Date.now()}_${sanitizePathPart(fileName.replace(/\s+/g, '_'))}`);

  let publicUrl = '';
  let usedBucket = '';
  let lastUploadError: unknown = null;

  for (const bucketName of [ATTACHMENT_BUCKET, DELIVERY_BUCKET] as const) {
    const { error } = await admin.storage
      .from(bucketName)
      .upload(storagePath, bytes, {
        contentType: resolvedMimeType,
        upsert: true,
      });

    if (!error) {
      usedBucket = bucketName;
      const { data: publicData } = admin.storage
        .from(bucketName)
        .getPublicUrl(storagePath);
      publicUrl = publicData.publicUrl;
      break;
    }

    lastUploadError = error;
  }

  if (!publicUrl) {
    await updateMessageRow(admin, row.id, {
      attachment_error: true,
      attachment_error_message: `STORAGE_FAIL:${shortErrorMessage(lastUploadError)}`,
    });
    return {
      success: false,
      code: 'STORAGE_FAIL',
      messageId: row.id,
      attempts: attemptCount,
    };
  }

  const attachmentType = resolveAttachmentType(messageType, resolvedMimeType, mediaVariant);
  const nextMetadata = {
    ...rowMetadata,
    media_variant: mediaVariant,
    storage_bucket: usedBucket,
    storage_path: storagePath,
    resolver_source: 'internal-crm-media-resolver',
    resolver_strategy: media.strategy,
  };

  let transcriptText: string | null = null;
  if (attachmentType === 'audio') {
    transcriptText = await transcribeAudioWithOpenAI(media.base64, resolvedMimeType);
  }

  const placeholderBody = resolvePlaceholderBody(attachmentType, mediaVariant);
  const currentBody = asString(row.body, 8_000);
  const shouldReplaceBodyWithTranscript =
    attachmentType === 'audio'
    && Boolean(transcriptText)
    && (!currentBody || currentBody === placeholderBody || currentBody.startsWith('Audio: '));

  const updatePayload: Record<string, unknown> = {
    attachment_url: publicUrl,
    attachment_ready: true,
    attachment_mimetype: resolvedMimeType,
    attachment_name: fileName,
    attachment_size: fileSize,
    attachment_error: false,
    attachment_error_message: `COMPLETED_OK:${Math.round(perfNow() - mediaFetchStartedAt)}ms_fetch:${Math.round(perfNow() - uploadStartedAt)}ms_upload`,
    metadata: transcriptText ? { ...nextMetadata, transcript: transcriptText } : nextMetadata,
  };

  if (shouldReplaceBodyWithTranscript && transcriptText) {
    updatePayload.body = `Audio: ${transcriptText}`;
  } else if (!currentBody) {
    updatePayload.body = placeholderBody;
  }

  const { error: updateError } = await updateMessageRow(admin, row.id, updatePayload);
  if (updateError) {
    await updateMessageRow(admin, row.id, {
      attachment_error: true,
      attachment_error_message: `DB_UPDATE_FAIL:${shortErrorMessage(updateError)}`,
    });
    return { success: false, code: 'DB_UPDATE_FAIL', messageId: row.id, attempts: attemptCount };
  }

  return {
    success: true,
    code: 'COMPLETED_OK',
    messageId: row.id,
    attempts: attemptCount,
    attachmentUrl: publicUrl,
    attachmentType,
    mediaVariant,
  };
}

async function processPendingMedia(
  admin: ReturnType<typeof createClient>,
  evolutionUrl: string,
  evolutionApiKey: string,
  payload: Record<string, unknown>,
) {
  const maxBatch = asPositiveInt(payload.maxBatch, RETRY_PENDING_BATCH_DEFAULT, 1, 100);
  const minAgeSeconds = asPositiveInt(payload.minAgeSeconds, RETRY_PENDING_MIN_AGE_SECONDS_DEFAULT, 5, 3_600);
  const maxAttempts = asPositiveInt(payload.maxAttempts, RETRY_PENDING_MAX_ATTEMPTS_DEFAULT, 1, 15);
  const cutoffIso = new Date(Date.now() - minAgeSeconds * 1_000).toISOString();

  const { data, error } = await crmSchema(admin)
    .from('messages')
    .select('*')
    .eq('attachment_ready', false)
    .in('message_type', ['image', 'video', 'audio', 'document'])
    .lte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(maxBatch);

  if (error) throw error;

  const rows = (data as InternalCrmMessageRow[] | null) || [];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    if (row.attachment_attempt_count >= maxAttempts) {
      await updateMessageRow(admin, row.id, {
        attachment_ready: true,
        attachment_error: true,
        attachment_error_message: 'MAX_ATTEMPTS_EXHAUSTED',
      });
      results.push({ messageId: row.id, status: 'skipped', code: 'MAX_ATTEMPTS_EXHAUSTED' });
      continue;
    }

    try {
      const result = await resolveSingleMedia(admin, evolutionUrl, evolutionApiKey, {
        messageId: row.id,
        waMessageId: row.wa_message_id,
        instanceName: asString(asRecord(row.metadata).instance_name, 180),
        mimeType: row.attachment_mimetype,
        fileName: row.attachment_name,
        messageType: row.message_type,
        mediaVariant: asString(asRecord(row.metadata).media_variant, 32),
        maxAttempts,
      });
      results.push(result);
    } catch (error) {
      const errorMessage = shortErrorMessage(error);
      await updateMessageRow(admin, row.id, {
        attachment_ready: true,
        attachment_error: true,
        attachment_error_message: `RETRY_PENDING_FAILED:${errorMessage}`,
      });
      results.push({
        messageId: row.id,
        success: false,
        code: 'RETRY_PENDING_FAILED',
        error: errorMessage,
      });
    }
  }

  return {
    scanned: rows.length,
    resolved: results.filter((item) => item.success === true).length,
    failed: results.filter((item) => item.success === false).length,
    results,
  };
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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const evolutionUrl = String(Deno.env.get('EVOLUTION_API_URL') || '').trim().replace(/\/+$/, '');
    const evolutionApiKey = String(Deno.env.get('EVOLUTION_API_KEY') || '').trim();
    if (!supabaseUrl || !supabaseServiceRoleKey || !evolutionUrl || !evolutionApiKey) {
      return new Response(JSON.stringify({ error: 'missing_runtime_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invocationAuth = validateServiceInvocationAuth(req, {
      serviceRoleKey: supabaseServiceRoleKey,
      internalApiKey: String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim(),
    });
    if (!invocationAuth.ok) {
      return new Response(JSON.stringify({ error: invocationAuth.code, reason: invocationAuth.reason }), {
        status: invocationAuth.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const payload = await req.json().catch(() => ({}));
    const body = isRecord(payload) ? payload : {};
    const action = asString(body.action, 40) || 'resolveOne';

    if (action === 'retryPending') {
      const summary = await processPendingMedia(admin, evolutionUrl, evolutionApiKey, body);
      return new Response(JSON.stringify({ ok: true, action, ...summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await resolveSingleMedia(admin, evolutionUrl, evolutionApiKey, {
      messageId: asString(body.messageId || body.message_id, 120),
      waMessageId: asString(body.waMessageId || body.wa_message_id, 180),
      instanceName: asString(body.instanceName || body.instance_name, 180),
      mimeType: asString(body.mimeType || body.mime_type, 180),
      fileName: asString(body.fileName || body.file_name, 220),
      messageType: asString(body.messageType || body.message_type, 32),
      mediaVariant: asString(body.mediaVariant || body.media_variant, 32),
      evolutionMessage: asRecord(body.evolutionMessage || body.evolution_message || body.message),
      maxAttempts: body.maxAttempts,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ ok: false, ...result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[internal-crm-media-resolver] fatal_error', error);
    return new Response(JSON.stringify({ error: shortErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

