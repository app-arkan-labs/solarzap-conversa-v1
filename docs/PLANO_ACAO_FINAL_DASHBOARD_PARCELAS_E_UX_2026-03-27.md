# Plano de Acao Final - Dashboard SolarZap (Parcelas, Hoje, Vendas e UX)

Data: 2026-03-27
Status: Planejado, sem implementacao nesta rodada
Escopo: corrigir acao de parcelas, reduzir poluicao de interface, conter listas longas com scroll interno e organizar melhor as telas Hoje, Vendas e Financeiro.

---

## 1. Objetivo desta rodada

Resolver os problemas que ainda comprometem usabilidade e confianca no dashboard atual:

1. `Financeiro` mostra `Parcelas que pedem acao`, mas o clique nao executa a acao certa e hoje pode levar a uma navegacao quebrada.
2. `Hoje` ainda mistura resumo, prioridades, compromissos, parcelas e leads parados em uma leitura repetitiva e longa demais.
3. `Vendas` sofre com blocos de baixa densidade util, listas longas sem contencao visual e espacos vazios estranhos na composicao.
4. O sistema ja identifica parcelas que precisam de confirmacao, mas o dashboard ainda nao oferece um fluxo simples para dizer se a parcela foi paga ou nao.
5. Falta um gatilho automatico para cobrar decisao do vendedor quando uma parcela ja venceu ha pelo menos 1 dia.

Meta final desta fase:

- toda linha clicavel do dashboard precisa abrir uma acao valida
- nenhuma lista critica deve crescer indefinidamente no fluxo da pagina
- `Hoje` precisa responder em poucos segundos: o que eu preciso fazer agora?
- `Vendas` precisa responder em poucos segundos: onde as vendas travam?
- `Financeiro` precisa responder em poucos segundos: o que ja entrou, o que venceu e o que precisa ser confirmado?

---

## 2. Diagnostico consolidado

## 2.1. Problema 1 - Clique quebrado em `Parcelas que pedem acao`

Diagnostico:

1. O componente [FinanceSnapshotCard.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/FinanceSnapshotCard.tsx) ainda usa `onOpenLead(lead_name)` nas linhas de parcelas.
2. Em [DashboardView.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/DashboardView.tsx), `handleOpenLeadByName` navega para `/app?tab=conversas&search=...`.
3. O app atualmente esta roteado em `/`, nao em `/app`, conforme [App.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/App.tsx).
4. Resultado: parte dos cliques vai para uma URL invalida e pode cair em `404`.
5. Mesmo quando a navegacao funciona, abrir conversa por nome do lead e a acao errada para uma parcela. O contexto correto e financeiro, nao busca textual.

Causa raiz:

- o dashboard financeiro ainda esta acoplado a uma acao genrica de "abrir lead" em vez de usar uma acao contextual de parcela.

---

## 2.2. Problema 2 - `Hoje` continua repetitivo e amontoado

Diagnostico:

1. [DashboardTodayPage.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/pages/DashboardTodayPage.tsx) repete conceitos entre:
   - faixa superior de resumo
   - `LeadActionQueuePanel`
   - `FinanceSnapshotCard`
   - `TodayBottleneckCard`
   - `StaleLeadsTable`
2. O usuario le `acoes vencidas`, `leads parados`, `compromissos` e `parcelas vencidas` no topo e encontra blocos com a mesma ideia logo abaixo, sem uma hierarquia suficientemente forte.
3. A pagina cresce em altura demais porque os principais blocos ficam empilhados com listas livres, especialmente `LeadActionQueuePanel`, `FinanceSnapshotCard` e `StaleLeadsTable`.
4. O resultado visual e uma tela que parece comprida demais, pouco controlada e cognitivamente pesada.

Causa raiz:

- a tela `Hoje` ainda tenta resumir e detalhar ao mesmo tempo, sem separar o que e status rapido do que e lista operacional.

---

## 2.3. Problema 3 - `Vendas` tem vazios estranhos e listas muito longas

Diagnostico:

1. [DashboardSalesPage.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/pages/DashboardSalesPage.tsx) empilha:
   - faixa de metricas
   - `FunnelOverview`
   - `SourcePerformanceCard`
   - grafico comercial
   - `StaleLeadsTable`
   - card extra `Onde agir primeiro`
