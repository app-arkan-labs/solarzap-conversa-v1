# Auditoria Emergencial do App SolarZap Conversa

Data da auditoria: 2026-02-19
Escopo: frontend React, hooks de dominio, edge functions, schema/migrations, estado atual do banco remoto e testes E2E prioritarios.

## 1) Metodologia usada

- Analise estatica dos modulos criticos: IA, automacoes/pipeline, dashboard, proposta.
- Auditoria de dados no banco remoto via SQL (contagens por org e consistencia de configuracoes).
- Execucao de gates rapidos:
  - `npx tsc --noEmit` -> PASS
  - `npx playwright test tests/e2e/m7_2-ai-settings-write.spec.ts` -> PASS
  - `npx playwright test tests/e2e/proposal-smoke.spec.ts` -> FAIL (teste desatualizado para schema org_id obrigatorio)

Evidencias geradas em: `_deploy_tmp/audit_live/`.

## 2) Funcionalidades existentes hoje (estado real)

- Conversas: chat, envio de texto/arquivo/audio/reacao, painel de acoes, takeover de IA.
- Pipeline: kanban com drag/drop, acao rapida por lead, modais de ligacao/proposta/agendamento.
- Calendario: agendamentos via `appointments`.
- Contatos: CRUD de lead, import/export.
- Dashboard: KPIs comerciais, funil, performance e agenda + bloco adicional de metricas de proposta.
- Integracoes: instancias WhatsApp (criar/conectar/desconectar/IA por instancia).
- Automacoes: configuracao local (localStorage por org) de gatilhos e mensagens.
- IA (aba Inteligencia Artificial): chave mestre, nome do assistente, IA por instancia, edicao de prompt por etapa.
- Banco de dados (knowledge base): gestao de conteudo para IA.
- Admin Equipe: membros, papeis e permissoes (owner/admin).

## 3) Achados principais (ordenado por severidade)

### CRITICO 1: Aba de IA “vazia” para a org principal por ausencia de `ai_stage_config`

Evidencia de banco:
- Org principal (`rodrigosenafernandes@gmail.com`) com 74 leads possui `ai_stage_rows = 0`.
- So 1 org no banco possui 19 etapas configuradas em `ai_stage_config`.

Arquivos/evidencias:
- `_deploy_tmp/audit_live/q6_org_email_leads_ai_result.txt`
- `_deploy_tmp/audit_live/q4_lead_org_vs_ai_result.txt`
- `_deploy_tmp/audit_live/q3_ai_stage_by_org_result.txt`

Causa-raiz:
- Na remediacao M7, linhas com `org_id` nulo em `ai_stage_config` foram forçadas para uma unica org fallback (owner primario), sem clone por organizacao.
- Isso aparece explicitamente em `_deploy_tmp/m7_fix_nulls.sql` no bloco `fallback_primary_owner`.

Impacto:
- Prompts por etapa e configuracoes do agente nao aparecem para a org que opera os leads.
- IA fica com comportamento fallback generico em vez de prompt por etapa.

### CRITICO 2: Fluxo de ligacao mudou e bloqueia automacao se nao concluir TODOS os passos

Arquivos:
- `src/components/solarzap/CallConfirmModal.tsx:19`
- `src/components/solarzap/CallConfirmModal.tsx:101`
- `src/components/solarzap/CallConfirmModal.tsx:303`

Causa-raiz:
- O fluxo agora e: `method -> qr -> confirm -> feedback`.
- O lead so muda de etapa quando o usuario preenche feedback e clica `Enviar`.
- Clicar apenas `Sim, Realizei` nao move etapa.

Impacto:
- Na pratica parece que “botao de ligacao nao funciona”.
- Sem move para `chamada_realizada`, nao encadeia para `aguardando_proposta`/geracao de proposta.

### ALTO 3: Motor de automacao duplicado (PipelineView + SolarZapLayout)

Arquivos:
- `src/components/solarzap/PipelineView.tsx:84`
- `src/components/solarzap/PipelineView.tsx:203`
- `src/components/solarzap/PipelineView.tsx:907`
- `src/components/solarzap/SolarZapLayout.tsx:416`
- `src/components/solarzap/SolarZapLayout.tsx:881`

Causa-raiz:
- Existem dois fluxos de modal/automacao ativos ao mesmo tempo.
- `SolarZapLayout` centraliza automacao, mas `PipelineView` ainda executa automacoes locais.

