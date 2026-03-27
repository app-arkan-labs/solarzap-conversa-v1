# PLANO DE ACAO - DASHBOARD MULTI-VISUALIZACOES

Data: 2026-03-26
Status: Planejado
Escopo desta entrega: analise, arquitetura de informacao, UX/UI, fidelidade de dados e plano anti-regressao.
Fora do escopo desta entrega: implementacao de codigo.

## 1. Objetivo

Parar de empilhar tudo em uma unica Dashboard e reorganizar a experiencia em visualizacoes separadas, cada uma com um trabalho claro:

1. mostrar o estado do negocio em segundos
2. mostrar onde o comercial esta travando
3. mostrar o que precisa de acao hoje
4. mostrar o financeiro real do Projeto Pago
5. mostrar onde as vendas estao sendo perdidas e por qual motivo

A meta nao e apenas "deixar bonito".
A meta e transformar dado em leitura objetiva e acao concreta para o pequeno empresario de energia solar e para o vendedor no uso diario.

## 2. Diagnostico do problema atual

A Dashboard atual melhorou em conteudo, mas ainda falha em arquitetura de leitura.
O problema principal nao e falta de dados. O problema principal e mistura excessiva de intencoes dentro da mesma superficie.

Hoje a tela mistura ao mesmo tempo:

1. resumo executivo
2. prioridades operacionais
3. agenda comercial
4. leitura de funil
5. leitura financeira
6. analise de perdas
7. analise por origem
8. performance por responsavel

Isso gera quatro efeitos negativos:

1. poluicao visual
2. perda de hierarquia
3. dificuldade de entender o que importa agora
4. risco de parecer um relatorio tecnico em vez de um painel de decisao

## 3. Principios que vao guiar a versao final

### 3.1 Um objetivo por visualizacao
Cada visualizacao precisa responder uma pergunta principal.
Se um bloco nao ajuda aquela pergunta, ele nao entra naquela view.

### 3.2 Primeira dobra com leitura rapida
A area acima da dobra precisa caber visualmente sem exigir interpretacao longa.
No maximo 3 modulos principais acima da dobra.

### 3.3 Linguagem de negocio, nao linguagem tecnica
Evitar termos que exigem decodificacao.
Exemplos:

1. usar `Resumo`, `Comercial`, `Agenda`, `Financeiro`, `Perdas`
2. evitar `forecast`, `SLA`, `analitico`, `macrofunil` como rotulo primario
3. quando um conceito tecnico existir, explicar no subtitulo em linguagem simples

### 3.4 Fidelidade absoluta dos dados
Nao misturar sem aviso:

1. evento comercial
2. entrada em `Projeto Pago`
3. recebimento financeiro
4. lucro realizado

Cada visualizacao precisa deixar claro qual evento alimenta cada numero.

### 3.5 Uma barra de filtros comum, uma area de conteudo variavel
O filtro nao pode mudar de lugar quando o usuario muda a view.
A view muda o conteudo, nao a navegacao.

### 3.6 Sem scroll lateral
Nenhuma view principal pode exigir scroll horizontal em desktop padrao.
Tabelas largas devem ir para area secundaria, drawer, accordion ou coluna unica.

## 4. Decisao de arquitetura

A Dashboard deixara de ser uma pagina unica de blocos empilhados e passara a ser um container de visualizacoes.

### 4.1 Novo seletor de visualizacao
Adicionar um seletor de visualizacao na barra superior, exatamente na regiao indicada no print.

#### Ordem recomendada da barra
1. responsavel / escopo
2. visualizacao
3. periodo rapido
4. intervalo de datas
5. exportar

#### Ajuste importante
O botao fixo `Analise de perdas` deve sair da barra principal.
Motivo: ele concorre com o proprio conceito de visualizacao.
A leitura de perdas passa a ser uma view propria.
Se houver acao secundaria de perdas, ela aparece dentro da view `Perdas`.

### 4.2 Opcoes do seletor
As visualizacoes recomendadas para a V1 final sao:

