# Production Readiness Audit and Final Blueprint

Date: 2026-03-12

## Escopo auditado
- Plano de execução: `PLAN.FINAL.md`
- Diagnóstico original de prontidão: `c:\Users\rosen\AppData\Roaming\Code\User\workspaceStorage\1dc91694cc7beb8211a15cf338f54fd4\GitHub.copilot-chat\memory-tool\memories\OTlkNDk3YzAtMTcwZC00NDFlLTg5N2MtOWZiNTVkMDRmNjJm\plan.md`
- Evidência de staging: `docs/STAGING_VALIDATION_REPORT_2026-03-12.md`
- Código, migrações, funções Edge, scripts operacionais e testes relacionados às fases 1-5

## Veredito
- `staging`: validado
- `produção`: ainda não

O lote implementado fecha bem o objetivo de `staging green`, mas ainda não fecha o objetivo de `produção segura`. Há três razões objetivas:
- faltam gates finais explicitamente exigidos pelo próprio `PLAN.FINAL.md`, especialmente o piloto live controlado;
- existem lacunas críticas de autenticação em workers/funções privilegiadas;
- parte da operação ficou "verde em staging" sem contrato final de produção, principalmente KB ingest, smoke operacional reutilizável e evidência formal de performance.

## O que ficou correto

### 1. Broadcast worker saiu do browser e foi para backend
- A migração `supabase/migrations/20260312100000_broadcast_worker_backend.sql:3` adiciona `attempt_count`, `max_attempts`, `next_attempt_at` e `processing_started_at`.
- A mesma migração cria as rotinas de progresso e requeue: `broadcast_refresh_campaign_progress` em `:31` e `broadcast_requeue_stale_recipients` em `:175`.
- O worker `supabase/functions/broadcast-worker/index.ts` implementa claim, requeue, retry/backoff, idempotência operacional, criação/atualização de lead e envio via `evolution-proxy`.
- No front, `src/hooks/useBroadcasts.ts:407` passou a apenas iniciar/pausar/cancelar estado de campanha; o envio efetivo ficou desacoplado da aba do usuário.

Resultado: esta era uma das maiores fragilidades do plano original e foi corrigida na direção certa.

### 2. Automações por organização foram persistidas com fallback compatível
- A tabela `automation_settings` foi criada com RLS em `supabase/migrations/20260312101000_automation_settings_persistence.sql:1`, `:29`, `:32`, `:39`, `:45`, `:51`.
- O contexto agora hidrata do banco, faz bootstrap do registro quando ausente e mantém fallback local por org em `src/contexts/AutomationContext.tsx:123`, `:142`, `:159`, `:197`.
- O contrato de UI com `isSaving` e `isHydrating` continua exposto em `src/hooks/useAutomationSettings.ts:51`, `:52`, `:117`, `:118`.

Resultado: o comportamento ficou compatível com legado, mas com persistência real por org.

### 3. O pipeline de KB foi ligado ponta a ponta no caminho feliz
- A migração `supabase/migrations/20260312102000_kb_ingestion_status_pipeline.sql:2` adiciona `ingestion_status`, `ingestion_started_at`, `ingestion_finished_at` e index por org/status em `:24`.
- A função `supabase/functions/kb-ingest/index.ts:275`, `:291`, `:340`, `:425`, `:435` resolve membership, move status para `processing`, grava chunks e fecha como `ready` ou `error`.
- A UI de upload chama a função após upload em `src/components/solarzap/KnowledgeBaseView.tsx:78` e atualiza o estado local em `:170`.

Resultado: o fluxo básico upload -> ingest -> status existe e funciona no caminho principal.

### 4. Hardening de MFA e remoção da chave operacional no banco foram feitos
- O segredo TOTP agora pode ficar mascarado e só é revelado/copied sob ação explícita em `src/components/admin/MfaSetup.tsx:106`, `:113`, `:163`, `:170`, `:178`.
- A coluna `openai_api_key` foi removida em `supabase/migrations/20260312103000_remove_ai_settings_openai_api_key.sql:2`.
- Não há referência frontend ativa a `openai_api_key` nas telas/hooks inspecionados; os agentes usam `OPENAI_API_KEY` de ambiente em `supabase/functions/ai-digest-worker/index.ts:394` e `supabase/functions/ai-pipeline-agent/index.ts:3291`.

Resultado: a parte mais óbvia de exposição de segredo operacional foi saneada.