Impacto:
- Competicao de estado, duplicidade de modal e comportamento inconsistente entre caminhos de acao.

### ALTO 4: Dashboard contaminado por bloco de proposta (mudanca local)

Arquivos:
- `src/components/solarzap/DashboardView.tsx:14`
- `src/components/solarzap/DashboardView.tsx:193`
- `src/hooks/useProposalMetrics.ts:39`

Causa-raiz:
- Foi acoplado ao dashboard um card inteiro de “Propostas no periodo” com novo hook.
- Esta exatamente alinhado ao sintoma relatado de “aparecendo coisas da proposta que nao deveriam estar la”.

Impacto:
- Mistura de escopo no dashboard operacional/comercial.
- Polui leitura para times que nao querem telemetria do gerador de proposta nesse painel.

### ALTO 5: Exposicao de segredos sensiveis no repositório

Arquivos:
- `scripts/check_db_status.js:4`
- `scripts/m0_run_sql.mjs:7`
- `run_db_query.bat:2`
- `scripts/update_stage_prompts.ts:7`

Causa-raiz:
- Chaves de service role/tokens administrativos hardcoded em scripts versionados.

Impacto:
- Risco severo de seguranca e controle do ambiente.

### MEDIO 6: Testes e scripts importantes desatualizados para modelo org-aware

Evidencias:
- `tests/e2e/proposal-smoke.spec.ts` falha ao inserir lead sem `org_id`.
- `scripts/update_stage_prompts.ts` usa `onConflict: 'pipeline_stage'` e nao envia `org_id`.

Arquivos:
- `tests/e2e/proposal-smoke.spec.ts:61`
- `tests/e2e/proposal-smoke.spec.ts:73`
- `scripts/update_stage_prompts.ts:92`

Impacto:
- Gates falsos/instaveis e operacao manual arriscada de prompt.

### MEDIO 7: Inconsistencia funcional no menu de acoes do pipeline (regressoes locais)

Arquivos:
- `src/components/solarzap/PipelineView.tsx:753`
- `src/components/solarzap/PipelineView.tsx:177`
- `src/components/solarzap/PipelineView.tsx:800`

Causa-raiz:
- Acao “Ver Conversa” chama `handleQuickAction('conversation', ...)`, mas esse case nao existe.
- Acao “Excluir Lead” no dropdown chama delete direto e ignora fluxo de confirmacao.

Impacto:
- Botoes que aparentam disponiveis, mas sem efeito esperado (ou com efeito destrutivo sem confirmacao).

### MEDIO 8: Dados de stage inconsistentes no banco afetam leitura analitica

Evidencias:
- Na org principal existem valores mistos: `Novo Lead` e `novo_lead`.
- Dashboard agrega `status_pipeline` sem normalizacao.

Arquivos/evidencias:
- `_deploy_tmp/audit_live/q7c_org70_stage_distribution_result.txt`
- `src/hooks/useDashboardReport.ts:203`

Impacto:
- Funil pode ficar quebrado/duplicado por label sem padronizacao.

## 4) Relacao direta com os sintomas reportados

- “IA nao aparece / defasada”: confirmado por falta de `ai_stage_config` na org operacional + tela IA sem cobertura dos novos modulos de proposta.
- “Automacoes pararam na ligacao”: confirmado por alteracao de UX/fluxo (agora depende de feedback obrigatorio) + duplicidade de motores de automacao.
- “Dashboard com coisas de proposta”: confirmado por introducao do bloco de metricas de proposta no proprio `DashboardView`.

## 5) Plano de correcao imediato (P0)

1. Corrigir dados de IA por org (reseed de `ai_stage_config`) para a org ativa de producao.
2. Desacoplar fluxo duplicado: manter automacao somente no `SolarZapLayout` ou somente no `PipelineView` (um unico orquestrador).
3. Ajustar `CallConfirmModal` para mover etapa ao confirmar ligacao (feedback opcional ou pos-etapa).
4. Remover/feature-flag do bloco de proposta no dashboard principal.
5. Revogar e rotacionar imediatamente todas as credenciais expostas em scripts.
6. Atualizar testes/scripts para exigir `org_id` e membership em seed.

## 6) Estado de risco atual

Classificacao geral: ALTO.

Motivos:
- Quebra funcional em fluxos centrais (IA por etapa e ligacao->proposta).
- Divergencia entre UX e comportamento real.
- Exposicao de segredos em repositorio.
