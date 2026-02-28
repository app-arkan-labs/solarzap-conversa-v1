// Regional monthly generation factors for Brazil.
// Factors are normalized to monthly average = 1.0.

export type BrazilSeasonalRegion = 'norte' | 'nordeste' | 'centro_oeste' | 'sudeste' | 'sul';

const BRAZIL_LEGACY_PROFILE_RAW = [
  1.18, 1.15, 1.08, 0.95, 0.78, 0.70,
  0.74, 0.88, 0.96, 1.07, 1.16, 1.23,
];

const REGION_PROFILE_RAW: Record<BrazilSeasonalRegion, number[]> = {
  norte: [
    1.05, 1.04, 1.02, 0.99, 0.97, 0.95,
    0.94, 0.95, 0.98, 1.02, 1.04, 1.05,
  ],
  nordeste: [
    1.16, 1.14, 1.08, 0.98, 0.84, 0.75,
    0.79, 0.90, 0.98, 1.07, 1.15, 1.16,
  ],
  centro_oeste: [
    1.17, 1.14, 1.06, 0.94, 0.81, 0.72,
    0.76, 0.89, 0.98, 1.08, 1.14, 1.17,
  ],
  sudeste: [
    1.15, 1.12, 1.05, 0.93, 0.80, 0.72,
    0.76, 0.88, 0.97, 1.07, 1.13, 1.16,
  ],
  sul: [
    1.20, 1.15, 1.02, 0.86, 0.72, 0.66,
    0.70, 0.84, 0.98, 1.10, 1.18, 1.22,
  ],
};

const UF_TO_REGION: Record<string, BrazilSeasonalRegion> = {
  AC: 'norte',
  AL: 'nordeste',
  AP: 'norte',
  AM: 'norte',
  BA: 'nordeste',
  CE: 'nordeste',
  DF: 'centro_oeste',
  ES: 'sudeste',
  GO: 'centro_oeste',
  MA: 'nordeste',
  MT: 'centro_oeste',
  MS: 'centro_oeste',
  MG: 'sudeste',
  PA: 'norte',
  PB: 'nordeste',
  PR: 'sul',
  PE: 'nordeste',
  PI: 'nordeste',
  RJ: 'sudeste',
  RN: 'nordeste',
  RS: 'sul',
  RO: 'norte',
  RR: 'norte',
  SC: 'sul',
  SP: 'sudeste',
  SE: 'nordeste',
  TO: 'norte',
};

const normalize = (factors: number[]): number[] => {
  if (!Array.isArray(factors) || factors.length !== 12) return BRAZIL_MONTHLY_IRRADIATION_FACTOR;
  const safe = factors.map((value) => Math.max(0, Number(value) || 0));
  if (safe.some((value) => value <= 0)) return BRAZIL_MONTHLY_IRRADIATION_FACTOR;
  const average = safe.reduce((acc, value) => acc + value, 0) / safe.length;
  if (!Number.isFinite(average) || average <= 0) return BRAZIL_MONTHLY_IRRADIATION_FACTOR;
  return safe.map((value) => value / average);
};

export const BRAZIL_MONTHLY_IRRADIATION_FACTOR = normalize(BRAZIL_LEGACY_PROFILE_RAW);

export const REGIONAL_MONTHLY_IRRADIATION_FACTORS: Record<BrazilSeasonalRegion, number[]> = {
  norte: normalize(REGION_PROFILE_RAW.norte),
  nordeste: normalize(REGION_PROFILE_RAW.nordeste),
  centro_oeste: normalize(REGION_PROFILE_RAW.centro_oeste),
  sudeste: normalize(REGION_PROFILE_RAW.sudeste),
  sul: normalize(REGION_PROFILE_RAW.sul),
};

export function getRegionalMonthlyGenerationFactorsByUf(ufRaw?: string | null): number[] | null {
  const uf = String(ufRaw || '').trim().toUpperCase();
  const region = UF_TO_REGION[uf];
  if (!region) return null;
  return [...REGIONAL_MONTHLY_IRRADIATION_FACTORS[region]];
}
