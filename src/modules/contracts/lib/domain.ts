export const CONTRACT_TEMPLATE_VERSION = 'solarzap_contract_real_v2';
export const CONTRACT_TEMPLATE_SOURCE_PATH =
  'GERADOR DE CONTRATOS/contrato_base_solarzap_template_real_v2.md';

export const CONTRACT_STATUS_VALUES = [
  'draft',
  'review_ready',
  'preview_generated',
  'pdf_generated',
  'sent_for_signature',
  'signed',
  'cancelled',
  'expired',
  'failed',
] as const;

export type ContractStatus = (typeof CONTRACT_STATUS_VALUES)[number];

export const CONTRACT_SIGNATURE_STATUS_VALUES = [
  'not_requested',
  'ready',
  'pending',
  'signed',
  'declined',
  'cancelled',
  'failed',
] as const;

export type ContractSignatureStatus =
  (typeof CONTRACT_SIGNATURE_STATUS_VALUES)[number];

export const CONTRACT_ARTIFACT_KIND_VALUES = [
  'preview_html',
  'pdf',
  'signature_receipt',
  'summary_snapshot',
] as const;

export type ContractArtifactKind = (typeof CONTRACT_ARTIFACT_KIND_VALUES)[number];

export const CONTRACT_EVENT_TYPE_VALUES = [
  'contract_created',
  'contract_draft_saved',
  'summary_confirmed',
  'preview_generated',
  'pdf_generated',
  'sent_for_signature',
  'signed',
  'cancelled',
  'expired',
  'failed',
  'special_condition_applied',
  'state_transition',
] as const;

export type ContractEventType = (typeof CONTRACT_EVENT_TYPE_VALUES)[number];

export const CONTRACT_PLAN_CODE_VALUES = ['plano_a', 'plano_b', 'plano_c'] as const;
export type ContractPlanCode = (typeof CONTRACT_PLAN_CODE_VALUES)[number];

export type ContractInputMode = 'workspace' | 'standalone' | 'crm_admin' | 'embedded';

export interface ContractCompanyAddress {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
}

export interface ContractingCompanyData {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: ContractCompanyAddress;
}

export interface LegalRepresentativeData {
  nome: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  cpf: string;
  rg: string;
  cargo: string;
  email: string;
  telefone: string;
}

export interface ContractorPartyData {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  representanteNome: string;
  representanteCpf: string;
}

export interface ContractPlanFeatureFlags {
  suporteWhatsapp: boolean;
  reuniaoExtra: boolean;
  landingPage: boolean;
  treinamentoGravado: boolean;
  solarZapMesUm: boolean;
  acompanhamentoSemanal: boolean;
  trafegoPago: boolean;
}

export interface ContractPlanSnapshot {
  codigo: ContractPlanCode;
  nome: string;
  valorImplantacao: number;
  valorRecorrente: number;
  quantidadeReunioesImplantacao: number;
  descricaoObjetiva: string;
  itensInclusos: string[];
  itensNaoInclusos: string[];
  flags: ContractPlanFeatureFlags;
}

export interface ContractSpecialConditionInput {
  ativa: boolean;
  descricao: string;
  observacoesComerciais: string;
  incluiReuniaoExtra: boolean;
  incluiLandingPage: boolean;
}

export interface ContractPaymentTerms {
  dataAssinatura: string;
  dataInicio: string;
  dataPrimeiroVencimento: string;
  diaVencimentoMensal: number;
  formaPagamentoImplantacao: string;
  formaPagamentoRecorrencia: string;
  valorImplantacao: number;
  valorRecorrente: number;
}

export interface ContractRecurrenceTerms {
  vigenciaInicialMeses: number;
  prazoCancelamentoDias: number;
  prazoExportacaoDadosDias: number;
  multaInadimplenciaPercentual: number;
  jurosInadimplenciaPercentual: number;
  renovacaoAutomaticaMensal: boolean;
  faseUmDescricao: string;
  faseDoisDescricao: string;
}

export interface ContractSignatureTerms {
  plataformaNome: string;
  plataformaUrl: string;
}

export interface ContractForumTerms {
  cidade: string;
  estado: string;
}

export interface ContractLegalData {
  contratante: ContractingCompanyData;
  responsavel: LegalRepresentativeData;
  contratada: ContractorPartyData;
  plano: ContractPlanSnapshot;
  condicaoEspecial: ContractSpecialConditionInput;
  pagamento: ContractPaymentTerms;
  recorrencia: ContractRecurrenceTerms;
  assinatura: ContractSignatureTerms;
  foro: ContractForumTerms;
}

