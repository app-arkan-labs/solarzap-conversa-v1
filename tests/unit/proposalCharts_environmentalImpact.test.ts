import { describe, expect, it } from 'vitest';

import { calcEnvironmentalImpact } from '@/utils/proposalCharts';

describe('calcEnvironmentalImpact', () => {
  it('calcula impacto ambiental com unidades e magnitude coerentes', () => {
    const result = calcEnvironmentalImpact(4200, 25);

    expect(result.co2Tons).toBe(33.44);
    expect(result.trees).toBe(238);
    expect(result.carKm).toBe(174452);
    expect(result.carKm).toBeGreaterThan(150000);
  });

  it('alinha com baseline de 300 kWh/mes usado na comparacao com Luvik', () => {
    const result = calcEnvironmentalImpact(300 * 12, 25);

    expect(result.co2Tons).toBe(28.66);
    expect(result.trees).toBe(204);
  });
});
