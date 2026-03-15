# Plano Corretivo Mobile Definitivo

Data: 15/03/2026
Status: Analise concluida, aguardando autorizacao para implementar
Metodo: leitura dos planos anteriores + auditoria de codigo + validacao no browser em viewport mobile

## Escopo real desta analise

Este documento substitui os planos anteriores como referencia principal para a proxima execucao.

O objetivo aqui nao e propor mais um plano teorico. O objetivo e registrar:

1. O que foi de fato confirmado no codigo atual.
2. O que foi de fato reproduzido no browser mobile atual.
3. Quais itens dos planos anteriores ficaram so parcialmente implementados ou foram implementados de forma incorreta.
4. Qual e a ordem correta de correcao para eliminar os bugs sem criar novas regressões.

## Fontes usadas

Planos revisados:
- docs/PLANO_CORRETIVO_MOBILE_V2.md
- docs/PLANO_ACAO_MOBILE_FINAL.md
- docs/MOBILE_FUNCTIONAL_ACTION_PLAN.md

Validacao em browser:
- viewport mobile no app local em http://localhost:8081/
- navegacao real em Conversas, Mais, Contatos e Disparos
- inspecao do estado renderizado e dos containers scrollaveis

## Conclusao executiva

Os problemas restantes nao sao pontuais. Eles sao estruturais.

O app ainda tem tres classes de falha repetidas:

1. Shell mobile inconsistente entre abas.
2. Cadeia de flex/scroll quebrada em varias views.
3. Adaptacoes mobile incompletas, onde parte da ideia do plano foi aplicada, mas a causa-raiz nao foi corrigida.

Em termos práticos:
- algumas correcões anteriores existem no codigo, mas nao resolvem o fluxo completo;
- alguns bugs reportados pelo usuario continuam reproduzindo localmente;
- alguns itens foram implementados diferentes do que foi pedido;
- ha pelo menos um bloqueador adicional de confiabilidade no ambiente local: erro fatal intermitente envolvendo AutomationProvider/useAuth.

## O que foi confirmado no browser agora

### Confirmado: bug real ainda presente em Disparos

Reproducao:
- abrir aba Disparos no mobile
- a tela renderiza campanhas
- nenhum container scrollavel funcional aparece no DOM durante a validacao
- document/body permanecem com altura fixa igual ao viewport

Evidencia observada:
- nao houve nenhum elemento com overflow-y auto/scroll e scrollHeight > clientHeight durante a validacao do viewport mobile
- isso explica por que o usuario relata que a aba "continua sem o scroll funcionando"

Conclusao:
- o problema nao foi resolvido
- a view continua sem uma cadeia de altura/scroll funcional no mobile

### Confirmado: bug real ainda presente em Contatos

Reproducao:
- abrir aba Contatos no mobile
- a interface entra em detalhe/lista, mas a validacao nao encontrou container scrollavel funcional
- a tela de detalhe/lista continua com comportamento inconsistente de rolagem

Conclusao:
- o problema continua reproduzindo
- a tentativa anterior de adicionar min-h-0 foi incompleta e nao atingiu toda a cadeia de containers

### Confirmado: duplicidade de Configuracoes no modal Mais

Reproducao:
- abrir modal Mais
- aparecem dois acessos de Configuracoes ao mesmo tempo:
  - um card da grade principal
  - um CTA adicional "Configuracoes / Conta, IA, integracoes e equipe"

Causa confirmada no codigo:
- MobileMoreModal mostra um item de configuracoes em mobileMoreMainItems
- e tambem renderiza um segundo botao separado para abrir a secao de settings

Conclusao:
- esse bug esta reproduzindo agora
- e um problema estrutural do componente, nao um bug visual isolado

### Confirmado: o botao do Calendario foi implementado errado

Pedido original do usuario:
- botao Eventos
- ao clicar, abrir a experiencia que agrupa proximos/passados e dali permitir abrir arquivo e arquivar eventos passados

Estado atual do codigo:
- foi adicionado um botao Arquivo na barra mobile
- isso nao corresponde ao pedido

Conclusao:
- implementacao divergente do requisito
- deve ser revertida para uma experiencia centrada em Eventos, nao Arquivo

### Confirmado: clique unico em Conversas funciona localmente no estado atual

Reproducao local:
- clique em uma conversa no mobile abriu o chat em 1 clique

