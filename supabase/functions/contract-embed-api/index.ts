import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
import {
  appendContractEventEntry,
  applyLockedPrefillFields,
  buildContractCommercialSummary,
  createContractEventEntry,
  normalizeContractValues,
  type ContractEmbedPrefill,
} from '../_shared/contractEmbedDraft.ts';
import { sha256Hex, verifyContractEmbedToken } from '../_shared/contractEmbedToken.ts';

const asString = (value: unknown, max = 2000): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const asRawString = (value: unknown, max = 2_000_000): string =>
  String(value ?? '').slice(0, max);

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 140) || 'contrato.pdf';

const ensurePrivateBucket = async (
  admin: ReturnType<typeof createClient>,
  bucketName: string,
) => {
  const { data: bucket, error } = await admin.storage.getBucket(bucketName);
  if (!bucket || error) {
    const { error: createError } = await admin.storage.createBucket(bucketName, { public: false });
    if (createError && !String(createError.message || '').toLowerCase().includes('already exists')) {
      throw createError;
    }
    return;
  }

  if (bucket.public) {
    try {
      await admin.storage.updateBucket(bucketName, { public: false });
    } catch {
      // noop
    }
  }
};

const uploadArtifact = async (input: {
  admin: ReturnType<typeof createClient>;
  bucket: string;
  orgId: string;
  draftId: string;
  kind: 'preview_html' | 'pdf';
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
}) => {
  await ensurePrivateBucket(input.admin, input.bucket);
  const path = `${input.orgId}/${input.draftId}/${input.kind}/${Date.now()}_${sanitizeFileName(input.fileName)}`;
  const { error } = await input.admin.storage
    .from(input.bucket)
    .upload(path, input.bytes, {
      contentType: input.mimeType,
      upsert: true,
    });
  if (error) throw error;
  return { bucket: input.bucket, path };
};

