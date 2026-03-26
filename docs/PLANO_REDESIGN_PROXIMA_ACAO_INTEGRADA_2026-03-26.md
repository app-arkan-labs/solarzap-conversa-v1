# Plano de Redesign: Proxima Acao Integrada

Data: 2026-03-26  
Status: pronto para execucao

## 1. Objetivo

Redesenhar completamente a UX da funcionalidade de `Ultima Acao / Proxima Acao` para que ela:

- pare de competir visualmente com a conversa;
- deixe de criar blocos "estranhos" no app;
- use um ponto de captura natural dentro da coluna de `Acoes Rapidas`;
- preserve a fundacao operacional ja implementada;
- nao exija mudanca estrutural de banco nesta etapa.

## 2. Diagnostico do Problema Atual

O erro da iteracao anterior nao foi de regra de negocio. Foi de superficie visual.

Hoje a feature aparece em lugares demais e de formas grandes demais:

- uma faixa larga no topo da conversa;
- um bloco dedicado no painel direito;
- uma fila operacional no topo da lista de conversas;
- um painel proprio dentro do dashboard;
- badges adicionais na lista.

Isso quebrou duas coisas ao mesmo tempo:

- a hierarquia visual da tela;
- a linguagem nativa do SolarZap, que privilegia conversa no centro e acoes no painel lateral.

## 3. Nova Direcao de UX

Vamos reduzir a feature para duas superficies apenas:

### 3.1 Captura

O ponto principal de criacao/edicao passa a ser:

- `Painel lateral > Acoes Rapidas > botao Proxima Acao`

Esse botao:

- abre o `AppointmentModal`;
- ja entra com `type = other`;
- preseleciona o lead atual;
- preenche contexto operacional quando houver;
- usa o modal como superficie unica de agendamento da proxima acao.

### 3.2 Leitura

Na conversa, fica apenas uma linha fina e integrada abaixo do cabecalho, no formato:

- `PROXIMA ACAO (26/03 14:00): Retornar com proposta`
- `PROXIMA ACAO: nao definida`

Sem card, sem caixa alta dominante, sem bloco escuro destacado, sem ocupar altura relevante da tela.

## 4. Decisoes de Produto

### 4.1 O que sai imediatamente

- remover a `Fila Operacional` da lista de conversas;
- remover o bloco operacional do `Dashboard`;
- remover o card `Proxima acao` do painel direito;
- remover o badge avulso `Sem acao` da lista de conversas;
- remover a ideia de "camada operacional" como secao visual independente.

### 4.2 O que entra no lugar

- um botao `Proxima Acao` em `Acoes Rapidas`;
- um `AppointmentModal` com contexto operacional;
- uma barra inline fina na conversa;
- a continuidade da fundacao em `lead_tasks`, sem trocar o motor interno.

### 4.3 Regra operacional

A `Proxima Acao` continua sendo operacionalmente rastreada por `lead_tasks`, mas a experiencia de agendamento passa a acontecer por um fluxo mais natural:

- usuario clica em `Proxima Acao`;
- o sistema abre um agendamento do tipo `Outro`;
- ao salvar, o sistema cria ou atualiza a task aberta do lead;
- quando houver evento vinculado, a task segue vinculada ao appointment.

Ou seja: a modelagem continua, mas a UI passa a se apresentar como agendamento contextual, nao como mini-sistema paralelo dentro da tela.

## 5. Fluxo Desejado

### 5.1 Fluxo principal do vendedor

1. O vendedor abre a conversa.
2. Vê uma linha pequena dizendo qual e a proxima acao ou que ela nao esta definida.
3. Se precisar criar ou ajustar, usa `Acoes Rapidas > Proxima Acao`.
4. O modal abre em `Outro`.
5. O modal mostra tambem `Ultimo evento`, para dar contexto do que acabou de acontecer com o lead.
6. O vendedor salva.
7. A barra fina da conversa atualiza automaticamente.

### 5.2 Fluxo sem proxima acao

1. A barra mostra `PROXIMA ACAO: nao definida`.
2. O botao `Proxima Acao` no painel direito continua visivel.
3. O vendedor agenda a proxima acao em um clique.

### 5.3 Fluxo com proxima acao ja existente

1. A barra mostra data/hora e descricao.
2. O botao `Proxima Acao` reabre o modal com contexto da acao atual.
3. O vendedor pode reagendar, ajustar titulo, notas ou responsavel.

## 6. Alteracoes de UX/UI por Area

## 6.1 Conversas

### Estado futuro

Substituir a barra larga atual por uma linha integrada ao header da conversa:

