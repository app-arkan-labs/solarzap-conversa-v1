# Plano de Acao Detalhado - Dashboard Comercial com Funil Completo (2026-03-25)

## 0) Status
Plano somente. Nao executar implementacao ate sua autorizacao explicita.

## 1) Objetivo
Evoluir a aba Dashboard para entregar uma leitura realmente util para:
1. dono do negocio, que precisa enxergar resultado, gargalos, agenda comercial e risco do funil;
2. vendedor, que precisa enxergar prioridade do dia, leads parados, proximos compromissos e sua propria conversao.

Sem perder os KPIs atuais, a nova Dashboard deve:
1. preservar os indicadores ja existentes no contrato atual;
2. ampliar a leitura do topo ao fundo do funil;
3. ser pratica, clara e objetiva;
4. respeitar escopo por periodo e por responsavel;
5. ser segura contra regressao funcional, visual e de dados.

## 2) Nao negociaveis
1. Nao remover os KPIs atuais ja calculados em `useDashboardReport`.
2. Nao reintroduzir bloco de proposta dentro da Dashboard principal.
3. Nao quebrar filtros atuais de periodo, exportacao, `leadScope` e `LossAnalyticsModal`.
4. Toda nova metrica deve respeitar:
   - `org_id`;
   - intervalo de datas;
   - escopo do responsavel (`mine`, `org_all`, `user:<id>`).
5. Todo agregado de etapa deve usar etapa canonica/normalizada, nunca labels livres.
6. Toda mudanca de UI deve continuar responsiva em desktop e mobile.
7. Toda entrega deve ser aditiva e comparavel com o baseline atual.

## 3) Diagnostico atual (base real do codigo)
1. A tela atual renderiza basicamente:
   - hero de lucro;
   - cards de margem, faturamento, ticket medio e ciclo medio;
   - um grafico financeiro;
   - tabela de performance por responsavel;
   - tabela de leads estagnados;
   - modal de analise de perdas.
2. O hook principal `src/hooks/useDashboardReport.ts` ja calcula mais do que a UI mostra:
   - leads;
   - conversao;
   - faturamento;
   - lucro;
   - ticket medio;
   - ciclo medio;
   - forecast;
   - performance por responsavel.
3. O tipo `src/types/dashboard.ts` ainda carrega bloco `calendar`, mas a Dashboard atual nao usa esse painel.
4. Existe um componente pronto `src/components/dashboard/tables/CalendarSummaryPanel.tsx`, hoje orfao na tela.
5. Existe uma Edge Function `supabase/functions/reports-dashboard/index.ts` com `funnel_counts` e resumo de agenda, mas a tela atual nao usa esse contrato.
6. Hoje existem duas fontes de verdade desalinhadas para dashboard:
   - `useDashboardReport` no frontend;
   - `reports-dashboard` no backend.
7. A Dashboard esta excessivamente puxada para financeiro e leitura retrospectiva.
8. Falta visao clara de:
   - funil completo por etapa;
   - gargalo por etapa;
   - agenda comercial;
   - no-show/cancelamento;
   - perdas estruturadas em destaque;
   - prioridades operacionais do vendedor.
9. A tabela de performance por responsavel omite justamente campos importantes para leitura comercial:
   - volume de leads;
   - conversao;
   - comparacao entre volume e receita.
10. A tabela de leads estagnados tem coluna de "ultima interacao", mas hoje o payload nao a preenche.
11. A Dashboard atual nao aproveita fontes valiosas que ja existem no sistema:
   - `lead_stage_history`;
   - `appointments`;
   - `perdas_leads` / `motivos_perda`;
   - `conversion_events`;
   - `lead_tasks` (potencial futuro);
   - `interacoes.read_at` (potencial futuro).

## 4) O que o dono do negocio precisa ver em 30 segundos
1. Quantos leads entraram e quantos avancaram no funil no periodo.
2. Onde o funil esta travando.
3. Quanto virou faturamento, lucro e forecast.
4. Quais canais trazem mais volume e quais trazem mais venda.
5. Quem da equipe esta performando melhor e quem precisa de apoio.
6. Quantas perdas aconteceram e por qual motivo.
7. Como esta a agenda comercial:
   - agendados;
   - realizados;
   - cancelados;
   - no-show.

