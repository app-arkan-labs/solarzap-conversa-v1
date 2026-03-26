# Blueprint Operacional - Ultima Acao + Proxima Acao no SolarZap (2026-03-25)

## 0) Status
Blueprint somente.
Nao implementar sem sua autorizacao explicita.

## 1) Objetivo
Transformar a rotina manual de `Ultima Acao` + `Proxima Acao` em uma camada operacional nativa do SolarZap, com foco em:

1. clareza diaria para o vendedor;
2. visibilidade instantanea dentro da aba `Conversas`;
3. fila consolidada para o dia;
4. integracao natural com `Calendario`, sem forcar tudo a virar evento;
5. rollout incremental, reversivel e com risco minimo de regressao.

## 2) Decisao de Produto

### 2.1. Regra principal
Nao tratar isso como escolha entre "por lead" ou "painel geral".

O modelo correto para o SolarZap e:

1. `por lead`, porque o vendedor precisa ver a verdade operacional quando abre a conversa;
2. `fila consolidada`, porque o vendedor e o gestor precisam enxergar prioridade do dia;
3. `calendario`, apenas para compromissos com data/hora marcadas;
4. `modal diario`, no maximo como camada opcional e nao como mecanismo principal.

### 2.2. Decisao de UX
O centro da experiencia deve ser a aba `Conversas`.

Funcao de cada area:

1. `Conversas` = cockpit operacional do vendedor;
2. `ActionsPanel` = local de edicao completa;
3. `Calendario` = compromissos com horario;
4. `Dashboard` = fila e priorizacao;
5. `notificacao/modal leve` = lembrete opcional, nunca bloqueante.

### 2.3. Regra operacional central
Cada lead deve ter, no maximo, `1 Proxima Acao ativa`.

Essa decisao reduz ambiguidade, evita listas paralelas e cria disciplina.

## 3) Nao Negociaveis

1. A informacao tem que aparecer na cara do vendedor na aba `Conversas`.
2. `Proxima Acao` nao pode ficar escondida apenas em comentario interno ou apenas no calendario.
3. `Ultima Acao` e `Proxima Acao` precisam ser curtas, legiveis e operacionais.
4. O vendedor nao pode ser obrigado a abrir modal diario para trabalhar.
5. O fluxo atual de pipeline, follow-up, agendamentos, comentarios e IA nao pode quebrar.
6. Toda implementacao deve ser aditiva, preferencialmente atras de feature flag.
7. Nenhuma migration pode ser destrutiva.
8. Em mobile, a solucao precisa caber sem poluir o header do chat.
9. `Proxima Acao` manual do vendedor nao pode ser sobrescrita silenciosamente por tarefa da IA.
10. Owner/admin so podem ver fila do time respeitando o escopo atual de permissao.

## 4) Diagnostico Atual da Base Real

### 4.1. O que ja existe no codigo
1. A aba `Conversas` ja funciona como centro do dia a dia:
   - `src/components/solarzap/ChatArea.tsx`
   - `src/components/solarzap/ConversationList.tsx`
   - `src/components/solarzap/ActionsPanel.tsx`
2. O `ActionsPanel` ja e o lugar natural para gestao detalhada do lead:
   - dados do lead;
   - follow-up automatico;
   - observacoes;
   - acoes rapidas.
3. O `PipelineView` ja contem uma nocao de "proxima acao por etapa", mas hoje ela e apenas sugestao operacional:
   - `src/components/solarzap/PipelineView.tsx`
4. O `Calendario` ja suporta:
   - responsavel;
   - notas;
   - tipo de compromisso;
   - feedback de evento;
   - arquivamento.
5. O `Dashboard` ja possui:
   - `Leads estagnados`
   - `Agenda Comercial`
   - base para fila operacional futura
6. A tabela `lead_tasks` ja existe no banco e ja e usada pela IA para follow-up:
   - `supabase/migrations/20260212170200_lead_tasks.sql`
   - `supabase/functions/ai-pipeline-agent/index.ts`
