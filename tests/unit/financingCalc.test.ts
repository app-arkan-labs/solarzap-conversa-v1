import { describe, expect, it } from 'vitest';

import { calcPMT } from '@/utils/financingCalc';

describe('calcPMT', () => {
  it('retorna PV/n quando taxa é zero', () => {
    expect(calcPMT(0, 60, 12000)).toBe(200);
  });

  it('calcula PMT com juros compostos na ordem de grandeza esperada', () => {
    const installment = calcPMT(1.5, 60, 14850);
    expect(installment).toBeCloseTo(377.092397, 6);
    expect(installment).toBeGreaterThan(300);
    expect(installment).toBeLessThan(500);
  });
});