1. `Resumo`
2. `Comercial`
3. `Agenda`
4. `Financeiro`
5. `Perdas`

Essas 5 views cobrem o que o dono e o vendedor realmente precisam sem transformar a tela em labirinto.

## 5. Mapa das visualizacoes recomendadas

## 5.1 View `Resumo`

### Pergunta que responde
`Como o negocio esta agora e onde eu devo agir primeiro?`

### Usuario principal
1. dono do negocio
2. gestor comercial
3. vendedor que quer uma leitura rapida do dia

### Conteudo acima da dobra
1. faixa curta de KPIs essenciais
2. card `O que agir hoje`
3. card `Agenda comercial`

### Conteudo abaixo da dobra
1. mini leitura de gargalo da carteira
2. mini leitura financeira do periodo
3. resumo curto de perdas

### KPIs da view
Manter os KPIs originais apenas quando fizer sentido para leitura rapida:

1. leads recebidos
2. conversao
3. faturamento em Projeto Pago
4. ticket medio

Blocos secundarios nesta view:

1. em negociacao
2. lucro realizado
3. parcelas vencidas ou proximos recebimentos

### O que NAO entra nessa view
1. tabela completa por responsavel
2. funil detalhado por todas as etapas
3. graficos multiplos
4. listas longas
5. analise detalhada por origem

### Objetivo visual
Ser a view que qualquer pessoa entende em 10 segundos.

## 5.2 View `Comercial`

### Pergunta que responde
`Onde o funil esta andando, onde esta travando e o que precisa destravar?`

### Usuario principal
1. dono do negocio
2. gestor comercial
3. vendedor

### Conteudo acima da dobra
1. KPIs comerciais da carteira
2. resumo visual do funil
3. destaque de gargalo principal

### Conteudo principal
1. distribuicao por macroetapa: entrada, contato/visita, proposta/fechamento, concluidos
2. etapas criticas com maior volume parado
3. leads estagnados
4. avancos no periodo
5. conversao do topo ate fechamento

### O que entra aqui
1. `FunnelOverview` redesenhado para esta view
2. `StaleLeadsTable`
3. leitura resumida de performance por responsavel, somente se houver modo equipe

### O que deve sair desta view
1. agenda detalhada
2. parcelas e vencimentos
3. perdas por motivo detalhadas
4. graficos genericos sem acao clara

### Objetivo visual
Ser a view para reuniao comercial e destravamento de carteira.

## 5.3 View `Agenda`

### Pergunta que responde
`Quem precisa fazer o que agora para nao perder venda?`

### Usuario principal
1. vendedor
2. SDR
3. gestor acompanhando a execucao diaria

### Conteudo acima da dobra
1. fila de proximas acoes
2. agenda comercial dos proximos dias
3. alertas de no-show, cancelamento e falta de proxima acao

### Conteudo principal
1. `LeadActionQueuePanel`
2. `CalendarSummaryPanel`
3. lista de leads sem proxima acao
4. lista de leads estagnados por falta de retorno

### Metricas desta view
1. compromissos hoje
2. compromissos proximos 7 dias
3. no-show no periodo
4. cancelamentos no periodo
5. leads sem proxima acao
6. leads estagnados

### O que nao entra
1. graficos mensais
2. funil detalhado completo
3. analise financeira

### Objetivo visual
Ser a tela de trabalho do dia, nao um painel de curiosidade.

## 5.4 View `Financeiro`

### Pergunta que responde
`Quanto virou Projeto Pago, quanto entrou, quanto ainda vai entrar e o que esta vencendo?`

### Usuario principal
1. dono do negocio
2. financeiro
3. gestor operacional

### Conteudo acima da dobra
1. faturamento em Projeto Pago no periodo
2. recebido no periodo
3. lucro realizado
4. vencido e a vencer

### Conteudo principal
1. resumo financeiro do Projeto Pago
2. lista de parcelas proximas
3. lista de parcelas vencidas
4. curva simples de recebimentos previstos x recebidos
5. leitura de margem da venda

