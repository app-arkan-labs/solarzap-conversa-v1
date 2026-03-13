import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { calculateSolarSizing } from '@/utils/solarSizing';

describe('calculateSolarSizing', () => {
  const prevSRA = process.env.VITE_USE_SOLAR_RESOURCE_API;
  beforeEach(() => { process.env.VITE_USE_SOLAR_RESOURCE_API = 'false'; });
  afterEach(() => { if (prevSRA === undefined) delete process.env.VITE_USE_SOLAR_RESOURCE_API; else process.env.VITE_USE_SOLAR_RESOURCE_API = prevSRA; });

  it('calcula dimensionamento residencial com ordem de grandeza correta', () => {
    const result = calculateSolarSizing({
      consumoMensal: 350,
      irradiancia: 4.52,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      custoDisponibilidadeKwh: 50,
      aplicarCustoDisponibilidadeNoDimensionamento: false,
    });

    expect(result.consumoBaseDimensionamentoKwh).toBe(350);
    expect(result.basePotenciaKwp).toBeCloseTo(3.2264, 4);
    expect(result.quantidadePaineis).toBe(6);
    expect(result.potenciaSistemaKwp).toBe(3.3);
    expect(result.valorTotal).toBe(14850);
    expect(result).not.toHaveProperty('economiaAnual');
    expect(result).not.toHaveProperty('paybackMeses');
  });

  it('abate custo de disponibilidade no consumo base quando flag habilitada', () => {
    const withoutAbate = calculateSolarSizing({
      consumoMensal: 350,
      irradiancia: 4.52,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      custoDisponibilidadeKwh: 100,
      aplicarCustoDisponibilidadeNoDimensionamento: false,
    });

    const withAbate = calculateSolarSizing({
      consumoMensal: 350,
      irradiancia: 4.52,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      custoDisponibilidadeKwh: 100,
      aplicarCustoDisponibilidadeNoDimensionamento: true,
    });

    expect(withoutAbate.consumoBaseDimensionamentoKwh).toBe(350);
    expect(withAbate.consumoBaseDimensionamentoKwh).toBe(250);
    expect(withAbate.basePotenciaKwp).toBeLessThan(withoutAbate.basePotenciaKwp);
    expect(withAbate.quantidadePaineis).toBeLessThan(withoutAbate.quantidadePaineis);
  });

  it('usa 30.4375 dias/mes quando VITE_USE_SOLAR_RESOURCE_API esta ativa', () => {
    const previous = process.env.VITE_USE_SOLAR_RESOURCE_API;
    process.env.VITE_USE_SOLAR_RESOURCE_API = 'true';

    try {
      const result = calculateSolarSizing({
        consumoMensal: 350,
        irradiancia: 4.52,
        moduloPotenciaW: 550,
        performanceRatio: 0.8,
        precoPorKwp: 4500,
      });

      expect(result.basePotenciaKwp).toBeCloseTo(3.1800, 3);
    } finally {
      if (previous === undefined) delete process.env.VITE_USE_SOLAR_RESOURCE_API;
      else process.env.VITE_USE_SOLAR_RESOURCE_API = previous;
    }
  });

  it('mantem o sizing legado quando sombreamento e 0%', () => {
    const legacy = calculateSolarSizing({
      consumoMensal: 500,
      irradiancia: 4.5,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
    });
    const withZeroShade = calculateSolarSizing({
      consumoMensal: 500,
      irradiancia: 4.5,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      sombreamentoPct: 0,
    });

    expect(withZeroShade).toEqual(legacy);
  });

  it('aumenta o consumo base em 15% de sombreamento', () => {
    const result = calculateSolarSizing({
      consumoMensal: 500,
      irradiancia: 4.5,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      sombreamentoPct: 15,
    });

    expect(result.consumoBaseDimensionamentoKwh).toBeCloseTo(588.2353, 4);
    expect(result.basePotenciaKwp).toBeCloseTo(5.4466, 4);
  });

  it('aplica perda leve de 3% para telhado norte', () => {
    const result = calculateSolarSizing({
      consumoMensal: 500,
      irradiancia: 4.5,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      sombreamentoPct: 3,
    });

    expect(result.consumoBaseDimensionamentoKwh).toBeCloseTo(515.4639, 4);
  });

  it('aplica perda forte de 25% para telhado sul', () => {
    const result = calculateSolarSizing({
      consumoMensal: 500,
      irradiancia: 4.5,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      sombreamentoPct: 25,
    });

    expect(result.consumoBaseDimensionamentoKwh).toBeCloseTo(666.6667, 4);
    expect(result.basePotenciaKwp).toBeCloseTo(6.1728, 4);
  });
});
