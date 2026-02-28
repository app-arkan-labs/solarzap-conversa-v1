export interface SolarSizingParams {
  consumoMensal: number;
  irradiancia: number;
  moduloPotenciaW: number;
  performanceRatio?: number;
  diasMes?: number;
  precoPorKwp?: number;
  custoDisponibilidadeKwh?: number;
  aplicarCustoDisponibilidadeNoDimensionamento?: boolean;
}

export interface SolarSizingResult {
  consumoBaseDimensionamentoKwh: number;
  basePotenciaKwp: number;
  potenciaSistemaKwp: number;
  quantidadePaineis: number;
  valorTotal: number;
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

  return {
    consumoBaseDimensionamentoKwh,
    basePotenciaKwp: basePotencia,
    potenciaSistemaKwp,
    quantidadePaineis,
    valorTotal,
  };
}
