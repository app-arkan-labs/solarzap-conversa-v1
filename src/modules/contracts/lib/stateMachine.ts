import type { ContractStatus } from './domain';

const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['review_ready', 'failed', 'cancelled'],
  review_ready: ['draft', 'preview_generated', 'failed', 'cancelled'],
  preview_generated: ['review_ready', 'pdf_generated', 'failed', 'cancelled'],
  pdf_generated: [
    'review_ready',
    'preview_generated',
    'sent_for_signature',
    'failed',
    'cancelled',
  ],
  sent_for_signature: ['signed', 'cancelled', 'expired', 'failed'],
  signed: [],
  cancelled: [],
  expired: [],
  failed: ['draft', 'review_ready'],
};

export const canTransitionContractStatus = (
  currentStatus: ContractStatus,
  nextStatus: ContractStatus,
) => ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus);

export const assertContractStatusTransition = (
  currentStatus: ContractStatus,
  nextStatus: ContractStatus,
) => {
  if (!canTransitionContractStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Transicao invalida do contrato: ${currentStatus} -> ${nextStatus}`,
    );
  }
};

export const getContractStatusLabel = (status: ContractStatus) => {
  switch (status) {
    case 'draft':
      return 'Rascunho';
    case 'review_ready':
      return 'Revisao pronta';
    case 'preview_generated':
      return 'Preview gerado';
    case 'pdf_generated':
      return 'PDF gerado';
    case 'sent_for_signature':
      return 'Enviado para assinatura';
    case 'signed':
      return 'Assinado';
    case 'cancelled':
      return 'Cancelado';
    case 'expired':
      return 'Expirado';
    case 'failed':
      return 'Falhou';
    default:
      return status;
  }
};

export const CONTRACT_STATUS_STEPS: ContractStatus[] = [
  'draft',
  'review_ready',
  'preview_generated',
  'pdf_generated',
  'sent_for_signature',
  'signed',
];
