import { describe, expect, it } from 'vitest';

import {
  isChartFixedSeasonalProfileEnabled,
  isDegradationAllClientsEnabled,
  isFinancialShadowModeEnabled,
  isOmCostModelEnabled,
  isPdfRendererV2Enabled,
  isSolarResourceApiEnabled,
  isTusdTeSimplifiedEnabled,
  isUnifiedGenerationEnabled,
} from '@/config/featureFlags';

function withEnv(name: string, value: string | undefined, cb: () => void): void {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    cb();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

describe('featureFlags', () => {
  it('parses truthy values', () => {
    withEnv('VITE_USE_UNIFIED_GENERATION', 'true', () => {
      expect(isUnifiedGenerationEnabled()).toBe(true);
    });
    withEnv('VITE_USE_UNIFIED_GENERATION', '1', () => {
      expect(isUnifiedGenerationEnabled()).toBe(true);
    });
    withEnv('VITE_USE_UNIFIED_GENERATION', 'ON', () => {
      expect(isUnifiedGenerationEnabled()).toBe(true);
    });
  });

  it('defaults to false for missing and falsy values', () => {
    withEnv('VITE_USE_UNIFIED_GENERATION', 'false', () => {
      expect(isUnifiedGenerationEnabled()).toBe(false);
    });
    withEnv('VITE_USE_UNIFIED_GENERATION', '0', () => {
      expect(isUnifiedGenerationEnabled()).toBe(false);
    });
    withEnv('VITE_USE_UNIFIED_GENERATION', '', () => {
      expect(isUnifiedGenerationEnabled()).toBe(false);
    });
  });

  it('exposes all proposal flags', () => {
    withEnv('VITE_USE_SOLAR_RESOURCE_API', 'yes', () => {
      expect(isSolarResourceApiEnabled()).toBe(true);
    });
    withEnv('VITE_USE_OM_COST_MODEL', 'true', () => {
      expect(isOmCostModelEnabled()).toBe(true);
    });
    withEnv('VITE_USE_DEGRADATION_ALL_CLIENTS', 'true', () => {
      expect(isDegradationAllClientsEnabled()).toBe(true);
    });
    withEnv('VITE_USE_TUSD_TE_SIMPLIFIED', 'true', () => {
      expect(isTusdTeSimplifiedEnabled()).toBe(true);
    });
    withEnv('VITE_USE_PDF_RENDERER_V2', 'true', () => {
      expect(isPdfRendererV2Enabled()).toBe(true);
    });
    withEnv('VITE_USE_FINANCIAL_SHADOW_MODE', 'true', () => {
      expect(isFinancialShadowModeEnabled()).toBe(true);
    });
    withEnv('VITE_USE_CHART_FIXED_SEASONAL_PROFILE', 'true', () => {
      expect(isChartFixedSeasonalProfileEnabled()).toBe(true);
    });
  });
});
