# Plano de Redesign UI - Camada Operacional Ultima Acao / Proxima Acao

Data: 2026-03-26
Status: Planejado para execucao imediata
Escopo: Conversas + Dashboard + ajustes de linguagem visual da camada operacional
Objetivo: Corrigir imediatamente o excesso visual introduzido pela feature sem mexer na espinha de dados, regras, hooks e integracoes que ja foram implementados.

## 1. Diagnostico Objetivo

O problema atual nao e conceitual. O problema e de escala, hierarquia visual e distribuicao de densidade.

O que ficou ruim:

- A camada operacional passou a competir com a conversa principal, em vez de apoia-la.
- A barra superior da conversa ficou alta demais, com cara de painel fixo, empurrando o conteudo principal para baixo.
- O card "Resumo operacional do dia" na lista de conversas ficou grande demais para uma informacao secundaria.
- O badge `Sem acao` foi repetido demais e ficou visualmente ruidoso.
- O bloco novo no Dashboard ficou pesado, largo e dominante, com cara de "produto paralelo" dentro da tela.
- A feature ficou com muita cara de "bloco novo adicionado" e pouca cara de "camada integrada ao SolarZap".

Resumo do erro de UX:

- O sistema precisava ficar mais orientador.
- A implementacao deixou o sistema mais barulhento.

## 2. Causa de Design

Os componentes novos foram construidos como superficies completas e explicitas demais:

- card grande na lista;
- card grande na conversa;
- card grande no dashboard;
- badge persistente ate quando nao ha urgencia real.

Ou seja:

- faltou estado compacto por default;
- faltou priorizacao por urgencia;
- faltou separar "sinal operacional" de "bloco de gerenciamento";
- faltou respeitar a hierarquia da tela de conversa.

## 3. Principios do Redesign

O redesenho deve obedecer estes principios:

1. A conversa continua sendo protagonista.
2. A camada operacional deve ficar sempre visivel, mas pequena.
3. Estado vazio nao pode gritar.
4. Urgencia real pode chamar atencao; ausencia de dado nao.
5. Dashboard deve resumir e encaminhar, nao substituir Conversas.
6. Detalhe e historico ficam no painel lateral, nao no centro da tela.
7. A maior parte do redesign deve ser visual e estrutural, preservando hooks, queries, migrations e contratos atuais.

## 4. Nova Direcao por Superficie

### 4.1 Conversas - Lista lateral

Problema atual:

- o card de resumo ocupa altura demais;
- o topo da lista ganhou peso visual desnecessario;
- `Sem acao` repetido em toda linha gera poluicao.

Nova direcao:

- remover o card grande de "Resumo operacional do dia";
- substituir por uma barra fina horizontal, integrada ao topo da lista;
- transformar o resumo em texto compacto + chips pequenos:
  - `0 vencidas`
  - `0 hoje`
  - `70 sem acao`
- exibir `Sem acao` apenas quando fizer sentido:
  - na linha selecionada;
  - no hover;
  - quando filtro operacional estiver ativo;
  - ou em listas dedicadas.
- por default, cada conversa deve mostrar badge operacional apenas se houver:
  - vencida;
  - hoje;
  - agendada;
  - atraso real.

Decisao de UX:

- ausencia de proxima acao vira sinal silencioso;
- urgencia vira sinal visivel.

### 4.2 Conversas - Area principal do chat

Problema atual:

- a barra superior ficou grossa, longa e pesada;
- ela rouba o primeiro olhar da conversa;
- o historico nao deve morar ali.

Nova direcao:

- remover o bloco grande full-width atual;
- substituir por uma `faixa operacional compacta` logo abaixo do cabecalho;
- altura alvo:
  - entre 44px e 64px no desktop;
  - maximo de 2 linhas visuais.

Estrutura proposta:

- linha 1:
  - `Proxima acao: Retornar quinta 10:00`
  - chip de estado `Hoje`, `Vencida`, `Sem prazo`, `Agendada`
  - CTA pequeno: `Gerir`
- linha 2 opcional:
  - `Ultima: pediu retorno com esposa`

Estado vazio:

- texto compacto:
  - `Sem proxima acao`
- CTA minimo:
  - `Definir`

O que sai da area principal:

- historico recente completo;
- badges de prioridade detalhados;
- botoes demais lado a lado;
- excesso de texto explicativo.

### 4.3 Conversas - Painel lateral direito

Problema atual:

- a melhor superficie para detalhe existe, mas o detalhamento ainda esta espalhado.

Nova direcao:

- concentrar aqui o gerenciamento completo da camada operacional;
- este painel vira a "central de detalhe";
- a conversa principal mostra contexto;
- o painel lateral mostra gerenciamento.

Estrutura proposta:

- card `Proxima acao`
- CTA principais:
  - `Concluir`
  - `Editar`
  - `Agendar/Reagendar`
- secoes colapsaveis:
  - `Ultima acao`
  - `Historico recente`

Decisao:

- tudo que exigir leitura cuidadosa ou manutencao detalhada sai do centro e vai para a lateral.

### 4.4 Dashboard

Problema atual:

- o bloco "Minha fila de hoje" esta grande demais;
- virou quase uma pagina dentro da pagina;
- a lista de `Sem acao` em massa pesa e desorganiza o ritmo da dashboard.

Nova direcao:

- transformar o dashboard em resumo executivo, nao em area operacional pesada;
- reduzir a feature para um widget de baixa altura;
- limitar volume visual e empurrar profundidade para Conversas.

