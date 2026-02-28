export interface SolarSizingParams {
  consumoMensal: number;
  irradiancia: number;
  moduloPotenciaW: number;
  performanceRatio?: number;
  diasMes?: number;
  precoPorKwp?: number;
  tarifaKwh?: number;
  custoDisponibilidadeKwh?: number;
  aplicarCustoDisponibilidadeNoDimensionamento?: boolean;
}

export interface SolarSizingResult {
  consumoBaseDimensionamentoKwh: number;
  potenciaSistemaKwp: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaMensal: number;
  economiaAnual: number;
  paybackMeses: number;
}

const toSafeNumber = (value: number | undefined, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export function calculateSolarSizing(params: SolarSizingParams): SolarSizingResult {
  const consumoMensal = Math.max(0, toSafeNumber(params.consumoMensal, 0));
  const irradiancia = Math.max(0.01, toSafeNumber(params.irradiancia, 4.5));
  const moduloPotenciaW = Math.max(1, toSafeNumber(params.moduloPotenciaW, 550));
  const performanceRatio = Math.max(0.01, toSafeNumber(params.performanceRatio, 0.8));
  const diasMes = Math.max(1, toSafeNumber(params.diasMes, 30));
  const precoPorKwp = Math.max(0, toSafeNumber(params.precoPorKwp, 4500));
  const tarifaKwh = Math.max(0, toSafeNumber(params.tarifaKwh, 0.76));
  const custoDisponibilidadeKwh = Math.max(0, toSafeNumber(params.custoDisponibilidadeKwh, 50));
  const aplicarCustoDisponibilidadeNoDimensionamento = Boolean(params.aplicarCustoDisponibilidadeNoDimensionamento);

  const consumoBaseDimensionamentoKwh = aplicarCustoDisponibilidadeNoDimensionamento
    ? Math.max(consumoMensal - Math.min(custoDisponibilidadeKwh, consumoMensal), 0)
    : consumoMensal;

  const basePotencia = consumoBaseDimensionamentoKwh > 0
    ? consumoBaseDimensionamentoKwh / (irradiancia * diasMes * performanceRatio)
    : 0;
  const quantidadePaineis = basePotencia > 0
    ? Math.ceil((basePotencia * 1000) / moduloPotenciaW)
    : 0;
  const potenciaSistemaKwp = quantidadePaineis > 0
    ? Number(((quantidadePaineis * moduloPotenciaW) / 1000).toFixed(2))
    : 0;
  const valorTotal = Math.round(potenciaSistemaKwp * precoPorKwp);

  const contaMensal = consumoMensal * tarifaKwh;
  const taxaMinima = Math.min(custoDisponibilidadeKwh, consumoMensal) * tarifaKwh;
  const economiaMensal = Math.max(contaMensal - taxaMinima, 0);
  const economiaAnual = economiaMensal * 12;
  const paybackMeses = economiaAnual > 0 ? Math.ceil((valorTotal / economiaAnual) * 12) : 0;

  return {
    consumoBaseDimensionamentoKwh,
    potenciaSistemaKwp,
    quantidadePaineis,
    valorTotal,
    economiaMensal,
    economiaAnual,
    paybackMeses,
  };
}
