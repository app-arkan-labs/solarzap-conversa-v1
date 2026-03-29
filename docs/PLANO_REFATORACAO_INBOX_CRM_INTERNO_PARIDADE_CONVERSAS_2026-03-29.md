# Plano de Refatoracao — Inbox do CRM Interno com Paridade da Aba Conversas

Data: 2026-03-29
Contexto base: `src/components/solarzap/SolarZapLayout.tsx`, `src/components/solarzap/ConversationList.tsx`, `src/components/solarzap/ChatArea.tsx`, `src/components/solarzap/ActionsPanel.tsx`, `src/components/solarzap/ConversationActionsSheet.tsx`
Destino: `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx` e subcomponentes em `src/modules/internal-crm/components/inbox/*`

---

## 0. Objetivo

Refazer a aba `Inbox` do CRM interno para que ela fique **visualmente e estruturalmente igual a aba Conversas do SolarZap**, com a mesma sensacao de produto, mesma composicao de workspace, mesma densidade visual e mesma hierarquia de interacoes.

O resultado esperado nao e uma pagina "parecida" nem uma reinterpretacao simplificada. O resultado esperado e uma **copia adaptada ao contexto do CRM interno**, preservando o isolamento de dados do modulo `internal_crm`.

---

## 1. Problema Atual

O Inbox interno atual ficou como uma pagina funcional, mas **nao replica a experiencia da aba Conversas**.

