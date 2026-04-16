import { supabase } from '@/lib/supabase';
import type {
  ContractArtifactKind,
  ContractArtifactRecord,
  ContractDraftListItem,
  ContractDraftRecord,
  ContractEventLogEntry,
  ContractEventType,
  ContractSignatureStatus,
  ContractStatus,
} from './domain';
import type { ContractFormalizationFormValues } from './schema';
import { applyExternalPrefill, createDefaultContractFormValues } from './schema';
import { createEventId, toIsoNow } from './formatters';
import { synchronizeContractValues } from './derivations';
import { renderContractDocument } from './templateEngine';
import { assertContractStatusTransition } from './stateMachine';

type ContractDraftDbRow = {
  id: string;
  org_id: string;
  lead_id: number | null;
  opportunity_id: number | null;
  contract_number: string;
  contract_version: number;
  template_version: string;
  contract_status: ContractStatus;
  signature_status: ContractSignatureStatus;
  legal_data: ContractFormalizationFormValues['legalData'];
  internal_metadata: ContractFormalizationFormValues['internalMetadata'];
  commercial_summary: Record<string, unknown>;
  placeholder_snapshot: Record<string, string>;
  rendered_html: string | null;
  rendered_text: string | null;
  preview_storage_bucket: string | null;
  preview_storage_path: string | null;
  pdf_storage_bucket: string | null;
  pdf_storage_path: string | null;
  last_error: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  sent_to_signature_at: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
};

type ContractArtifactDbRow = {
  id: string;
  contract_draft_id: string;
  artifact_kind: ContractArtifactKind;
  version_no: number;
  template_version: string;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string;
  html_snapshot: string | null;
  text_snapshot: string | null;
  checksum_hash: string | null;
  created_at: string;
};

const toDraftRecord = (row: ContractDraftDbRow): ContractDraftRecord => ({
  id: row.id,
  orgId: row.org_id,
  leadId: row.lead_id ? String(row.lead_id) : '',
  opportunityId: row.opportunity_id ? String(row.opportunity_id) : '',
  contractNumber: row.contract_number,
  contractVersion: row.contract_version,
  templateVersion: row.template_version,
  status: row.contract_status,
  signatureStatus: row.signature_status,
  legalData: row.legal_data as unknown as ContractDraftRecord['legalData'],
  internalMetadata:
    row.internal_metadata as unknown as ContractDraftRecord['internalMetadata'],
  commercialSummary:
    row.commercial_summary as unknown as ContractDraftRecord['commercialSummary'],
  placeholderSnapshot:
    row.placeholder_snapshot as ContractDraftRecord['placeholderSnapshot'],
  renderedHtml: row.rendered_html || '',
  renderedText: row.rendered_text || '',
  previewStorageBucket: row.preview_storage_bucket || '',
  previewStoragePath: row.preview_storage_path || '',
  pdfStorageBucket: row.pdf_storage_bucket || '',
  pdfStoragePath: row.pdf_storage_path || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  sentToSignatureAt: row.sent_to_signature_at || '',
  signedAt: row.signed_at || '',
  cancelledAt: row.cancelled_at || '',
  lastError:
    row.last_error && typeof row.last_error.message === 'string'
      ? row.last_error.message
      : '',
});

const toListItem = (row: ContractDraftDbRow): ContractDraftListItem => ({
  id: row.id,
  contractNumber: row.contract_number,
  status: row.contract_status,
  signatureStatus: row.signature_status,
  companyName: row.legal_data?.contratante?.razaoSocial || 'Empresa nao preenchida',
  responsibleName: row.legal_data?.responsavel?.nome || 'Responsavel nao preenchido',
  planName: row.legal_data?.plano?.nome || 'Plano nao definido',
  templateVersion: row.template_version,
  updatedAt: row.updated_at,
  pdfStoragePath: row.pdf_storage_path || '',
});

const buildLocalEventEntry = (input: {
  userId: string;
  type: ContractEventType;
  previousStatus: ContractStatus | null;
  nextStatus: ContractStatus | null;
  message: string;
  payload?: Record<string, unknown>;
}): ContractEventLogEntry => ({
  id: createEventId(),
  type: input.type,
  previousStatus: input.previousStatus,
  nextStatus: input.nextStatus,
  createdAt: toIsoNow(),
  createdByUserId: input.userId,
  message: input.message,
  payload: input.payload,
});