7. A base ja possui padrao de fallback seguro para schema parcial em `useLeads`, usando meta JSON em `observacoes`:
   - `src/hooks/domain/useLeads.ts`

### 4.2. Onde esta o gap real
Hoje o SolarZap tem:

1. etapa do funil;
2. agenda;
3. follow-up da IA;
4. comentarios internos;
5. no-show e outcome de visita;

Mas nao tem uma camada explicita de `compromisso operacional do lead`.

Na pratica, falta responder com clareza:

1. o que foi a ultima acao relevante neste lead;
2. qual e a proxima acao combinada;
3. quando ela vence;
4. quem e o responsavel;
5. quais leads estao vencidos, hoje, proximos ou sem proxima acao.

### 4.3. Riscos identificados
1. Misturar tarefas humanas e tarefas da IA na mesma superficie visual.
2. Usar so comentarios livres e perder estrutura.
3. Usar so calendario e forcar evento para tudo.
4. Poluir o header da conversa no mobile.
5. Quebrar a visao de escopo do owner/admin em filas do time.
6. Criar duplicidade de tarefas abertas para o mesmo lead.

## 5) Solucao Alvo

### 5.1. Conceitos funcionais

#### `Ultima Acao`
Resumo curto do ultimo passo comercial relevante.

Exemplos:

1. `Ligacao realizada; cliente pediu retorno quinta 10h`
2. `Visita agendada para 28/03 as 15:00`
3. `Proposta apresentada; ficou de validar com a esposa`

#### `Proxima Acao`
Compromisso operacional ativo e singular do lead.

Exemplos:

1. `Retornar quinta 10:00`
2. `Cobrar documentos para financiamento`
3. `Confirmar visita de amanha`

#### `Fila do Dia`
Visao consolidada de `Proximas Acoes` agrupadas em:

1. `Vencidas`
2. `Hoje`
3. `Proximas`
4. `Sem proxima acao`

#### `Sugestao de Proxima Acao`
Recomendacao derivada da etapa do pipeline, sem persistir automaticamente.

Exemplo:

1. etapa `respondeu` sugere `Agendar chamada`
2. etapa `proposta_pronta` sugere `Apresentar proposta`

### 5.2. Superficies de UX

#### A) Faixa operacional dentro da conversa
Logo abaixo do header do chat, mostrar uma faixa compacta com:

1. `Ultima Acao`
2. `Proxima Acao`
3. prazo
4. status visual
5. CTA rapido

CTAs iniciais:

1. `Concluir`
2. `Reagendar`
3. `Editar`
4. `Criar proxima`

#### B) Painel lateral detalhado
No `ActionsPanel`, adicionar o editor completo de gestao operacional do lead:

1. resumo da `Ultima Acao`;
2. bloco da `Proxima Acao ativa`;
3. historico das ultimas acoes;
4. opcao de criar nova proxima acao;
5. opcao de concluir e ja definir a proxima.

#### C) Lista de conversas
Adicionar apenas um sinal visual sintetico, sem poluir:

1. chip `Vencida`
2. chip `Hoje 14:00`
3. chip `Amanha`
4. chip `Sem acao`

Nao mostrar descricao longa aqui.

#### D) Dashboard
Adicionar um bloco `Minha fila de hoje` para vendedor e `Fila do time` para owner/admin.

#### E) Calendario
Quando a `Proxima Acao` tiver data/hora e natureza de compromisso:

1. chamada
2. reuniao
3. visita
4. instalacao

ela pode ser vinculada a `appointments`.

Quando for apenas follow-up operacional sem horario fechado, ela continua apenas como tarefa.

### 5.3. Wireframe textual recomendado

```text
CHAT HEADER
[Nome do lead] [Etapa]

[Ultima Acao: Ligacao realizada; pediu retorno quinta]
[Proxima Acao: Retornar quinta 10:00] [Hoje/Vencida/Amanha]
[Concluir] [Reagendar] [Editar]

Mensagens...
```

```text
LISTA DE CONVERSAS
Maria Souza
Etapa: Proposta Pronta
Chip: Hoje 14:00
```

