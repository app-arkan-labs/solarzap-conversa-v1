# Plano de Acao Cirurgico - IA por Instancia + Atribuicao + Politica de Agendamento (2026-03-25)

## 0) Status
Plano somente. Nao executar implementacao ate sua autorizacao explicita.

## 1) Objetivo
Entregar, de forma incremental e com blindagem de regressao:
1. Nome do assistente por instancia de WhatsApp (nao mais nome global unico no uso principal).
2. Personalizacao por instancia com botao `Personalizar` para prompt da instancia.
3. Capacidade da IA atribuir contato para:
   - outro vendedor especifico;
   - outra IA (instancia) especifica.
4. Campos `Atribuir para` na Politica de Agendamento Automatico:
   - abaixo de `Dias minimos para ligacao`;
   - abaixo de `Dias minimos para visita`;
   com possibilidade de vendedores diferentes ou iguais.
5. Preservar funcionamento atual de prompts/stages/DB sem sobrescrita indevida.

## 2) Nao negociaveis de seguranca
1. Zero mudanca destrutiva de schema (somente aditivo nesta entrega).
2. Nao alterar nem sobrescrever `ai_stage_config.prompt_override` existente dos agentes.
3. Prompt por instancia sera armazenado separado do prompt por etapa.
4. Fallback obrigatorio:
   - se configuracao por instancia estiver vazia/invalida, manter comportamento atual (nome global + prompt de etapa).
5. Cada etapa de implementacao so avanca com smoke verde.
6. Se algum smoke falhar:
   - bloquear avancar;
   - corrigir;
   - rerodar smoke da etapa e bateria final.

## 3) Mapa tecnico atual (base real do codigo)
1. UI principal da aba IA:
   - `src/components/solarzap/AIAgentsView.tsx`
2. Persistencia de settings IA:
   - `src/hooks/useAISettings.ts`
   - `src/types/ai.ts`
3. Instancias WhatsApp:
   - `src/hooks/useUserWhatsAppInstances.ts`
4. Runtime da IA (prompt + acoes):
   - `supabase/functions/ai-pipeline-agent/index.ts`
5. Atribuicao existente para vendedor (manual):
   - `src/components/solarzap/AssignMemberSelect.tsx`
   - `src/hooks/domain/useLeads.ts` (campo `assigned_to_user_id`)
6. Agendamentos e responsavel:
   - `supabase/functions/ai-pipeline-agent/index.ts` (create appointment usa `user_id`)
   - `src/hooks/useAppointments.ts` (ja suporta `user_id` responsavel)

## 4) Estrategia de dados (aditiva e retrocompativel)

### 4.1 Novas colunas em `whatsapp_instances` (perfil da IA por instancia)
1. `assistant_identity_name text null`
2. `assistant_prompt_override text null`
3. `assistant_prompt_override_version integer not null default 0`
4. `assistant_prompt_updated_at timestamptz null`

Observacao: manter tudo opcional para nao quebrar instancias antigas.

### 4.2 Novas colunas em `ai_settings` (Atribuir para em auto-agendamento)
1. `auto_schedule_call_assign_to_user_id uuid null references auth.users(id) on delete set null`
2. `auto_schedule_visit_assign_to_user_id uuid null references auth.users(id) on delete set null`

### 4.3 Validacao de integridade
1. Trigger/funcao para garantir que os dois `*_assign_to_user_id` pertencem a `organization_members` da mesma `org_id`.
2. Trigger de guarda de prompt por instancia (mesma politica de bloqueio de padroes perigosos usada em prompt override de etapa).

### 4.4 Compatibilidade
1. Nao remover `assistant_identity_name` global de `ai_settings`.
2. Runtime:
   - primeiro tenta configuracao por instancia;
   - se ausente, usa global atual.

## 5) Desenho funcional alvo

### 5.1 Unificacao visual de Nome + Instancias
1. Substituir os 2 cards atuais por 1 area unica por linha de instancia:
   - Identificacao da instancia (display_name/status);
   - campo `Nome do assistente` daquela instancia;
   - botao `Personalizar` (abre editor de prompt da instancia);
   - switch IA da instancia;
   - botao `Religar todos`.
2. Nome global permanece apenas como fallback tecnico (nao fluxo principal da tela).

### 5.2 Personalizar por instancia
1. Cada instancia tera prompt proprio.
2. O prompt da instancia nao substitui prompt de etapa:
   - ele entra como camada adicional de persona/roteamento.