const buildDraftPayload = (
  values: ContractFormalizationFormValues,
  status: ContractStatus,
  renderPreview: boolean,
) => {
  const synchronizedValues = synchronizeContractValues(values);
  const renderResult = renderContractDocument(synchronizedValues);
  const internalMetadata = {
    ...synchronizedValues.internalMetadata,
    contractStatus: status,
  };

  return {
    synchronizedValues: {
      ...synchronizedValues,
      internalMetadata,
    },
    renderResult,
    rowPayload: {
      id: synchronizedValues.internalMetadata.contractDraftId,
      org_id: synchronizedValues.internalMetadata.organizationId,
      lead_id: synchronizedValues.internalMetadata.leadId
        ? Number(synchronizedValues.internalMetadata.leadId)
        : null,
      opportunity_id: synchronizedValues.internalMetadata.opportunityId
        ? Number(synchronizedValues.internalMetadata.opportunityId)
        : null,
      contract_number: synchronizedValues.internalMetadata.contractNumber,
      contract_version: synchronizedValues.internalMetadata.contractVersion,
      template_version: synchronizedValues.internalMetadata.templateVersion,
      contract_status: status,
      signature_status: synchronizedValues.internalMetadata.signatureStatus,
      generated_from: synchronizedValues.internalMetadata.source.generatedFrom,
      source_context: synchronizedValues.internalMetadata.source,
      embed_origin: synchronizedValues.internalMetadata.source.embedOrigin || null,
      embed_source: synchronizedValues.internalMetadata.source.embedSource || null,
      sales_session_id:
        synchronizedValues.internalMetadata.source.salesSessionId || null,
      seller_user_id:
        synchronizedValues.internalMetadata.sellerUserId || null,
      created_by_user_id:
        synchronizedValues.internalMetadata.createdByUserId,
      last_updated_by_user_id:
        synchronizedValues.internalMetadata.lastUpdatedByUserId,
      signature_provider:
        synchronizedValues.internalMetadata.signatureProvider || null,
      signature_envelope_id:
        synchronizedValues.internalMetadata.signatureEnvelopeId || null,
      signature_reference: {
        signature_status: synchronizedValues.internalMetadata.signatureStatus,
      },
      legal_data: synchronizedValues.legalData,
      internal_metadata: internalMetadata,
      commercial_summary: renderResult.commercialSummary,
      plan_snapshot: synchronizedValues.legalData.plano,
      special_condition_snapshot: synchronizedValues.legalData.condicaoEspecial,
      payment_snapshot: synchronizedValues.legalData.pagamento,
      recurrence_snapshot: synchronizedValues.legalData.recorrencia,
      placeholder_snapshot: renderResult.placeholders,
      rendered_html: renderPreview ? renderResult.html : null,
      rendered_text: renderResult.markdown,
      preview_storage_path: internalMetadata.previewStoragePath || null,
      pdf_storage_path: internalMetadata.pdfStoragePath || null,
      preview_storage_bucket: null,
      pdf_storage_bucket: null,
      last_error: null,
      preview_generated_at:
        status === 'preview_generated' || status === 'pdf_generated'
          ? toIsoNow()
          : null,
      pdf_generated_at: status === 'pdf_generated' ? toIsoNow() : null,
      sent_to_signature_at:
        status === 'sent_for_signature' ? toIsoNow() : null,
      signed_at: status === 'signed' ? toIsoNow() : null,
      cancelled_at: status === 'cancelled' ? toIsoNow() : null,
    },
  };
};

const syncLocalEventLog = (
  values: ContractFormalizationFormValues,
  eventEntry: ContractEventLogEntry,
) => ({
  ...values,
  internalMetadata: {
    ...values.internalMetadata,
    eventLog: [...values.internalMetadata.eventLog, eventEntry],
    lastUpdatedByUserId: eventEntry.createdByUserId,
  },
});

export const listContractDrafts = async (orgId: string) => {
  const { data, error } = await supabase
    .from('contract_drafts')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return ((data || []) as ContractDraftDbRow[]).map(toListItem);
};

export const getContractDraft = async (contractDraftId: string, orgId: string) => {
  const { data, error } = await supabase
    .from('contract_drafts')
    .select('*')
    .eq('id', contractDraftId)
    .eq('org_id', orgId)
    .single();

  if (error) throw error;
  return toDraftRecord(data as ContractDraftDbRow);
};

export const contractDraftRecordToFormValues = (
  draft: ContractDraftRecord,
): ContractFormalizationFormValues => ({
  legalData: draft.legalData,
  internalMetadata: draft.internalMetadata,
});

