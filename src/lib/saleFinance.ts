import {
  LeadSaleFinancePlanForm,
  PAYMENT_METHOD_ORDER,
  PaymentMethod,
  SaleInstallmentInput,
} from '@/types/finance';

export const MONEY_EPSILON = 0.01;

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculateMarginValue(saleValue: number, projectCost: number): number {
  return roundMoney((Number(saleValue) || 0) - (Number(projectCost) || 0));
}

export function calculateMarginPct(saleValue: number, projectCost: number): number {
  const sale = Number(saleValue) || 0;
  if (sale <= 0) return 0;
  return roundMoney((calculateMarginValue(saleValue, projectCost) / sale) * 100);
}

export function sumInstallments(installments: Array<Pick<SaleInstallmentInput, 'amount'>>): number {
  return roundMoney(installments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
}

export function validateInstallmentsExactTotal(
  saleValue: number,
  installments: Array<Pick<SaleInstallmentInput, 'amount'>>,
): boolean {
  const total = sumInstallments(installments);
  return Math.abs(total - roundMoney(saleValue)) <= MONEY_EPSILON;
}

export function calculateRecognizedProfitForInstallment(
  saleValue: number,
  projectCost: number,
  paidAmount: number,
): number {
  const sale = Number(saleValue) || 0;
  if (sale <= 0) return 0;
  const marginValue = calculateMarginValue(saleValue, projectCost);
  return roundMoney((Number(paidAmount) || 0) / sale * marginValue);
}

export function canRewriteFinancePlan(hasPaidInstallment: boolean): boolean {
  return hasPaidInstallment !== true;
}

function uniqOrderedPaymentMethods(methods: PaymentMethod[]): PaymentMethod[] {
  const uniqueMethods = methods.filter((method, index) => methods.indexOf(method) === index);
  return PAYMENT_METHOD_ORDER.filter((method) => uniqueMethods.includes(method));
}

export function getRegularInstallmentMethods(selectedMethods: PaymentMethod[]): PaymentMethod[] {
  const orderedSelection = uniqOrderedPaymentMethods(selectedMethods);

  if (orderedSelection.includes('financing')) {
    return ['financing'];
  }

  return orderedSelection;
}

export function getEntryInstallmentMethods(selectedMethods: PaymentMethod[]): PaymentMethod[] {
  const orderedSelection = uniqOrderedPaymentMethods(selectedMethods);

  if (!orderedSelection.includes('financing')) {
    return [];
  }

  return orderedSelection.filter((method) => method !== 'financing');
}

export function normalizeInstallments(installments: SaleInstallmentInput[]): SaleInstallmentInput[] {
  return installments
    .map((item, index) => ({
      installment_no: Math.max(1, Number(item.installment_no) || index + 1),
      due_on: String(item.due_on || '').slice(0, 10),
      amount: roundMoney(Number(item.amount) || 0),
      payment_methods: Array.isArray(item.payment_methods) ? item.payment_methods : [],
      notes: item.notes?.trim() || undefined,
    }))
    .sort((a, b) => a.installment_no - b.installment_no)
    .map((item, index) => ({ ...item, installment_no: index + 1 }));
}

export function isFinancePlanFormValid(form: LeadSaleFinancePlanForm): boolean {
  if ((Number(form.sale_value) || 0) <= 0) return false;
  if ((Number(form.project_cost) || 0) < 0) return false;
  if (!Array.isArray(form.installments) || form.installments.length === 0) return false;
  if (!validateInstallmentsExactTotal(form.sale_value, form.installments)) return false;
  return form.installments.every((item) => {
    const hasMethod = Array.isArray(item.payment_methods) && item.payment_methods.length > 0;
    return item.amount > 0 && !!item.due_on && hasMethod;
  });
}