3. Exemplo suportado: Instancia Joao (vendas) com instrucao para transferir para Maria (pos-venda).

### 5.3 IA atribuir para outra IA ou vendedor
1. Extender contrato de saida JSON da IA com bloco opcional de handoff/atribuicao.
2. Aplicar side effect validado:
   - vendedor: atualizar `leads.assigned_to_user_id`;
   - outra IA: atualizar `leads.instance_name` (somente com alvo valido da org).
3. Registrar auditoria em `ai_action_logs`.
4. Se invalido/ambiguo: ignorar acao de atribuicao, registrar log, manter conversa sem quebra.

### 5.4 Politica de Agendamento Automatico com Atribuir para
1. Campo `Atribuir para` em ligacao.
2. Campo `Atribuir para` em visita.
3. Runtime de agendamento automatico:
   - se tipo `call`, usar `auto_schedule_call_assign_to_user_id` quando valido;
   - se tipo `visit`, usar `auto_schedule_visit_assign_to_user_id` quando valido;
   - fallback: `lead.assigned_to_user_id` e depois `lead.user_id`.

## 6) Plano incremental por etapa (com smoke obrigatorio por etapa)

### Etapa 0 - Baseline e snapshot de seguranca
Acoes:
1. Capturar snapshot pre-mudanca (somente leitura) de:
   - `ai_settings` (campos atuais);
   - `whatsapp_instances`;
   - `ai_stage_config` (prompt_override e versoes).
2. Documentar baseline.

Smoke da etapa 0:
1. `npm run typecheck`
2. `npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line`
3. `npx playwright test tests/e2e/m7_2-ai-settings-write.spec.ts --reporter=line`
4. `npx playwright test tests/e2e/p0-instance-activate-all-sync.spec.ts --reporter=line`

Criterio de saida:
1. Baseline aprovado ou falhas pre-existentes documentadas.

### Etapa 1 - Schema aditivo + guard rails SQL
Acoes:
1. Criar migration nova em `supabase/migrations/` com:
   - colunas novas em `whatsapp_instances`;
   - colunas novas em `ai_settings`;
   - trigger de validacao de assignee por org;
   - trigger de guarda do prompt por instancia.