## 5) O que o vendedor precisa ver em 30 segundos
1. Quantos leads novos cairam para ele no periodo.
2. Quantos leads estao parados e ha quantos dias.
3. Quais compromissos ele tem hoje e nos proximos dias.
4. Em quais etapas ele mais trava.
5. Sua propria conversao, ticket e ritmo de fechamento.
6. Quais leads merecem acao imediata:
   - estagnados;
   - no-show;
   - follow-up aberto;
   - tarefa vencida (fase opcional).

## 6) Fontes de dados ja disponiveis e prontidao

| Fonte | Ja existe | Uso recomendado na Dashboard | Prontidao |
|---|---|---|---|
| `leads` | Sim | volume de leads, origem, etapa atual, aging, distribuicao do funil | Alta |
| `deals` | Sim | vendas ganhas, forecast, ticket, ciclo, receita por responsavel | Alta |
| `lead_sale_installments` | Sim | modo financeiro por caixa realizado/lucro realizado | Alta |
| `lead_stage_history` | Sim | avancos por etapa, gargalo, tempo medio por etapa, taxa entre etapas | Alta |
| `appointments` | Sim | agenda, realizados, cancelados, no-show, proximos compromissos | Alta |
| `perdas_leads` + `motivos_perda` | Sim | perdas por motivo, mitigacao, ranking de perdas | Alta |
| `conversion_events` | Sim | milestones do funil e leitura de conversao por macro etapa | Media |
| `lead_tasks` | Sim | fila de tarefas/follow-ups vencidos e abertos | Media |
| `interacoes` + `read_at` | Sim | resposta pendente, unread, SLA de retorno | Media |

## 7) Gaps reais da Dashboard atual
1. Falta contexto de topo de funil.
   - O usuario ve lucro e faturamento, mas nao enxerga claramente entrada, avancos e perdas do funil.
2. Falta leitura de meio de funil.
   - Nao fica claro quantos leads estao em `respondeu`, `chamada_agendada`, `visita_agendada`, `proposta_pronta`, `negociacao`, `financiamento` e afins.
3. Falta leitura de fundo de funil.
   - O hook calcula venda/forecast, mas a UI nao conecta isso com as etapas finais do pipeline.
4. Falta leitura operacional.
   - O vendedor nao ve agenda de hoje, no-show, follow-up ou tarefas.
5. Falta leitura de perda.
   - O modal de perdas existe, mas a tela principal nao destaca o problema sem depender de clique extra.
6. Falta leitura de qualidade por canal.
   - Existe origem de leads e vendas por origem, mas a tela nao ajuda a responder "qual canal da volume" vs "qual canal fecha".
7. Falta leitura comparativa de equipe.
   - A tabela atual privilegia receita, mas nao explica volume, conversao e produtividade de cada responsavel.
8. Falta coerencia de contrato de dados.
   - O frontend tem um payload, a Edge Function tem outro, e isso aumenta o risco de regressao.

## 8) Estrutura alvo recomendada para a nova Dashboard

### 8.1 Faixa 1 - KPIs preservados e reorganizados
Manter todos os KPIs atuais, mas reorganizar em uma faixa unica e mais clara:
1. Leads
2. Conversao
3. Faturamento
4. Lucro
5. Margem
6. Ticket medio
7. Ciclo medio
8. Forecast

Regra:
1. Os KPIs atuais nao somem.
2. O hero deixa de carregar sozinho a importancia da tela.
3. O usuario entende negocio primeiro, sem perder eficiencia visual.

### 8.2 Faixa 2 - Funil completo
Novo bloco com leitura do funil por etapa e por macrogrupo:
1. Topo:
   - `novo_lead`
   - `respondeu`
2. Meio:
   - `chamada_agendada`
   - `chamada_realizada`
   - `visita_agendada`
   - `visita_realizada`
   - `aguardando_proposta`
   - `proposta_pronta`
   - `proposta_negociacao`
3. Fundo:
   - `financiamento`
   - `aprovou_projeto`
   - `contrato_assinado`
   - `projeto_pago`
   - `aguardando_instalacao`
   - `projeto_instalado`
4. Saidas:
   - `perdido`
   - `contato_futuro`

O bloco deve mostrar:
1. volume por etapa;
2. percentual sobre o total do funil;
3. destaque de gargalo;
4. quantidade de leads parados acima do SLA da etapa.

### 8.3 Faixa 3 - Centro de acao do vendedor
Bloco pratico para acao imediata:
1. Leads estagnados.
2. Agendamentos de hoje e proximos 7 dias.
3. No-shows e cancelamentos do periodo.
4. Follow-ups/tarefas vencidas.

