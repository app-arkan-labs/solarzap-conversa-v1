import { describe, expect, it } from 'vitest';

import { buildMonthlyChartSeriesFromAnnual } from '@/utils/proposalCharts';

describe('buildMonthlyChartSeriesFromAnnual', () => {
  it('gera 12 meses inteiros, nao negativos e soma exata do anual', () => {
    const monthly = buildMonthlyChartSeriesFromAnnual(6753);

    expect(monthly).toHaveLength(12);
    monthly.forEach((value) => {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
    expect(monthly.reduce((acc, value) => acc + value, 0)).toBe(6753);
  });

  it('respeita sazonalidade do perfil Brasil legado', () => {
    const monthly = buildMonthlyChartSeriesFromAnnual(4200);

    expect(monthly[0]).toBeGreaterThan(monthly[5]); // Jan > Jun
    expect(monthly[1]).toBeGreaterThan(monthly[6]); // Fev > Jul
    expect(monthly[11]).toBeGreaterThan(monthly[7]); // Dez > Ago
  });

  it('distribui de forma uniforme com fatores customizados uniformes', () => {
    const monthly = buildMonthlyChartSeriesFromAnnual(1200, new Array(12).fill(1));

    expect(monthly).toEqual(new Array(12).fill(100));
    expect(monthly.reduce((acc, value) => acc + value, 0)).toBe(1200);
  });
});