2. Garantir idempotencia (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`).

Smoke da etapa 1:
1. Validacao SQL local/remota da migration.
2. `npm run typecheck`
3. `pwsh -File scripts/smoke_test_final.ps1` (modo disponivel no ambiente).

Criterio de saida:
1. Migration aplica sem alterar comportamento existente.

### Etapa 2 - Tipos e hooks (sem mudar runtime ainda)
Acoes:
1. Atualizar tipos:
   - `src/types/ai.ts`
   - `src/hooks/useUserWhatsAppInstances.ts` (interface de instancia)
2. Expandir `useAISettings` para normalizar/persistir novos campos de assignee.
3. Adicionar metodos de update de perfil IA por instancia (nome/prompt/version).
4. Implementar controle de conflito otimista (versionamento por instancia).

Smoke da etapa 2:
1. `npm run typecheck`
2. `npm run test:unit`
3. `npx playwright test tests/e2e/m7_2-ai-settings-write.spec.ts --reporter=line`

Criterio de saida:
1. Persistencia nova pronta sem impacto visual.

### Etapa 3 - UI da aba IA (merge das duas areas + Personalizar por instancia)
Acoes:
1. Refatorar `AIAgentsView.tsx`:
   - unificar Nome + Instancias em um bloco por instancia;
   - remover dependencia do save bar global para esse trecho;
   - criar acao `Personalizar` por linha de instancia;
   - manter toggle de instancia e `Religar todos`.
2. Inserir os dois selects de `Atribuir para` no card de Politica de Agendamento Automatico.
3. Carregar vendedores via `listMembers` (mesmo padrao usado em outras telas).

Smoke da etapa 3:
1. `npm run typecheck`
2. `npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line`
3. `npx playwright test tests/e2e/p0-instance-activate-all-sync.spec.ts --reporter=line`
4. Novo e2e: persistencia de nome/prompt por instancia (criar e executar).
5. Novo e2e: persistencia de `Atribuir para` call/visit (criar e executar).

Criterio de saida:
1. UI nova funcional sem perda de recursos existentes.

### Etapa 4 - Runtime da IA: persona por instancia + atribuicao automatica
Acoes:
1. Em `ai-pipeline-agent`:
   - carregar perfil da instancia atual;
   - compor `effectiveAssistantName` e bloco de prompt da instancia;
   - manter fallback global.
2. Atualizar create appointment automatico para usar assignee configurado por tipo.
3. Extender contrato JSON da IA para handoff/atribuicao:
   - validar alvo;
   - aplicar update no lead;
   - auditar em log.
4. Blindagem de compatibilidade para schema antigo:
   - se coluna ausente, fallback sem quebrar execucao.

Smoke da etapa 4:
1. `npm run typecheck`
2. `npm run test:unit tests/unit/pipelineAgentJobsContract.test.ts`
3. `pwsh -File scripts/smoke_test_final.ps1`
4. Smoke funcional novo de handoff:
   - cenarios vendedor e instancia;
   - validar update em `leads` + log em `ai_action_logs`.

Criterio de saida:
1. Runtime usa configuracao por instancia e faz atribuicao segura.

### Etapa 5 - Endurecimento final e regressao cruzada
Acoes:
1. Revisar diffs para garantir que nao houve alteracao acidental em:
   - prompts de etapa;
   - fluxo de follow_up;
   - funcoes nao relacionadas.
2. Ajustar testes de contrato/string caso necessario.
3. Revisar performance basica do runtime (queries extras por execucao).

Smoke da etapa 5:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:unit`
5. `npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line`
6. `npx playwright test tests/e2e/m7_2-ai-settings-write.spec.ts --reporter=line`
7. `npx playwright test tests/e2e/p0-ia-stage-config-smoke.spec.ts --reporter=line`
8. `npx playwright test tests/e2e/prompt-versioning.spec.ts --reporter=line`
9. `npx playwright test tests/e2e/p0-instance-activate-all-sync.spec.ts --reporter=line`
10. `npx playwright test tests/e2e/p0-conversation-instance-switch-smoke.spec.ts --reporter=line`
11. `pwsh -File scripts/smoke_test_final.ps1`

Criterio de saida:
1. Bateria final verde.

## 7) Regras anti-sobrescrita de prompt (critico)
1. Nunca escrever prompt de instancia em `ai_stage_config.prompt_override`.
2. Nunca atualizar prompt de etapa ao salvar personalizacao por instancia.
3. Sempre incrementar versao do prompt por instancia somente ao salvar naquele registro.
4. Restaurar prompt da instancia limpa apenas `assistant_prompt_override` da instancia (nao encosta em prompt de etapa).

## 8) Riscos e mitigacoes
1. Risco: conflito entre prompt da instancia e prompt da etapa.
   - Mitigacao: precedencia explicita no system prompt e bloco de limites (compliance/stage sempre acima de estilo).
2. Risco: atribuicao para usuario de outra org.
   - Mitigacao: trigger SQL + validacao runtime antes de update.
3. Risco: atribuicao de instancia invalida.
   - Mitigacao: validar existencia/org/is_active/ai_enabled antes de aplicar.
4. Risco: regressao silenciosa em agendamento.
   - Mitigacao: smoke dedicado de `create_appointment` com call/visit e assert de `appointments.user_id`.
5. Risco: sobrescrita concorrente de prompt por dois admins.
   - Mitigacao: controle de versao otimista e mensagem de conflito com reload.

## 9) Rollback seguro
1. Frontend:
   - rollback do deploy do app para tag anterior.
2. Edge Function:
   - re-deploy da versao anterior de `ai-pipeline-agent`.
3. Dados:
   - como schema e aditivo, rollback funcional pode apenas ignorar colunas novas.
   - se necessario, restaurar valores via snapshot capturado na Etapa 0.

## 10) Deploy Supabase (somente no final e se necessario)
1. Aplicar migration nova (DB) apenas apos todos os testes locais/staging.
2. Deploy de function somente se `ai-pipeline-agent` mudar.
3. Pos deploy:
   - rerodar `scripts/smoke_test_final.ps1`;
   - rerodar e2e criticos da IA.
4. Nao versionar credenciais no repositorio; usar variaveis de ambiente/sessao.

## 11) Checklist de aceite final
1. Cada instancia exibe e salva seu proprio nome de assistente.
2. Cada instancia aceita prompt personalizado via `Personalizar`.
3. Prompt de etapa existente permanece intacto.
4. IA consegue atribuir para vendedor especifico.
5. IA consegue atribuir para outra IA (instancia) de forma validada.
6. Politica de agendamento mostra e persiste `Atribuir para` em ligacao e visita.
7. Agendamento automatico grava `appointments.user_id` conforme configurado.
8. Bateria de smoke por etapa + bateria final completa sem falhas.
