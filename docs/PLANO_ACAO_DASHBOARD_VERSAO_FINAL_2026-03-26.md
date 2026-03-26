# Plano de Acao - Dashboard Comercial Versao Final (2026-03-26)

## 0) Status
Plano de refinamento final da Dashboard ja implementada.

Objetivo desta fase:
1. reduzir poluicao visual;
2. eliminar scroll lateral indevido;
3. trocar linguagem tecnica por linguagem de negocio;
4. transformar a Dashboard em painel de uso diario para pequeno empresario de energia solar;
5. manter seguranca contra regressao visual, funcional e de dados.

## 1) Diagnostico objetivo do estado atual

### 1.1 Problemas visuais e de usabilidade observados
1. O bloco de funil esta ocupando area demais.
2. O funil esta longo demais na vertical e gera cansaco visual.
3. Os cards de Topo, Meio, Fundo e Saidas somam informacao, mas nao ajudam tanto na tomada de decisao quanto ocupam espaco.
4. A lista detalhada de etapas esta detalhada demais para a leitura diaria.
5. O bloco de Agenda Comercial esta espremido ao lado da tabela de performance.
6. A secao inferior esta gerando scroll lateral.
7. A tela ainda parece mais analitica do que operacional.
8. Alguns termos falam a lingua do sistema, nao a lingua do empresario:
   - `SLA`
   - `Forecast`
   - `Qualidade por origem`
   - `Funil atual`
9. A Dashboard ainda entrega dados, mas nem sempre transforma esses dados em prioridade clara.

### 1.2 Causa tecnica mais provavel dos problemas
1. `OwnerPerformanceTable` usa `Table className="min-w-[980px]"`, o que empurra a largura total da secao para alem da coluna disponivel.
2. A secao inferior esta em grid com duas colunas:
   - performance por responsavel;
   - agenda comercial.
3. Como a tabela exige largura minima alta, a coluna da Agenda fica comprimida e o container todo passa a estourar horizontalmente.
4. O funil atual renderiza:
   - cards por macrogrupo;
   - cards-resumo adicionais;
   - lista completa de etapas por grupo;
   - badges de atraso;
   - barras de progresso.
5. Isso cria excesso de repeticao visual e baixa densidade informacional util.

### 1.3 Problema de produto, nao so de layout
1. O dono de uma empresa pequena de energia solar nao quer "entender o sistema".
2. Ele quer responder rapidamente:
   - entrou lead?
   - tem vendedor parado?
   - tem proposta esperando?
   - tenho visita marcada?
   - de onde vem negocio bom?
   - onde estou perdendo venda?
   - o que preciso cobrar hoje?
3. Se o painel exige interpretacao tecnica, ele falha como painel de rotina.

## 2) Principio da versao final
A Dashboard final precisa seguir esta regra:

1. pouca leitura;
2. alta clareza;
3. linguagem simples;
4. foco em acao;
5. zero excesso visual;
6. sem horizontal scroll em uso normal;
7. cada bloco precisa responder uma pergunta pratica do negocio.

## 3) Linguagem final recomendada

### 3.1 Termos a remover da interface
1. `SLA`
2. `Forecast`
3. `Qualidade por origem`
4. `Funil atual`
5. `Movimentos no periodo` se nao vier acompanhado de explicacao util

### 3.2 Termos recomendados para a versao final
1. `SLA` -> `tempo ideal` ou `tempo esperado`
2. `acima do SLA` -> `parado alem do tempo ideal`
3. `Dentro do SLA` -> `dentro do tempo ideal`
4. `Forecast` -> `valor em negociacao` ou `potencial em aberto`
5. `Funil atual` -> `Carteira por etapa`
6. `Qualidade por origem` -> `Canais que mais trazem resultado`
7. `Perdas no periodo` -> `Motivos de perda`
8. `Movimentos no periodo` -> `Leads que avancaram`
9. `Gargalo principal` -> `Ponto que mais trava hoje`