### Regras desta view
1. `Faturamento` = soma do `sale_value` dos leads que entraram em `Projeto Pago` dentro do periodo filtrado
2. `Recebido` = soma das parcelas pagas ou confirmadas no periodo, usando `paid_amount` quando existir e `amount` como fallback
3. `Lucro realizado` = soma de `profit_amount` das parcelas pagas ou confirmadas no periodo
4. `Margem da venda` = margem calculada na venda do `Projeto Pago`, usando `sale_value - project_cost`
5. `Previsto no periodo` = parcelas previstas no intervalo filtrado
6. `Vencidas` = parcelas abertas com `due_on` anterior a hoje
7. `Proximos 7 dias` = parcelas abertas com vencimento entre hoje e +7 dias

### O que nao entra
1. funil detalhado
2. origem de lead
3. perdas detalhadas
4. tabela grande do time

### Objetivo visual
Ser a verdade financeira operacional do Projeto Pago, sem misturar evento de venda com evento de caixa.

## 5.5 View `Perdas`

### Pergunta que responde
`Onde estamos perdendo venda e o que precisa mudar?`

### Usuario principal
1. dono do negocio
2. gestor comercial
3. vendedor em revisao de processo

### Conteudo acima da dobra
1. perdas no periodo
2. principal motivo de perda
3. etapa com maior perda
4. origem mais problematica ou mais improdutiva

### Conteudo principal
1. `LossSummaryCard`
2. analise detalhada de motivos
3. perdas por etapa
4. perdas por origem
5. comparacao com periodo anterior
6. atalho para analise profunda, se mantivermos modal complementar

### Uso de `Qualidade por origem`
A leitura por origem faz mais sentido nesta view do que no `Resumo`.
Aqui ela ajuda a responder se o problema esta na entrada do funil ou no fechamento.

### Objetivo visual
Ser uma view diagnostica e acionavel, nao apenas um quadro estatistico.

## 6. Comportamento do seletor de visualizacao

## 6.1 UX esperada
1. mudar de visualizacao nao reseta o periodo nem o escopo
2. a URL deve guardar a view ativa por query param, por exemplo `?dashboardView=financeiro`
3. o mobile deve usar o mesmo seletor, com tratamento responsivo
4. a view padrao deve ser `Resumo`

## 6.2 Posicionamento e rotulo
1. rotulo visivel: `Visualizacao`
2. valor selecionado: `Resumo`, `Comercial`, `Agenda`, `Financeiro`, `Perdas`
3. componente sugerido: `Select` ou `Segmented control` horizontal em desktop largo e `Select` em mobile

## 6.3 Regras de conteudo contextual
1. botao ou CTA secundario deve depender da view ativa
2. exemplo: `Exportar recebimentos` e mais natural em `Financeiro`
3. exemplo: `Ver perdas detalhadas` e mais natural em `Perdas`
4. exemplo: `Ir para calendario` e mais natural em `Agenda`

## 7. Modelo de informacao por view

## 7.1 Camada comum
A camada comum deve continuar vindo de `useDashboardReport`, mas a tela nao deve renderizar tudo de uma vez.
Precisamos separar `dados carregados` de `dados exibidos`.

### Estrategia recomendada
1. manter o payload atual como base
2. introduzir um estado `dashboardView`
3. criar um mapa de configuracao de views com:
   - titulo
   - subtitulo
   - componentes que entram
   - variantes de layout
   - CTAs contextuais
4. cada view escolhe somente os blocos que precisa

## 7.2 Reuso dos componentes atuais
Componentes que podem ser reaproveitados com pouca ou media adaptacao:

1. `KpiCards`
2. `ActionSnapshotCard`
3. `LeadActionQueuePanel`
4. `CalendarSummaryPanel`
5. `FinanceSnapshotCard`
6. `FunnelOverview`
7. `LossSummaryCard`
8. `SourcePerformanceCard`
9. `OwnerPerformanceTable`
10. `StaleLeadsTable`
11. `DashboardCharts`