### Estado atual ruim

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx` monta um grid de 3 colunas com cara de dashboard, nao um workspace de conversas.
- `InternalCrmConversationList.tsx` renderiza cards simples, sem a linguagem visual da lista real do SolarZap.
- `InternalCrmChatArea.tsx` e um container generico com header simples, bolhas basicas e composer isolado.
- `InternalCrmActionsPanel.tsx` virou um conjunto de cards, quando no SolarZap o painel lateral e uma coluna operacional densa, continua e integrada.
- `InternalCrmConversationActionsSheet.tsx` virou um sheet raso com tres botoes, sem reproduzir o modo operacional da aba Conversas.
- O bloco de `Instancias internas` ficou fora do fluxo principal do Inbox, quebrando a experiencia.

### Consequencia

O CRM interno parece outro produto. A aba nao herda a ergonomia nem a fluidez operacional da aba Conversas do SolarZap.

---

## 2. Regra de Execucao

A estrategia aqui e **copy-first de apresentacao**.

Isso significa:

1. Copiar a estrutura visual e a composicao da aba Conversas do SolarZap.
2. Trocar a camada de dados e as acoes para o contexto `internal_crm`.
3. Adaptar labels, campos e quick actions ao CRM interno.
4. Nao inventar um layout alternativo.

### Regras inegociaveis

1. Zero escrita no schema `public` a partir do Inbox interno.
2. Zero reutilizacao de hooks de escrita do SolarZap principal.
3. Zero condicional por host ou modo dentro dos componentes do SolarZap principal.
4. Todo o trabalho de UI deve ficar no namespace `src/modules/internal-crm/*`.
5. A experiencia final precisa bater a aba Conversas do SolarZap em desktop e mobile.

---

## 3. Fontes e Destinos

### Fontes visuais e estruturais obrigatorias

- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/ActionsPanel.tsx`
- `src/components/solarzap/ConversationActionsSheet.tsx`

### Destinos a refatorar

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/hooks/useInternalCrmApi.ts`
- `src/modules/internal-crm/types/index.ts`
- `supabase/functions/internal-crm-api/index.ts`

---

## 4. Gap Real Entre SolarZap e Inbox Interno

### 4.1 Shell da pagina

#### SolarZap

- Workspace continuo de conversas.
- Sidebar esquerda + chat central + painel lateral direito.
- Larguras, abertura e fechamento de paineis fazem parte da experiencia.
- Acoes e detalhes vivem dentro da mesma tela.

#### CRM interno atual

- Grid de cards com header de modulo.
- A area de instancias esta fora do fluxo da conversa.
- Nao existe sensacao de workspace continuo.

### 4.2 Lista de conversas

#### SolarZap

- Lista densa, viva, com forte sinal visual.
- Busca, filtros, estados, badges, horario, preview e acoes por linha.
- Comportamento especial quando painel operacional esta aberto.

#### CRM interno atual

- Lista simples em cards arredondados.
- Sem densidade, sem sinais fortes de unread, ownership, contexto e operacao.

### 4.3 Chat area

#### SolarZap

- Header robusto.
- Area de mensagens com estados, reply, anexos, acoes e composer integrado.
- Fluxo de conversa domina a tela.

#### CRM interno atual

- Header basico.
- Bolhas simplificadas.
- Composer em formato de formulario separado.

### 4.4 Painel lateral direito

#### SolarZap

- Coluna operacional unica.
- Header STATUS.
- Toggle de follow-up.
- Quick actions coloridas.
- Dados do cliente editaveis.
- Pipeline, observacoes, propostas e controle operacional no mesmo painel.

#### CRM interno atual

- Varios cards empilhados.
- Sem mesma hierarquia visual.
- Sem mesmo impacto operacional.

### 4.5 Modo actions sheet

#### SolarZap

- Existe modo operacional proprio para trabalhar lista + acoes em conjunto.
- Nao e um modal raso nem um sheet trivial.

#### CRM interno atual

- Sheet simplificado com apenas tres acoes de status.

---

## 5. Meta Visual e Funcional

Ao fim da refatoracao, o Inbox interno deve ter:

1. A mesma composicao da aba Conversas do SolarZap.
2. A mesma densidade visual da lista de conversas.
3. O mesmo tipo de area central de chat.
4. Um painel lateral direito com a mesma linguagem visual do ActionsPanel.
5. Um modo de acoes semelhante ao ConversationActionsSheet.
6. Responsividade equivalente: lista -> chat -> detalhes no mobile.

---

## 6. O Que Deve Ser Adaptado Ao Contexto Do CRM Interno

### Entidades

- `Lead` do SolarZap vira `Client` do CRM interno.
- A conversa passa a usar `internal_crm.conversations` e `internal_crm.messages`.
- O contexto comercial vem de `deals`, `tasks`, `appointments` e `customer_app_links`.

### Quick actions

As quick actions devem manter a linguagem visual do SolarZap, mas com significado interno:

- `Ligar Agora`
- `Video Chamada`
- `Agendar Reuniao`
- `Gerar Checkout` ou `Gerar Link`
- `Agendar Visita`
- `Comentarios`
- `Ver Pipeline`
- `Provisionar Conta` quando aplicavel

### Painel lateral

Em vez de propostas solares, o painel deve mostrar:

- status comercial interno
- lifecycle do cliente
- stage atual
- proxima acao
- deals abertos
- historico curto de tasks
- status de provisionamento
- dados principais do cliente

### Composer e chat

Devem suportar:

- mensagem de texto
- nota interna
- anexos conforme disponibilidade do canal interno
- sincronizacao com instancia interna

---

## 7. Fases de Implementacao

### Fase 1 — Reconstruir o shell do Inbox

Objetivo: matar o layout atual de dashboard e recriar o workspace igual ao SolarZap.

Acoes:

1. Reescrever `InternalCrmInboxPage.tsx` seguindo o bloco de composicao da aba Conversas em `SolarZapLayout.tsx`.
2. Remover o card solto de `Instancias internas` da tela principal.
3. Introduzir estado de painel lateral aberto/fechado.
4. Introduzir comportamento de lista, chat e painel direito na mesma superficie.

Entrega esperada:

- A tela passa a parecer uma area de conversa de produto, nao uma pagina administrativa de cards.

### Fase 2 — Portar a lista esquerda

Objetivo: fazer a coluna de conversas do CRM interno ter a mesma leitura visual da lista do SolarZap.

Acoes:

1. Reescrever `InternalCrmConversationList.tsx` com base em `ConversationList.tsx`.
2. Levar busca, filtros, estrutura de linha, avatar, preview, horario, badges e estado selecionado para o CRM interno.
3. Adaptar filtros para `status`, `owner`, `canal`, `lifecycle`, `stage` quando houver suporte.
4. Exibir sinais de contexto como telefone, canal, ultima mensagem, nao lida e status.

Entrega esperada:

- A coluna da esquerda fica visualmente equivalente a aba Conversas do SolarZap.

### Fase 3 — Portar o chat central

Objetivo: transformar o chat interno em uma experiencia equivalente ao ChatArea do SolarZap.

Acoes:

1. Reescrever `InternalCrmChatArea.tsx` com base em `ChatArea.tsx`.
2. Reescrever `InternalCrmMessageComposer.tsx` para virar barra de composer integrada no rodape do chat.
3. Adaptar header, bolhas, timestamps, status de entrega e estados vazios.
4. Preparar slots para reply, anexos e busca interna da conversa.

Entrega esperada:

- A area central para de parecer um card com textarea e passa a parecer um chat real do produto.

### Fase 4 — Portar o painel lateral direito

Objetivo: recriar a coluna operacional do SolarZap para o CRM interno.

Acoes:

1. Reescrever `InternalCrmActionsPanel.tsx` copiando a hierarquia de `ActionsPanel.tsx`.
2. Manter header `STATUS` no topo.
3. Incluir toggle operacional equivalente ao follow-up automatico, mas ligado ao contexto do CRM interno.
4. Copiar o grid de quick actions coloridas.
5. Copiar o bloco de dados do cliente com densidade semelhante.
6. Adaptar os blocos finais para stage, deals, tasks, provisionamento e dados do app publico vinculados.

Entrega esperada:

- O print do Inbox interno passa a ter o mesmo impacto visual do print da aba Conversas do SolarZap.

### Fase 5 — Recriar o actions sheet

Objetivo: trazer para o CRM interno o modo operacional do SolarZap, e nao apenas um mini sheet de status.

Acoes:

1. Reescrever `InternalCrmConversationActionsSheet.tsx` inspirado em `ConversationActionsSheet.tsx`.
2. Permitir mudanca rapida de status, proxima acao, atribuicao e agendamento rapido.
3. Integrar scroll sincronizado com a lista quando necessario.

Entrega esperada:

- O modo operacional deixa de ser um sheet trivial e passa a ser uma extensao real do workspace.

### Fase 6 — Expandir hooks e contratos

Objetivo: dar suporte de dados ao layout equivalente.

Acoes:

1. Expandir `useInternalCrmInbox.ts` para coordenar estado de UI, selecao, painel lateral, filtros, acoes e invalidacoes.
2. Expandir `useInternalCrmApi.ts` para suportar queries e mutations necessarias ao painel completo.
3. Expandir `types/index.ts` com campos de unread, owner, stage, next action, status operacional e demais dados do layout.
4. Expandir `internal-crm-api` se necessario para retornar os campos que a tela precisa sem fazer montagem fraca no frontend.

Entrega esperada:

- A UI deixa de depender de remendos e passa a ser suportada por contratos coerentes.

### Fase 7 — Polimento visual e validacao

Objetivo: garantir paridade real, nao so aproximacao.

Acoes:

1. Validar desktop e mobile lado a lado com o SolarZap.
2. Ajustar espacamento, tipografia, badges, pesos visuais, alturas e headers.
3. Garantir que o Inbox interno continue isolado do dominio publico.

Entrega esperada:

- O Inbox interno parece parte da mesma familia de produto do SolarZap.

---

## 8. O Que Sai Da Tela Atual

Devem sair da experiencia principal do Inbox:

1. Estrutura de pagina em formato de dashboard.
2. Lista de conversas renderizada como cards genericos.
3. Chat com textarea desacoplado da experiencia do produto.
4. Painel lateral em cards independentes.
5. Card de instancias internas fora do fluxo da conversa.

---

## 9. O Que Nao Entra Nesta Refatoracao

Para evitar nova deriva de escopo, esta refatoracao nao deve virar outra frente paralela.

Fica fora, salvo necessidade tecnica direta:

1. Reescrita de outros modulos do CRM interno.
2. Mudanca de arquitetura do SolarZap principal.
3. Automacoes novas que nao sejam necessarias para paridade da aba.
4. Reorganizacao ampla de design system fora do que a aba exige.

---

## 10. Criterios De Aceite

### Layout

- [ ] O shell do Inbox interno replica a composicao da aba Conversas.
- [ ] Desktop usa lista esquerda + chat central + painel lateral direito.
- [ ] Mobile usa comportamento equivalente ao SolarZap.

### Lista de conversas

- [ ] A lista tem a mesma densidade visual da coluna de conversas do SolarZap.
- [ ] Busca e filtros ficam no mesmo padrao de leitura.
- [ ] Cada linha mostra avatar, nome, preview, horario e badges relevantes.

### Chat

- [ ] O chat central parece o ChatArea do SolarZap, nao um card administrativo.
- [ ] O composer fica integrado no rodape do chat.
- [ ] Mensagens, notas e status aparecem com hierarquia visual correta.

### Painel lateral

- [ ] O painel lateral parece o ActionsPanel do SolarZap.
- [ ] O topo mostra STATUS.
- [ ] Existem quick actions visuais equivalentes.
- [ ] Dados do cliente e contexto comercial aparecem com densidade parecida.

### Operacao

- [ ] O actions sheet do CRM interno reproduz o modo operacional do SolarZap.
- [ ] O bloco de instancias nao fica mais solto fora do fluxo principal.
- [ ] Toda a experiencia continua usando exclusivamente o dominio `internal_crm`.

---

## 11. Ordem Recomendada De Execucao Imediata

1. Reescrever o shell de `InternalCrmInboxPage.tsx`.
2. Portar `InternalCrmConversationList.tsx` a partir de `ConversationList.tsx`.
3. Portar `InternalCrmChatArea.tsx` e `InternalCrmMessageComposer.tsx` a partir de `ChatArea.tsx`.
4. Portar `InternalCrmActionsPanel.tsx` a partir de `ActionsPanel.tsx`.
5. Reescrever `InternalCrmConversationActionsSheet.tsx` a partir de `ConversationActionsSheet.tsx`.
6. Expandir hook, contracts e API para sustentar a nova UI.
7. Validar paridade visual com comparacao direta lado a lado.

---

## 12. Definicao De Pronto

O trabalho so sera considerado pronto quando:

1. O print do Inbox interno tiver a mesma leitura estrutural da aba Conversas do SolarZap.
2. O painel direito do CRM interno deixar de parecer um conjunto de cards e passar a parecer a coluna STATUS do SolarZap.
3. A lista esquerda tiver a mesma linguagem da coluna de conversas do produto.
4. O chat central tiver a mesma sensacao de conversa em tempo real.
5. O fluxo estiver visualmente coerente em desktop e mobile.
6. O modulo continuar 100% isolado no contexto `internal_crm`.