Observacao:
1. `lead_tasks` e SLA de resposta via `interacoes` entram como fase 2 opcional, somente apos validacao de qualidade de dados.

### 8.4 Faixa 4 - Performance por responsavel
Expandir a tabela atual para incluir:
1. leads recebidos no periodo;
2. vendas fechadas;
3. conversao;
4. faturamento;
5. lucro;
6. margem;
7. ticket medio.

Regra:
1. Owner/admin enxerga a equipe.
2. Vendedor comum enxerga somente sua propria linha ou uma versao resumida pessoal.

### 8.5 Faixa 5 - Canais e origem
Transformar origem em bloco realmente util:
1. leads por origem;
2. vendas por origem;
3. taxa de conversao por origem;
4. receita por origem.

Isso responde duas perguntas diferentes:
1. qual canal enche o funil;
2. qual canal fecha negocio.

### 8.6 Faixa 6 - Agenda e perdas
Reaproveitar o que ja existe no produto:
1. `CalendarSummaryPanel` na propria Dashboard;
2. resumo de perdas em destaque;
3. CTA para abrir `LossAnalyticsModal`.

O bloco de perdas na tela principal deve mostrar:
1. perdas do periodo;
2. principal motivo;
3. participacao do principal motivo;
4. tendencia vs periodo anterior.

## 9) Recomendacao de arquitetura para reduzir regressao
1. Nao ligar a tela diretamente na Edge Function `reports-dashboard` nesta primeira evolucao.
2. Tornar `src/hooks/useDashboardReport.ts` a fonte principal de verdade do frontend nesta entrega.
3. Expandir `src/types/dashboard.ts` de forma aditiva.
4. Levar a Edge Function para um de dois caminhos, mas nao misturar agora:
   - ou alinhar com o novo contrato depois;
   - ou marcar como legado e remover uso futuro.
5. Antes de mudar a UI, congelar um contrato comparavel entre:
   - KPIs antigos;
   - KPIs novos;
   - escopo por owner;
   - modo financeiro por recebimento (`finance_project_paid_v1`).

Motivo:
1. Hoje a maior fonte de risco nao e falta de dado.
2. E divergencia de contrato e ampliacao de tela sem baseline.

## 10) Plano detalhado por etapa (a prova de regressao)

### Etapa 0 - Baseline e congelamento do contrato atual
Acoes:
1. Documentar o payload atual retornado por `useDashboardReport`.
2. Fotografar o baseline da Dashboard com:
   - owner em `mine`;
   - owner em `org_all`;
   - vendedor comum;
   - periodo vazio;
   - periodo com dados.
3. Congelar quais KPIs sao "originais" e nao podem variar:
   - leads;
   - conversao;
   - faturamento;
   - lucro;
   - ticket medio;
   - ciclo medio;
   - forecast.
4. Confirmar a regra de default de escopo:
   - manter `mine` por seguranca nesta primeira entrega.

Arquivos foco:
1. `src/hooks/useDashboardReport.ts`
2. `src/types/dashboard.ts`
3. `src/components/solarzap/DashboardView.tsx`

Smoke da etapa 0:
1. `npm run typecheck`
2. `npm run build`
3. `npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line`

Criterio de saida:
1. Existe baseline funcional e visual para comparar toda a evolucao.

### Etapa 1 - Unificar e endurecer o contrato de dados
Acoes:
1. Expandir `DashboardPayload` de forma aditiva com novos blocos:
   - `funnel`;
   - `agenda_health`;
   - `loss_summary`;
   - `source_performance`.
2. Manter chaves antigas intactas.
3. Criar helper unico de normalizacao de etapa para dashboard.
4. Adicionar testes unitarios de contrato para impedir quebra silenciosa.

Arquivos foco:
1. `src/types/dashboard.ts`
2. `src/hooks/useDashboardReport.ts`
3. `tests/unit/dashboard/dashboard-contract.test.ts` [NOVO]
4. `tests/unit/dashboard/dashboard-stage-normalization.test.ts` [NOVO]

