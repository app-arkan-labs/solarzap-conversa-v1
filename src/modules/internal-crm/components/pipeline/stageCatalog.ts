export type InternalCrmCanonicalStageCode =
  | 'novo_lead'
  | 'tentando_contato'
  | 'mql'
  | 'reuniao_marcada'
  | 'reuniao_realizada'
  | 'contrato_fechado'
  | 'venda_finalizada';

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
  'tentando_contato',
  'mql',
  'reuniao_marcada',
  'reuniao_realizada',
  'contrato_fechado',
  'venda_finalizada',
];

export const INTERNAL_CRM_STAGE_ALIASES: Record<string, InternalCrmCanonicalStageCode> = {
  lead_entrante: 'novo_lead',
  respondeu: 'tentando_contato',
  contato_iniciado: 'tentando_contato',
  qualificado: 'mql',
  chamada_agendada: 'tentando_contato',
  chamada_realizada: 'reuniao_realizada',
  nao_compareceu: 'tentando_contato',
  negociacao: 'reuniao_realizada',
  demo_agendada: 'reuniao_marcada',
  proposta_enviada: 'reuniao_realizada',
  aguardando_pagamento: 'contrato_fechado',
  fechou: 'venda_finalizada',
  ganho: 'venda_finalizada',
  agendou_reuniao: 'reuniao_marcada',
  reuniao_agendada: 'reuniao_marcada',
};

export const INTERNAL_CRM_STAGE_META: Record<InternalCrmCanonicalStageCode, InternalCrmStageMeta> = {
  novo_lead: {
    label: 'Novo Lead',
    shortLabel: 'Novo Lead',
    color: '#2196F3',
    icon: 'N',
    nextActionLabel: 'Ligar agora',
  },
  tentando_contato: {
    label: 'Tentando Contato',
    shortLabel: 'Tentando',
    color: '#F59E0B',
    icon: 'T',
    nextActionLabel: 'Registrar chamada',
  },
  mql: {
    label: 'MQL',
    shortLabel: 'MQL',
    color: '#0EA5E9',
    icon: 'M',
    nextActionLabel: 'Agendar reuniao',
  },
  reuniao_marcada: {
    label: 'Reuniao Marcada',
    shortLabel: 'Marcada',
    color: '#6366F1',
    icon: 'R',
    nextActionLabel: 'Abrir reuniao',
  },
  reuniao_realizada: {
    label: 'Reuniao Realizada',
    shortLabel: 'Realizada',
    color: '#14B8A6',
    icon: 'R',
    nextActionLabel: 'Registrar contrato',
  },
  contrato_fechado: {
    label: 'Contrato Fechado',
    shortLabel: 'Contrato',
    color: '#22C55E',
    icon: 'C',
    nextActionLabel: 'Confirmar pagamento',
  },
  venda_finalizada: {
    label: 'Venda Finalizada',
    shortLabel: 'Finalizada',
    color: '#15803D',
    icon: 'V',
    nextActionLabel: 'Ver cliente',
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