```text
ACTIONS PANEL
Status do lead
Follow-up automatico

Ultima Acao
Ligacao realizada; pediu retorno quinta

Proxima Acao
Retornar quinta 10:00
Responsavel: Joao
Canal: WhatsApp
Notas: validar decisor

[Concluir] [Editar] [Cancelar]
[Criar nova proxima acao]
Historico
```

## 6) Modelo de Dados Recomendado

### 6.1. Fonte de verdade recomendada
Usar `lead_tasks` como fonte principal da `Proxima Acao`.

Motivos:

1. a tabela ja existe;
2. o conceito de fila e historico encaixa naturalmente;
3. evita abusar de `comentarios_leads` para algo estruturado;
4. evita forcar tudo em `appointments`;
5. reduz o risco de criar tabela nova sem necessidade.

### 6.2. Estrategia recomendada de producao
Evoluir `lead_tasks` de forma aditiva para suportar a camada operacional humana.

Novas colunas recomendadas:

1. `task_kind text not null default 'generic'`
2. `completed_at timestamptz null`
3. `completed_by uuid null references auth.users(id) on delete set null`
4. `result_summary text null`
5. `linked_appointment_id uuid null references public.appointments(id) on delete set null`
6. `metadata jsonb not null default '{}'::jsonb`

Valores recomendados de `task_kind`:

1. `generic`
2. `next_action`
3. `follow_up_ai`
4. `system`

### 6.3. Indices e constraints recomendados

1. indice por `org_id, user_id, status, due_at`
2. indice por `lead_id, task_kind, status`
3. indice por `linked_appointment_id`
4. unique parcial para garantir apenas `1 next_action open` por lead

Exemplo de regra:

1. `UNIQUE (lead_id) WHERE status = 'open' AND task_kind = 'next_action'`

### 6.4. Papel das tabelas existentes

#### `lead_tasks`
Fonte principal de:

1. proxima acao ativa;
2. historico operacional;
3. fila do dia;
4. overdue/today/upcoming;
5. vinculo opcional com appointments.

#### `appointments`
Fonte principal de:

1. compromissos de agenda;
2. data/hora marcada;
3. outcome do compromisso.

#### `comentarios_leads`
Fonte secundaria e auditavel para:

1. registrar conclusao relevante;
2. espelhar resultado da acao;
3. preservar contexto humano.

#### `leads`
Continuam como fonte principal de:

1. etapa;
2. responsavel do lead;
3. dados cadastrais;
4. estado geral do relacionamento.

### 6.5. Fallback para ambientes legados
Nao usar `observacoes` como caminho principal de producao.

Se houver ambiente com schema incompleto:

1. manter a feature flag desligada;
2. ou adotar fallback tecnico temporario seguindo o padrao de meta JSON de `useLeads`;
3. nunca misturar isso como estrategia definitiva.

## 7) Regras de Negocio

### 7.1. Regra principal
Um lead pode ter apenas `1 Proxima Acao ativa`.

### 7.2. Criacao de proxima acao
Ao criar uma nova `Proxima Acao`:

1. se nao houver aberta, cria normalmente;
2. se houver aberta, o usuario deve escolher:
   - `substituir`
   - `reagendar`
   - `cancelar criacao`

### 7.3. Conclusao de proxima acao
Ao concluir:

1. o sistema exige um `resultado curto`;
2. esse resultado alimenta a `Ultima Acao`;
3. a tarefa muda para `done`;
4. opcionalmente o usuario ja define a nova `Proxima Acao`.

### 7.4. Cancelamento
Ao cancelar:

1. a tarefa vai para `canceled`;
2. nao vira `Ultima Acao` por padrao;
3. pode registrar comentario se houver contexto relevante.

### 7.5. Integracao com agendamento
Se a proxima acao virar compromisso com horario:

1. criar ou vincular `appointment`;
2. manter a task vinculada ao evento;
3. ao registrar outcome do evento, permitir:
   - concluir a task vinculada;
   - atualizar `Ultima Acao`;
   - criar a nova `Proxima Acao`.