Smoke da etapa 1:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/dashboard/dashboard-contract.test.ts tests/unit/dashboard/dashboard-stage-normalization.test.ts`

Criterio de saida:
1. O contrato suporta o novo painel sem quebrar o antigo.

### Etapa 2 - Enriquecer o hook com funil, agenda e perdas
Acoes:
1. Reaproveitar `leads` para funil atual por etapa.
2. Reaproveitar `lead_stage_history` para:
   - avancos por etapa;
   - tempo medio por etapa;
   - gargalos.
3. Reaproveitar `appointments` para:
   - total;
   - realizados;
   - cancelados;
   - no-show;
   - proximos compromissos.
4. Reaproveitar `perdas_leads` e `motivos_perda` para bloco resumido de perdas.
5. Enriquecer performance por responsavel com volume de leads e conversao.
6. Enriquecer bloco por origem com conversao e receita por origem.
7. Manter a UI antiga ainda intacta enquanto os dados novos entram por tras.

Arquivos foco:
1. `src/hooks/useDashboardReport.ts`
2. `src/types/dashboard.ts`
3. `tests/unit/dashboard/dashboard-report-calculations.test.ts` [NOVO]

Smoke da etapa 2:
1. `npm run typecheck`
2. `npm run test:unit -- tests/unit/dashboard/dashboard-report-calculations.test.ts`
3. `npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line`

Criterio de saida:
1. Os novos dados existem no payload.
2. Os KPIs antigos continuam identicos para o mesmo filtro.

### Etapa 3 - Refatorar a estrutura visual da Dashboard
Acoes:
1. Reorganizar `DashboardView` por faixas:
   - KPIs;
   - funil;
   - centro de acao;
   - performance;
   - canais;
   - agenda/perdas.
2. Preservar no topo:
   - filtro de periodo;
   - date range;
   - exportacao;
   - `LeadScopeSelect`;
   - botao de perdas.
3. Reaproveitar `CalendarSummaryPanel` dentro da tela.
4. Reduzir a dependencia de um unico hero oversized.
5. Garantir empty states claros para cada secao.

Arquivos foco:
1. `src/components/solarzap/DashboardView.tsx`
2. `src/components/dashboard/KpiCards.tsx`
3. `src/components/dashboard/DashboardCharts.tsx`
4. `src/components/dashboard/tables/CalendarSummaryPanel.tsx`
5. `src/components/dashboard/FunnelOverview.tsx` [NOVO]
6. `src/components/dashboard/ActionCenter.tsx` [NOVO]
7. `src/components/dashboard/LossSummaryCard.tsx` [NOVO]
8. `src/components/dashboard/SourcePerformanceCard.tsx` [NOVO]

Smoke da etapa 3:
1. `npm run typecheck`
2. `npm run build`
3. `npx playwright test tests/e2e/dashboard-layout.spec.ts --reporter=line` [NOVO]
4. `npx playwright test tests/e2e/dashboard-mobile.spec.ts --reporter=line` [NOVO]

Criterio de saida:
1. A nova tela fica mais rica sem perder objetividade.
2. Nao ha overflow critico no mobile.

### Etapa 4 - Tornar a Dashboard acionavel para vendedor e owner
Acoes:
1. Melhorar `OwnerPerformanceTable` para exibir mais contexto comercial.
2. Melhorar `StaleLeadsTable`:
   - manter foco em prioridade;
   - remover ou ajustar a coluna que hoje nao tem dado confiavel;
   - incluir CTA claro para pipeline/chat.
3. Adicionar bloco de agenda comercial.
4. Adicionar bloco resumido de perdas.
5. Se `canViewTeam = false`, mostrar leitura focada no proprio vendedor.

Arquivos foco:
1. `src/components/dashboard/tables/OwnerPerformanceTable.tsx`
2. `src/components/dashboard/tables/StaleLeadsTable.tsx`
3. `src/components/solarzap/DashboardView.tsx`

Smoke da etapa 4:
1. `npm run typecheck`
2. `npx playwright test tests/e2e/dashboard-owner-scope.spec.ts --reporter=line` [NOVO]
3. `npx playwright test tests/e2e/dashboard-seller-focus.spec.ts --reporter=line` [NOVO]

Criterio de saida:
1. Owner e vendedor recebem leituras uteis, cada um dentro do seu escopo.

### Etapa 5 - Fase opcional de metricas avancadas
Entrar somente depois da V1 estar estabilizada.

Acoes:
1. Expor `lead_tasks` como fila de tarefas abertas e vencidas.
2. Expor sinais de `interacoes`:
   - unread;
   - resposta pendente;
   - SLA de retorno.
3. Expor `conversion_events` como drill-down de milestones por campanha/origem, se o time realmente precisar disso na Dashboard principal.

Regra:
1. Se a qualidade/consistencia desses dados nao estiver validada, esta fase nao entra na Dashboard V1.

Arquivos foco:
1. `src/hooks/useDashboardReport.ts`
2. componentes novos de fila operacional, se aprovados

Smoke da etapa 5:
1. `npm run typecheck`
2. testes unitarios especificos das novas metricas
3. smoke visual dedicado das novas secoes

Criterio de saida:
1. So entra o que tiver dado confiavel e leitura realmente util.

### Etapa 6 - Hardening final e rollout seguro
Acoes:
1. Revisar diff por whitelist de arquivos.
2. Comparar resultados antigos vs novos para os KPIs preservados.
3. Medir custo de query e tempo de carregamento da nova Dashboard.
4. Se necessario, ativar rollout por feature flag (`dashboard_full_funnel_v1`).
5. Atualizar documentacao interna da tela.

Arquivos foco:
1. `src/components/solarzap/DashboardView.tsx`
2. `src/hooks/useDashboardReport.ts`
3. `src/types/dashboard.ts`
4. testes unitarios e E2E

Smoke da etapa 6:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:unit`
5. `npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line`
6. `npx playwright test tests/e2e/dashboard-layout.spec.ts --reporter=line`
7. `npx playwright test tests/e2e/dashboard-owner-scope.spec.ts --reporter=line`
8. `npx playwright test tests/e2e/dashboard-mobile.spec.ts --reporter=line`

