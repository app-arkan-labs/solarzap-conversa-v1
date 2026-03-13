import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { calcMonthlyGeneration } from '@/utils/proposalCharts';

describe('calcMonthlyGeneration', () => {
  const prevSRA = process.env.VITE_USE_SOLAR_RESOURCE_API;
  beforeEach(() => { process.env.VITE_USE_SOLAR_RESOURCE_API = 'false'; });
  afterEach(() => { if (prevSRA === undefined) delete process.env.VITE_USE_SOLAR_RESOURCE_API; else process.env.VITE_USE_SOLAR_RESOURCE_API = prevSRA; });

  it('usa potencia como base quando potencia instalada e informada', () => {
    const monthly = calcMonthlyGeneration(3.3, 350);
    const annual = monthly.reduce((acc, value) => acc + value, 0);

    expect(monthly).toHaveLength(12);
    expect(monthly).toEqual([425, 414, 389, 342, 281, 252, 266, 317, 346, 385, 418, 443]);
    expect(annual).toBe(4278);
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
    expect(new Set(monthly)).toEqual(new Set([356]));
    expect(annual).toBe(4272);
  });

  it('usa fallback sazonal regional por UF quando fatores externos nao estao disponiveis', () => {
    const monthlySouth = calcMonthlyGeneration(3.3, 350, { uf: 'RS' });
    const monthlyNorth = calcMonthlyGeneration(3.3, 350, { uf: 'PA' });

    expect(monthlySouth).toHaveLength(12);
    expect(monthlyNorth).toHaveLength(12);
    const annualSouth = monthlySouth.reduce((acc, value) => acc + value, 0);
    const annualNorth = monthlyNorth.reduce((acc, value) => acc + value, 0);
    expect(annualSouth).toBeGreaterThanOrEqual(4270);
    expect(annualSouth).toBeLessThanOrEqual(4285);
    expect(annualNorth).toBeGreaterThanOrEqual(4270);
    expect(annualNorth).toBeLessThanOrEqual(4285);
    expect(monthlySouth).not.toEqual(monthlyNorth);
  });
});
