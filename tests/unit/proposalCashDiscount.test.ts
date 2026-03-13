import { clampProposalCashDiscount, hasCashPaymentCondition, resolveCashDiscountSnapshot } from '@/utils/proposalCashDiscount';

describe('proposalCashDiscount', () => {
  it('clamps discount between 0 and total value', () => {
    expect(clampProposalCashDiscount(-100, 5000)).toBe(0);
    expect(clampProposalCashDiscount(6000, 5000)).toBe(5000);
    expect(clampProposalCashDiscount(750, 5000)).toBe(750);
  });

  it('detects cash payment conditions', () => {
    expect(hasCashPaymentCondition(['pix_avista'])).toBe(true);
    expect(hasCashPaymentCondition(['financiamento_bancario'])).toBe(false);
    expect(hasCashPaymentCondition(['financiamento_bancario', 'boleto_avista'])).toBe(true);
  });

  it('uses net cash investment as metrics base when cash is selected', () => {
    const mixed = resolveCashDiscountSnapshot({
      valorTotal: 10000,
      descontoAvistaValor: 1500,
      paymentConditions: ['pix_avista', 'financiamento_bancario'],
    });

    expect(mixed.descontoAvistaValor).toBe(1500);
    expect(mixed.valorAvistaLiquido).toBe(8500);
    expect(mixed.investimentoBaseMetricas).toBe(8500);

    const financingOnly = resolveCashDiscountSnapshot({
      valorTotal: 10000,
      descontoAvistaValor: 1500,
      paymentConditions: ['financiamento_bancario'],
    });

    expect(financingOnly.valorAvistaLiquido).toBe(8500);
    expect(financingOnly.investimentoBaseMetricas).toBe(10000);
  });
});
