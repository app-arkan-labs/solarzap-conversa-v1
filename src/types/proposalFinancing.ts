export type PaymentConditionOptionId =
  | 'pix_avista'
  | 'boleto_avista'
  | 'ted_avista'
  | 'cartao_credito'
  | 'entrada_saldo'
  | 'financiamento_bancario';

export type GracePeriodUnit = 'dias' | 'meses';

export interface FinancingCondition {
  id: string;
  institutionName: string;
  interestRateMonthly: number;
  installments: number[];
  gracePeriodValue: number;
  gracePeriodUnit: GracePeriodUnit;
}

export interface PaymentConditionOption {
  id: PaymentConditionOptionId;
  label: string;
}

export const PAYMENT_CONDITION_OPTIONS: PaymentConditionOption[] = [
  { id: 'pix_avista', label: 'PIX à vista' },
  { id: 'boleto_avista', label: 'Boleto à vista' },
  { id: 'ted_avista', label: 'TED/Transferência à vista' },
  { id: 'cartao_credito', label: 'Cartão de crédito' },
  { id: 'entrada_saldo', label: 'Entrada + saldo' },
  { id: 'financiamento_bancario', label: 'Financiamento bancário' },
];

export const PAYMENT_CONDITION_LABEL_BY_ID: Record<PaymentConditionOptionId, string> = {
  pix_avista: 'PIX à vista',
  boleto_avista: 'Boleto à vista',
  ted_avista: 'TED/Transferência à vista',
  cartao_credito: 'Cartão de crédito',
  entrada_saldo: 'Entrada + saldo',
  financiamento_bancario: 'Financiamento bancário',
};

export const COMMON_FINANCING_INSTITUTIONS = [
  'BTG Pactual',
  'Santander',
  'BV Financeira',
  'Itaú',
  'Bradesco',
  'Caixa',
  'Banco do Brasil',
  'Sicoob',
  'Sicredi',
] as const;

export const INSTALLMENT_OPTIONS = [
  1, 2, 3, 6, 9, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 120,
] as const;
