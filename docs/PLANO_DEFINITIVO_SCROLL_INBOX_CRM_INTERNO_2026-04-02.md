# Plano Definitivo: corrigir o scroll do inbox do CRM Interno

Data: 2026-04-02
Status: análise e planejamento somente. Não executar nada a partir deste arquivo até nova autorização.

## Contexto

O problema reportado permanece mesmo após o último deploy:

- o navegador continua exibindo scroll da página inteira
- o histórico de mensagens do chat não se comporta como viewport interna independente
- o inbox continua "carregando todas as mensagens" no fluxo do documento, em vez de confinar o scroll no painel central

Pelo screenshot mais recente:

- a mídia já está renderizando
- o layout de 3 colunas aparece
- o bug restante está concentrado no host de scroll do workspace de conversas

Ou seja:

- o problema principal agora não é mais o render de mídia
- é a arquitetura do container do inbox e do chat

## Conclusão da análise

## 1. O erro anterior atacou a camada errada

Foi tentado corrigir:

- [AdminLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminLayout.tsx)
- [InternalCrmPageLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\InternalCrmPageLayout.tsx)
- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)

Esses ajustes ajudaram a reduzir parte do vazamento de altura, mas não resolveram a raiz.

O fato de o browser continuar com scroll global mesmo depois dessas mudanças mostra que:

- o leak final não está apenas no shell do Admin
- ele está no próprio workspace do inbox

## 2. O CRM Interno não replica a hierarquia estrutural estável do SolarZap principal

O SolarZap principal usa uma cadeia muito específica para conter o scroll do chat:

- workspace root com `flex-1`, `min-h-0`, `overflow-hidden`
- camada intermediária com `flex flex-1 min-h-0 min-w-0`
- coluna do chat com `h-full overflow-hidden`
- componente `ChatArea` com `flex-1 flex flex-col min-h-0 overflow-hidden`
- viewport do histórico com `flex-1 min-h-0 overflow-y-auto`

Referência estrutural:

- [SolarZapLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\solarzap\SolarZapLayout.tsx)
- [ChatArea.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\solarzap\ChatArea.tsx)

O CRM Interno hoje usa uma composição diferente:

- `PageHeader` fora do workspace de conversas
- card arredondado como sibling do header
- grid 3 colunas dentro do card
- chat dentro dessa grid
- `InternalCrmChatAreaFull` tentando se comportar como viewport final

Arquivos:

- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)
- [InternalCrmChatAreaFull.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmChatAreaFull.tsx)

Essa composição "parecida", mas não igual, é a raiz mais provável do problema.

## 3. O host de scroll ainda está sendo resolvido pelo documento, não pelo viewport central do chat

Mesmo com `overflow-y-auto` em:

- [InternalCrmChatAreaFull.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmChatAreaFull.tsx)

o histórico só vira scroll interno se toda a cadeia acima estiver corretamente limitada.

Como o browser ainda mostra scroll global:

- algum ancestral do chat continua deixando a altura crescer por conteúdo
- então o histórico não está sendo "espremido" para virar viewport

Em termos práticos:

- o `overflow-y-auto` existe
- mas ainda não é o scroll host ativo do workspace

## 4. O sinal visual atual confirma que o problema está concentrado no painel central

No screenshot mais recente:

- a lista esquerda parece estável
- o painel direito parece estável
- quem continua "vazando" é o fluxo vertical da área central

Isso estreita a causa para:

- a coluna central do grid do inbox
- ou o root do `InternalCrmChatAreaFull`
- ou a ausência de uma camada intermediária idêntica à do `SolarZapLayout`

## Diagnóstico técnico por arquivo

## A. [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)

Problemas prováveis:

- `PageHeader` fora do workspace real do chat
- `gap-4` no root empilhando header e card em vez de formar um workspace contínuo
- o card principal não replica a malha estrutural do `SolarZapLayout`
- faltam camadas equivalentes a:
  - `flex flex-1 min-h-0 min-w-0`
  - `h-full overflow-hidden`
  - wrappers separados por responsabilidade de scroll

Conclusão:

- o inbox precisa ser redesenhado como workspace de conversas, não como "página comum com header + card"

## B. [InternalCrmChatAreaFull.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmChatAreaFull.tsx)

Problemas prováveis:

- o componente assume que já recebeu uma altura resolvida pelo parent
- mas a árvore acima ainda não entrega um viewport fechado
- o `messagesEndRef` e o `scrollRef` estão corretos para um chat normal
- porém a contenção depende do shell, não apenas do próprio componente

Conclusão:

- o `InternalCrmChatAreaFull` pode até estar correto isoladamente
- mas ele está encaixado num shell estruturalmente errado

## C. [InternalCrmPageLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\InternalCrmPageLayout.tsx)

Foi ajustado para `flex-1`, mas isso não basta.

Conclusão:

- o page layout agora ajuda
- mas não substitui o workspace interno correto do inbox

## Causa raiz mais provável

Resumo direto:

- o inbox do CRM Interno foi tratado como "página administrativa com cabeçalho", quando na prática ele precisa ser um "workspace operacional de conversas" como o SolarZap principal

Isso deixa o componente central tentando resolver scroll sozinho, sem o mesmo arcabouço estrutural do SolarZap.

O resultado é:

- browser/documento vira scroll host
- não o painel de mensagens

## O que NÃO fazer

Para não repetir o erro:

- não continuar empilhando `min-h-0`, `overflow-hidden` e `flex-1` aleatoriamente em pais diferentes
- não tentar corrigir só com CSS superficial no `InternalCrmChatAreaFull`
- não manter o `PageHeader` externo ao workspace se ele continuar participando do cálculo de altura do inbox
- não seguir com remendos de overflow sem inspecionar a cadeia inteira do root até o viewport de mensagens

## Estratégia correta

## Fase 1 - Reproduzir e instrumentar o problema

Antes de editar:

1. abrir o inbox com várias mensagens
2. medir em runtime:
   - `window.innerHeight`
   - altura do root do inbox
   - altura do card principal
   - altura da coluna central
   - `clientHeight` e `scrollHeight` do `scrollRef`
3. identificar explicitamente quem está virando o scroll host:
   - documento
   - `main`
   - page layout
   - card do inbox
   - viewport do chat

Saída esperada:

- tabela clara de alturas e overflows
- confirmação precisa do primeiro ancestral que está crescendo por conteúdo

## Fase 2 - Refatorar o inbox para o modelo de workspace do SolarZap

Trocar a estrutura atual do inbox por uma versão equivalente ao fluxo do SolarZap:

### Estrutura desejada

1. root do inbox:
   - `flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden`
2. cabeçalho do inbox:
   - `shrink-0`
3. workspace de conversas:
   - `flex flex-1 min-h-0 min-w-0 overflow-hidden`
4. coluna esquerda:
   - `min-h-0 overflow-hidden`
5. coluna central:
   - `min-h-0 min-w-0 overflow-hidden`
6. coluna direita:
   - `min-h-0 overflow-hidden`

Conclusão:

- o chat deixa de ser uma "seção dentro de um card"
- e passa a ser um workspace operacional propriamente dito

## Fase 3 - Mover o PageHeader para fora da competição de scroll

Opções válidas:

### Opção recomendada

- manter o `PageHeader` como bloco fixo `shrink-0`
- logo abaixo dele, o workspace ocupa `flex-1 min-h-0`

### Opção alternativa

- remover o `PageHeader` desse inbox
- criar header compacto interno ao próprio workspace

Recomendação:

- usar a primeira opção
- porque preserva consistência visual com o resto do CRM

## Fase 4 - Garantir um único scroll host para o histórico

No painel central:

- `InternalCrmChatAreaFull` deve continuar com:
  - root: `flex h-full min-h-0 flex-col overflow-hidden`
  - messages viewport: `flex-1 min-h-0 overflow-y-auto`

Mas o plano definitivo exige validar que:

- nenhum ancestral do chat tenha `overflow-auto` competindo com ele
- nenhum wrapper do chat tenha altura "auto por conteúdo"

## Fase 5 - Blindar o scroll da lista e do painel lateral

Separar scroll por coluna:

- conversa/lista: scroll próprio
- histórico: scroll próprio
- painel lateral: scroll próprio

Resultado esperado:

- rolagem no histórico não movimenta o documento
- rolagem do painel lateral não afeta o histórico
- rolagem da lista não afeta o painel central

## Fase 6 - Validar em runtime com dataset/testid

Adicionar temporariamente:

- `data-testid="crm-inbox-root"`
- `data-testid="crm-inbox-workspace"`
- `data-testid="crm-inbox-chat-column"`
- `data-testid="crm-inbox-chat-scroll"`

Usar isso para confirmar:

- o `crm-inbox-chat-scroll` é o único host com `scrollHeight > clientHeight`
- o documento não cresce além da viewport

Depois:

- manter os `data-testid` se ajudarem nos testes e2e

## Fase 7 - Criar teste de regressão de scroll

Criar smoke/e2e específico do inbox:

- abrir conversa com histórico longo
- confirmar que a página não cresce além da viewport
- confirmar que o scroll ocorre no host interno do chat
- confirmar que a lista e o painel lateral permanecem independentes

Teste recomendado:

- `tests/e2e/internal-crm-inbox-scroll.spec.ts`

Checks:

- `document.scrollingElement.scrollHeight` próximo da viewport
- `chatScroll.scrollHeight > chatScroll.clientHeight`
- wheel/scroll altera `chatScroll.scrollTop`

## Arquivos mais prováveis de alteração futura

- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)
- [InternalCrmChatAreaFull.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmChatAreaFull.tsx)
- [InternalCrmConversationList.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmConversationList.tsx)
- [InternalCrmActionsPanelFull.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmActionsPanelFull.tsx)
- [InternalCrmPageLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\InternalCrmPageLayout.tsx)
- [AdminLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminLayout.tsx)

## Critério de aceite

O corretivo só pode ser considerado resolvido quando:

1. o navegador deixar de exibir scroll da página para o histórico do inbox
2. o histórico central virar o único viewport de rolagem das mensagens
3. a lista da esquerda tiver scroll próprio
4. o painel da direita tiver scroll próprio
5. o chat continuar funcionando com imagem e vídeo
6. o comportamento for validado em desktop real, não só por build

## Resumo executivo

O erro não é mais "um detalhe de CSS".

A causa mais provável é arquitetural:

- o inbox do CRM Interno ainda não usa o mesmo modelo de workspace do SolarZap principal
- por isso o scroll host continua sendo resolvido fora do painel central

O conserto correto não é mais adicionar `overflow-hidden` em camadas aleatórias.

O conserto correto é:

- portar a estrutura de workspace do SolarZap
- medir o host de scroll em runtime
- deixar o histórico central como único viewport de mensagens

## Regra deste plano

Não executar nada ainda.

Próximo passo somente quando o usuário mandar:

- executar este plano definitivo de scroll