### 5. Billing e gating ficaram coerentes em staging
- `stripe-checkout` usa `plan_key` corretamente em `supabase/functions/stripe-checkout/index.ts:52`, `:59`, `:101`, `:178`, `:193`, `:205`.
- O hook de billing resolve `plan_key` com fallback compatível em `src/hooks/useOrgBilling.ts:87`, `:98`, `:126`.
- O gating principal está aplicado em `src/components/ProtectedRoute.tsx:157`, `:160`, `:168`.
- Os E2Es cobrem `pending_checkout`, `trialing`, `active`, `past_due`, `unpaid`, upgrade e downgrade em `tests/e2e/billing-gating-access-states.spec.ts:139`, `:154`, `:181`, `:196`, `:210`.

Resultado: para staging, a trilha comercial básica ficou consistente.

### 6. Fase operacional de staging foi bem estruturada
- A extensão de health scan adiciona alertas para Stripe, backlog de broadcast, WhatsApp desconectado, anomalia de IA e cron ausente em `supabase/migrations/20260312104000_ops_runtime_health_extension.sql:137`, `:202`, `:242`, `:292`, `:332`, `:379`.
- Existe runbook em `docs/STAGING_OPERATIONS_RUNBOOK.md`.
- Existe política de backup/retenção em `docs/STAGING_BACKUP_RETENTION_POLICY.md`.
- Existe drill de restore com checksum em `scripts/ops/staging_backup_restore_drill.sql:4`, `:7`, `:23`, `:48`.
- A validação de staging registra `24 PASS`, `0 FAIL`, `2 INFO`, `6 passed`, `HTTP 201` e checksum validado em `docs/STAGING_VALIDATION_REPORT_2026-03-12.md:42`, `:43`, `:44`, `:58`, `:65`, `:66`.

Resultado: para ambiente de homologação, a camada operacional está melhor do que o estado descrito no diagnóstico original.

### 7. UX/performance melhoraram na direção certa
- Rotas principais estão em lazy loading em `src/App.tsx:18`, `:28`, com fallback global em `:148`.
- As abas pesadas do SolarZap estão lazy-loaded em `src/components/solarzap/SolarZapLayout.tsx:87`, `:100` com `Suspense` dedicado em `:1602`, `:1644`, `:1687`, `:1708`, `:1749`, `:1761`.
- Há responsividade explícita de viewport/mobile em `src/components/solarzap/SolarZapLayout.tsx:202`, `:1302`.
- O checklist de onboarding foi ligado ao estado real da org em `src/components/billing/OnboardingChecklist.tsx:48`, `:89`, `:112`, `:150`.
- Existe smoke mobile dedicado em `tests/e2e/mobile-critical-tabs-smoke.spec.ts:22`, `:84`, `:93`, `:96`.

Resultado: a Fase 4 foi implementada em substância, mas não está completamente fechada como gate de produção.

## O que ficou errado ou incompleto

### 1. Crítico: `process-agent-jobs` continua sem autenticação de invocação
- `supabase/functions/process-agent-jobs/index.ts:837` inicia o handler.
- `supabase/functions/process-agent-jobs/index.ts:860` cria client com `SUPABASE_SERVICE_ROLE_KEY`.
- Não há `validateInvocationAuth`, `auth.getUser`, `EDGE_INTERNAL_API_KEY` nem equivalente na função.
- O helper `supabase/functions/_shared/cors.ts:65` considera `originAllowed = !requestOrigin || ...`, ou seja: requests sem header `Origin` são aceitos.

Impacto:
- qualquer chamada server-to-server sem `Origin` pode atingir um worker privilegiado que processa jobs com service role;
- o smoke atual não cobre este caso; ele só verifica caminho feliz com service role em `scripts/smoke_test_final.ps1:298`, `:303`.

Conclusão:
- isto bloqueia produção.

### 2. Crítico: `ai-pipeline-agent` continua sem autenticação de invocação
- A função usa o padrão antigo de CORS fixo em `supabase/functions/ai-pipeline-agent/index.ts:5`, `:11`.
- O handler começa em `supabase/functions/ai-pipeline-agent/index.ts:2070` e trata método/JSON em `:2072`, `:2096`.
- O client privilegiado é criado em `supabase/functions/ai-pipeline-agent/index.ts:2276`.
- A busca no arquivo não encontrou `validateInvocationAuth`, `auth.getUser`, `EDGE_INTERNAL_API_KEY` ou equivalente.