2. `FunnelOverview` ja entrega gargalo e resumo dos leads. O card `Onde agir primeiro` repete o raciocinio por outro angulo.
3. `StaleLeadsTable` cresce em altura sem limite de painel, empurrando a pagina para baixo indefinidamente.
4. A combinacao de cards com alturas muito diferentes gera sobras de area e respiracao desalinhada no grid.

Causa raiz:

- excesso de blocos explicando a mesma historia e ausencia de areas operacionais com altura fixa e scroll interno.

---

## 2.4. Problema 4 - `Financeiro` pede acao, mas nao fecha o ciclo

Diagnostico:

1. `Financeiro` destaca vencido, a receber e proximos 7 dias.
2. Existe lista de `Parcelas que pedem acao`.
3. Porem o dashboard nao permite ao vendedor concluir a acao essencial: confirmar se a parcela foi paga ou nao.
4. Isso gera um painel que alerta, mas nao resolve.

Causa raiz:

- existe operacao de status financeiro no backend e nas notificacoes, mas ela ainda nao foi conectada ao dashboard.

---

## 2.5. Problema 5 - O sistema ja tem infraestrutura, mas a UX esta fragmentada

Reaproveitamento encontrado:

1. [useNotifications.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useNotifications.ts) ja possui:
   - `confirmInstallmentPaid`
   - `rescheduleInstallment`
   - polling de parcelas em `awaiting_confirmation`
2. [NotificationsPanel.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/NotificationsPanel.tsx) ja mostra acoes de parcela:
   - `Parcela paga`
   - `Nao paga`
3. A migration [20260305193000_project_paid_finance_module.sql](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/migrations/20260305193000_project_paid_finance_module.sql) ja define:
   - `rpc_confirm_installment_paid`
   - `rpc_reschedule_installment`
   - scanner de parcelas vencidas para confirmacao

Conclusao:

- o problema principal nao e ausencia de backend; e falta de integracao coerente entre dashboard, notificacoes e fluxo operacional.

---

## 3. Decisao de produto para esta fase

### 3.1. Regra principal

O dashboard precisa deixar de ser so observacao e passar a ser ponto de decisao.

### 3.2. Regra para listas criticas

Toda lista operacional longa tera:

1. altura maxima fixa
2. scroll interno
3. cabecalho fixo do card
4. rodape opcional com CTA para ver tudo

### 3.3. Regra para parcelas que pedem acao

Toda parcela clicavel deve abrir um fluxo de decisao financeira, nao navegacao por busca de lead.

### 3.4. Regra para a tela `Hoje`

`Hoje` deve priorizar urgencia e rotina, nao historico e nem analise extensa.

### 3.5. Regra para a tela `Vendas`

`Vendas` deve priorizar gargalo, concentracao por etapa e lista de leads que precisam de retorno.

---

## 4. Arquitetura UX final recomendada

## 4.1. `Hoje` - arquitetura final

Pergunta principal:

> No que eu preciso agir agora?

Estrutura recomendada:

### Linha 1 - faixa compacta de status rapido

Manter apenas 4 contadores, sem duplicar microexplicacoes logo abaixo:

1. Acoes vencidas
2. Leads parados
3. Compromissos hoje e proximos 3 dias
4. Parcelas vencidas

Ajustes:

- reduzir altura da faixa superior
- encurtar os helpers
- deixar o CTA `Abrir conversas` na mesma faixa
- remover qualquer bloco abaixo que repita exatamente o mesmo resumo em formato de outro card

### Linha 2 - painel principal em duas colunas com altura equilibrada

Coluna A:

1. `Prioridades do dia`
2. lista com altura fixa e scroll interno
3. rodape com CTA `Abrir conversas`

Coluna B:

1. `Compromissos`
2. lista com altura fixa e scroll interno
3. CTA `Ver agenda`

### Linha 3 - financeiro pratico + gargalo

Coluna A:

1. `Parcelas que pedem acao`
2. altura fixa e scroll interno
3. clique abre modal de decisao da parcela

Coluna B:

1. `Maior gargalo do momento`
2. card enxuto, sem lista longa
3. CTA `Ver vendas`

### Linha 4 - lista complementar

1. `Leads parados`
2. tabela em card com altura maxima fixa
3. scroll interno no corpo da tabela
4. CTA `Ver leads`

O que sai de `Hoje`:

1. explicacoes longas no topo
2. repeticao de gargalo em mais de um bloco
3. bloco financeiro grande demais com resumo e lista misturados sem hierarquia
4. listas abertas crescendo sem limite

---

## 4.2. `Vendas` - arquitetura final

Pergunta principal:

> Onde as vendas travam e o que precisa destravar?

Estrutura recomendada:

### Linha 1 - metricas operacionais

1. Leads em andamento
2. Mudancas de etapa
3. Vendas fechadas
4. Precisam de atencao

### Linha 2 - leitura principal

Coluna A:

1. `Onde as vendas travam`
2. `FunnelOverview` refatorado para ficar mais denso e menos disperso
3. manter resumo por grupo + maior gargalo + etapas prioritarias
4. altura visual mais compacta

Coluna B:

1. `Canais que mais vendem`
2. manter apenas o card principal por origem
3. remover bloco extra que repete raciocinio semelhante

### Linha 3 - unica area analitica longa

1. manter somente 1 grafico comercial, se continuar de fato ajudando a leitura
2. abaixo dele, `Leads que precisam de atencao`
3. tabela com altura fixa e scroll interno
4. CTA `Ver leads`

O que sai de `Vendas`:

1. card extra `Onde agir primeiro` se ele continuar duplicando `SourcePerformanceCard`
2. qualquer bloco que descreva o mesmo gargalo ja explicado no funil
3. tabela solta ocupando pagina inteira

---

## 4.3. `Financeiro` - arquitetura final

Pergunta principal:

> O que entrou, o que vai entrar e o que precisa de confirmacao agora?

Estrutura recomendada:

### Linha 1 - metricas principais

1. Faturado
2. Recebido
3. Lucro realizado
4. A receber no periodo
5. Vencido
6. Proximos 7 dias

### Linha 2 - area operacional principal

Coluna A:

1. `Parcelas que pedem acao`
2. lista com altura fixa e scroll interno
3. clique abre modal da parcela
4. prioridade visual para:
   - aguardando confirmacao
   - vencidas
   - vencem hoje
   - proximas

Coluna B:

1. `Resumo de cobranca`
2. bloco compacto com:
   - quantidade vencida
   - valor vencido
   - valor previsto nos proximos 7 dias
   - CTA `Abrir conversas`

### Linha 3 - detalhamento

1. grafico financeiro simples, se continuar ajudando
2. abaixo, lista maior de parcelas vencidas e proximas com scroll interno ou paginacao leve

O que sai de `Financeiro`:

1. comportamento de clique que leva para busca por nome do lead
2. mistura de resumo financeiro com lista aberta sem contencao
3. acao financeira inexistente no dashboard

---

## 5. Fluxo final para parcelas que pedem acao

## 5.1. Comportamento no clique da parcela

Ao clicar numa linha de parcela em `Hoje` ou `Financeiro`, abrir modal dedicado.

Titulo sugerido:

`Confirmar parcela`

Conteudo minimo:

- nome do lead
- numero da parcela
- valor
- vencimento
- texto objetivo: `Essa parcela foi paga?`

Botoes principais:

1. `Foi paga`
2. `Nao foi paga`

### Acao `Foi paga`

Comportamento:

1. chamar `confirmInstallmentPaid(installmentId)` ja existente em [useNotifications.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useNotifications.ts)
2. fechar modal
3. atualizar dashboard
4. atualizar notificacoes
5. mostrar toast curto de sucesso

### Acao `Nao foi paga`

Decisao de UX:

O primeiro passo continua simples com dois botoes, como solicitado. Porem `Nao foi paga` nao pode encerrar o fluxo sozinho, porque o backend atual trabalha com reagendamento e um "nao" sem nova data deixa a cobranca sem proximo estado util.

Solucao recomendada:

1. primeiro estado do modal: pergunta binaria simples
2. ao clicar `Nao foi paga`, o mesmo modal troca para um segundo estado minimo:
   - titulo: `Quando cobrar de novo?`
   - atalhos: `Amanha`, `Em 7 dias`
   - opcao `Escolher data`
3. ao confirmar, chamar `rescheduleInstallment(installmentId, newDueOn)` ja existente
4. atualizar dashboard e notificacoes

Importante:

- manter tudo no mesmo modal
- sem abrir outra tela
- sem formulario pesado
- sem expor linguagem tecnica

---