### 3.3 Regra de copy
Toda copy deve obedecer a esta pergunta:
1. um dono de integradora solar entenderia isso sem explicacao adicional?

Se a resposta for nao, o texto precisa ser simplificado.

## 4) Estrutura recomendada da versao final

### 4.1 Faixa 1 - Visao rapida do negocio
Manter os KPIs, mas reorganizar com prioridade de leitura real.

Ordem recomendada:
1. Leads recebidos
2. Conversao
3. Faturamento realizado
4. Lucro realizado
5. Valor em negociacao
6. Ticket medio
7. Tempo medio de fechamento

Regra:
1. Margem deixa de disputar protagonismo com os indicadores principais.
2. Hero deixa de ser um bloco grande demais.
3. Os KPIs devem parecer uma "faixa de leitura rapida", nao uma parede de cards.

### 4.2 Faixa 2 - O que agir hoje
Criar um bloco de prioridade operacional.

Itens recomendados:
1. Leads parados alem do tempo ideal
2. Compromissos dos proximos dias
3. No-show do periodo
4. Propostas ou negociacoes sem avancar

Essa faixa deve responder:
1. onde agir primeiro;
2. quem cobrar;
3. qual risco esta mais urgente.

### 4.3 Faixa 3 - Carteira por etapa
O funil precisa virar um painel compacto, nao uma lista longa.

Modelo recomendado:
1. uma linha de resumo por macroetapa:
   - Entrada
   - Atendimento
   - Proposta
   - Fechamento
2. cada macroetapa mostra:
   - quantidade atual
   - quantos estao parados
   - sinal de alerta
3. abaixo, no maximo 4 ou 5 etapas criticas detalhadas, nao a lista completa toda aberta

Alternativas validas:
1. detalhar so etapas com volume relevante;
2. detalhar so etapas com atraso;
3. esconder detalhes em `accordion`;
4. trocar o bloco por cards compactos de macroetapa + tabela curta de gargalos.

Regra:
1. o usuario precisa bater o olho e saber onde esta acumulando lead.
2. ele nao precisa ver 12 a 15 cards extensos ao mesmo tempo.

### 4.4 Faixa 4 - Canais e perdas
Blocos pequenos e objetivos.

`Canais que mais trazem resultado` deve mostrar:
1. origem
2. leads
3. vendas
4. conversao
5. receita

`Motivos de perda` deve mostrar:
1. total de perdas
2. principal motivo
3. comparacao com periodo anterior
4. uma recomendacao curta

### 4.5 Faixa 5 - Equipe e agenda
Estas duas secoes nao devem competir na mesma linha quando houver risco de overflow.

Estrutura recomendada:
1. Performance por responsavel em largura total
2. Agenda Comercial abaixo, tambem em largura total

Regra:
1. se a tabela exigir largura para leitura correta, ela deve ocupar a linha inteira.
2. Agenda nao deve ficar espremida.
3. Dashboard nunca deve gerar scroll lateral por causa dessa composicao.

## 5) Ajustes finos recomendados por componente

### 5.1 `FunnelOverview`
Problemas:
1. excesso de cards
2. excesso de repeticao
3. excesso de altura
4. linguagem tecnica

Acoes:
1. substituir os 4 cards de Topo/Meio/Fundo/Saidas por 3 cards mais orientados a negocio:
   - `Leads em andamento`
   - `Etapa que mais trava`
   - `Leads parados`
2. reduzir a lista detalhada para uma tabela curta ou accordion
3. detalhar somente etapas com:
   - maior volume;
   - maior atraso;
   - maior risco
4. trocar `SLA` por `tempo ideal`
5. trocar `Sem atraso relevante` por `Sem fila critica`
6. trocar `Movimentos no periodo` por `Leads que avancaram`
7. trocar `Vitorias no periodo` por `Vendas fechadas`
8. trocar `Gargalo principal` por `Etapa que pede atencao`