### 7.6. Reatribuicao de lead
No MVP incremental:

1. a `Proxima Acao` nasce com o responsavel atual do lead;
2. se o lead for reatribuido depois, a task aberta nao muda silenciosamente;
3. o sistema apenas destaca divergencia entre:
   - responsavel do lead
   - responsavel da proxima acao

Motivo:

1. evita mudanca operacional silenciosa;
2. reduz risco de regressao;
3. permite endurecer a regra depois.

### 7.7. Convivencia com a IA
As tarefas da IA nao devem disputar superficie com as tarefas manuais do vendedor.

Regras:

1. tarefas da IA devem ficar marcadas como `follow_up_ai`;
2. a faixa principal da conversa mostra apenas `next_action` humana;
3. a IA pode sugerir proxima acao, mas nao assumir automaticamente o papel do vendedor;
4. o `FollowUpIndicator` existente continua independente.

### 7.8. Sugestao por etapa
Se nao houver `Proxima Acao` ativa:

1. mostrar `Sugestao de proxima acao` derivada da etapa;
2. usar o mapeamento ja existente em `PipelineView`;
3. nao persistir automaticamente.

## 8) Arquitetura de UX/UI

### 8.1. O que entra em cada tela

#### Conversas
Obrigatorio:

1. faixa operacional compacta no chat;
2. chip resumido na lista de conversas;
3. editor completo no painel lateral.

#### Calendario
Obrigatorio:

1. opcao de vincular agendamento a task operacional;
2. ao arquivar evento, permitir atualizar ultima/proxima acao.

#### Dashboard
Obrigatorio em fase posterior:

1. fila `Vencidas`
2. fila `Hoje`
3. fila `Sem proxima acao`

### 8.2. O que nao fazer

1. nao usar modal diario como fluxo principal;
2. nao exibir texto longo da ultima acao na lista de conversas;
3. nao forcar toda proxima acao a virar appointment;
4. nao esconder isso apenas em comentario interno;
5. nao misturar tarefa da IA e tarefa do vendedor no mesmo card principal.

### 8.3. Recomendacao de reminder
Se quiser lembrete diario:

1. usar banner leve, toast contextual ou card de resumo ao entrar;
2. opcional por usuario;
3. configuravel;
4. nunca bloqueante.

Nao recomendar modal obrigatorio 2x por dia como versao inicial.

## 9) Implementacao Incremental Recomendada

## Etapa 0 - Baseline e congelamento
Objetivo:
congelar o comportamento atual antes de tocar em dados e UI.

Acoes:

1. registrar baseline da aba `Conversas` desktop e mobile;
2. registrar baseline da `CalendarView`, `AppointmentModal` e `EventFeedbackModal`;
3. listar como `lead_tasks` esta sendo usada hoje pela IA;
4. criar feature flag `lead_next_action_v1` default `false`.

Smoke:

1. `npm run typecheck`
2. smoke da aba `Conversas`
3. smoke da aba `Calendario`

Saida:

1. baseline congelado;
2. flag criada;
3. zero mudanca visual para usuario final.

## Etapa 1 - Fundacao de dados escondida
Objetivo:
preparar base de dados sem expor UI nova.

Acoes:

1. migration aditiva em `lead_tasks`;
2. classificar tarefas da IA como `follow_up_ai`;
3. criar helper/hook dedicado, ex.: `useLeadTasks` ou `useLeadNextActions`;
4. mapear estados derivados:
   - `overdue`
   - `today`
   - `upcoming`
   - `none`
5. manter tudo atras da feature flag.

Arquivos alvo:

1. `supabase/migrations/...`
2. `src/types/solarzap.ts`
3. `src/hooks/useLeadTasks.ts` novo

Smoke:

1. `npm run typecheck`
2. `npm run test:unit`
3. validacao local da migration

Saida:

1. base pronta;
2. sem alteracao visivel em UX.

## Etapa 2 - MVP no painel lateral apenas
Objetivo:
validar a rotina sem poluir `ChatArea` ainda.