Estrutura proposta:

- linha de resumo com 4 indicadores:
  - `Vencidas`
  - `Hoje`
  - `Proximas`
  - `Sem acao`
- bloco abaixo com apenas uma lista pequena:
  - `Prioridade imediata`
  - maximo 5 itens
- CTA unico:
  - `Abrir fila em Conversas`

O que deve sair:

- painel gigante em 2 colunas;
- lista longa de leads sem acao;
- repeticao de chips `Sem acao` em massa.

Se houver necessidade de visao maior:

- usar drawer, pagina dedicada ou filtro em Conversas;
- nao inflar a dashboard principal.

### 4.5 Linguagem visual

Problema atual:

- mistura de card, badge, outline, linha pontilhada e blocos grandes;
- a feature parece enxertada.

Nova direcao visual:

- reduzir bordas pesadas;
- reduzir altura dos containers;
- usar mais `inline status` e menos `large cards`;
- usar cores so em urgencia real;
- estado vazio com cinza neutro e baixo contraste;
- priorizar:
  - tipografia
  - espacamento
  - ritmo
  - compacidade

## 5. O Que Deve Ser Mantido

Para evitar regressao, manter:

- schema e migrations de `lead_tasks`;
- hook `useLeadTasks`;
- logica de `nextActionByLeadId` e `lastActionByLeadId`;
- integracao com `appointments`;
- integracao com `EventFeedbackModal`;
- filtros operacionais como comportamento, nao necessariamente como visual atual.

Em resumo:

- vamos redesenhar a casca;
- nao reabrir a fundacao.

## 6. Plano de Execucao Incremental

### Fase 1 - Contencao imediata do estrago visual

Objetivo:

- remover os elementos mais gritantes sem trocar a logica.

Acoes:

- remover o card grande de resumo da lista de conversas;
- trocar por barra fina compacta;
- esconder badge `Sem acao` por default nas linhas;
- remover o bloco grande full-width do chat.

Resultado esperado:

- queda imediata de ruido;
- conversa volta a respirar;
- feature continua funcionando.

### Fase 2 - Reconstrucao da faixa operacional do chat

Objetivo:

- devolver presenca operacional sem roubar a tela.

Acoes:

- criar faixa compacta abaixo do header;
- CTA unico `Gerir`;
- mover detalhe e historico para o painel lateral;
- manter empty state pequeno e util.

Resultado esperado:

- a informacao fica na cara;
- mas sem virar um header gigante.

### Fase 3 - Refinamento da lista de conversas

Objetivo:

- transformar a lista em triagem silenciosa e eficiente.

Acoes:

- novo resumo em formato de chips compactos;
- sinalizar so urgencias e datas;
- mostrar ausencia de proxima acao apenas em contexto relevante;
- revisar hierarquia de tipografia e espacamento dos rows.

Resultado esperado:

- menos poluicao;
- mais escaneabilidade;
- menos repeticao.

### Fase 4 - Reducao drástica do bloco da dashboard

Objetivo:

- fazer o dashboard resumir, nao dominar.

Acoes:

- trocar o mega card por widget compacto;
- mostrar so top 5 prioridades;
- remover a listagem longa de "sem acao";
- CTA para abrir Conversas com filtro aplicado.

Resultado esperado:

- dashboard volta a ser dashboard;
- operacional pesado volta para Conversas.

### Fase 5 - Polimento visual e responsivo

Objetivo:

- consolidar consistencia e acabamento.

Acoes:

- revisar mobile;
- revisar truncamentos;
- revisar densidade de chips;
- revisar contrastes;
- revisar comportamento de hover, selected e empty.

Resultado esperado:

- feature integrada;
- menos sensacao de improviso visual;
- cara de produto nativo.

## 7. Arquivos Mais Provaveis de Ajuste

- `src/components/solarzap/LeadNextActionSection.tsx`
- `src/components/solarzap/LeadNextActionBadge.tsx`
- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/ActionsPanel.tsx`
- `src/components/dashboard/tables/LeadActionQueuePanel.tsx`
- `src/components/solarzap/DashboardView.tsx`
- possivelmente `src/components/solarzap/SolarZapLayout.tsx` apenas para encaixe e props

## 8. Critérios de Aceite

O redesign sera considerado aprovado quando:

- a conversa continuar sendo o foco visual da aba `Conversas`;
- a camada operacional estiver visivel sem parecer um painel invasivo;
- a lista lateral estiver mais limpa e escaneavel;
- o dashboard nao parecer uma segunda central operacional;
- `Sem acao` deixar de ser uma poluicao visual persistente;
- o fluxo de criar, editar, concluir e agendar continuar intacto;
- nenhuma migration, hook ou contrato de dados precisar ser refeito.

## 9. Recomendacao Final

Nao devemos "melhorar o card atual".

Devemos fazer uma troca de abordagem:

- de `blocos grandes persistentes`
- para `sinais compactos + detalhe sob demanda`

Traduzindo:

- menos painel;
- mais contexto;
- menos card;
- mais fluxo.

## 10. Proximo Passo Recomendado

Executar imediatamente a `Fase 1` e a `Fase 2` juntas.

Essa combinacao entrega o maior ganho perceptivel com o menor risco:

- remove o que esta gritando;
- preserva a funcionalidade;
- melhora dramaticamente a percepcao da feature em poucas alteracoes.
