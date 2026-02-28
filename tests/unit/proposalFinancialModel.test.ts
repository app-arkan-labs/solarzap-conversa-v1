import { describe, expect, it } from 'vitest';

import { calcMonthlyGeneration } from '@/utils/proposalCharts';
import {
  calculateProposalFinancials,
  resolveTariffByPriority,
} from '@/utils/proposalFinancialModel';

describe('resolveTariffByPriority', () => {
  it('respeita prioridade manual > lead > inferred > fallback', () => {
    const manual = resolveTariffByPriority({
      manualTariffKwh: 0.91,
      leadTariffKwh: 0.81,
      inferredTariffKwh: 0.71,
      fallbackTariffKwh: 0.61,
    });
    const lead = resolveTariffByPriority({
      manualTariffKwh: 0,
      leadTariffKwh: 0.81,
      inferredTariffKwh: 0.71,
      fallbackTariffKwh: 0.61,
    });
    const inferred = resolveTariffByPriority({
      manualTariffKwh: null,
      leadTariffKwh: null,
      inferredTariffKwh: 0.71,
      fallbackTariffKwh: 0.61,
    });
    const fallback = resolveTariffByPriority({
      manualTariffKwh: null,
      leadTariffKwh: null,
      inferredTariffKwh: null,
      fallbackTariffKwh: 0.61,
    });

    expect(manual).toEqual({ tariffKwh: 0.91, source: 'manual' });
    expect(lead).toEqual({ tariffKwh: 0.81, source: 'lead' });
    expect(inferred).toEqual({ tariffKwh: 0.71, source: 'inferred' });
    expect(fallback).toEqual({ tariffKwh: 0.61, source: 'fallback' });
  });
});

