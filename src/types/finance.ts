export type SaleInstallmentStatus = 'scheduled' | 'awaiting_confirmation' | 'paid' | 'canceled';

export type PaymentMethod =
  | 'pix'
  | 'boleto'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'financing'
  | 'cash'
  | 'check'
  | 'other';

export type FinanceWizardStep = 1 | 2 | 3 | 4;

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  'pix',
  'boleto',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'financing',
  'cash',
  'check',
  'other',
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  bank_transfer: 'Transferência bancária',
  financing: 'Financiamento',
  cash: 'Dinheiro',
  check: 'Cheque',
  other: 'Outro',
};

export const PAYMENT_METHOD_GROUPS: Array<{
  title: string;
  description: string;
  methods: PaymentMethod[];
}> = [
  {
    title: 'Pagamento direto',
    description: 'Liquida na hora ou por cobrança simples.',
    methods: ['pix', 'boleto', 'cash', 'check'],
  },
  {
    title: 'Cartão',
    description: 'Recebimento em crédito ou débito.',
    methods: ['credit_card', 'debit_card'],
  },
  {
    title: 'Bancário',
    description: 'Fluxos ligados ao banco do cliente.',
    methods: ['bank_transfer', 'financing'],
  },
  {
    title: 'Outros',
    description: 'Casos fora dos fluxos principais.',
    methods: ['other'],
  },
];

export interface SaleInstallmentInput {
  installment_no: number;
  due_on: string; // YYYY-MM-DD
  amount: number;
  payment_methods: PaymentMethod[];
  notes?: string;
}

export interface LeadSaleFinancePlanForm {
  sale_value: number;
  project_cost: number;
  notes?: string;
  installments: SaleInstallmentInput[];
}

export interface LeadSaleFinancePlanRecord {
  id: string;
  org_id: string;
  lead_id: number;
  sale_value: number;
  project_cost: number;
  margin_value: number;
  margin_pct: number;
  notes?: string | null;
  first_paid_at?: string | null;
  locked_after_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadSaleInstallmentRecord {
  id: string;
  org_id: string;
  plan_id: string;
  lead_id: number;
  installment_no: number;
  due_on: string;
  amount: number;
  payment_methods: PaymentMethod[];
  status: SaleInstallmentStatus;
  cycle_no: number;
  paid_amount?: number | null;
  paid_at?: string | null;
  profit_amount?: number | null;
  notes?: string | null;
}
