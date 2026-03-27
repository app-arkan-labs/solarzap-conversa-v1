# Dashboard Redesign Plan

## 1. Diagnostico do dashboard atual

O dashboard atual do SolarZap cresceu como um painel acumulador de contexto. A tela principal tenta responder perguntas demais ao mesmo tempo e, por isso, perdeu clareza operacional.

Hoje a base de dados ja oferece informacao suficiente para uma boa leitura comercial:
- `useDashboardReport` entrega KPIs, funil, agenda, financeiro, perdas, fontes, estagnados e performance por responsavel.
- `useLossAnalytics` ja entrega leitura aprofundada de perdas com historico, ranking e acoes sugeridas.
- Os filtros de periodo e de responsavel ja estao funcionando e devem ser preservados.

O problema central nao e falta de dado. O problema esta na arquitetura da informacao, que mistura:
- rotina do dia
- visao de vendas
- agenda
- financeiro
- perdas
- analise historica

A consequencia pratica e alta carga cognitiva: o usuario bate o olho e nao entende em segundos onde agir primeiro.

## 2. Problemas encontrados

### 2.1 Mistura de contextos
- `DashboardView.tsx` centraliza todas as views e tambem os blocos compartilhados, o que favoreceu uma composicao inchada.
- A view `summary` funciona como deposito de tudo.
- `agenda` existe como visao propria, mas o contexto de agenda precisa estar na rotina do dia, nao como painel principal isolado.

### 2.2 Duplicacao visual e conceitual
- KPIs de volume e conversao aparecem em mais de um lugar.
- O mesmo assunto reaparece em card, tabela e grafico na mesma experiencia.
- O funil e repetido em leitura resumida e detalhada sem hierarquia clara.

### 2.3 Linguagem pouco natural
Rotulos atuais ainda soam tecnicos ou artificiais:
- `Carteira ativa`
- `Onde a carteira trava`
- `Leitura rapida`
- `Fila operacional`
- `Sem proxima acao`
- `Agenda comercial`
- `Canais que trazem resultado`

### 2.4 Perdas escondidas em modal
- A analise mais rica de perdas esta dentro de `LossAnalyticsModal.tsx`.
- O usuario precisa abrir um modal para entender uma das perguntas mais importantes do negocio.

### 2.5 Navegacao fraca
- O dropdown de visualizacao exige descoberta e adiciona friccao.
- A arquitetura atual ainda reflete a organizacao interna do codigo, nao a organizacao mental do usuario.

### 2.6 Excesso de cards
- Ha muitos cards com a mesma hierarquia visual.
- Falta uma separacao clara entre informacao primaria, secundaria e detalhe opcional.

### 2.7 Acao pouco explicita
- Nem todo bloco termina em uma acao concreta.
- A leitura fica informativa, mas nem sempre operacional.

## 3. Componentes que podem ser reutilizados

### Reutilizacao direta ou quase direta
- `src/components/dashboard/tables/CalendarSummaryPanel.tsx`
  - Reaproveitar em `Hoje`, com linguagem nova e foco em proximos 3 dias.
- `src/components/dashboard/tables/LeadActionQueuePanel.tsx`
  - Reaproveitar como base de `Prioridades do dia`.
- `src/components/dashboard/tables/StaleLeadsTable.tsx`
  - Reaproveitar em `Hoje` e `Vendas` com ajustes de titulo e CTA.
- `src/components/dashboard/FinanceSnapshotCard.tsx`
  - Reaproveitar em `Financeiro`, com mais hierarquia entre recebido, vencido e proximos vencimentos.
- `src/components/dashboard/SourcePerformanceCard.tsx`
  - Reaproveitar na tela `Vendas`, com nova nomenclatura e papel secundario.
- `src/components/dashboard/DashboardCharts.tsx`
  - Reaproveitar, mas restringindo a no maximo um grafico por pagina.
- `src/hooks/useDashboardReport.ts`
  - Manter como principal fonte do dashboard.
- `src/hooks/useLossAnalytics.ts`
  - Reutilizar para montar a pagina `Perdas` sem modal.

### Reutilizacao parcial
- `src/components/dashboard/FunnelOverview.tsx`
  - Aproveitar estrutura de leitura por etapa, mas refatorar profundamente para caber em `Vendas`.
- `src/components/dashboard/ActionSnapshotCard.tsx`
  - Aproveitar parte da leitura curta para a tela `Hoje`, se ainda fizer sentido apos a nova hierarquia.
- `src/components/dashboard/tables/OwnerPerformanceTable.tsx`
  - Pode continuar existindo, mas fora do primeiro plano. Entrara apenas como detalhe contextual em `Vendas`, se necessario.

## 4. Componentes que devem ser removidos

### Remover da experiencia principal
- `Resumo` como view principal.
- `Agenda` como view principal separada.
- Dropdown de visualizacao atual.
- Uso do `LossAnalyticsModal` como experiencia principal de perdas.

