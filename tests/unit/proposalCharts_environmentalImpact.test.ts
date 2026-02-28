import { describe, expect, it } from 'vitest';

import { calcEnvironmentalImpact } from '@/utils/proposalCharts';

describe('calcEnvironmentalImpact', () => {
  it('calcula impacto ambiental com unidades e magnitude coerentes', () => {
    const result = calcEnvironmentalImpact(4200, 25);

    expect(result.co2Tons).toBe(8.6);
    expect(result.trees).toBe(16);
    expect(result.carKm).toBe(44757);
    expect(result.carKm).toBeGreaterThan(40000);
  });
});