Acoes:

1. adicionar bloco `Ultima Acao / Proxima Acao` no `ActionsPanel`;
2. permitir criar, editar, concluir e cancelar `Proxima Acao`;
3. ao concluir, exigir `resultado curto`;
4. mostrar historico resumido das ultimas acoes;
5. ainda nao mostrar chip na lista de conversas.

Arquivos alvo:

1. `src/components/solarzap/ActionsPanel.tsx`
2. `src/components/solarzap/LeadActionEditor.tsx` novo
3. `src/components/solarzap/LeadActionHistoryModal.tsx` novo

Smoke:

1. criar proxima acao
2. editar
3. concluir
4. cancelar
5. validar que follow-up automatico continua intacto

Saida:

1. vendedor ja consegue operar manualmente;
2. risco de regressao visual ainda baixo.

## Etapa 3 - Superficie na aba Conversas
Objetivo:
levar a informacao para o lugar certo do fluxo diario.

Acoes:

1. adicionar faixa operacional abaixo do header em `ChatArea`;
2. adicionar chip resumido em `ConversationList`;
3. adicionar filtros operacionais simples na lista:
   - `Vencidas`
   - `Hoje`
   - `Sem acao`
4. preservar layout desktop e mobile.

Arquivos alvo:

1. `src/components/solarzap/ChatArea.tsx`
2. `src/components/solarzap/ConversationList.tsx`
3. `src/components/solarzap/LeadActionStrip.tsx` novo

Smoke:

1. desktop `Conversas`
2. mobile `Conversas`
3. troca de conversa
4. detalhe aberto/fechado
5. lista continua performatica

Saida:

1. a funcionalidade passa a ficar na cara do vendedor;
2. ainda sem tocar no Dashboard.

## Etapa 4 - Integracao com Calendario
Objetivo:
conectar compromissos com horario a tarefa operacional.

Acoes:

1. permitir vincular `next_action` a `appointment`;
2. ao criar agendamento a partir da acao, gravar `linked_appointment_id`;
3. em `EventFeedbackModal`, oferecer conclusao da task vinculada;
4. opcionalmente sugerir nova `Proxima Acao` apos outcome.

Arquivos alvo:

1. `src/components/solarzap/AppointmentModal.tsx`
2. `src/components/solarzap/calendar/EventFeedbackModal.tsx`
3. `src/hooks/useAppointments.ts`

Smoke:

1. agendar a partir da conversa
2. editar agendamento
3. arquivar evento com feedback
4. validar que fluxo antigo continua funcionando sem task vinculada

Saida:

1. calendario passa a ser extensao da camada operacional, nao substituto.

## Etapa 5 - Dashboard operacional
Objetivo:
dar leitura consolidada para vendedor e gestor.

Acoes:

1. adicionar bloco `Minha fila de hoje`;
2. adicionar bloco `Leads sem proxima acao`;
3. para owner/admin, adicionar `Fila do time`;
4. respeitar `leadScope`.

Arquivos alvo:

1. `src/components/solarzap/DashboardView.tsx`
2. `src/components/dashboard/tables/LeadActionQueuePanel.tsx` novo
3. `src/hooks/useDashboardReport.ts` apenas se realmente necessario

Smoke:

1. vendedor ve somente sua fila
2. owner/admin respeita escopo
3. zero regressao nos cards atuais

Saida:

1. a camada operacional fica completa.

## Etapa 6 - Reminder leve e configuravel
Objetivo:
adicionar lembrete sem virar intrusao.

Acoes:

1. banner/toast ao entrar com resumo:
   - vencidas
   - hoje
   - sem proxima acao
2. configuracao por usuario ou org;
3. modal apenas como opcional futuro.

Saida:

1. lembrete operacional sem atrapalhar.

## 10) Permissoes e Escopo

### 10.1. Escopo do vendedor
Vendedor comum:

1. ve suas proximas acoes;
2. cria e edita suas acoes;
3. conclui e cancela suas acoes.