Criterio de saida:
1. A nova Dashboard entra com contrato estavel, sem regressao de permissao, sem regressao de KPI e sem regressao visual grave.

## 11) Riscos reais e mitigacoes
1. Risco: KPI novo mudar valor de KPI antigo por efeito colateral.
   - Mitigacao: snapshot e teste comparativo de KPI antigo vs novo para o mesmo periodo e escopo.
2. Risco: vazamento de dados de equipe para vendedor comum.
   - Mitigacao: manter e ampliar smoke de `leadScope` e `canViewTeam`.
3. Risco: agregacao por etapa quebrar por label historica inconsistente.
   - Mitigacao: normalizacao obrigatoria de etapa antes de agregar.
4. Risco: dashboard ficar pesada demais com mais queries.
   - Mitigacao: medir performance a cada etapa; se estourar, migrar agregacao para RPC/servidor em etapa separada.
5. Risco: mobile sofrer overflow com novos blocos.
   - Mitigacao: Playwright mobile + verificacao de scroll horizontal e cards compactos.
6. Risco: usar dados incompletos de `lead_tasks` ou `interacoes`.
   - Mitigacao: deixar como fase opcional apos validacao, nao como requisito da V1.
7. Risco: duplicar logica entre hook e Edge Function.
   - Mitigacao: nesta entrega, escolher um contrato principal e nao plugar dois backends ao mesmo tempo.

## 12) Bateria final obrigatoria (go/no-go)
1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:unit`
5. `npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line`
6. `npx playwright test tests/e2e/dashboard-layout.spec.ts --reporter=line`
7. `npx playwright test tests/e2e/dashboard-owner-scope.spec.ts --reporter=line`
8. `npx playwright test tests/e2e/dashboard-mobile.spec.ts --reporter=line`
9. smoke manual com:
   - owner em `mine`;
   - owner em `org_all`;
   - vendedor comum;
   - periodo sem dados;
   - periodo com dados e com perdas;
   - org com `finance_project_paid_v1` ligado;
   - org com `finance_project_paid_v1` desligado.

## 13) Criterios de aceite da nova Dashboard
1. O owner consegue responder, sem trocar de aba:
   - quanto entrou;
   - quanto avancou;
   - onde travou;
   - quem performou melhor;
   - por que esta perdendo;
   - como esta a agenda comercial.
2. O vendedor consegue responder, sem trocar de aba:
   - o que agir hoje;
   - quais leads estao frios;
   - quais compromissos tem em seguida;
   - como esta sua conversao.
3. Todos os KPIs originais seguem disponiveis.
4. Nenhum bloco de proposta volta para a Dashboard principal.
5. O painel continua claro e nao vira uma tela poluida de analytics.

## 14) Recomendacao pratica de priorizacao
Se quisermos maximizar impacto com baixo risco, a ordem ideal e:
1. primeiro: contrato de dados + funil + agenda + perdas;
2. depois: reorganizacao visual e centro de acao;
3. por ultimo: metricas avancadas de tarefas/interacoes.

Essa ordem entrega valor cedo, reaproveita o que ja existe no produto e evita inflar a primeira versao com dependencias menos maduras.