Impacto:
- a função processa IA e gravações com service role sem gate explícito de invocação;
- o smoke só testa invocação autorizada de caminho feliz em `scripts/smoke_test_final.ps1:167`, `:172`, `:175`;
- não há cobertura negativa de segurança para este endpoint no lote final.

Conclusão:
- isto também bloqueia produção.

### 3. Alto: o fluxo de KB promete processamento em background que o código não garante
- A UI trata falha de invoke como `pending` em `src/components/solarzap/KnowledgeBaseView.tsx:86`.
- Em seguida informa `"A ingestão será concluída em background."` em `:179`.
- A UI também mostra `"Documento enfileirado para processamento."` em `:293`.
- No repositório auditado, o único disparo de `kb-ingest` encontrado é a invocação direta da UI em `src/components/solarzap/KnowledgeBaseView.tsx:78`.
- Não existe cron, worker dedicado ou retry automático de `kb-ingest` no lote atual.

Impacto:
- se a chamada imediata falhar depois do upload, o item pode ficar em `pending/error` indefinidamente;
- o contrato UX atual está mais otimista que a operação real.

Conclusão:
- staging passa no caminho feliz, mas produção precisa de retry operacional real ou UX honesta com retry explícito.

### 4. Médio: o smoke final não está pronto para promoção de ambiente
- O runbook exige `SUPABASE_PROJECT_REF` em `docs/STAGING_OPERATIONS_RUNBOOK.md:13`.
- O smoke final usa project ref hardcoded de staging em `scripts/smoke_test_final.ps1:40`.
- O mesmo script contém regressões de encoding em `scripts/smoke_test_final.ps1:285`, `:290`, `:312`, `:319`, `:325`.

Impacto:
- o script não é reaproveitável como gate único entre staging e produção;
- há inconsistência entre documentação operacional e script executável.

Conclusão:
- precisa ser parametrizado e saneado antes do fechamento final.

### 5. Médio: a meta de performance da Fase 4 não foi provada
- `PLAN.FINAL.md:33` e `:37` pedem gate de performance com redução do chunk principal e meta acordada.
- Há lazy loading real em `src/App.tsx` e `src/components/solarzap/SolarZapLayout.tsx`, mas `docs/STAGING_VALIDATION_REPORT_2026-03-12.md:71` só registra `npm run build`.
- `vite.config.ts` não contém orçamento, threshold ou análise de bundle.

Impacto:
- houve implementação de code-splitting, mas não há evidência formal de que o gate de performance foi atingido.

Conclusão:
- isto não bloqueia staging, mas impede afirmar "produção pronta" com rigor.

### 6. Médio: o guard de encoding não cobre o artefato que regrediu
- `tests/unit/text_encoding_guard.test.ts:8`, `:17`, `:43` mostra um conjunto pequeno de arquivos monitorados.
- `scripts/smoke_test_final.ps1` não está nesse guard e acabou entrando com mojibake.

Impacto:
- regressões textuais em artefatos operacionais continuam escapando.

### 7. Baixo/Médio: `kb-ingest` ainda vaza `error.message` em 500
- O catch final retorna mensagem bruta em `supabase/functions/kb-ingest/index.ts:443`, `:445`.

Impacto:
- risco moderado porque o endpoint é autenticado, mas não é o padrão desejado para produção.

## Lacunas não executadas pelo próprio plano final
- O próprio `PLAN.FINAL.md` diz que o fechamento final exige `staging completo + piloto live controlado` em `:13`, `:42`, `:56`, `:68`.
- O artefato final disponível é um relatório de staging em `docs/STAGING_VALIDATION_REPORT_2026-03-12.md`, não um relatório de piloto live.

Conclusão:
- mesmo se os bugs acima não existissem, o software ainda não poderia ser marcado como "pronto para produção" porque o gate final do plano não foi executado.

## Estado consolidado por fase

| Fase | Estado | Observação |
| --- | --- | --- |
| Fase 1/2 | Parcialmente fechada | Broadcast, automações, MFA e billing ficaram bons; KB ficou correta no happy path, mas incompleta no pós-falha |
| Fase 3 | Fechada para staging | Alertas, runbook, backup policy e restore drill existem e têm evidência |
| Fase 4 | Parcialmente fechada | Lazy loading, mobile e onboarding existem; gate formal de performance não foi provado |
| Fase 5 | Fechada para staging | E2E e smoke de staging estão verdes |
| Fechamento de produção | Não iniciado/concluído | Falta piloto live e ainda existem gaps críticos de segurança |

## Blueprint final para fechar produção de vez

