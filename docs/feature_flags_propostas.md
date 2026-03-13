# Feature Flags do Gerador de Propostas

## Objetivo

Controlar rollout gradual das mudancas de calculo e renderizacao de PDF sem quebrar o baseline legado.

## Lista de flags

1. `VITE_USE_UNIFIED_GENERATION`
- Default: `false`
- Efeito: usa fonte unica para geracao anual (`sum(monthlyGeneration)`).

2. `VITE_USE_SOLAR_RESOURCE_API`
- Default: `false`
- Efeito: consulta `solar-resource` (Open-Meteo + PVGIS + cache) com fallback por UF.

3. `VITE_USE_OM_COST_MODEL`
- Default: `false`
- Efeito: aplica O&M anual no fluxo de caixa.

4. `VITE_USE_DEGRADATION_ALL_CLIENTS`
- Default: `false`
- Efeito: aplica degradacao para todos os segmentos.

5. `VITE_USE_TUSD_TE_SIMPLIFIED`
- Default: `false`
- Efeito: separa economia entre TE e TUSD.
- Premissa conservadora: `tusdCompensationPct = 0%` quando nao informado.

6. `VITE_USE_PDF_RENDERER_V2`
- Default: `false`
- Efeito: usa renderer modular (`src/utils/pdf/*`) via fachada publica.

7. `VITE_USE_FINANCIAL_SHADOW_MODE`
- Default: `false`
- Efeito: calcula legado e novo em paralelo; persiste deltas em `premiumPayload.shadowComparison`.

8. `VITE_USE_CHART_FIXED_SEASONAL_PROFILE`
- Default: `false`
- Efeito: altera apenas a serie mensal do grafico "Geracao Mensal Estimada" para perfil sazonal fixo Brasil legado.
- Observacao: nao altera payback/economia/ROI nem demais calculos financeiros.

## Ordem sugerida de rollout

1. Ativar `VITE_USE_UNIFIED_GENERATION`.
2. Ativar `VITE_USE_SOLAR_RESOURCE_API` em pequena amostra.
3. Ativar `VITE_USE_OM_COST_MODEL` e `VITE_USE_DEGRADATION_ALL_CLIENTS`.
4. Ativar `VITE_USE_TUSD_TE_SIMPLIFIED` com monitoramento comercial.
5. Ativar `VITE_USE_FINANCIAL_SHADOW_MODE` durante validacao.
6. Ativar `VITE_USE_PDF_RENDERER_V2` apos estabilizacao de golden e smoke funcional.
7. Ativar `VITE_USE_CHART_FIXED_SEASONAL_PROFILE` em canario e expandir apos validacao visual.

## Operacao e troubleshooting

- Falha em recurso externo nunca deve bloquear proposta: fallback por UF/perfil legado e geracao continua.
- Em divergencia de resultados, usar `shadowComparison` para medir delta de payback/economia/ROI.
- Para auditoria de PDF, validar hashes em `tests/golden/expectedHashes.ts`.
