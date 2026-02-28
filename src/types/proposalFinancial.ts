export type TariffSource = 'lead' | 'manual' | 'inferred' | 'fallback';

export interface FinancialInputs {
  tipoCliente?: string;
  investimentoTotal: number;
  consumoMensalKwh: number;
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
}

export const FINANCIAL_MODEL_VERSION = 'v2_cashflow_non_usina_coerente' as const;