### P0. Corrigir as duas lacunas críticas de autenticação
1. Aplicar ao `process-agent-jobs` o mesmo padrão de auth interna usado em `notification-worker` e `ai-digest-worker`.
2. Aplicar ao `ai-pipeline-agent` um gate explícito de invocação:
   - aceitar somente `service_role` bearer ou `x-internal-api-key`;
   - se houver modo usuário, autenticar com anon key + `auth.getUser()` + membership explícita.
3. Garantir que requests sem `Origin` não substituam autenticação de aplicação.
4. Adicionar testes negativos:
   - sem auth -> `401`;
   - auth inválida -> `403/401`;
   - origem não permitida -> `403` onde aplicável.
5. Estender o smoke para cobrir negativa de auth desses endpoints.

Gate P0:
- `curl` sem auth não executa nem `process-agent-jobs` nem `ai-pipeline-agent`;
- cron/automações legítimas continuam verdes;
- staging redeployado e retestado.

### P1. Fechar o contrato operacional do KB ingest
1. Escolher um modelo e implementá-lo de verdade:
   - recomendado: worker/cron de retry para `kb-ingest` processar itens `pending/error`;
   - alternativo: remover o texto de "background" e adicionar botão de retry manual + polling de status.
2. Sanitizar resposta 500 de `kb-ingest`.
3. Adicionar smoke/E2E mínimo cobrindo:
   - upload com processamento imediato;
   - falha de invoke seguida de retry e convergência para `ready` ou `error`.

Gate P1:
- nenhum documento fica indefinidamente em `pending` sem caminho operacional de saída;
- a UI não promete comportamento que o backend não entrega.

### P2. Tornar o pacote operacional reutilizável para produção
1. Parametrizar `scripts/smoke_test_final.ps1` com `SUPABASE_PROJECT_REF`.
2. Remover todo texto com mojibake do smoke.
3. Ampliar `tests/unit/text_encoding_guard.test.ts` para incluir:
   - `scripts/smoke_test_final.ps1`;
   - outros artefatos operacionais e telas críticas alteradas neste lote.
4. Produzir versão de runbook/backup policy para produção, derivada dos documentos de staging.

Gate P2:
- o mesmo smoke roda por ambiente, sem edição manual do arquivo;
- regressões de encoding voltam a falhar em CI.

### P3. Fechar o gate de performance com evidência real
1. Gerar baseline de bundle atual.
2. Definir threshold objetivo para chunks principais.
3. Se necessário, adicionar estratégia explícita de chunking e um check automatizado em CI.
4. Registrar delta no artefato final de validação.

Gate P3:
- existe número documentado para antes/depois;
- build falha se o orçamento voltar a regredir.

### P4. Executar o fechamento comercial/operacional de produção
1. Configurar Stripe live:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - URLs live de app/callback
2. Fazer dry run controlado com org interna.
3. Executar 1 piloto live controlado, como exigido por `PLAN.FINAL.md`.
4. Validar:
   - checkout;
   - webhook;
   - transição `pending_checkout -> trialing/active`;
   - access state;
   - alertas operacionais;
   - rollback operacional documentado.

Gate P4:
- existe evidência live, não só staging.

### P5. Matriz final obrigatória antes de produção
1. `npm run typecheck`
2. `npm run build`
3. `npm test -- --run`
4. `npm run lint`
5. E2E billing/gating
6. smoke desktop/mobile
7. smoke negativo de auth para workers críticos
8. queries de saúde operacional
9. piloto live controlado documentado

Aceite final:
- zero falhas críticas;
- zero endpoints privilegiados publicamente invocáveis;
- KB ingest com recuperação real;
- smoke parametrizado por ambiente;
- performance documentada;
- piloto live concluído com evidência.

## Conclusão final
O software não está mais no estado descrito pelo diagnóstico original. A retomada implementou a maior parte do trabalho necessário para chegar a `staging validado`, e isso está coerente com o código e com o relatório.

Mas ainda não é tecnicamente correto chamar este estado de `pronto para produção`.

Hoje o estado real é:
- `staging`: pronto
- `produção`: bloqueada por 2 falhas críticas de autenticação, 1 contrato operacional incompleto em KB ingest, 1 pacote de smoke/docs ainda preso a staging, ausência de evidência de performance e ausência do piloto live exigido pelo plano.

Se o objetivo for encerrar de vez, o blueprint acima é a menor sequência defensável para sair de staging e fechar produção sem regressão escondida.