### 5.2 `CalendarSummaryPanel`
Problemas:
1. largura insuficiente quando dividida com a tabela
2. quebra ruim de texto
3. sensacao de bloco apertado

Acoes:
1. mover a Agenda para uma linha propria
2. reduzir densidade do cabecalho
3. transformar os totais em pequenos indicadores:
   - realizados
   - pendentes
   - no-show
   - cancelados
4. mostrar no maximo 4 eventos
5. priorizar:
   - proximo horario
   - nome do lead
   - tipo
6. remover qualquer largura fixa desnecessaria que piore compressao em breakpoints intermediarios

### 5.3 `OwnerPerformanceTable`
Problemas:
1. tabela larga demais
2. colunas demais para a vista principal
3. tabela pouco amigavel em resolucoes menores

Acoes:
1. reduzir colunas da vista principal para:
   - Responsavel
   - Leads
   - Vendas
   - Conversao
   - Faturamento
2. mover `lucro`, `margem` e `ticket medio` para:
   - detalhe expandido;
   - tooltip;
   - segunda linha opcional;
   - drawer no mobile
3. remover `min-w-[980px]` da versao desktop normal
4. adotar largura responsiva real com `min-w-0` nos containers pais
5. no mobile, trocar tabela por cards empilhados

### 5.4 `KpiCards`
Acoes:
1. renomear `Forecast`
2. reduzir texto explicativo secundario
3. diminuir a competicao visual entre todos os cards
4. deixar a faixa principal mais compacta
5. priorizar os KPIs que respondem operacao e caixa

### 5.5 `DashboardView`
Acoes:
1. reorganizar layout em blocos de largura total quando necessario
2. evitar grids de duas colunas quando um dos lados tiver tabela larga
3. adicionar `min-w-0` nos filhos dos grids que precisarem contrair corretamente
4. reduzir espacamentos onde a tela estiver "aerada demais"
5. equilibrar melhor a ordem visual:
   - leitura do negocio
   - acao do dia
   - carteira por etapa
   - canais/perdas
   - equipe
   - agenda

## 6) Plano de acao detalhado para chegarmos na versao final

### Etapa 0 - Congelar direcao final
Objetivo:
alinhar criterio antes de mexer em layout.

Acoes:
1. aprovar a linguagem final da interface
2. aprovar o nome substituto de `Forecast`
3. aprovar que `SLA` sai da interface
4. aprovar que Agenda e Performance nao ficam mais lado a lado se isso gerar compressao

Saida esperada:
1. criterios de linguagem e hierarquia aprovados

### Etapa 1 - Corrigir estrutura e overflow
Objetivo:
eliminar scroll lateral e desalinhamentos.

Acoes:
1. mover `Agenda Comercial` para linha propria
2. revisar grid inferior da Dashboard
3. remover dependencia da largura minima extrema da tabela
4. adicionar comportamento responsivo adequado em breakpoints intermediarios
5. validar ausencia de overflow horizontal em:
   - 1280px
   - 1440px
   - 1536px
   - mobile

Saida esperada:
1. zero scroll lateral involuntario
2. agenda legivel
3. tabela legivel

### Etapa 2 - Compactar o funil
Objetivo:
reduzir area ocupada e aumentar valor pratico.

Acoes:
1. trocar funil longo por versao compacta
2. mostrar resumo de macroetapas
3. exibir apenas gargalos e etapas prioritarias
4. esconder detalhes secundarios atras de expansao
5. trocar linguagem tecnica por linguagem orientada a acao

Saida esperada:
1. funil ocupa menos altura
2. leitura mais rapida
3. destaque para gargalo real, nao para volume de componentes

### Etapa 3 - Traduzir a tela para linguagem de negocio
Objetivo:
tirar a Dashboard do modo "BI interno" e colocar no modo "painel de rotina".

