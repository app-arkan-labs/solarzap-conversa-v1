export type InternalCrmCanonicalStageCode =
  | 'novo_lead'
  | 'respondeu'
  | 'chamada_agendada'
  | 'chamada_realizada'
  | 'nao_compareceu'
  | 'negociacao'
  | 'fechou'
  | 'nao_fechou';

type InternalCrmStageMeta = {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  nextActionLabel: string;
  terminal?: boolean;
};

export const INTERNAL_CRM_PIPELINE_STAGE_ORDER: InternalCrmCanonicalStageCode[] = [
  'novo_lead',
  'respondeu',
  'chamada_agendada',
  'chamada_realizada',
  'nao_compareceu',
  'negociacao',
  'fechou',
  'nao_fechou',
];

export const INTERNAL_CRM_STAGE_ALIASES: Record<string, InternalCrmCanonicalStageCode> = {
  lead_entrante: 'novo_lead',
  contato_iniciado: 'respondeu',
  qualificado: 'respondeu',
  demo_agendada: 'chamada_agendada',
  proposta_enviada: 'negociacao',
  aguardando_pagamento: 'negociacao',
  ganho: 'fechou',
  perdido: 'nao_fechou',
  agendou_reuniao: 'chamada_agendada',
  reuniao_agendada: 'chamada_agendada',
  reuniao_realizada: 'chamada_realizada',
  contrato_fechado: 'fechou',
};

export const INTERNAL_CRM_STAGE_META: Record<InternalCrmCanonicalStageCode, InternalCrmStageMeta> = {
  novo_lead: {
    label: 'Novo Lead',
    shortLabel: 'Novo Lead',
    color: '#2196F3',
    icon: 'N',
    nextActionLabel: 'Abrir conversa',
  },
  respondeu: {
    label: 'Respondeu',
    shortLabel: 'Respondeu',
    color: '#FF9800',
    icon: 'R',
    nextActionLabel: 'Agendar reuniao',
  },
  chamada_agendada: {
    label: 'Reuniao Agendada',
    shortLabel: 'Agendada',
    color: '#3F51B5',
    icon: 'A',
    nextActionLabel: 'Realizar reuniao',
  },
  chamada_realizada: {
    label: 'Reuniao Realizada',
    shortLabel: 'Realizada',
    color: '#4CAF50',
    icon: 'C',
    nextActionLabel: 'Gerar checkout',
  },
  nao_compareceu: {
    label: 'Nao Compareceu',
    shortLabel: 'No-show',
    color: '#F44336',
    icon: '!',
    nextActionLabel: 'Reagendar',
  },
  negociacao: {
    label: 'Negociacao',
    shortLabel: 'Negociacao',
    color: '#FFC107',
    icon: '$',
    nextActionLabel: 'Fechar negociacao',
  },
  fechou: {
    label: 'Fechou Contrato',
    shortLabel: 'Fechou',
    color: '#8BC34A',
    icon: 'F',
    nextActionLabel: 'Provisionar conta',
    terminal: true,
  },
  nao_fechou: {
    label: 'Nao Fechou',
    shortLabel: 'Perdido',
    color: '#607D8B',
    icon: '!',
    nextActionLabel: 'Reativar lead',
    terminal: true,
  },
};

export function normalizeInternalCrmStageCode(stageCode: string | null | undefined): string {
  const normalized = String(stageCode || '').trim().toLowerCase();
  if (!normalized) return 'novo_lead';
  return INTERNAL_CRM_STAGE_ALIASES[normalized] || normalized;
}

export function getInternalCrmStageMeta(stageCode: string | null | undefined) {
  const normalized = normalizeInternalCrmStageCode(stageCode) as InternalCrmCanonicalStageCode;
  return INTERNAL_CRM_STAGE_META[normalized];
}

export function getInternalCrmStageLabel(stageCode: string | null | undefined, fallback?: string | null) {
  return getInternalCrmStageMeta(stageCode)?.label || fallback || normalizeInternalCrmStageCode(stageCode);
}

export function getInternalCrmStageColor(stageCode: string | null | undefined) {
  return getInternalCrmStageMeta(stageCode)?.color || '#9E9E9E';
}

export function getInternalCrmNextActionLabel(stageCode: string | null | undefined) {
  return getInternalCrmStageMeta(stageCode)?.nextActionLabel || 'Abrir deal';
}

export function isInternalCrmTerminalStage(stageCode: string | null | undefined) {
  return Boolean(getInternalCrmStageMeta(stageCode)?.terminal);
}