Leitura do codigo atual:
- ConversationList ja esconde AssignMemberSelect em mobile
- a causa-raiz anterior daquele bug especifico foi removida no codigo local

Conclusao:
- no estado local atual, esse bug nao reproduziu
- portanto ele deve entrar no plano como item de regressao a validar em staging/producao, nao como causa-raiz ativa local

### Confirmado: preview de imagem/video continua com sizing estatico

Causa confirmada no codigo:
- MessageContent usa `max-w-[280px]` para imagem e video
- ChatArea usa bubble `max-w-[82%]` no mobile

Efeito:
- o preview nao escala a partir do viewport real nem do contexto da mensagem
- em telas estreitas, o bloco visual continua grande demais e desproporcional

Conclusao:
- a reclamacao do usuario faz sentido
- o sizing ainda e estatico e precisa ser tornado responsivo ao viewport e ao tipo de midia

## Achados sistemicos do codigo

### 1. O topo nao esta realmente fixo em todas as abas

Causa-raiz:
- varias views ainda colocam o PageHeader dentro da area que deveria rolar
- em outras, a view tem overflow no root em vez de separar header fixo e content scrollavel

Padrao incorreto atual:
- root rolando + PageHeader dentro do root

Padrao correto desejado:
- root: `flex-1 flex flex-col min-h-0 overflow-hidden`
- header: `flex-shrink-0`
- content: `flex-1 min-h-0 overflow-y-auto`

Esse problema explica diretamente o pedido:
- "quero que o cabecalho e menu de baixo esteja fixo em todas as abas"

Observacao importante:
- o menu inferior ja e fixo na arquitetura principal
- o que nao esta padronizado e o topo de cada aba
- e, no caso de Conversas, o composer/chat shell ainda precisa ser tratado como parte fixa do layout interno da tela

### 2. Falta padronizacao da cadeia `min-h-0`

Esse e o problema mais repetido do app inteiro.

O que acontece hoje:
- um container pai usa flex
- um filho usa `flex-1 overflow-auto`
- mas um ancestor acima nao tem `min-h-0`
- o navegador nao cria uma area de scroll real
- o conteudo fica preso ou cortado

Esse problema explica diretamente:
- Disparos sem scroll
- Contatos com scroll bugado
- parte dos problemas de Conversas
- varios sintomas de Tracking e abas densas

### 3. MobileMoreModal tem arquitetura de navegacao duplicada

Causa-raiz confirmada:
- `mobileMoreMainItems` ja inclui a acao `settings`
- o componente ainda renderiza um segundo botao separado para abrir settingsItems

Resultado:
- duplicidade visual
- confusao de hierarquia
- UX incoerente

### 4. Calendario mobile esta com semantica errada

O problema nao e so texto.

Hoje ha tres conceitos diferentes misturados:
- proximos eventos
- eventos passados
- arquivo historico

O usuario pediu uma entrada chamada Eventos que abrisse a experiencia mobile equivalente ao desktop, de onde ele pudesse:
- ver passados e futuros
- abrir arquivo completo
- arquivar os passados

O que foi feito foi apenas adicionar um atalho direto para Arquivo.

Isso e funcionalmente diferente do pedido.

### 5. Tracking ainda esta so parcialmente adaptado ao mobile

Embora o codigo ja tenha encurtado labels de tabs e trocado a tabela de entregas por cards no mobile, ainda restam dois problemas estruturais:

1. a barra de tabs continua em `flex-nowrap` com `overflow-x-auto` sem affordance visual adequada;
2. a tela ainda nao segue um shell consistente de header fixo + conteudo rolavel.

Resultado prático:
- a barra de selecao continua com cara de bugada no mobile;
- o usuario nao percebe claramente que pode arrastar horizontalmente;
- a experiencia parece quebrada mesmo quando tecnicamente responde.

### 6. Contatos ainda mistura estados de lista e detalhe sem um shell mobile definitivo

O problema atual nao e so scroll.

A aba Contatos ainda mistura:
- header da lista
- lead scope selector
- busca
- lista
- detalhe
- header do detalhe
- acoes do detalhe

Sem uma cadeia clara de containers fixos e scrollaveis por estado.

Resultado:
- comportamento instavel no mobile
- detalhe abre, mas o scroll nao fica confiavel
- a UX continua densa demais

### 7. Disparos continua sem shell de viewport confiavel

O root ganhou `min-h-0`, mas isso nao bastou.