### Ponto importante
O reuso deve ser controlado por view.
Nao podemos continuar usando o criterio atual de "se existe componente, joga na pagina".

## 8. Gaps de dados e ajustes necessarios antes da implementacao

## 8.1 Gaps provavelmente resolvidos com o payload atual
1. `Resumo`
2. `Comercial`
3. boa parte de `Agenda`
4. boa parte de `Financeiro`
5. resumo de `Perdas`

## 8.2 Gaps que merecem verificacao tecnica antes de codar
1. curva de caixa prevista x recebida no `Financeiro`
2. perdas por etapa com leitura clara e confiavel dentro do periodo
3. separacao limpa entre `origem que mais traz lead` e `origem que mais fecha`
4. quantidade de leads sem proxima acao com fonte consistente em todos os cenarios

## 8.3 Regra obrigatoria de fidelidade
Se algum bloco nao tiver base confiavel ainda, ele nao entra na V1 final.
E melhor omitir do que exibir numero bonito com semantica errada.

## 9. Proposta de layout da barra superior

### Desktop
1. escopo / responsavel
2. seletor `Visualizacao`
3. periodo rapido
4. intervalo de datas
5. exportar

### Mobile
1. primeira linha: titulo + periodo rapido
2. segunda linha scrollavel: escopo, visualizacao, datas, exportar
3. nada de cinco botoes grandes competindo lado a lado

## 10. Proposta de layout por visualizacao

## 10.1 Resumo
Linha 1:
1. faixa de KPIs compacta

Linha 2:
1. `O que agir hoje`
2. `Agenda comercial`

Linha 3:
1. `Gargalo da carteira`
2. `Financeiro curto`
3. `Perdas curtas`

## 10.2 Comercial
Linha 1:
1. KPIs comerciais
2. gargalo principal

Linha 2:
1. funil macro
2. etapas que pedem atencao

Linha 3:
1. leads estagnados
2. performance por responsavel resumida

## 10.3 Agenda
Linha 1:
1. fila de acoes
2. agenda dos proximos dias

Linha 2:
1. sem proxima acao
2. no-show e cancelamentos

Linha 3:
1. leads parados aguardando retorno

## 10.4 Financeiro
Linha 1:
1. faturamento Projeto Pago
2. recebido
3. lucro realizado
4. vencido / proximos 7 dias

Linha 2:
1. curva simples de recebimentos
2. alertas financeiros

Linha 3:
1. proximas parcelas
2. parcelas vencidas

## 10.5 Perdas
Linha 1:
1. perdas no periodo
2. principal motivo
3. etapa critica
4. origem critica

Linha 2:
1. motivos de perda
2. perdas por origem

Linha 3:
1. perdas por etapa
2. comparacao com periodo anterior

## 11. Etapas de implementacao recomendadas

## Etapa 0 - Baseline e blindagem
1. congelar a composicao atual da Dashboard em screenshot de referencia
2. registrar payload atual e contratos tipados
3. listar metrica por metrica e sua semantica oficial
4. definir criterios de aceite por view

## Etapa 1 - Shell de multi-visualizacao
1. adicionar `dashboardView` na `DashboardView`
2. incluir seletor de visualizacao na barra superior
3. mover `Analise de perdas` para dentro da view `Perdas`
4. persistir view na URL
5. manter filtros comuns entre as views

## Etapa 2 - View `Resumo`
1. compor a nova primeira view como default
2. reduzir a superficie para leitura em 10 segundos
3. validar que o dono consegue responder `como estamos e onde agir hoje`

## Etapa 3 - View `Comercial`
1. isolar funil e gargalos
2. redesenhar `FunnelOverview` para uso prioritario nessa view
3. encaixar `StaleLeadsTable` sem poluicao

## Etapa 4 - View `Agenda`
1. promover `LeadActionQueuePanel` e `CalendarSummaryPanel` a protagonistas
2. incluir estados sem proxima acao e no-show
3. garantir leitura de rotina diaria