describe('calculateProposalFinancials', () => {
  it('calcula snapshot financeiro coerente para nao-usina', () => {
    const result = calculateProposalFinancials({
      tipoCliente: 'residencial',
      investimentoTotal: 14850,
      consumoMensalKwh: 350,
      potenciaSistemaKwp: 3.3,
      rentabilityRatePerKwh: 0.85,
      tarifaKwh: 0.85,
      custoDisponibilidadeKwh: 50,
      analysisYears: 25,
    }, {
      unifiedGenerationEnabled: false,
      omCostModelEnabled: false,
      degradationAllClientsEnabled: false,
      tusdTeSimplifiedEnabled: false,
    });

    expect(result.annualGenerationKwhYear1).toBe(4200);
    expect(result.monthlyGenerationAvgKwhYear1).toBe(350);
    expect(result.annualRevenueYear1).toBe(3060);
    expect(result.monthlyRevenueYear1).toBe(255);
    expect(result.annualRevenueSeries).toHaveLength(25);
    expect(result.cumulativeRevenueSeries).toHaveLength(25);
    expect(result.paybackMonths).toBe(58);
    expect(result.billBeforeMonthly).toBe(297.5);
    expect(result.billAfterMonthly).toBe(42.5);
    expect(result.savingsMonthly).toBe(255);
    expect(result.savingsAnnual).toBe(3060);
    expect(result.savingsPct).toBeCloseTo(85.7142, 3);
    expect(result.roi25Pct).toBeGreaterThan(400);
    expect(result.roi25Pct).toBeLessThan(430);
  });

  it('aplica crescimento/degradacao na usina e mantem serie crescente neste cenario', () => {
    const result = calculateProposalFinancials({
      tipoCliente: 'usina',
      investimentoTotal: 100000,
      consumoMensalKwh: 5000,
      potenciaSistemaKwp: 100,
      rentabilityRatePerKwh: 0.65,
      tarifaKwh: 0.65,
      custoDisponibilidadeKwh: 100,
      annualEnergyIncreasePct: 8,
      moduleDegradationPct: 0.8,
      analysisYears: 25,
    }, {
      unifiedGenerationEnabled: false,
      omCostModelEnabled: false,
      degradationAllClientsEnabled: false,
      tusdTeSimplifiedEnabled: false,
    });

    expect(result.annualGenerationKwhYear1).toBe(60000);
    expect(result.annualRevenueYear1).toBe(39000);
    expect(result.annualRevenueSeries).toHaveLength(25);
    expect(result.annualRevenueSeries[1]).toBeGreaterThan(result.annualRevenueSeries[0]);
    expect(result.cumulativeRevenueSeries[24]).toBeGreaterThan(result.cumulativeRevenueSeries[0]);
    expect(result.paybackMonths).toBeGreaterThan(0);
    expect(result.billBeforeMonthly).toBeUndefined();
    expect(result.billAfterMonthly).toBeUndefined();
    expect(result.savingsMonthly).toBeUndefined();
  });

  it('com USE_UNIFIED_GENERATION ativo, geracao anual bate com soma mensal', () => {
    const previous = process.env.VITE_USE_UNIFIED_GENERATION;
    process.env.VITE_USE_UNIFIED_GENERATION = 'true';

    try {
      const result = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        custoDisponibilidadeKwh: 50,
        analysisYears: 25,
      });
      const monthlyGen = calcMonthlyGeneration(3.3, 350);
      const annualFromMonthly = monthlyGen.reduce((acc, value) => acc + value, 0);

      expect(result.annualGenerationKwhYear1).toBe(annualFromMonthly);
    } finally {
      if (previous === undefined) delete process.env.VITE_USE_UNIFIED_GENERATION;
      else process.env.VITE_USE_UNIFIED_GENERATION = previous;
    }
  });

  it('aplica O&M anual quando VITE_USE_OM_COST_MODEL esta ativa', () => {
    const previous = process.env.VITE_USE_OM_COST_MODEL;
    process.env.VITE_USE_OM_COST_MODEL = 'true';

    try {
      const resultWithOm = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        custoDisponibilidadeKwh: 50,
        annualOmCostPct: 1,
        analysisYears: 25,
      });
      const resultWithoutOm = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        custoDisponibilidadeKwh: 50,
        annualOmCostPct: 0,
        analysisYears: 25,
      });

      expect(resultWithOm.annualOmCostYear1).toBeCloseTo(148.5, 2);
      expect(resultWithOm.annualRevenueYear1).toBeLessThan(resultWithoutOm.annualRevenueYear1);
      expect(resultWithOm.netAnnualRevenueYear1).toBe(resultWithOm.annualRevenueYear1);
    } finally {
      if (previous === undefined) delete process.env.VITE_USE_OM_COST_MODEL;
      else process.env.VITE_USE_OM_COST_MODEL = previous;
    }
  });

  it('aplica degradacao para nao-usina quando VITE_USE_DEGRADATION_ALL_CLIENTS esta ativa', () => {
    const previous = process.env.VITE_USE_DEGRADATION_ALL_CLIENTS;
    process.env.VITE_USE_DEGRADATION_ALL_CLIENTS = 'true';

    try {
      const result = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        custoDisponibilidadeKwh: 50,
        moduleDegradationPct: 0.8,
        analysisYears: 25,
      });

      expect(result.annualRevenueSeries[1]).toBeLessThan(result.annualRevenueSeries[0]);
    } finally {
      if (previous === undefined) delete process.env.VITE_USE_DEGRADATION_ALL_CLIENTS;
      else process.env.VITE_USE_DEGRADATION_ALL_CLIENTS = previous;
    }
  });

  it('separa TE/TUSD com compensacao conservadora quando VITE_USE_TUSD_TE_SIMPLIFIED esta ativa', () => {
    const previous = process.env.VITE_USE_TUSD_TE_SIMPLIFIED;
    process.env.VITE_USE_TUSD_TE_SIMPLIFIED = 'true';

    try {
      const result = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        teRatePerKwh: 0.65,
        tusdRatePerKwh: 0.20,
        tusdCompensationPct: 0,
        custoDisponibilidadeKwh: 50,
        analysisYears: 25,
      });

      expect(result.teSavingsMonthly).toBeCloseTo(195, 4);
      expect(result.tusdSavingsMonthly).toBe(0);
      expect(result.savingsMonthly).toBeCloseTo(195, 4);
    } finally {
      if (previous === undefined) delete process.env.VITE_USE_TUSD_TE_SIMPLIFIED;
      else process.env.VITE_USE_TUSD_TE_SIMPLIFIED = previous;
    }
  });

  it('permite overrides de flags para shadow mode', () => {
    const previousOm = process.env.VITE_USE_OM_COST_MODEL;
    process.env.VITE_USE_OM_COST_MODEL = 'true';

    try {
      const withEnvOm = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        custoDisponibilidadeKwh: 50,
      });
      const withOverrideLegacy = calculateProposalFinancials({
        tipoCliente: 'residencial',
        investimentoTotal: 14850,
        consumoMensalKwh: 350,
        potenciaSistemaKwp: 3.3,
        rentabilityRatePerKwh: 0.85,
        tarifaKwh: 0.85,
        custoDisponibilidadeKwh: 50,
      }, {
        omCostModelEnabled: false,
        degradationAllClientsEnabled: false,
        tusdTeSimplifiedEnabled: false,
      });

      expect(withEnvOm.annualRevenueYear1).toBeLessThan(withOverrideLegacy.annualRevenueYear1);
    } finally {
      if (previousOm === undefined) delete process.env.VITE_USE_OM_COST_MODEL;
      else process.env.VITE_USE_OM_COST_MODEL = previousOm;
    }
  });
});