Falta ajustar pelo menos:
- o wrapper do conteudo scrollavel para `min-h-0`
- a relacao com o parent shell da aba
- a verificacao real de qual elemento esta recebendo a rolagem no mobile

Enquanto isso nao for resolvido em cadeia completa, a aba pode continuar renderizando cards sem scroll real.

### 8. O app local tem um erro grave intermitente que afeta a confiabilidade da QA

Erro observado no browser:
- `useAuth must be used within an AuthProvider`
- stack envolvendo `AutomationProvider`

Isso aparece de forma intermitente no log do browser local.

Mesmo quando a UI consegue voltar a renderizar, esse erro indica que a baseline do ambiente local nao esta 100% confiavel para validar todos os fluxos.

Esse item deve entrar no plano como bloqueador de confiabilidade de QA antes da rodada final de adaptacao mobile.

## O que dos planos anteriores ficou parcialmente implementado ou nao implementado

### Itens parcialmente implementados

1. Conversas 1 clique
- corrigido localmente para o caso antigo do AssignMemberSelect
- precisa apenas de validacao final em deploy

2. Audio mobile
- o codigo ja usa preferencia por ogg/webm com mimeType real
- esse item nao e mais a prioridade principal

3. Mic com PointerEvents
- ja existe no codigo atual
- nao entra mais como causa-raiz principal desta rodada

4. Tracking mobile
- houve adaptacao parcial
- continua faltando resolver shell, affordance e UX da barra

### Itens implementados de forma incorreta

1. Calendario
- pedido era Eventos
- foi entregue Arquivo

2. Notificacoes full-screen
- houve alteracao no NotificationsPanel
- mas a estrategia aprovada no plano anterior falava em tratamento de navegação full-screen equivalente a aba, o que nao foi concluido na arquitetura principal

3. IA mobile simplificada
- ajustes pequenos de texto e spacing foram feitos
- o colapso estrutural das secoes densas nao foi implementado como previsto no plano final

### Itens nao implementados de forma definitiva

1. shell fixo de topo em todas as abas
2. cadeia de scroll correta em Contatos
3. cadeia de scroll correta em Disparos
4. limpeza arquitetural do modal Mais
5. experiencia correta de Eventos no Calendario
6. sizing responsivo de midia no chat
7. revisao definitiva da barra de tabs de Tracking

## Plano corretivo definitivo

## Fase 0 - Baseline confiavel de QA

Objetivo:
- garantir que a proxima rodada de validacao mobile seja feita sobre uma baseline estavel

Tarefas:
1. Corrigir o erro intermitente envolvendo AutomationProvider/useAuth.
2. Confirmar que o app local abre sem pageError fatal no fluxo autenticado.
3. Padronizar viewport de teste mobile em 390x844 e 375x812.
4. Preparar um roteiro fixo de navegacao por abas para a iteracao posterior.

Resultado esperado:
- ambiente local confiavel para QA funcional mobile.

## Fase 1 - Corrigir o shell mobile compartilhado

Objetivo:
- fixar topo e base em toda a aplicacao, com scroll apenas no miolo da aba

Tarefas:
1. Padronizar todas as views operacionais para o shell:
   - root `flex-1 flex flex-col min-h-0 overflow-hidden`
   - header `flex-shrink-0`
   - content `flex-1 min-h-0 overflow-y-auto`
2. Revisar o acoplamento de PageHeader em:
   - BroadcastView
   - ContactsView
   - CalendarView
   - DashboardView
   - PipelineView
   - ProposalsView
   - TrackingView
   - KnowledgeBaseView
3. Validar especialmente Conversas com o composer grudado ao rodape da area do chat.

Resultado esperado:
- header fixo em todas as abas
- bottom nav fixo
- scroll isolado no conteudo

## Fase 2 - Resolver scroll quebrado de verdade

Objetivo:
- eliminar definitivamente os bugs de scroll que ainda reproduzem

Tarefas:
1. Disparos
   - corrigir a cadeia completa de `min-h-0`
   - garantir que exista um unico container scrollavel funcional
   - validar no browser que `scrollHeight > clientHeight` no container certo
2. Contatos
   - separar de forma definitiva os estados lista e detalhe no mobile
   - adicionar `min-h-0` em todos os ancestors do painel de detalhe
   - garantir header do detalhe fixo e conteudo interno rolavel