## 5.2. Modal automatico ao acessar o SolarZap

Requisito desejado:

> 1 dia depois do vencimento da parcela, o modal deve aparecer quando o vendedor acessar o SolarZap.

Implementacao recomendada:

### Regra funcional

Mostrar modal automatico apenas quando houver parcela:

1. pendente de confirmacao
2. vencida ha pelo menos 1 dia
3. ainda nao tratada pelo usuario

### Fonte de verdade recomendada

Usar as notificacoes financeiras ja carregadas por [useNotifications.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useNotifications.ts) como primeira fonte, porque elas ja carregam:

- `installmentId`
- `dueOn`
- `amount`
- `contactName`
- `requiresAction`

### Regra de abertura

1. ao montar `SolarZapLayout`, verificar notificacoes financeiras nao resolvidas
2. filtrar apenas parcelas com `dueOn < hoje`
3. abrir automaticamente a primeira parcela da fila
4. mostrar uma unica parcela por vez
5. ao concluir ou dispensar, registrar controle de sessao para nao reabrir em loop na mesma visita

### Controle de sessao recomendado

Usar `sessionStorage` com chave por:

- org
- usuario
- installmentId
- data da sessao

Objetivo:

- evitar modal repetindo em loop durante a mesma navegacao
- permitir reapresentacao em um acesso futuro se a parcela continuar sem resolucao

---

## 5.3. Dependencia opcional de backend

Backend ja permite confirmar e reagendar. Portanto, para a primeira entrega, nao e obrigatorio mudar Supabase.

Opcao recomendada para alinhamento futuro:

- ajustar o scanner SQL para mover a parcela para `awaiting_confirmation` apenas em D+1, e nao no proprio dia do vencimento

Hoje a migration existente usa scanner de vencimento no proprio dia. Isso nao impede a entrega do modal automatico em D+1 no frontend, mas deixa a semantica do status menos alinhada com o comportamento esperado.

Conclusao:

- **Entrega principal:** pode ser feita sem mudanca obrigatoria de backend
- **Alinhamento fino opcional:** migration de ajuste no scanner, se quisermos que notificacao e modal nascam exatamente no mesmo momento logico

---

## 6. Componentes a reutilizar

## 6.1. Reutilizar diretamente

1. [useNotifications.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useNotifications.ts)
2. [NotificationsPanel.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/NotificationsPanel.tsx)
3. [DashboardMetricGrid.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/DashboardMetricGrid.tsx)
4. [FinanceSnapshotCard.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/FinanceSnapshotCard.tsx)
5. [LeadActionQueuePanel.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/tables/LeadActionQueuePanel.tsx)
6. [CalendarSummaryPanel.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/tables/CalendarSummaryPanel.tsx)
7. [StaleLeadsTable.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/tables/StaleLeadsTable.tsx)
8. [FunnelOverview.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/dashboard/FunnelOverview.tsx)
9. componentes `Dialog`, `ScrollArea`, `Button`, `Badge`, `Card`

## 6.2. Reutilizar com refatoracao obrigatoria

1. `FinanceSnapshotCard`
   - deixar de abrir lead por nome
   - receber callback de `onReviewInstallment`
   - ganhar lista com altura fixa
2. `StaleLeadsTable`
   - trocar navegaçao para rota correta
   - aceitar `maxHeight`
   - aceitar layout com corpo scrollavel
3. `LeadActionQueuePanel`
   - aceitar altura fixa e scroll interno
   - reduzir repeticao textual
4. `CalendarSummaryPanel`
   - aceitar altura fixa e scroll interno da lista
5. `FunnelOverview`
   - reduzir dispersao de espacos e compactar leitura

## 6.3. Componentes novos recomendados

1. `InstallmentActionModal.tsx`
   - modal central do fluxo financeiro
2. `InstallmentActionList.tsx`
   - lista scrollavel reutilizavel para `Hoje` e `Financeiro`
3. `DashboardPanelFrame.tsx`
   - wrapper padrao para cards com header fixo, corpo scrollavel e CTA opcional
4. `AutoOpenInstallmentPrompt.tsx` ou hook equivalente
   - coordena fila automatica de parcelas vencidas na entrada do sistema

---

## 7. Componentes que devem perder protagonismo ou sair

