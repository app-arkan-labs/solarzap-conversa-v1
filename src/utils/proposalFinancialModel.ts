import type { FinancialInputs, FinancialOutputs, TariffSource } from '@/types/proposalFinancial';
import {
  DEFAULT_ANALYSIS_YEARS,
  DEFAULT_ANNUAL_INCREASE_PCT,
  DEFAULT_MODULE_DEGRADATION_PCT,
  DEFAULT_TARIFF_KWH,
} from '@/constants/financialDefaults';
import {
  isDegradationAllClientsEnabled,
  isOmCostModelEnabled,
  isUnifiedGenerationEnabled,
} from '@/config/featureFlags';
import { calcMonthlyGeneration } from '@/utils/proposalCharts';

const toFinite = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clampNonNegative = (value: number) => Math.max(0, value);

const isUsinaClient = (tipoCliente?: string) => String(tipoCliente || '').toLowerCase() === 'usina';

const formatYearsAndMonths = (monthsRaw: number) => {
  const totalMonths = Math.max(0, Math.round(toFinite(monthsRaw, 0)));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${years} anos e ${months} meses`;
};

export function resolveTariffByPriority(params: {
  manualTariffKwh?: number | null;
  leadTariffKwh?: number | null;
  inferredTariffKwh?: number | null;
  fallbackTariffKwh?: number;
}): { tariffKwh: number; source: TariffSource } {
  const manualTariff = toFinite(params.manualTariffKwh, 0);
  if (manualTariff > 0) return { tariffKwh: manualTariff, source: 'manual' };

  const leadTariff = toFinite(params.leadTariffKwh, 0);
  if (leadTariff > 0) return { tariffKwh: leadTariff, source: 'lead' };

  const inferredTariff = toFinite(params.inferredTariffKwh, 0);
  if (inferredTariff > 0) return { tariffKwh: inferredTariff, source: 'inferred' };

  return {
    tariffKwh: clampNonNegative(toFinite(params.fallbackTariffKwh, DEFAULT_TARIFF_KWH)),
    source: 'fallback',
  };
}

function buildNonUsinaBillSnapshot(
  consumoMensalKwh: number,
  custoDisponibilidadeKwh: number,
  rentabilityRatePerKwh: number,
) {
  const availabilityKwhUsed = clampNonNegative(Math.min(consumoMensalKwh, custoDisponibilidadeKwh));
  const billBeforeMonthly = clampNonNegative(consumoMensalKwh * rentabilityRatePerKwh);
  const billAfterMonthly = clampNonNegative(availabilityKwhUsed * rentabilityRatePerKwh);
  const savingsMonthly = clampNonNegative(billBeforeMonthly - billAfterMonthly);
  const savingsAnnual = savingsMonthly * 12;
  const savingsPct = billBeforeMonthly > 0 ? (savingsMonthly / billBeforeMonthly) * 100 : 0;

  return {
    billBeforeMonthly,
    billAfterMonthly,
    savingsMonthly,
    savingsAnnual,
    savingsPct,
    availabilityKwhUsed,
  };
}

export function calculateProposalFinancials(input: FinancialInputs): FinancialOutputs {
  const omCostModelEnabled = isOmCostModelEnabled();
  const degradationAllClientsEnabled = isDegradationAllClientsEnabled();
  const tipoCliente = String(input.tipoCliente || '').toLowerCase();
  const isUsina = isUsinaClient(tipoCliente);
  const investimentoTotal = clampNonNegative(toFinite(input.investimentoTotal));
  const consumoMensalKwh = clampNonNegative(toFinite(input.consumoMensalKwh));
  const potenciaSistemaKwp = clampNonNegative(toFinite(input.potenciaSistemaKwp));
  const rentabilityRatePerKwh = clampNonNegative(
    toFinite(input.rentabilityRatePerKwh, toFinite(input.tarifaKwh, DEFAULT_TARIFF_KWH)),
  );
  const custoDisponibilidadeKwh = clampNonNegative(toFinite(input.custoDisponibilidadeKwh, 0));
  const years = Math.max(1, Math.round(toFinite(input.analysisYears, DEFAULT_ANALYSIS_YEARS)));
  const annualEnergyIncreasePct = clampNonNegative(toFinite(input.annualEnergyIncreasePct, DEFAULT_ANNUAL_INCREASE_PCT));
  const moduleDegradationPct = clampNonNegative(toFinite(input.moduleDegradationPct, DEFAULT_MODULE_DEGRADATION_PCT));
  const annualOmCostPct = clampNonNegative(toFinite(input.annualOmCostPct, omCostModelEnabled ? 1 : 0));
  const annualOmCostFixed = clampNonNegative(toFinite(input.annualOmCostFixed, 0));
  const annualEnergyIncrease = annualEnergyIncreasePct / 100;
  const moduleDegradation = Math.min(0.95, moduleDegradationPct / 100);
  const unifiedGenerationEnabled = isUnifiedGenerationEnabled();
  const nonUsinaSnapshot = isUsina
    ? null
    : buildNonUsinaBillSnapshot(consumoMensalKwh, custoDisponibilidadeKwh, rentabilityRatePerKwh);

  const unifiedMonthlyGeneration = unifiedGenerationEnabled
    ? calcMonthlyGeneration(potenciaSistemaKwp, consumoMensalKwh, {
      monthlyGenerationFactors: input.monthlyGenerationFactors,
    })
    : null;
  const legacyAnnualGenerationKwhYear1 = clampNonNegative(consumoMensalKwh * 12);
  const annualGenerationKwhYear1 = unifiedMonthlyGeneration
    ? clampNonNegative(unifiedMonthlyGeneration.reduce((acc, value) => acc + Math.max(0, Number(value) || 0), 0))
    : legacyAnnualGenerationKwhYear1;
  const monthlyGenerationAvgKwhYear1 = annualGenerationKwhYear1 / 12;

  const annualRevenueYear1Gross = isUsina
    ? legacyAnnualGenerationKwhYear1 * rentabilityRatePerKwh
    : (nonUsinaSnapshot?.savingsAnnual || 0);
  const annualOmCostYear1 = omCostModelEnabled
    ? ((investimentoTotal * annualOmCostPct) / 100) + annualOmCostFixed
    : 0;

  const annualRevenueSeries: number[] = [];
  const cumulativeRevenueSeries: number[] = [];
  let cumulative = 0;

  for (let year = 1; year <= years; year += 1) {
    const yearIndex = year - 1;
    const growthFactor = isUsina ? Math.pow(1 + annualEnergyIncrease, yearIndex) : 1;
    const degradationFactor = (isUsina || degradationAllClientsEnabled)
      ? Math.pow(1 - moduleDegradation, yearIndex)
      : 1;
    const annualRevenueGross = clampNonNegative(annualRevenueYear1Gross * growthFactor * degradationFactor);
    const annualRevenue = clampNonNegative(annualRevenueGross - annualOmCostYear1);
    annualRevenueSeries.push(annualRevenue);
    cumulative += annualRevenue;
    cumulativeRevenueSeries.push(cumulative);
  }
  const annualRevenueYear1 = annualRevenueSeries[0] || 0;

  let paybackMonths = 0;
  if (investimentoTotal > 0) {
    let prevCumulative = 0;
    for (let year = 1; year <= years; year += 1) {
      const annual = annualRevenueSeries[year - 1] || 0;
      const currentCumulative = prevCumulative + annual;
      if (currentCumulative >= investimentoTotal && annual > 0) {
        const remainingAtYearStart = investimentoTotal - prevCumulative;
        const fraction = Math.max(0, Math.min(1, remainingAtYearStart / annual));
        paybackMonths = Math.max(1, Math.round(((year - 1) + fraction) * 12));
        break;
      }
      prevCumulative = currentCumulative;
    }
  }

  if (paybackMonths <= 0 && investimentoTotal > 0 && annualRevenueYear1 > 0) {
    paybackMonths = Math.max(1, Math.round((investimentoTotal / annualRevenueYear1) * 12));
  }

  const lastYearRevenue = cumulativeRevenueSeries[Math.min(24, cumulativeRevenueSeries.length - 1)] || 0;
  const roi25Pct = investimentoTotal > 0 ? ((lastYearRevenue - investimentoTotal) / investimentoTotal) * 100 : 0;
  const retornoPorReal = investimentoTotal > 0 ? (lastYearRevenue / investimentoTotal) : 0;
  const retornoPorKwpAno = potenciaSistemaKwp > 0 ? (annualRevenueYear1 / potenciaSistemaKwp) : 0;
  const retornoPorKwh = annualGenerationKwhYear1 > 0 ? (annualRevenueYear1 / annualGenerationKwhYear1) : 0;

  return {
    annualGenerationKwhYear1,
    monthlyGenerationAvgKwhYear1,
    annualRevenueYear1,
    monthlyRevenueYear1: annualRevenueYear1 / 12,
    annualRevenueSeries,
    cumulativeRevenueSeries,
    paybackMonths,
    paybackYearsDecimal: paybackMonths > 0 ? paybackMonths / 12 : 0,
    paybackLabelYearsMonths: formatYearsAndMonths(paybackMonths),
    roi25Pct,
    retornoPorReal,
    retornoPorKwpAno,
    retornoPorKwh,
    billBeforeMonthly: nonUsinaSnapshot?.billBeforeMonthly,
    billAfterMonthly: nonUsinaSnapshot?.billAfterMonthly,
    savingsMonthly: nonUsinaSnapshot?.savingsMonthly,
    savingsAnnual: nonUsinaSnapshot?.savingsAnnual,
    savingsPct: nonUsinaSnapshot?.savingsPct,
    rentabilityRatePerKwhUsed: rentabilityRatePerKwh,
    availabilityKwhUsed: nonUsinaSnapshot?.availabilityKwhUsed,
    annualOmCostYear1: omCostModelEnabled ? annualOmCostYear1 : undefined,
    netAnnualRevenueYear1: annualRevenueYear1,
    assumptionsSnapshot: {
      omCostModelEnabled,
      degradationAllClientsEnabled,
      annualOmCostPct,
      annualOmCostFixed,
      annualEnergyIncreasePct,
      moduleDegradationPct,
    },
  };
}
