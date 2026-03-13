# Plano Final de Execucao - Estado Atual ate Producao (Ancorado na realidade de 2026-03-13)

## Resumo
Este plano nao parte do zero. Ele assume o estado real atual do SolarZap:
- staging validado;
- billing Stripe operacional em staging;
- broadcast worker, automations persistence, health scan, backup drill e smoke principal ja entregues;
- lote novo de UX/CRM ja implementado em boa parte.

Objetivo desta versao:
- parar de reexecutar trabalho ja feito;
- fechar os ajustes restantes do lote atual;
- levar o software de `staging valido` para `producao liberavel`, sem regressao.

Referencia tecnica obrigatoria:
- `docs/FINAL_REALITY_AUDIT_2026-03-13.md`

## O que ja esta entregue e deve ser preservado
- reacoes em mensagens corrigidas e integradas frontend/backend;
- calendario com overflow visual controlado por `+N mais`;
- billing blocker por popup para acoes governadas, soft walls e limites;
- Agente de Apoio Global com prompt editavel e fallback de runtime;
- signup + onboarding expandidos para semear org, membership e configuracoes operacionais principais;
- tour guiado basico com replay manual pelo logo lateral;
- barra lateral compacta com badge de plano e menu consolidado;
- broadcast worker backend;
- persistencia de automacoes por org;
- pipeline de status de KB;
- health/runtime extension, runbooks e backup drill;
- code-splitting real em rotas/views.

## Ordem fixa de execucao

### Fase P0 - Fechar o lote atual sem reabrir escopo
1. Corrigir a persistencia do guided tour automatico.
- `SolarZapLayout` nao pode iniciar o fluxo automatico como `manual`.
- `skip`, `close` e `complete` do autoplay precisam gravar `dismissed/completed` no banco.

2. Fechar o contrato dos passos do tour.
- ou implementar `fallbackSelector` e `waitForMs` no renderer;
- ou remover esses campos do contrato para nao manter API falsa.

3. Adicionar cobertura de regressao do lote novo.
- E2E do guided tour: primeiro autoplay, replay manual, skip/complete, multi-org.
- teste alvo de reacoes: envio, substituicao e persistencia.
- teste alvo de calendario denso: dia com mais de 4 eventos.

4. Corrigir a narrativa documental do billing.
- documentar que popup vale para bloqueios por acao/limite/feature/read_only;
- manter explicitamente `pending_checkout` e `blocked/unpaid` como gates de tela inteira.

Gate da fase:
- guided tour sem reabrir sozinho em nova sessao apos `skip/complete`;
- regressao automatizada do lote novo verde;
- docs alinhadas ao comportamento real.

### Fase P1 - Hardening de producao nas edge functions criticas
1. Adicionar auth/secret de invocacao em `process-agent-jobs`.
2. Adicionar auth/secret de invocacao em `ai-pipeline-agent`.
3. Revisar o helper de CORS para requests sem `Origin` em funcoes sensiveis.
4. Sanitizar respostas de erro e manter startup fail-closed para env obrigatoria.

Gate da fase:
- nenhuma funcao critica sobe `service_role` sem gate de invocacao;
- cron e callers legitimos continuam operando;
- requests indevidos falham de forma deterministica.

### Fase P2 - Fechar semantica operacional que ainda esta parcial
1. Definir e implementar a regra final do onboarding.
- assumir oficialmente que o onboarding preenche campos essenciais, nao "todos os campos";
- se o produto exigir mais cobertura inicial, expandir o onboarding de forma deliberada.

2. Fechar KB para producao.
- se a promessa continuar sendo ingestao em background, criar retry/worker real para `pending/error`;
- se nao, ajustar a UX e a documentacao para o comportamento real atual.

3. Garantir que o smoke operacional nao dependa de premissas antigas do tour/onboarding.

Gate da fase:
- onboarding com escopo formalizado;
- KB sem ambiguidade operacional;
- smoke coerente com a UX real.

### Fase P3 - Performance final
1. Reduzir os chunks ainda grandes do build atual.
- alvo minimo: atacar `Index-C6ktJ4e5.js` (~1.83 MB) e `index-CklYD0yE.js` (~612 kB).

2. Revisar imports pesados e fronteiras de chunk.
- vendor splitting;
- lazy real nas dependencias pesadas ainda residuais;
- `manualChunks` se necessario.

3. Rodar smoke desktop/mobile depois de cada corte.

Gate da fase:
- build continua verde;
- chunk principal reduzido de forma comprovavel;
- sem tela branca e sem regressao de navegacao.

### Fase P4 - Validacao final pre-producao
1. Rodar gates locais completos.
- `npm run typecheck`
- `npm run build`
- `npm test -- --run`
- `npm run lint`

2. Rodar E2E alvo.
- billing/gating;
- guided tour;
- lote novo de reacoes/calendario;
- smoke mobile critico.

3. Rodar validacao operacional.
- health queries;
- cron jobs;
- backlog de notificacoes/disparos/jobs;
- KB pipeline;
- backup/restore check.

Gate da fase:
- 100% verde no escopo de release;
- nenhum bloqueio P0/P1 aberto.

### Fase P5 - Liberacao controlada para producao
1. Configurar secrets/live webhooks no ambiente final.
2. Fazer deploy controlado.
3. Executar piloto live pequeno.
4. Monitorar billing, jobs, IA, WhatsApp e alertas nas primeiras horas.

Gate da fase:
- piloto live sem incidente critico;
- monitoramento limpo;
- rollback documentado e nao acionado.

## Criterios de aceite finais
- nenhuma funcao critica exposta sem auth/secret de invocacao;
- guided tour estabilizado e testado;
- billing docs e comportamento alinhados;
- onboarding com escopo real documentado;
- KB com comportamento real fechado;
- performance com evidencia de melhora;
- matriz final de build/test/smoke/ops totalmente verde.

## Fora de escopo desta rodada
- redesenho comercial do produto fora do Stripe;
- reescrever areas maduras sem bug comprovado;
- reabrir fases ja validadas em staging sem evidencia tecnica.
