export type TariffSource = 'lead' | 'manual' | 'inferred' | 'fallback';

export interface FinancialInputs {
  tipoCliente?: string;
  investimentoTotal: number;
  consumoMensalKwh: number;
  contaLuzMensalReferencia?: number;
  potenciaSistemaKwp: number;
  rentabilityRatePerKwh?: number;
  tarifaKwh: number;
  rentabilitySource?: TariffSource;
  tariffSource?: TariffSource; // legacy alias
  custoDisponibilidadeKwh?: number;
  abaterCustoDisponibilidadeNoDimensionamento?: boolean;
  annualEnergyIncreasePct?: number;
  moduleDegradationPct?: number;
  analysisYears?: number;
  monthlyGenerationFactors?: number[];
  uf?: string;
  avgDailyIrradiance?: number;
  performanceRatio?: number;
  daysInMonth?: number;
  annualOmCostPct?: number;
  annualOmCostFixed?: number;
  teRatePerKwh?: number;
  tusdRatePerKwh?: number;
  tusdCompensationPct?: number;
  irradianceSource?: 'uf_fallback' | 'pvgis' | 'pvgis_cache_degraded' | 'open_meteo' | 'cache';
  latitude?: number;
  longitude?: number;
}

export interface FinancialOutputs {
  annualGenerationKwhYear1: number;
  monthlyGenerationAvgKwhYear1: number;
  annualRevenueYear1: number;
  monthlyRevenueYear1: number;
  annualRevenueSeries: number[];
  cumulativeRevenueSeries: number[];
  paybackMonths: number;
  paybackYearsDecimal: number;
  paybackLabelYearsMonths: string;
  roi25Pct: number;
  retornoPorReal: number;
  retornoPorKwpAno: number;
  retornoPorKwh: number;
  billBeforeMonthly?: number;
  billAfterMonthly?: number;
  savingsMonthly?: number;
  savingsAnnual?: number;
  savingsPct?: number;
  rentabilityRatePerKwhUsed?: number;
  availabilityKwhUsed?: number;
  annualOmCostYear1?: number;
  netAnnualRevenueYear1?: number;
  teSavingsMonthly?: number;
  tusdSavingsMonthly?: number;
  assumptionsSnapshot?: Record<string, unknown>;
}

export const FINANCIAL_MODEL_VERSION = 'v3_geo_om_tusdte_flagged' as const;
