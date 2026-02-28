import { describe, expect, it } from 'vitest';

import {
  calculateProposalFinancials,
  resolveTariffByPriority,
} from '@/utils/proposalFinancialModel';
import { calcMonthlyGeneration } from '@/utils/proposalCharts';

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
  it('calcula snapshot financeiro coerente para não-usina', () => {
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

  it('aplica crescimento/degradação na usina e mantém série crescente neste cenário', () => {
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

  it('com USE_UNIFIED_GENERATION ativo, geração anual bate com soma mensal', () => {
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
});