export interface ContractSourceContext {
  sourceContext: string;
  generatedFrom: string;
  embedOrigin: string;
  embedSource: string;
  salesSessionId: string;
  prefillLockedFields: string[];
}

export interface ContractInternalMetadata {
  contractDraftId: string;
  contractNumber: string;
  contractVersion: number;
  templateVersion: string;
  leadId: string;
  opportunityId: string;
  organizationId: string;
  sellerUserId: string;
  createdByUserId: string;
  lastUpdatedByUserId: string;
  contractStatus: ContractStatus;
  signatureStatus: ContractSignatureStatus;
  signatureProvider: string;
  signatureEnvelopeId: string;
  pdfStoragePath: string;
  previewStoragePath: string;
  checksumHash: string;
  source: ContractSourceContext;
  eventLog: ContractEventLogEntry[];
}

export interface ContractCommercialSummary {
  contratanteNome: string;
  responsavelNome: string;
  planoNome: string;
  planoCodigo: ContractPlanCode;
  valorImplantacao: number;
  valorRecorrente: number;
  dataInicio: string;
  primeiroVencimento: string;
  diaVencimentoMensal: number;
  quantidadeReunioesImplantacao: number;
  suporteWhatsapp: boolean;
  landingPage: boolean;
  reuniaoExtra: boolean;
  acompanhamentoSemanal: boolean;
  treinamentoGravado: boolean;
  solarZapMesUm: boolean;
  trafegoPago: boolean;
  condicaoEspecialAtiva: boolean;
  descricaoCondicaoEspecial: string;
  observacoesComerciais: string;
  foro: string;
  plataformaAssinatura: string;
}

export interface ContractPlaceholderSnapshot {
  [placeholder: string]: string;
}

export interface ContractRenderResult {
  markdown: string;
  html: string;
  blocks: ContractRenderBlock[];
  placeholders: ContractPlaceholderSnapshot;
  commercialSummary: ContractCommercialSummary;
  includedAnnexes: string[];
}

export interface ContractRenderBlock {
  type:
    | 'heading_1'
    | 'heading_2'
    | 'heading_3'
    | 'paragraph'
    | 'blockquote'
    | 'unordered_list'
    | 'ordered_list'
    | 'divider';
  content?: string;
  items?: string[];
}

export interface ContractArtifactRecord {
  id: string;
  contractDraftId: string;
  kind: ContractArtifactKind;
  version: number;
  templateVersion: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  htmlSnapshot: string;
  textSnapshot: string;
  checksumHash: string;
  createdAt: string;
}

export interface ContractEventLogEntry {
  id: string;
  type: ContractEventType;
  previousStatus: ContractStatus | null;
  nextStatus: ContractStatus | null;
  createdAt: string;
  createdByUserId: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface ContractDraftRecord {
  id: string;
  orgId: string;
  leadId: string;
  opportunityId: string;
  contractNumber: string;
  contractVersion: number;
  templateVersion: string;
  status: ContractStatus;
  signatureStatus: ContractSignatureStatus;
  legalData: ContractLegalData;
  internalMetadata: ContractInternalMetadata;
  commercialSummary: ContractCommercialSummary;
  placeholderSnapshot: ContractPlaceholderSnapshot;
  renderedHtml: string;
  renderedText: string;
  previewStorageBucket: string;
  previewStoragePath: string;
  pdfStorageBucket: string;
  pdfStoragePath: string;
  createdAt: string;
  updatedAt: string;
  sentToSignatureAt: string;
  signedAt: string;
  cancelledAt: string;
  lastError?: string;
}

export interface ContractDraftListItem {
  id: string;
  contractNumber: string;
  status: ContractStatus;
  signatureStatus: ContractSignatureStatus;
  companyName: string;
  responsibleName: string;
  planName: string;
  templateVersion: string;
  updatedAt: string;
  pdfStoragePath: string;
}

export interface ContractExternalPrefill {
  empresaNome?: string;
  empresaRazaoSocial?: string;
  cnpj?: string;
  responsavelNome?: string;
  responsavelEmail?: string;
  responsavelTelefone?: string;
  planoSugerido?: ContractPlanCode;
  condicaoEspecialAtiva?: boolean;
  condicaoEspecialDescricao?: string;
  sellerUserId?: string;
  salesSessionId?: string;
  lockFields?: string[];
}

export type ContractEmbedSessionStatus = 'active' | 'expired' | 'revoked';

export interface ContractEmbedSessionRecord {
  sessionId: string;
  draftId: string;
  orgId: string;
  sellerUserId: string;
  allowedOrigin: string;
  status: ContractEmbedSessionStatus;
  expiresAt: string;
  lockFields: string[];
  prefill: ContractExternalPrefill | null;
  createdAt: string;
  lastUsedAt: string;
}