### 10.2. Escopo do owner/admin
Owner/admin:

1. podem ver fila do time quando o `leadScope` permitir;
2. nao devem receber leitura aberta irrestrita por acidente.

### 10.3. Recomendacao tecnica de seguranca
Para visao de time:

1. preferir politica/RPC estreita e especifica;
2. evitar abrir `SELECT` bruto de `lead_tasks` para toda a org sem filtro claro;
3. alinhar com o mesmo raciocinio de escopo ja usado em leads e appointments.

## 11) Guard Rails Anti-Regressao

1. feature flag obrigatoria do inicio ao fim;
2. schema apenas aditivo;
3. nao alterar `useLeads` nem `lead.notes/observacoes` como caminho principal;
4. nao alterar logica de `followUpEnabled`, `followUpStep` e `FollowUpIndicator`;
5. nao alterar `AppointmentModal` para casos sem task vinculada;
6. nao alterar `PipelineView` para persistir proxima acao automaticamente;
7. nao remover nenhum card atual do Dashboard;
8. nao misturar tarefa da IA com tarefa do vendedor na mesma lista principal;
9. rollback por feature flag deve desativar toda a superficie nova sem exigir rollback de dados.

## 12) Riscos e Mitigacoes

### Risco 1
Duplicidade de tarefa ativa por lead.

Mitigacao:

1. unique parcial em banco;
2. bloqueio na UI;
3. fluxo explicito de substituir/reagendar.

### Risco 2
Mistura entre tarefa da IA e tarefa manual.

Mitigacao:

1. `task_kind` obrigatorio;
2. filtros separados;
3. UI principal mostra apenas `next_action`.

### Risco 3
Owner/admin ver dados errados do time.

Mitigacao:

1. seguir escopo atual do app;
2. usar read path controlado;
3. validar `mine`, `org_all` e `user:<id>`.

### Risco 4
Poluicao visual da conversa.

Mitigacao:

1. faixa compacta;
2. texto curto;
3. detalhes longos apenas no `ActionsPanel`.

### Risco 5
Regressao no mobile.

Mitigacao:

1. faixa colapsavel ou compacta;
2. nao empilhar botoes em excesso no header;
3. validar iPhone/Android antes de abrir flag.

### Risco 6
Calendar virar dependencia obrigatoria.

Mitigacao:

1. tarefas sem horario continuam fora da agenda;
2. appointment so para compromisso marcado.

## 13) Criterios de Aceite

1. vendedor abre o lead e ve `Ultima Acao` e `Proxima Acao` sem abrir modal extra;
2. vendedor consegue concluir uma acao e registrar o resultado em ate 2 cliques + texto curto;
3. nao existem duas `Proximas Acoes` abertas no mesmo lead;
4. lista de conversas destaca vencidas e hoje sem poluicao visual;
5. owner/admin conseguem ver fila do time respeitando escopo;
6. agendamento continua funcionando mesmo para leads sem task operacional;
7. a desativacao da feature flag remove a superficie nova sem quebrar dados existentes.

## 14) Recomendacao Final
Implementar em cima de `lead_tasks`, com rollout por feature flag, em fases.

Ordem recomendada:

1. `lead_tasks` como fundacao
2. `ActionsPanel` como primeiro ponto de operacao
3. `ChatArea` e `ConversationList` como superficie principal
4. `Calendario` como integracao
5. `Dashboard` como consolidacao
6. reminder leve por ultimo

Nao recomendo:

1. modal obrigatorio diario como MVP;
2. salvar isso apenas em comentarios;
3. criar tabela nova do zero antes de provar que `lead_tasks` nao atende;
4. automatizar persistencia da proxima acao direto do pipeline sem confirmacao humana.

## 15) Proximo Passo Ideal
Se voce aprovar este blueprint, o melhor passo seguinte e produzir um `PLANO_DE_IMPLEMENTACAO_CIRURGICO` com:

1. arquivos exatos por etapa;
2. migrations exatas;
3. contratos de dados;
4. estrategia de testes;
5. ordem de execucao com smoke por fase.
