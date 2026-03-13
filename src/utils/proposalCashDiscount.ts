import type { PaymentConditionOptionId } from '@/types/proposalFinancing';

export const CASH_PAYMENT_CONDITIONS: PaymentConditionOptionId[] = [
  'pix_avista',
  'boleto_avista',
  'ted_avista',
];

export const clampProposalCashDiscount = (value: unknown, totalValue: unknown): number => {
  const total = Math.max(0, Number(totalValue) || 0);
  const discount = Math.max(0, Number(value) || 0);
  return Math.min(total, discount);
};

export const hasCashPaymentCondition = (paymentConditions: PaymentConditionOptionId[] | undefined): boolean => {
  if (!Array.isArray(paymentConditions)) return false;
  return paymentConditions.some((id) => CASH_PAYMENT_CONDITIONS.includes(id));
};

export const resolveCashDiscountSnapshot = (params: {
  valorTotal: unknown;
  descontoAvistaValor: unknown;
  paymentConditions?: PaymentConditionOptionId[];
}) => {
  const valorTotal = Math.max(0, Number(params.valorTotal) || 0);
  const descontoAvistaValor = clampProposalCashDiscount(params.descontoAvistaValor, valorTotal);
  const valorAvistaLiquido = Math.max(0, valorTotal - descontoAvistaValor);
  const investimentoBaseMetricas = hasCashPaymentCondition(params.paymentConditions)
    ? valorAvistaLiquido
    : valorTotal;

  return {
    valorTotal,
    descontoAvistaValor,
    valorAvistaLiquido,
    investimentoBaseMetricas,
  };
};