const isAllowedEmbedOrigin = (sessionOrigin: string, providedOrigin: string) => {
  if (!sessionOrigin) return true;
  if (!providedOrigin) return true;
  return sessionOrigin.replace(/\/+$/, '') === providedOrigin.replace(/\/+$/, '');
};

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const embedSecret = Deno.env.get('CONTRACT_EMBED_SHARED_SECRET') || '';
    if (!supabaseUrl || !supabaseServiceRole || !embedSecret) {
      return new Response(JSON.stringify({ error: 'missing_required_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRole);
    const body = await req.json().catch(() => ({}));
    const token = asString(body?.token, 4096);
    const action = asString(body?.action, 120);
    const embedOrigin = asString(body?.embedOrigin, 255);

    if (!token || !action) {
      return new Response(JSON.stringify({ error: 'missing_token_or_action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verified = await verifyContractEmbedToken(token, embedSecret);
    if (!verified) {
      return new Response(JSON.stringify({ error: 'invalid_or_expired_token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await sha256Hex(token);
    const { data: sessionRow, error: sessionError } = await admin
      .from('contract_embed_sessions')
      .select('*')
      .eq('id', verified.session_id)
      .eq('contract_draft_id', verified.draft_id)
      .eq('org_id', verified.org_id)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      return new Response(JSON.stringify({ error: 'embed_session_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (asString(sessionRow.token_hash, 255) !== tokenHash) {
      return new Response(JSON.stringify({ error: 'token_hash_mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const expiresAt = new Date(sessionRow.expires_at);
    if (sessionRow.status !== 'active' || expiresAt.getTime() <= now.getTime()) {
      await admin
        .from('contract_embed_sessions')
        .update({ status: 'expired', last_used_at: now.toISOString() })
        .eq('id', sessionRow.id);
      return new Response(JSON.stringify({ error: 'embed_session_expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isAllowedEmbedOrigin(asString(sessionRow.allowed_origin, 255), embedOrigin)) {
      return new Response(JSON.stringify({ error: 'embed_origin_not_allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: draftRow, error: draftError } = await admin
      .from('contract_drafts')
      .select('*')
      .eq('id', verified.draft_id)
      .eq('org_id', verified.org_id)
      .maybeSingle();

    if (draftError || !draftRow) {
      return new Response(JSON.stringify({ error: 'contract_draft_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sessionPrefill = asObject(sessionRow.prefill_snapshot) as ContractEmbedPrefill;
    const normalizedValues = normalizeContractValues(draftRow as Record<string, any>, sessionPrefill);

    if (action === 'resolve') {
      await admin
        .from('contract_embed_sessions')
        .update({ last_used_at: now.toISOString() })
        .eq('id', sessionRow.id);

      return new Response(
        JSON.stringify({
          session: {
            sessionId: sessionRow.id,
            draftId: draftRow.id,
            orgId: draftRow.org_id,
            sellerUserId: sessionRow.seller_user_id,
            allowedOrigin: sessionRow.allowed_origin,
            status: sessionRow.status,
            expiresAt: sessionRow.expires_at,
            lockFields: Array.isArray(sessionPrefill.lockFields) ? sessionPrefill.lockFields : [],
            prefill: sessionPrefill,
            createdAt: sessionRow.created_at,
            lastUsedAt: sessionRow.last_used_at,
          },
          values: normalizedValues,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const incomingValues = asObject(body?.values);
    if (!incomingValues.legalData || !incomingValues.internalMetadata) {
      return new Response(JSON.stringify({ error: 'missing_contract_values' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let mergedValues = {
      legalData: asObject(incomingValues.legalData),
      internalMetadata: asObject(incomingValues.internalMetadata),
    };
    mergedValues = applyLockedPrefillFields(mergedValues as any, sessionPrefill);

    const previousStatus = asString(draftRow.contract_status, 120) || 'draft';
    let nextStatus = previousStatus;
    let eventType = 'contract_draft_saved';
    let eventMessage = 'Contrato draft salvo via sessao embed.';

    if (action === 'review_ready') {
      nextStatus = 'review_ready';
      eventType = 'summary_confirmed';
      eventMessage = 'Resumo comercial confirmado via embed.';
    } else if (action === 'save_preview') {
      nextStatus = 'preview_generated';
      eventType = 'preview_generated';
      eventMessage = 'Preview contratual salvo via embed.';
    } else if (action === 'save_pdf') {
      nextStatus = 'pdf_generated';
      eventType = 'pdf_generated';
      eventMessage = 'PDF contratual salvo via embed.';
    } else if (action !== 'save') {
      return new Response(JSON.stringify({ error: 'unsupported_action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventEntry = createContractEventEntry(mergedValues as any, {
      type: eventType,
      userId: asString(sessionRow.seller_user_id, 120),
      previousStatus,
      nextStatus,
      message: eventMessage,
    });
    const valuesWithEvent = appendContractEventEntry(mergedValues as any, eventEntry);
    valuesWithEvent.internalMetadata.contractStatus = nextStatus;
    valuesWithEvent.internalMetadata.source = {
      ...valuesWithEvent.internalMetadata.source,
      sourceContext: 'apresentacao_arkanlabs',
      generatedFrom: 'landing_embed',
      embedOrigin: asString(sessionRow.allowed_origin, 255),
      embedSource: 'public_embed',
      prefillLockedFields: Array.isArray(sessionPrefill.lockFields) ? sessionPrefill.lockFields : [],
    };

    const render = asObject(body?.render);
    let previewStorage = {
      bucket: asString(draftRow.preview_storage_bucket, 255),
      path: asString(draftRow.preview_storage_path, 255),
    };
    let pdfStorage = {
      bucket: asString(draftRow.pdf_storage_bucket, 255),
      path: asString(draftRow.pdf_storage_path, 255),
    };

    if (action === 'save_preview' || action === 'save_pdf') {
      const html = asRawString(render.html, 1_000_000);
      const markdown = asRawString(render.markdown, 1_000_000);
      if (!html || !markdown) {
        return new Response(JSON.stringify({ error: 'missing_render_payload' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      previewStorage = await uploadArtifact({
        admin,
        bucket: 'contracts',
        orgId: draftRow.org_id,
        draftId: draftRow.id,
        kind: 'preview_html',
        fileName: `${draftRow.contract_number}-preview.html`,
        bytes: new TextEncoder().encode(html),
        mimeType: 'text/html',
      });

      await admin.from('contract_artifacts').insert({
        contract_draft_id: draftRow.id,
        org_id: draftRow.org_id,
        created_by_user_id: sessionRow.seller_user_id,
        artifact_kind: 'preview_html',
        version_no: 1,
        template_version: valuesWithEvent.internalMetadata.templateVersion,
        storage_bucket: previewStorage.bucket,
        storage_path: previewStorage.path,
        mime_type: 'text/html',
        html_snapshot: html,
        text_snapshot: markdown,
        checksum_hash: valuesWithEvent.internalMetadata.checksumHash,
        payload: {
          included_annexes: Array.isArray(render.includedAnnexes) ? render.includedAnnexes : [],
        },
      });
    }

    if (action === 'save_pdf') {
      const pdfBase64 = asString(body?.pdfBase64, 10_000_000);
      const fileName = asString(body?.fileName, 255) || `${draftRow.contract_number}.pdf`;
      if (!pdfBase64) {
        return new Response(JSON.stringify({ error: 'missing_pdf_payload' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      pdfStorage = await uploadArtifact({
        admin,
        bucket: 'contracts',
        orgId: draftRow.org_id,
        draftId: draftRow.id,
        kind: 'pdf',
        fileName,
        bytes: decodeBase64(pdfBase64),
        mimeType: 'application/pdf',
      });

      await admin.from('contract_artifacts').insert({
        contract_draft_id: draftRow.id,
        org_id: draftRow.org_id,
        created_by_user_id: sessionRow.seller_user_id,
        artifact_kind: 'pdf',
        version_no: 1,
        template_version: valuesWithEvent.internalMetadata.templateVersion,
        storage_bucket: pdfStorage.bucket,
        storage_path: pdfStorage.path,
        mime_type: 'application/pdf',
        html_snapshot: asRawString(render.html, 1_000_000) || null,
        text_snapshot: asRawString(render.markdown, 1_000_000) || null,
        checksum_hash: valuesWithEvent.internalMetadata.checksumHash,
        payload: {
          file_name: fileName,
        },
      });
    }

    const updatePayload = {
      contract_status: nextStatus,
      signature_status: asString(valuesWithEvent.internalMetadata.signatureStatus, 120) || 'not_requested',
      generated_from: 'landing_embed',
      source_context: valuesWithEvent.internalMetadata.source,
      embed_origin: asString(sessionRow.allowed_origin, 255),
      embed_source: 'public_embed',
      sales_session_id: asString(valuesWithEvent.internalMetadata.source.salesSessionId, 120) || null,
      seller_user_id: asString(valuesWithEvent.internalMetadata.sellerUserId, 120) || sessionRow.seller_user_id,
      last_updated_by_user_id: sessionRow.seller_user_id,
      signature_provider: asString(valuesWithEvent.internalMetadata.signatureProvider, 120) || null,
      signature_envelope_id: asString(valuesWithEvent.internalMetadata.signatureEnvelopeId, 255) || null,
      signature_reference: {
        signature_status: asString(valuesWithEvent.internalMetadata.signatureStatus, 120) || 'not_requested',
      },
      legal_data: valuesWithEvent.legalData,
      internal_metadata: valuesWithEvent.internalMetadata,
      commercial_summary: buildContractCommercialSummary(valuesWithEvent as any),
      plan_snapshot: valuesWithEvent.legalData.plano,
      special_condition_snapshot: valuesWithEvent.legalData.condicaoEspecial,
      payment_snapshot: valuesWithEvent.legalData.pagamento,
      recurrence_snapshot: valuesWithEvent.legalData.recorrencia,
      placeholder_snapshot: asObject(render.placeholders),
      rendered_html: asRawString(render.html, 1_000_000) || draftRow.rendered_html,
      rendered_text: asRawString(render.markdown, 1_000_000) || draftRow.rendered_text,
      checksum_hash: asString(valuesWithEvent.internalMetadata.checksumHash, 255),
      preview_storage_bucket: previewStorage.bucket || null,
      preview_storage_path: previewStorage.path || null,
      pdf_storage_bucket: pdfStorage.bucket || null,
      pdf_storage_path: pdfStorage.path || null,
      preview_generated_at:
        action === 'save_preview' || action === 'save_pdf'
          ? now.toISOString()
          : draftRow.preview_generated_at,
      pdf_generated_at: action === 'save_pdf' ? now.toISOString() : draftRow.pdf_generated_at,
      sent_to_signature_at: draftRow.sent_to_signature_at,
      signed_at: draftRow.signed_at,
      cancelled_at: draftRow.cancelled_at,
    };

    const { error: updateError } = await admin
      .from('contract_drafts')
      .update(updatePayload)
      .eq('id', draftRow.id)
      .eq('org_id', draftRow.org_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'draft_update_failed', message: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    await admin.from('contract_events').insert({
      contract_draft_id: draftRow.id,
      org_id: draftRow.org_id,
      user_id: sessionRow.seller_user_id,
      event_type: eventType,
      previous_status: previousStatus,
      next_status: nextStatus,
      payload: {
        message: eventMessage,
        embed_origin: embedOrigin || null,
      },
    });

    await admin
      .from('contract_embed_sessions')
      .update({ last_used_at: now.toISOString() })
      .eq('id', sessionRow.id);

    return new Response(
      JSON.stringify({
        values: valuesWithEvent,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('contract-embed-api error:', error);
    return new Response(JSON.stringify({ error: 'internal_error', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