Acoes:
1. trocar todos os termos tecnicos
2. revisar subtitulos e descricoes
3. reescrever blocos para responder perguntas praticas
4. reduzir jargao de produto/CRM

Saida esperada:
1. tela entendida sem treinamento
2. dono do negocio sabe o que esta vendo

### Etapa 4 - Transformar dado em acao
Objetivo:
fazer a Dashboard orientar a rotina.

Acoes:
1. destacar bloco de "o que agir hoje"
2. conectar leads parados, agenda e perdas
3. exibir mensagens que indiquem prioridade real
4. trazer recomendacoes curtas nos blocos:
   - `cobrar propostas`
   - `reativar leads frios`
   - `revisar origem com baixa conversao`

Saida esperada:
1. cada bloco termina em uma acao implicita
2. menos leitura descritiva, mais leitura operacional

### Etapa 5 - Acabamento visual final
Objetivo:
deixar a tela mais limpa e coerente.

Acoes:
1. reduzir excesso de cards semelhantes
2. revisar padding e alturas
3. reduzir ruido de badges
4. ajustar pesos visuais
5. padronizar distancia entre secoes
6. revisar line-height e densidade textual

Saida esperada:
1. Dashboard mais leve
2. melhor alinhamento visual
3. menos poluicao

## 7) Riscos e mitigacoes
1. Risco: simplificar demais e perder dados relevantes.
   Mitigacao: manter detalhes em expansao, nao eliminar dado do payload.
2. Risco: trocar nome de metrica e gerar duvida historica.
   Mitigacao: usar labels novos, mas manter a formula igual.
3. Risco: resolver scroll lateral num breakpoint e quebrar outro.
   Mitigacao: validar em breakpoints fixos e mobile.
4. Risco: agenda ficar melhor e a tabela piorar.
   Mitigacao: tratar as duas secoes como sistema unico, nao como componentes isolados.
5. Risco: excesso de simplificacao na linguagem.
   Mitigacao: simplificar sem perder precisao da mensagem.

## 8) Bateria anti-regressao obrigatoria
1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. `npx vitest run tests/unit/dashboardMetrics.test.ts tests/unit/leadStageNormalization.test.ts`
5. validacao manual da Dashboard em:
   - desktop 1280px
   - desktop 1440px
   - desktop 1536px
   - mobile
6. checklist manual sem scroll lateral:
   - faixa de KPIs
   - funil
   - canais
   - perdas
   - performance por responsavel
   - agenda comercial

## 9) Criterios de aceite da versao final
1. O usuario entende a tela sem precisar saber o que e `SLA`.
2. O usuario entende a metrica hoje chamada `Forecast` sem precisar de traducao.
3. O funil nao domina a tela.
4. A Agenda Comercial nao fica comprimida.
5. Nao existe scroll lateral indevido.
6. A tela fica visualmente mais limpa.
7. A Dashboard mostra dado util e sugere prioridade real.
8. O dono do negocio consegue responder em menos de 30 segundos:
   - como estao entrando os leads;
   - onde o time trava;
   - o que precisa de atencao hoje;
   - de onde vem resultado;
   - onde esta perdendo venda.

## 10) Ordem recomendada de execucao
1. primeiro: corrigir overflow e estrutura
2. depois: compactar funil
3. depois: revisar linguagem
4. depois: reforcar bloco operacional
5. por ultimo: acabamento visual fino

## 11) Recomendacao pratica
Se quisermos chegar na melhor versao final com baixo risco, a implementacao deve ser feita em duas entregas:

### Entrega A
1. layout
2. responsividade
3. overflow
4. renomeacao de termos

### Entrega B
1. compactacao inteligente do funil
2. centro de acao
3. refinamento visual final

Motivo:
1. a Entrega A resolve desconforto imediato de uso;
2. a Entrega B eleva a Dashboard de "boa" para "painel de rotina real".
