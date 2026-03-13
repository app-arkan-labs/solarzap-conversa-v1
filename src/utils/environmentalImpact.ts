export interface EnvironmentalImpactValues {
  co2Tons: number;
  trees: number;
  carKm: number;
}

// Calibrated to align with Luvik baseline currently used in commercial comparisons.
const CO2_TON_PER_MWH = 0.3184444444;
const TREE_ABSORPTION_KG_PER_YEAR = 5.62;
const GASOLINE_CO2_KG_PER_LITER = 2.3;
const AVERAGE_CAR_KM_PER_LITER = 12;

export function calcEnvironmentalImpactFromAnnualKwh(
  annualKwh: number,
  years = 25,
): EnvironmentalImpactValues {
  const safeAnnualKwh = Math.max(0, Number(annualKwh) || 0);
  const safeYears = Math.max(1, Math.round(Number(years) || 25));
  const totalKwh = safeAnnualKwh * safeYears;
  const co2TonsRaw = (totalKwh / 1000) * CO2_TON_PER_MWH;
  const co2Tons = Math.round(co2TonsRaw * 100) / 100;
  const trees = Math.round((co2TonsRaw * 1000) / (TREE_ABSORPTION_KG_PER_YEAR * safeYears));
  const carKm = Math.round((co2TonsRaw * 1000) / GASOLINE_CO2_KG_PER_LITER * AVERAGE_CAR_KM_PER_LITER);
  return { co2Tons, trees, carKm };
}
