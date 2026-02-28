import { describe, expect, it } from 'vitest';

import { calcMonthlyGeneration } from '@/utils/proposalCharts';

describe('calcMonthlyGeneration', () => {
  it('usa consumo mensal como base e mantem anual proximo do esperado', () => {
    const monthly = calcMonthlyGeneration(3.3, 350);
    const annual = monthly.reduce((acc, value) => acc + value, 0);

    expect(monthly).toHaveLength(12);
    expect(monthly).toEqual([417, 407, 382, 336, 276, 247, 262, 311, 339, 378, 410, 435]);
    expect(annual).toBe(4200);
  });

  it('faz fallback pela potencia instalada quando consumo nao e informado', () => {
    const monthly = calcMonthlyGeneration(3.3);
    const annual = monthly.reduce((acc, value) => acc + value, 0);

    expect(monthly).toHaveLength(12);
    expect(annual).toBe(4278);
    expect(Math.max(...monthly)).toBeGreaterThan(Math.min(...monthly));
    expect(annual).toBeGreaterThan(3500);
    expect(annual).toBeLessThan(5000);
  });

  it('usa fatores mensais customizados quando informados', () => {
    const monthly = calcMonthlyGeneration(3.3, 350, {
      monthlyGenerationFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    });
    const annual = monthly.reduce((acc, value) => acc + value, 0);

    expect(monthly).toHaveLength(12);
    expect(new Set(monthly)).toEqual(new Set([350]));
    expect(annual).toBe(4200);
  });

  it('usa fallback sazonal regional por UF quando fatores externos nao estao disponiveis', () => {
    const monthlySouth = calcMonthlyGeneration(3.3, 350, { uf: 'RS' });
    const monthlyNorth = calcMonthlyGeneration(3.3, 350, { uf: 'PA' });

    expect(monthlySouth).toHaveLength(12);
    expect(monthlyNorth).toHaveLength(12);
    const annualSouth = monthlySouth.reduce((acc, value) => acc + value, 0);
    const annualNorth = monthlyNorth.reduce((acc, value) => acc + value, 0);
    expect(annualSouth).toBeGreaterThanOrEqual(4195);
    expect(annualSouth).toBeLessThanOrEqual(4205);
    expect(annualNorth).toBeGreaterThanOrEqual(4195);
    expect(annualNorth).toBeLessThanOrEqual(4205);
    expect(monthlySouth).not.toEqual(monthlyNorth);
  });
});