### Remover do fluxo principal da UI
- `KpiCards.tsx` no formato atual.
  - Hoje ele concentra informacao demais e empilha destaque sobre destaque.
  - O componente pode ser aposentado ou quebrado em metricas menores e mais especificas por pagina.

## 5. Componentes que devem ser refatorados

- `src/components/solarzap/DashboardView.tsx`
  - Refatoracao estrutural completa.
  - Passara a ser um container com navegacao por abas e composicao por pagina.
- `src/lib/dashboardViews.ts`
  - Trocar o contrato atual para `today | sales | financial | losses`.
  - Default obrigatorio: `today`.
- `src/components/dashboard/FunnelOverview.tsx`
  - Refatorar para `Vendas`, removendo excesso de caixas e linguagem antiga.
- `src/components/dashboard/tables/LeadActionQueuePanel.tsx`
  - Renomear e simplificar para `Prioridades do dia`.
- `src/components/dashboard/tables/CalendarSummaryPanel.tsx`
  - Renomear para `Compromissos` e ajustar a leitura para curto prazo.
- `src/components/dashboard/FinanceSnapshotCard.tsx`
  - Reorganizar ordem de leitura: faturado, recebido, lucro, a receber, vencido, proximos 7 dias.
- `src/components/dashboard/LossSummaryCard.tsx`
  - Deixar de ser resumo superficial e virar bloco introdutor da pagina `Perdas`.
- `src/components/dashboard/DashboardCharts.tsx`
  - Garantir uso de apenas um grafico por pagina.

## 6. Nova arquitetura de paginas

### 6.1 Hoje
Pergunta principal:
`No que preciso agir agora?`

Conteudo:
- Acoes vencidas
- Leads parados
- Compromissos de hoje e proximos 3 dias
- Parcelas vencidas e proximas
- Maior gargalo do momento
- CTA forte para abrir conversas

Regras:
- Sem grafico
- Sem analise historica longa
- Sem repeticao de KPI ja exibido em outras telas
- Cada bloco com CTA objetivo

### 6.2 Vendas
Pergunta principal:
`Onde as vendas travam e o que precisa destravar?`

Conteudo:
- Leads em andamento
- Mudancas de etapa no periodo
- Vendas fechadas
- Leads que precisam de atencao
- Resumo por etapa
- Maior gargalo
- Lista de leads parados / estagnados
- Canais que mais vendem
- 1 grafico comercial simples, apenas se agregar

Regras:
- Leitura primeiro operacional, depois analitica
- Mostrar acumulacao por etapa sem transformar a tela em parede de cards

### 6.3 Financeiro
Pergunta principal:
`O que entrou, o que vai entrar e o que esta atrasado?`

Conteudo:
- Faturado
- Recebido
- Lucro realizado
- A receber no periodo
- Vencido
- Proximos 7 dias
- Lista de parcelas vencidas e proximas
- 1 grafico financeiro simples, se houver base util

Regras:
- Separar claramente faturamento, recebimento e previsao
- Nao misturar com agenda, funil ou perdas

### 6.4 Perdas
Pergunta principal:
`Por que os negocios estao sendo perdidos e onde agir primeiro?`

Conteudo:
- Negocios perdidos
- Principal motivo
- Motivos registrados
- Comparacao vs periodo anterior
- Ranking de motivos
- Historico recente de perdas
- Acoes recomendadas
- 1 grafico de ranking de motivos

Regras:
- Nao depender de modal
- A propria pagina precisa resolver a leitura
- Acao recomendada precisa sair pronta e objetiva

## 7. Mapa de navegacao final

Navegacao superior do dashboard:
- `Hoje`
- `Vendas`
- `Financeiro`
- `Perdas`

Comportamento:
- Default = `Hoje`
- A navegacao deve ficar visivel, direta e clicavel, sem dropdown para views.
- Pode continuar persistindo o estado em query param, desde que o contrato mude para as novas abas.

Estrutura esperada no header:
- filtro de responsavel
- navegacao por abas do dashboard
- periodo
- intervalo de datas
- exportar

## 8. Dicionario final de nomenclatura

Aplicar estes nomes em toda a UI do dashboard:
- `Carteira` -> `Leads em andamento`
- `Carteira ativa` -> `Leads em andamento`
- `Onde a carteira trava` -> `Onde as vendas travam`
- `Resumo da carteira` -> `Resumo dos leads`
- `Pedem atencao` -> `Precisam de atencao`
- `Avancos` / `Avancos no periodo` -> `Mudancas de etapa`
- `Fila operacional` -> `Prioridades do dia`
- `Leitura rapida` -> `O que fazer agora`
- `Sem proxima acao` -> `Sem proxima etapa`
- `Agenda comercial` -> `Compromissos`
- `Motivos ativos` -> `Motivos registrados`
- `Analise de perdas` -> `Detalhes das perdas`
- `Canais que trazem resultado` -> `Canais que mais vendem`
- `Por onde atacar primeiro` -> `Onde agir primeiro`

Ajustes adicionais de microcopy:
- Preferir `Ver leads`, `Abrir conversas`, `Ver agenda`, `Cobrar agora`, `Ver detalhes`.
- Evitar `leitura rapida`, `visao`, `insight`, `pipeline` quando houver alternativa mais natural.

