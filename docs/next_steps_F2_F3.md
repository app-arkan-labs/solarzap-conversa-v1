# Next Steps apos F2/F3/F4

Este arquivo registra o backlog residual apos a entrega de F2/F3 e dos itens F4 de alto impacto.

## Entregue neste ciclo

- Recurso solar externo com cache e fallback por UF.
- Integracao de irradiancia georreferenciada com feature flag.
- `diasMes=30.4375` e sazonalidade baseada em fatores mensais externos.
- O&M e degradacao ampliada por flags.
- TUSD/TE simplificado conservador (`tusdCompensationPct` default 0%).
- Shadow mode financeiro (legado vs novo).
- Transparencia de premissas no PDF com flags avancadas.
- Renderer PDF modular com fachada e ativacao por `VITE_USE_PDF_RENDERER_V2`.

## Backlog tecnico recomendado

1. Simulacao horaria (8760h) para aumentar fidelidade de sazonalidade e perdas.
2. Modelagem regulatoria avancada por distribuidora (regras de compensacao TUSD/TE por classe).
3. Custo O&M mais detalhado (escada por porte, inflacao especifica, troca de inversor).
4. Cobertura de testes para Edge Function `solar-resource` com mocks de timeout/erro de provedor.
5. Expandir renderer V2 para renderizacao 100% nativa por modulo (reduzir dependencia do legado).
6. Monitoramento de rollout por flag com telemetria de deltas do shadow mode.