- altura visual pequena;
- mesmo background estrutural da area superior;
- apenas um `border-bottom` leve ou faixa translucida muito sutil;
- texto unico, com label pequena e conteudo linear;
- CTA minimo a direita, se necessario, em estilo ghost/link:
  - `Definir` quando nao houver proxima acao;
  - `Editar` quando houver.

### Regra visual

Nao usar:

- card;
- box com padding grande;
- bloco escuro destacado;
- duas caixas separadas para ultima e proxima acao.

### Texto sugerido

- `PROXIMA ACAO (Hoje, 14:00): Enviar proposta atualizada`
- `PROXIMA ACAO (Amanha, 09:30): Confirmar visita tecnica`
- `PROXIMA ACAO: nao definida`

## 6.2 Painel lateral direito

### Estado futuro

Remover a secao inteira de `Proxima acao` do painel.

No lugar:

- adicionar um novo item em `Acoes Rapidas`:
  - `Proxima Acao`
  - icone de calendario ou relogio
  - mesma hierarquia visual dos demais botoes

### Comportamento

Ao clicar:

- abre `AppointmentModal`;
- define `initialType = 'other'`;
- preseleciona o lead da conversa;
- leva contexto da task atual, se existir;
- leva `Ultimo evento` para leitura contextual.

## 6.3 Modal de Agendamento

### Novo campo

Adicionar um campo informativo `Ultimo evento`.

Caracteristicas:

- somente leitura;
- multi-linha curta;
- posicionado acima de `Notas` ou logo abaixo do titulo/tipo;
- preenchido com a `ultima acao` do lead;
- fallback: `Nenhum evento registrado`.

### Objetivo

Evitar que o vendedor agende a proxima acao no escuro, sem precisar abrir um painel separado para entender o historico recente.

### Regra do tipo

Para o fluxo de `Proxima Acao`, o modal deve abrir em:

- `type = other`

Sem inferencia automatica para `reuniao` ou `visita` nesse caminho.

Se o usuario quiser criar uma `Visita` ou `Reuniao`, ele continua usando os botoes especificos que ja existem.

## 6.4 Lista de Conversas

### Estado futuro

Remover:

- reminder do topo;
- chips de filtro operacional;
- CTA `Fechar hoje`;
- leitura de `Fila Operacional`;
- badges `Sem acao` destacados na listagem.

### Principio

A lista de conversas deve voltar a ser:

- limpa;
- orientada por busca, funil, selecao e leitura das conversas;
- nao por uma camada operacional paralela.

Se precisarmos reintroduzir algum sinal depois, ele deve ser minimo e embutido na metadata da linha, nunca como mini-dashboard.

## 6.5 Dashboard

### Estado futuro

Remover completamente o bloco de `Fila Operacional` desta iteracao.

### Justificativa

Hoje ele cria uma segunda narrativa dentro do dashboard, visualmente deslocada do restante dos cards.  
Nesta fase, o dashboard nao precisa ser superficie dessa funcionalidade.

Se essa visao voltar no futuro, ela deve voltar como:

- KPI curto;
- widget discreto;
- ou tabela secundaria opcional;

nunca como painel protagonista.

## 7. Estrategia Tecnica

## 7.1 O que vamos preservar

- tabela `lead_tasks`;
- historico de `ultima acao`;
- vinculo opcional com `appointments`;
- realtime e hooks ja implementados;
- feature flag existente;
- regras de conclusao e feedback ja construidas.

## 7.2 O que vamos reencaixar

- a criacao/edicao principal migra de `LeadNextActionSection` para `AppointmentModal`;
- a renderizacao principal migra para uma nova barra inline compacta;
- `LeadActionQueuePanel` sai do fluxo principal;
- `ConversationList` deixa de usar filtros operacionais;
- `ActionsPanel` vira o ponto principal de entrada.

## 8. Arquivos a Alterar

## 8.1 Remocoes / limpeza visual

- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/DashboardView.tsx`
- `src/components/dashboard/tables/LeadActionQueuePanel.tsx`
- `src/components/solarzap/ActionsPanel.tsx`

## 8.2 Novo fluxo de criacao

- `src/components/solarzap/ActionsPanel.tsx`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/AppointmentModal.tsx`

## 8.3 Nova superficie compacta na conversa

- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/LeadNextActionSection.tsx` ou substituicao por um componente novo mais simples

Sugestao melhor:

- criar `src/components/solarzap/LeadNextActionInlineBar.tsx`

para nao forcar o componente atual a servir dois paradigmas diferentes.

## 8.4 Ajustes auxiliares

- `src/lib/leadNextActions.ts`
- `src/types/solarzap.ts` somente se algum tipo de prop novo for necessario

## 9. Plano de Execucao Incremental

## Fase 1. Remocao das superficies invasivas

Objetivo:

- eliminar imediatamente o que esta gritando na UI.

Escopo:

- remover `Fila Operacional` da lista;
- remover painel do dashboard;
- remover secao `Proxima acao` do painel direito;
- retirar badge `Sem acao` da listagem.

Risco:

- baixo.

Porque:

- mexe quase so em renderizacao.

## Fase 2. Novo ponto de entrada via Acoes Rapidas

Objetivo:

- tornar a acao principal natural dentro do fluxo do vendedor.

Escopo:

- adicionar botao `Proxima Acao` em `Acoes Rapidas`;
- ligar esse botao a um fluxo de `AppointmentModal` com `type = other`;
- ajustar `SolarZapLayout` para abrir o modal nesse contexto;
- reaproveitar a criacao/atualizacao da `lead_task` por tras.

Risco:

- medio.

Porque:

- encosta na orquestracao entre conversa, modal e task.

## Fase 3. Contexto operacional dentro do AppointmentModal

Objetivo:

- dar contexto sem voltar a poluir a tela.

Escopo:

- adicionar campo somente leitura `Ultimo evento`;
- preencher com `lastAction`;
- manter `Notas` separada, para a nova proxima acao.

Risco:

- baixo.

Porque:

- e adicao de interface, nao de schema.

## Fase 4. Barra fina integrada na conversa

Objetivo:

- manter visibilidade da proxima acao sem competir com o chat.

Escopo:

- substituir a barra/card atual por faixa inline fina;
- texto linear com data/hora + descricao;
- CTA pequeno e opcional;
- sem fundo pesado.

Risco:

- baixo.

Porque:

- e uma troca local de componente.

## Fase 5. Polimento e regressao visual

Objetivo:

- garantir que a feature pareca nativa.

Escopo:

- revisar spacing, altura, contrastes e estados vazios;
- validar desktop e mobile;
- revisar overflow, truncamento e textos longos;
- verificar convivio com tema escuro atual.

## 10. Sem Mudanca de Banco Nesta Etapa

Nao precisamos de migration nova para este redesenho, desde que:

- `type = other` continue valido em `appointments`;
- `Ultimo evento` seja derivado do estado atual;
- o fluxo continue usando a fundacao de `lead_tasks` que ja existe.

Se surgir necessidade de persistir um resumo manual de `ultimo evento`, isso fica explicitamente fora desta fase.

## 11. Criterios de Aceite

O redesenho so sera considerado pronto quando:

1. nao existir mais `Fila Operacional` no topo da lista de conversas;
2. nao existir mais painel de `Fila Operacional` no dashboard;
3. nao existir mais card de `Proxima acao` no painel lateral;
4. existir botao `Proxima Acao` em `Acoes Rapidas`;
5. esse botao abrir `AppointmentModal` em `Outro`;
6. o modal mostrar `Ultimo evento`;
7. a conversa exibir apenas uma linha fina com a proxima acao;
8. quando nao houver acao, a conversa mostrar `nao definida`;
9. a nova UI parecer parte do SolarZap, nao um modulo enxertado;
10. nenhuma funcao de agendamento existente quebrar.

## 12. Smoke Tests Obrigatorios

- abrir uma conversa sem proxima acao e validar barra `nao definida`;
- clicar em `Proxima Acao` e validar modal em `Outro`;
- salvar proxima acao e validar atualizacao da barra;
- editar uma proxima acao existente;
- confirmar que `Agendar Reuniao` continua abrindo em `reuniao`;
- confirmar que `Agendar Visita` continua abrindo em `visita`;
- confirmar que o dashboard nao ficou com gap/layout quebrado apos remocao;
- confirmar que a lista de conversas nao ficou com espacamento estranho apos remover o reminder;
- validar mobile na abertura da conversa e no painel lateral.

## 13. Recomendacao de Execucao

Executar nesta ordem:

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 4
5. Fase 5

Essa ordem maximiza ganho visual rapido sem destruir a fundacao operacional que ja foi feita.

## 14. Decisao Final de Design

`Proxima Acao` deixa de ser uma secao grande e vira:

- um botao de captura dentro de `Acoes Rapidas`;
- um contexto leve dentro do modal;
- um sinal minimo e elegante dentro da conversa.

Essa e a forma mais funcional, menos invasiva e mais coerente com a UX atual do SolarZap.
