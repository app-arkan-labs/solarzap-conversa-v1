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
      tarifaKwh: 0.85,
      custoDisponibilidadeKwh: 50,
      aplicarCustoDisponibilidadeNoDimensionamento: false,
    });

    expect(result.consumoBaseDimensionamentoKwh).toBe(350);
    expect(result.quantidadePaineis).toBe(6);
    expect(result.potenciaSistemaKwp).toBe(3.3);
    expect(result.valorTotal).toBe(14850);
    expect(result.economiaMensal).toBe(255);
    expect(result.economiaAnual).toBe(3060);
    expect(result.paybackMeses).toBe(59);
  });

  it('abate custo de disponibilidade no consumo base quando flag habilitada', () => {
    const withoutAbate = calculateSolarSizing({
      consumoMensal: 350,
      irradiancia: 4.52,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      tarifaKwh: 1,
      custoDisponibilidadeKwh: 100,
      aplicarCustoDisponibilidadeNoDimensionamento: false,
    });

    const withAbate = calculateSolarSizing({
      consumoMensal: 350,
      irradiancia: 4.52,
      moduloPotenciaW: 550,
      performanceRatio: 0.8,
      precoPorKwp: 4500,
      tarifaKwh: 1,
      custoDisponibilidadeKwh: 100,
      aplicarCustoDisponibilidadeNoDimensionamento: true,
    });

    expect(withoutAbate.consumoBaseDimensionamentoKwh).toBe(350);
    expect(withAbate.consumoBaseDimensionamentoKwh).toBe(250);
    expect(withAbate.quantidadePaineis).toBeLessThan(withoutAbate.quantidadePaineis);
    expect(withAbate.economiaMensal).toBe(250);
  });
});