## 9. Plano de implementacao em etapas

### Etapa 1 — Base de navegacao
- Refatorar `dashboardViews.ts` para o novo contrato.
- Trocar o dropdown de visualizacao por uma navegacao em abas/botoes.
- Definir `Hoje` como pagina padrao.

### Etapa 2 — Container principal
- Reescrever `DashboardView.tsx` para separar a composicao por pagina.
- Extrair a montagem de cada pagina para funcoes/componentes menores.
- Preservar filtros de periodo, responsavel e exportacao.

### Etapa 3 — Tela Hoje
- Reaproveitar `LeadActionQueuePanel` como base de `Prioridades do dia`.
- Reaproveitar `CalendarSummaryPanel` como `Compromissos`.
- Criar uma leitura compacta de gargalo do momento.
- Criar um bloco financeiro curto para parcelas vencidas e proximas.
- Garantir ausencia total de grafico.

### Etapa 4 — Tela Vendas
- Refatorar `FunnelOverview` para leitura direta de destravamento.
- Reorganizar metricas para: leads em andamento, mudancas de etapa, vendas fechadas, precisam de atencao.
- Manter no maximo um grafico comercial.
- Posicionar `StaleLeadsTable` como bloco acionavel principal.

### Etapa 5 — Tela Financeiro
- Reorganizar `FinanceSnapshotCard` e os KPIs financeiros.
- Mostrar claramente: faturado, recebido, lucro realizado, a receber, vencido, proximos 7 dias.
- Deixar apenas um grafico financeiro, se a leitura agregar.

### Etapa 6 — Tela Perdas
- Transformar a analise hoje existente no modal em pagina.
- Reaproveitar `useLossAnalytics`.
- Criar estrutura com resumo, ranking, historico e acoes recomendadas.
- Retirar o modal do fluxo principal do dashboard.

### Etapa 7 — Higiene de linguagem e consistencia
- Aplicar o dicionario final em todos os componentes reutilizados.
- Revisar CTA de cada bloco.
- Remover labels tecnicos e repetitivos.

### Etapa 8 — Validacao
- Typecheck
- Build
- Lint dos arquivos alterados
- Testes unitarios relacionados ao contrato de views
- Revisao manual de responsividade e overflow horizontal

## 10. Riscos tecnicos

- `DashboardView.tsx` hoje concentra muita logica; refatorar sem quebrar filtros exige cuidado.
- `LossAnalyticsModal.tsx` contem UI rica, mas parte dela precisara ser extraida sem duplicar codigo.
- `OwnerPerformanceTable` e `StaleLeadsTable` usam tabelas com largura minima; isso precisa ser contido para nao recriar scroll horizontal ruim.
- Alguns componentes atuais foram desenhados para aparecer em combinacoes diferentes. Ao movelos para paginas separadas, pode surgir espaco em branco ou hierarquia fraca se nao houver ajuste fino.
- O uso de query param precisa continuar estavel para evitar regressao de navegacao.

## 11. Dependencias de backend, se houver

Dependencia esperada: nenhuma obrigatoria para esta fase.

Motivo:
- `useDashboardReport` ja entrega os dados necessarios para `Hoje`, `Vendas` e `Financeiro`.
- `useLossAnalytics` ja entrega a profundidade necessaria para `Perdas`.

Backend so deve ser alterado se, durante a implementacao, surgir ausencia real de algum dado essencial para CTA ou lista. A expectativa inicial e resolver tudo no frontend.

## 12. Checklist final de validacao

### Clareza e UX
- [ ] A tela inicial abre em `Hoje`
- [ ] O usuario entende em menos de 10 segundos o que fazer
- [ ] Nao existe mais `Resumo` como deposito de tudo
- [ ] `Agenda` deixou de ser view principal
- [ ] Cada pagina responde uma pergunta principal clara
- [ ] Cada bloco termina com uma acao concreta
- [ ] Nao ha repeticao desnecessaria de KPI na mesma pagina
- [ ] Nao ha mais linguagem tecnica desnecessaria

### Regras funcionais
- [ ] Filtro de periodo continua funcionando
- [ ] Filtro por responsavel continua funcionando
- [ ] Exportacao continua funcionando
- [ ] Query param da view continua funcionando com o novo contrato
- [ ] `Hoje` nao possui grafico
- [ ] Nenhuma pagina tem mais de um grafico

### Fidelidade de dados
- [ ] `Vendas` usa os dados de funil sem inventar metricas
- [ ] `Financeiro` separa corretamente faturado, recebido, lucro e previsao
- [ ] `Perdas` mostra ranking, historico e comparacao com base real
- [ ] Nenhum numero fica duplicado com nomes diferentes dentro da mesma tela

### Qualidade tecnica
- [ ] Sem overflow horizontal indevido nas larguras principais
- [ ] Typecheck verde
- [ ] Build verde
- [ ] Lint verde nos arquivos alterados
- [ ] Testes unitarios ajustados para o novo contrato de views