1. bloco hero de `Hoje` com texto longo demais
2. duplicacao de leitura entre resumo de topo e cards operacionais subsequentes
3. card `Onde agir primeiro` em `Vendas`, se continuar repetindo `SourcePerformanceCard`
4. qualquer lista operacional solta sem altura maxima
5. qualquer acao de `abrir lead por nome` em contexto de cobranca

---

## 8. Plano de implementacao em etapas

## Etapa 0 - Blindagem antes de mexer

1. mapear todos os pontos que navegam para `/app?tab=conversas...`
2. substituir por navegacao compativel com a rota atual ou por evento `open-chat`
3. levantar casos onde a acao nao deve navegar e sim abrir modal contextual

Entrega da etapa:

- nenhum clique do dashboard deve cair em 404

---

## Etapa 1 - Infra de painel com scroll interno

1. criar um padrao de painel com:
   - cabecalho fixo
   - corpo com altura maxima
   - `ScrollArea` interno
2. aplicar primeiro em:
   - `LeadActionQueuePanel`
   - `CalendarSummaryPanel`
   - `StaleLeadsTable`
   - lista de parcelas em `FinanceSnapshotCard`
3. definir alturas responsivas consistentes por tela

Sugestao inicial de comportamento:

- desktop: entre `320px` e `420px` conforme o painel
- mobile: listas podem expandir mais, mas ainda com limite e scroll interno

Entrega da etapa:

- `Hoje` e `Vendas` deixam de "descer para sempre"

---

## Etapa 2 - Limpeza estrutural de `Hoje`

1. reduzir a altura do topo
2. manter apenas os 4 indicadores realmente imediatos
3. reorganizar a pagina em uma grade mais equilibrada
4. transformar `TodayBottleneckCard` em bloco mais curto
5. mover `Leads parados` para card de lista complementar com altura fixa
6. revisar textos para eliminar repeticao de significado

Entrega da etapa:

- `Hoje` passa a parecer uma mesa de trabalho, nao uma pagina infinita de resumo

---

## Etapa 3 - Limpeza estrutural de `Vendas`

1. manter metricas do topo
2. compactar `FunnelOverview`
3. revisar `SourcePerformanceCard` para ocupar o espaco com mais eficiencia
4. remover ou absorver `Onde agir primeiro` caso permaneça redundante
5. colocar `Leads que precisam de atencao` em painel de altura fixa
6. revisar grid para acabar com vazios desproporcionais

Entrega da etapa:

- `Vendas` passa a ter hierarquia clara entre gargalo, canais e leads parados

---

## Etapa 4 - Fluxo real de parcelas no dashboard

1. criar `InstallmentActionModal`
2. ligar o clique de parcela a esse modal
3. substituir `onOpenLead` por `onReviewInstallment`
4. integrar com:
   - `confirmInstallmentPaid`
   - `rescheduleInstallment`
5. atualizar listas apos mutacao bem sucedida

Entrega da etapa:

- `Financeiro` deixa de ser so alerta e passa a resolver a cobranca no proprio dashboard

---

## Etapa 5 - Modal automatico em D+1 ao entrar no sistema

1. no `SolarZapLayout`, observar notificacoes financeiras elegiveis
2. abrir a primeira automaticamente quando houver parcela vencida ha pelo menos 1 dia
3. garantir uma parcela por vez
4. gravar controle de sessao para nao entrar em loop
5. dar prioridade para abrir esse modal em qualquer aba, inclusive fora do dashboard

Entrega da etapa:

- o vendedor passa a ser lembrado ativamente de resolver parcela vencida

---

## Etapa 6 - Afinacao de UX e microcopy

1. simplificar textos de cards
2. encurtar descricoes repetitivas
3. revisar paddings e alturas
4. ajustar estados vazios
5. alinhar pesos visuais e bordas para reduzir sensacao de poluicao

Entrega da etapa:

- dashboard fica mais limpo, mais previsivel e mais facil de bater o olho

---

## 9. Riscos tecnicos e mitigacoes

## Risco 1 - `Nao foi paga` sem proximo estado

Risco:

- um simples "nao" sem nova data deixa a operacao financeira ambigua.

Mitigacao:

- manter o primeiro modal binario e simples
- ao escolher `Nao foi paga`, abrir segundo estado minimo no mesmo modal para reagendamento

---

## Risco 2 - Modal automatico abrir de forma irritante

Risco:

- o modal pode reaparecer varias vezes no mesmo acesso e gerar fadiga.

Mitigacao:

- controle por `sessionStorage`
- fila de uma parcela por vez
- nao reabrir automaticamente a mesma parcela na mesma sessao apos dispensar

---

## Risco 3 - Divergencia entre dashboard e notificacoes

Risco:

- duas superficies diferentes podem exibir a mesma parcela com comportamentos distintos.

Mitigacao:

- usar as mesmas mutacoes (`confirmInstallmentPaid` e `rescheduleInstallment`)
- padronizar nomenclatura e CTA
- atualizar dashboard e notificacoes apos qualquer acao

---

## Risco 4 - Scroll interno ruim em mobile

Risco:

- scroll interno mal configurado pode piorar usabilidade em telas pequenas.

Mitigacao:

- usar alturas menores apenas em desktop
- em mobile, permitir expansao controlada e evitar zonas de scroll impossiveis
- testar toque, rolagem e foco de teclado

---

## Risco 5 - Alterar rota de conversa de forma inconsistente

Risco:

- parte do sistema continuar em `/app?...` e outra parte em `/?...`.

Mitigacao:

- centralizar abertura de conversa em helper unico
- substituir links quebrados por um unico mecanismo oficial de navegacao

---

## 10. Dependencias de backend

### Obrigatorias para a primeira entrega

- nenhuma obrigatoria, porque o projeto ja possui RPCs e modelo de dados suficientes para confirmar e reagendar parcelas

### Opcionais para alinhamento fino

1. migration para atrasar o scanner de `awaiting_confirmation` para D+1
2. eventual RPC de "dispensar ate mais tarde" se o produto quiser um terceiro estado mais leve no futuro

---

## 11. Checklist final de validacao

## Navegacao

- [ ] nenhum clique do dashboard leva para `404`
- [ ] toda linha clicavel tem acao coerente com o contexto

## Hoje

- [ ] nao ha repeticao obvia entre topo e blocos de detalhe
- [ ] listas principais possuem scroll interno
- [ ] a pagina fica legivel sem rolagem infinita
- [ ] gargalo aparece uma vez, no lugar certo

## Vendas

- [ ] nao ha bloco redundante explicando o mesmo gargalo
- [ ] leads que precisam de atencao ficam em painel contido
- [ ] o grid nao deixa vazios estranhos no desktop

## Financeiro

- [ ] clicar em parcela abre modal
- [ ] `Foi paga` confirma corretamente
- [ ] `Nao foi paga` leva a reagendamento minimo
- [ ] dashboard atualiza apos a acao
- [ ] notificacoes atualizam apos a acao

## Modal automatico

- [ ] so aparece para parcelas vencidas ha pelo menos 1 dia
- [ ] abre no acesso do vendedor ao sistema
- [ ] nao entra em loop na mesma sessao
- [ ] respeita fila de uma parcela por vez

## Dados

- [ ] faturado, recebido, lucro e vencido continuam coerentes com a regra atual
- [ ] nenhuma metrica e recalculada com base inventada
- [ ] a lista de parcelas usa `installmentId` real e nao busca por nome do lead

## UX

- [ ] usuario entende o que fazer em menos de 10 segundos
- [ ] a tela parece organizada e nao empilhada
- [ ] as listas ficam contidas e previsiveis
- [ ] o fluxo financeiro fecha a tarefa sem sair do contexto

---

## 12. Ordem recomendada de execucao

1. corrigir navegacao quebrada e acao contextual de parcela
2. criar infraestrutura de painel com scroll interno
3. limpar `Hoje`
4. limpar `Vendas`
5. implementar modal de parcela
6. implementar modal automatico em D+1
7. revisar microcopy e acabamentos finais

---

## 13. Decisao final recomendada

A proxima implementacao deve seguir esta direcao:

1. tratar `Parcelas que pedem acao` como fluxo financeiro real, nao como atalho para abrir lead
2. transformar `Hoje` em painel operacional compacto
3. transformar `Vendas` em leitura de gargalo com listas contidas
4. padronizar scroll interno para listas longas
5. usar a infraestrutura de notificacoes e RPCs que ja existe para nao inventar um segundo sistema

Esse e o menor caminho para sair de um dashboard que ainda "mostra coisa demais" para um dashboard que de fato ajuda vendedor e dono a decidir e agir.
