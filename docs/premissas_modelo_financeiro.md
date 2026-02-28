# Premissas do Modelo Financeiro (AS-IS)

Este documento registra o comportamento atual do motor de propostas sem aplicar correcoes de logica.

## Escopo

- `src/utils/solarSizing.ts`
- `src/utils/proposalFinancialModel.ts`
- `src/utils/proposalCharts.ts`
- `src/utils/generateProposalPDF.ts`

## Defaults financeiros atuais

- `DEFAULT_TARIFF_KWH`: `0.76`
- `DEFAULT_ANALYSIS_YEARS`: `25`
- `DEFAULT_ANNUAL_INCREASE_PCT`: `8`
- `DEFAULT_MODULE_DEGRADATION_PCT`: `0.8`

## Tarifa aplicada

A tarifa usada no modelo financeiro segue esta prioridade:

1. tarifa manual
2. tarifa do lead
3. tarifa inferida pela distribuidora
4. fallback

## Premissas de dimensionamento (AS-IS)

- `diasMes` fixo em `30`
- potencia base:
  `consumoBaseDimensionamento / (irradiancia * diasMes * performanceRatio)`
- quantidade de modulos:
  `ceil((potenciaBase * 1000) / moduloPotenciaW)`
- potencia instalada:
  `((qtdModulos * moduloPotenciaW) / 1000)` com arredondamento em 2 casas
- valor total:
  `round(potenciaInstalada * precoPorKwp)`

## Premissas financeiras (AS-IS)

### Nao-usina

- `annualGenerationKwhYear1 = consumoMensalKwh * 12`
- conta antes:
  `consumoMensalKwh * tarifa`
- conta com solar:
  `min(consumoMensalKwh, custoDisponibilidadeKwh) * tarifa`
- economia mensal:
  `contaAntes - contaComSolar`
- economia anual:
  `economiaMensal * 12`

### Usina

- `annualGenerationKwhYear1 = consumoMensalKwh * 12`
- receita ano 1:
  `annualGenerationKwhYear1 * tarifa`
- para cada ano:
  `receitaAnoN = receitaAno1 * (1 + annualEnergyIncreasePct)^n * (1 - moduleDegradationPct)^n`

## Payback (AS-IS)

- payback principal por interpolacao no ano em que o acumulado cruza o investimento
- fallback:
  `(investimentoTotal / annualRevenueYear1) * 12`

## Series e indicadores (AS-IS)

- serie anual de receita com horizonte `analysisYears`
- serie acumulada por soma anual
- `roi25Pct` sobre acumulado de 25 anos
- `retornoPorReal`, `retornoPorKwpAno`, `retornoPorKwh` derivados da receita ano 1 e acumulados

## Geração mensal no PDF (AS-IS)

- perfil sazonal fixo Brasil com media normalizada em `1.0`
- se `consumoMensal` existe:
  `monthlyGen = consumoMensal * fatorSazonal`
- fallback por potencia:
  `potencia * 4.5 * 30 * 0.8 * fatorSazonal`

## Impacto ambiental (AS-IS)

- fator de emissao SIN: `0.0817 tCO2/MWh`
- `co2Tons = (kWhTotal / 1000) * 0.0817`
- `trees` e `carKm` convertidos por fatores fixos
