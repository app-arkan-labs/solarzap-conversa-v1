import {
  calculateMarginPct,
  calculateMarginValue,
  calculateRecognizedProfitForInstallment,
  canRewriteFinancePlan,
  getEntryInstallmentMethods,
  getRegularInstallmentMethods,
  isFinancePlanFormValid,
  normalizeInstallments,
  validateInstallmentsExactTotal,
} from '@/lib/saleFinance';

describe('saleFinance helpers', () => {
  it('validates exact installment sum against sale value', () => {
    expect(validateInstallmentsExactTotal(1000, [{ amount: 600 }, { amount: 400 }])).toBe(true);
    expect(validateInstallmentsExactTotal(1000, [{ amount: 600 }, { amount: 399.98 }])).toBe(false);
  });

  it('calculates margin value and pct automatically', () => {
    expect(calculateMarginValue(10000, 7000)).toBe(3000);
    expect(calculateMarginPct(10000, 7000)).toBe(30);
    expect(calculateMarginPct(0, 1000)).toBe(0);
  });

  it('recognizes proportional profit per paid installment', () => {
    // Sale 10k / cost 7k => 3k margin. Paying 25% recognizes 750 profit.
    expect(calculateRecognizedProfitForInstallment(10000, 7000, 2500)).toBe(750);
  });

  it('locks plan rewrite after first paid installment', () => {
    expect(canRewriteFinancePlan(false)).toBe(true);
    expect(canRewriteFinancePlan(true)).toBe(false);
  });

  it('returns only the selected regular methods in visual order', () => {
    expect(getRegularInstallmentMethods(['pix', 'credit_card'])).toEqual(['pix', 'credit_card']);
    expect(getRegularInstallmentMethods(['credit_card', 'pix'])).toEqual(['pix', 'credit_card']);
  });

  it('restricts financing schedules to financing in regular installments', () => {
    expect(getRegularInstallmentMethods(['financing', 'pix'])).toEqual(['financing']);
    expect(getRegularInstallmentMethods(['pix', 'financing', 'credit_card'])).toEqual(['financing']);
  });

  it('returns only non-financing entry methods when financing exists', () => {
    expect(getEntryInstallmentMethods(['financing', 'pix'])).toEqual(['pix']);
    expect(getEntryInstallmentMethods(['credit_card', 'financing', 'pix'])).toEqual(['pix', 'credit_card']);
    expect(getEntryInstallmentMethods(['financing'])).toEqual([]);
    expect(getEntryInstallmentMethods(['pix', 'credit_card'])).toEqual([]);
  });

  it('normalizes installments order and numbering', () => {
    const normalized = normalizeInstallments([
      {
        installment_no: 4,
        due_on: '2026-07-10T00:00:00.000Z',
        amount: 2500,
        payment_methods: ['pix'],
      },
      {
        installment_no: 2,
        due_on: '2026-05-10T00:00:00.000Z',
        amount: 7500,
        payment_methods: ['credit_card', 'pix'],
      },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({ installment_no: 1, due_on: '2026-05-10', amount: 7500 }),
      expect.objectContaining({ installment_no: 2, due_on: '2026-07-10', amount: 2500 }),
    ]);
  });

  it('requires all mandatory fields in finance plan form', () => {
    const valid = isFinancePlanFormValid({
      sale_value: 1000,
      project_cost: 500,
      notes: '',
      installments: [
        {
          installment_no: 1,
          due_on: '2026-03-20',
          amount: 1000,
          payment_methods: ['pix'],
        },
      ],
    });

    const invalidMissingMethod = isFinancePlanFormValid({
      sale_value: 1000,
      project_cost: 500,
      notes: '',
      installments: [
        {
          installment_no: 1,
          due_on: '2026-03-20',
          amount: 1000,
          payment_methods: [],
        },
      ],
    });

    expect(valid).toBe(true);
    expect(invalidMissingMethod).toBe(false);
  });
});
