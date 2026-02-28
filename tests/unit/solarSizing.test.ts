import { describe, expect, it } from 'vitest';

import { calculateSolarSizing } from '@/utils/solarSizing';

describe('calculateSolarSizing', () => {
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
});
