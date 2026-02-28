import { describe, expect, it } from 'vitest';

import { calcMonthlyGeneration } from '@/utils/proposalCharts';

describe('calcMonthlyGeneration', () => {
  it('usa consumo mensal como base e mantém anual próximo do esperado', () => {
    const monthly = calcMonthlyGeneration(3.3, 350);
    const annual = monthly.reduce((acc, value) => acc + value, 0);

    expect(monthly).toHaveLength(12);
    expect(monthly).toEqual([417, 407, 382, 336, 276, 247, 262, 311, 339, 378, 410, 435]);
    expect(annual).toBe(4200);
  });

  it('faz fallback pela potência instalada quando consumo não é informado', () => {
    const monthly = calcMonthlyGeneration(3.3);
    const annual = monthly.reduce((acc, value) => acc + value, 0);

    expect(monthly).toHaveLength(12);
    expect(annual).toBe(4278);
    expect(Math.max(...monthly)).toBeGreaterThan(Math.min(...monthly));
    expect(annual).toBeGreaterThan(3500);
    expect(annual).toBeLessThan(5000);
  });
});