3. CalendarView
   - revisar conflitos entre grid principal, drawer e paineis auxiliares
4. TrackingView
   - remover conflitos de scroll entre tab strip e conteudo

Resultado esperado:
- Contatos e Disparos rolando corretamente no mobile
- nenhum conteudo essencial preso ou cortado

## Fase 3 - Corrigir navegacao mobile mal resolvida

Objetivo:
- remover ambiguidade e comportamento errado nos atalhos mobile

Tarefas:
1. MobileMoreModal
   - remover a duplicidade de Configuracoes
   - decidir uma unica hierarquia:
     - ou grade principal sem card Configuracoes e com CTA unico para settings
     - ou card Configuracoes na grade principal sem segundo CTA redundante
2. Calendario
   - substituir o botao Arquivo por Eventos
   - abrir drawer/modal de eventos que concentre passados e futuros
   - desse fluxo permitir abrir Arquivo e arquivar passados
3. Tracking
   - transformar a barra de tabs em um controle claramente horizontal, com affordance visual nas bordas
   - revisar labels e espacos para nao parecer quebrada

Resultado esperado:
- navegacao mobile coerente, sem duplicidade e sem atalho errado

## Fase 4 - Ajuste visual/funcional das mensagens e midias

Objetivo:
- adaptar Conversas para leitura real em mobile

Tarefas:
1. Redimensionar bubble de mensagem com regra mais proporcional ao viewport.
2. Tornar preview de imagem e video dependente do viewport e do tipo de midia, em vez de `max-w-[280px]` fixo.
3. Revisar imagens expandidas, thumbs e videos para nao dominar a tela.
4. Revisar spacing vertical do chat para densidade melhor no mobile.

Resultado esperado:
- mensagens e midias legiveis sem parecer oversized

## Fase 5 - QA por aba, iterativa, ate fechar o mobile

Objetivo:
- fazer a rodada que voce pediu: validar aba por aba, corrigir, retestar, repetir

Roteiro minimo de QA:
1. Conversas
2. Pipelines
3. Calendario
4. Contatos
5. Disparos
6. Propostas
7. Dashboard
8. Tracking
9. IA
10. Automacoes
11. Integracoes
12. Minha Empresa
13. Minha Conta
14. Meu Plano
15. Gestao de Equipe

Critério de saida por aba:
- abre corretamente em mobile
- topo fixo
- base fixa
- scroll do conteudo funciona
- nenhuma acao primaria fica inacessivel
- nenhum modal ou drawer fica sem forma clara de fechar
- nenhuma regressao desktop aparente

## Matriz de prioridade

P0
- shell fixo compartilhado
- Disparos sem scroll
- Contatos sem scroll
- Modal Mais com duplicidade
- Calendario Eventos vs Arquivo

P1
- Tracking tab bar / affordance
- midia e mensagens no chat
- validar Conversas em deploy apos baseline

P2
- simplificacao adicional de telas densas
- refinamentos de spacing e headers secundários

## Arquivos mais provaveis na proxima execucao

Shared shell e navegacao:
- src/components/solarzap/SolarZapLayout.tsx
- src/components/solarzap/PageHeader.tsx
- src/components/solarzap/MobileMoreModal.tsx
- src/components/solarzap/mobileNavConfig.ts

Abas com bugs confirmados:
- src/components/solarzap/BroadcastView.tsx
- src/components/solarzap/ContactsView.tsx
- src/components/solarzap/CalendarView.tsx
- src/components/solarzap/TrackingView.tsx
- src/components/solarzap/ChatArea.tsx
- src/components/solarzap/MessageContent.tsx

Ambiente/base de QA:
- src/contexts/AutomationContext.tsx
- src/contexts/AuthContext.tsx
- src/App.tsx

## Resumo final

O estado atual confirma que ainda faltam alteracoes importantes.

Os bugs mais relevantes que continuam reais agora sao:
- Disparos sem scroll
- Contatos sem scroll
- Configuracoes duplicado no Mais
- Calendario com botao errado
- shell mobile ainda nao fixado de forma consistente
- Tracking ainda com adaptacao incompleta
- previews de midia ainda grandes/dimensionados de forma estatica

Tambem ficou claro que parte do que foi planejado antes foi implementada apenas parcialmente.

A proxima execucao deve comecar pela arquitetura compartilhada e pela confiabilidade do ambiente, nao por remendos pontuais por tela.