export const createContractDraft = async (input: {
  orgId: string;
  userId: string;
  sellerUserId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  prefill?: Parameters<typeof applyExternalPrefill>[1];
}) => {
  let values = createDefaultContractFormValues();
  values = applyExternalPrefill(values, input.prefill);
  values = {
    ...values,
    internalMetadata: {
      ...values.internalMetadata,
      organizationId: input.orgId,
      createdByUserId: input.userId,
      lastUpdatedByUserId: input.userId,
      sellerUserId: input.sellerUserId || '',
      leadId: input.leadId || '',
      opportunityId: input.opportunityId || '',
    },
  };

  const createdEvent = buildLocalEventEntry({
    userId: input.userId,
    type: 'contract_created',
    previousStatus: null,
    nextStatus: 'draft',
    message: 'Contrato draft criado.',
  });
  const nextValues = syncLocalEventLog(values, createdEvent);
  const { synchronizedValues, rowPayload, renderResult } = buildDraftPayload(
    nextValues,
    'draft',
    false,
  );

  const { data, error } = await supabase
    .from('contract_drafts')
    .insert(rowPayload)
    .select('*')
    .single();

  if (error) throw error;

  await supabase.from('contract_events').insert({
    contract_draft_id: synchronizedValues.internalMetadata.contractDraftId,
    org_id: input.orgId,
    user_id: input.userId,
    event_type: 'contract_created',
    previous_status: null,
    next_status: 'draft',
    payload: {
      contract_number: synchronizedValues.internalMetadata.contractNumber,
      commercial_summary: renderResult.commercialSummary,
    },
  });

  return {
    draft: toDraftRecord(data as ContractDraftDbRow),
    values: synchronizedValues,
    renderResult,
  };
};

export const persistContractDraft = async (input: {
  values: ContractFormalizationFormValues;
  orgId: string;
  userId: string;
  nextStatus?: ContractStatus;
  eventType?: ContractEventType;
  eventMessage?: string;
  renderPreview?: boolean;
}) => {
  const currentStatus = input.values.internalMetadata.contractStatus;
  const nextStatus = input.nextStatus || currentStatus;

  if (currentStatus !== nextStatus) {
    assertContractStatusTransition(currentStatus, nextStatus);
  }

  const eventEntry = buildLocalEventEntry({
    userId: input.userId,
    type: input.eventType || 'contract_draft_saved',
    previousStatus: currentStatus,
    nextStatus,
    message:
      input.eventMessage ||
      (currentStatus === nextStatus
        ? 'Contrato draft salvo.'
        : `Status atualizado para ${nextStatus}.`),
  });

  const valuesWithEvent = syncLocalEventLog(input.values, eventEntry);
  const { synchronizedValues, rowPayload, renderResult } = buildDraftPayload(
    {
      ...valuesWithEvent,
      internalMetadata: {
        ...valuesWithEvent.internalMetadata,
        organizationId: input.orgId,
      },
    },
    nextStatus,
    input.renderPreview === true,
  );

  const { data, error } = await supabase
    .from('contract_drafts')
    .upsert(rowPayload)
    .select('*')
    .single();

  if (error) throw error;

  await supabase.from('contract_events').insert({
    contract_draft_id: synchronizedValues.internalMetadata.contractDraftId,
    org_id: input.orgId,
    user_id: input.userId,
    event_type: eventEntry.type,
    previous_status: eventEntry.previousStatus,
    next_status: eventEntry.nextStatus,
    payload: {
      message: eventEntry.message,
      checksum_hash: synchronizedValues.internalMetadata.checksumHash,
    },
  });

  return {
    draft: toDraftRecord(data as ContractDraftDbRow),
    values: synchronizedValues,
    renderResult,
  };
};

export const createContractArtifact = async (input: {
  contractDraftId: string;
  orgId: string;
  userId: string;
  kind: ContractArtifactKind;
  templateVersion: string;
  storageBucket?: string;
  storagePath?: string;
  mimeType: string;
  htmlSnapshot?: string;
  textSnapshot?: string;
  checksumHash?: string;
}) => {
  const { data, error } = await supabase
    .from('contract_artifacts')
    .insert({
      contract_draft_id: input.contractDraftId,
      org_id: input.orgId,
      created_by_user_id: input.userId,
      artifact_kind: input.kind,
      version_no: 1,
      template_version: input.templateVersion,
      storage_bucket: input.storageBucket || null,
      storage_path: input.storagePath || null,
      mime_type: input.mimeType,
      html_snapshot: input.htmlSnapshot || null,
      text_snapshot: input.textSnapshot || null,
      checksum_hash: input.checksumHash || null,
      payload: {},
    })
    .select('*')
    .single();

  if (error) throw error;

  const row = data as ContractArtifactDbRow;
  return {
    id: row.id,
    contractDraftId: row.contract_draft_id,
    kind: row.artifact_kind,
    version: row.version_no,
    templateVersion: row.template_version,
    storageBucket: row.storage_bucket || '',
    storagePath: row.storage_path || '',
    mimeType: row.mime_type,
    htmlSnapshot: row.html_snapshot || '',
    textSnapshot: row.text_snapshot || '',
    checksumHash: row.checksum_hash || '',
    createdAt: row.created_at,
  } as ContractArtifactRecord;
};
