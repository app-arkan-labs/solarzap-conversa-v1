# Premissas do Modelo Financeiro (estado atual)

Este documento descreve o comportamento atual do gerador de propostas apos as entregas F0/F1/F2/F3/F4 deste ciclo.

## Escopo

- `src/utils/solarSizing.ts`
- `src/utils/proposalFinancialModel.ts`
- `src/utils/proposalCharts.ts`
- `src/utils/generateProposalPDF.ts`
- `src/utils/pdf/*`

## Defaults base

- `DEFAULT_TARIFF_KWH`: `0.76`
- `DEFAULT_ANALYSIS_YEARS`: `25`
- `DEFAULT_ANNUAL_INCREASE_PCT`: `8`
- `DEFAULT_MODULE_DEGRADATION_PCT`: `0.8`

## Feature flags e comportamento

Todas as evolucoes de F2/F3/F4 foram entregues com rollout por flag.

- `VITE_USE_UNIFIED_GENERATION` (default OFF)
  - ON: financeiro usa geracao anual derivada de `sum(calcMonthlyGeneration)`.
- `VITE_USE_SOLAR_RESOURCE_API` (default OFF)
  - ON: usa Edge Function `solar-resource` (geocoder Open-Meteo + PVGIS + cache + fallback UF).
- `VITE_USE_OM_COST_MODEL` (default OFF)
  - ON: aplica O&M anual no fluxo financeiro (default `1% a.a.` quando nao informado).
- `VITE_USE_DEGRADATION_ALL_CLIENTS` (default OFF)
  - ON: aplica degradacao para todos os segmentos, nao apenas usina.
- `VITE_USE_TUSD_TE_SIMPLIFIED` (default OFF)
  - ON: separa economia por componentes TE/TUSD.
  - `tusdCompensationPct` default conservador: `0%`.
- `VITE_USE_PDF_RENDERER_V2` (default OFF)
  - ON: ativa fachada modular do renderer (`src/utils/pdf/*`) mantendo API publica.
- `VITE_USE_FINANCIAL_SHADOW_MODE` (default OFF)
  - ON: calcula legado vs novo em paralelo e grava deltas em `premiumPayload.shadowComparison`.

## Tarifa e prioridade

Resolucao de tarifa segue prioridade:

1. manual
2. lead
3. inferida
4. fallback

## Dimensionamento

- Potencia base:
  `consumoBaseDimensionamento / (irradiancia * diasMes * performanceRatio)`
- Quantidade de modulos:
  `ceil((potenciaBase * 1000) / moduloPotenciaW)`
- Potencia instalada:
  `((qtdModulos * moduloPotenciaW) / 1000)` (2 casas)
- Valor total:
  `round(potenciaInstalada * precoPorKwp)`
- `diasMes`:
  - OFF (legado): `30`
  - ON (`VITE_USE_SOLAR_RESOURCE_API`): `30.4375`

## Geracao mensal e anual

- Perfil mensal:
  - ON com recurso externo: fatores mensais da API/cache
  - OFF/falha: `LEGACY_SEASONAL_PROFILE` normalizado
- Com `VITE_USE_UNIFIED_GENERATION=ON`:
  - `annualGenerationKwhYear1 = sum(monthlyGeneration[12])`

## Modelo financeiro

### Nao-usina

- Conta antes: `consumoMensal * tarifaEfetiva`
- Conta apos solar: `custoDisponibilidade * tarifaEfetiva`
- Economia mensal/anual derivada dessa diferenca
- Com TUSD/TE ON:
  - `teSavingsMonthly = compensableKwh * teRatePerKwh`
  - `tusdSavingsMonthly = compensableKwh * tusdRatePerKwh * (tusdCompensationPct/100)`
  - Economia total = `TE + TUSD compensada`

### Usina

- Receita ano 1 baseada em geracao anual e taxa efetiva
- Serie anual aplica:
  - reajuste (`annualEnergyIncreasePct`)
  - degradacao (`moduleDegradationPct`), conforme flag de abrangencia

### O&M

- Se `VITE_USE_OM_COST_MODEL=ON`:
  - `annualOmCostYear1 = investimento * annualOmCostPct/100 + annualOmCostFixed`
  - Receita anual liquida = receita bruta - O&M

## Payback e indicadores

- Payback por interpolacao no ano de cruzamento do investimento
- Fallback: `(investimento / annualRevenueYear1) * 12`
- Indicadores:
  - `roi25Pct`
  - `retornoPorReal`
  - `retornoPorKwpAno`
  - `retornoPorKwh`

## PDF e transparencia de premissas

- Golden OFF permanece estavel.
- Com flags avancadas ON, o PDF exibe premissas tecnicas/financeiras:
  - fonte de irradiancia
  - coordenadas (quando houver)
  - `diasMes`
  - PR
  - tarifa efetiva / TE / TUSD / fator de compensacao
  - O&M
  - degradacao
  - horizonte
  - versao do modelo financeiro

## Versionamento

- `FINANCIAL_MODEL_VERSION`: `v3_geo_om_tusdte_flagged`