## Etapa 5 - View `Financeiro`
1. promover `FinanceSnapshotCard` para dashboard proprio
2. acrescentar curva simples de caixa, se a base estiver confiavel
3. separar claramente `Projeto Pago`, `recebido`, `lucro realizado` e `vencimento`

## Etapa 6 - View `Perdas`
1. transformar perdas em dashboard proprio
2. levar `Qualidade por origem` para esta view
3. manter CTA para investigacao profunda so aqui

## Etapa 7 - Acabamento UX/UI
1. microcopy final em linguagem simples
2. espacamentos e ritmo visual consistentes
3. remocao de elementos redundantes
4. responsividade fina desktop/tablet/mobile

## Etapa 8 - Validacao final e liberacao
1. typecheck
2. lint
3. testes unitarios dos mapeamentos de metricas
4. screenshots de regressao visual das 5 views
5. walkthrough manual com roteiro de negocio
6. deploy

## 12. Estrategia anti-regressao

## 12.1 Regras de implementacao segura
1. primeiro criar o shell das views sem quebrar o payload
2. depois mover os blocos view por view
3. so depois adaptar cada componente com refinamento visual

## 12.2 Regras de dado
1. nunca recalcular metrica visual dentro do componente se ela ja existe consolidada no hook
2. quando houver derivacao na view, centralizar em helper testavel
3. nenhum componente deve inventar fallback semantico sem explicacao

## 12.3 Regras de layout
1. cada view deve ter no maximo um bloco expansivel secundario
2. nenhuma view pode abrir com mais de uma tabela longa na primeira dobra
3. cards laterais nao podem comprimir tabelas essenciais

## 12.4 Regras de QA
1. validar cada view em desktop 1366px
2. validar cada view em notebook menor
3. validar mobile sem scroll lateral
4. validar filtros persistindo ao trocar a view
5. validar exportacao coerente com a view ativa quando aplicavel

## 13. Criterios de aceite da versao final

A versao final sera considerada aprovada quando:

1. o usuario bater o olho em `Resumo` e entender a situacao em ate 10 segundos
2. `Comercial` mostrar claramente onde o funil trava
3. `Agenda` orientar o trabalho diario sem ruido analitico
4. `Financeiro` separar com clareza faturamento, recebimento, lucro realizado e vencimento
5. `Perdas` mostrar onde estamos perdendo venda e o que atacar primeiro
6. a barra superior ficar limpa, previsivel e consistente
7. nenhuma view exigir scroll lateral em resolucao desktop comum
8. nao houver numero com semantica ambigua ou enganosa

## 14. Recomendacoes finais de produto

1. nao criar mais views nesta primeira rodada
2. nao duplicar o mesmo bloco em todas as views
3. nao usar accordions para esconder o problema de arquitetura
4. o `Resumo` deve ser pequeno e util; o detalhe vai para as views especificas
5. se uma informacao nao muda decisao, ela nao entra acima da dobra

## 15. Recomendacao de execucao

A ordem ideal para implementacao e:

1. shell do seletor e arquitetura de views
2. `Resumo`
3. `Comercial`
4. `Agenda`
5. `Financeiro`
6. `Perdas`
7. polimento final

Essa ordem reduz risco, melhora a leitura logo no inicio e evita uma nova rodada de tela unica poluida.

## 16. Entrega esperada apos implementacao

Ao final, a experiencia da aba Dashboard deve funcionar assim:

1. o usuario escolhe `quem` quer analisar
2. escolhe `qual visualizacao` quer abrir
3. mantem o mesmo periodo e as mesmas datas
4. recebe uma tela focada em uma pergunta especifica
5. consegue sair da leitura para a acao sem precisar decifrar um mosaico de cards

---

Observacao: este documento define a arquitetura alvo e a ordem de implementacao. Nenhuma alteracao de codigo deve ser feita antes da validacao deste plano.
