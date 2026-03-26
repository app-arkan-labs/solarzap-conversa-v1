# Plano Corretivo Definitivo: Planilha de Acoes Integrada a Conversas

Data: 2026-03-26  
Status: plano corretivo antes da reimplementacao

## 1. Problema Real

A implementacao atual errou o lugar da feature.

Em vez de a `planilha de acoes` nascer da coluna de leads, ela foi injetada dentro do `ChatArea`, acima da conversa. Isso gerou exatamente os sintomas que voce apontou:

- a planilha parece um painel separado;
- a coluna `Lead` ficou duplicada, porque as conversas ja sao a coluna de leads;
- o modo `Acoes` nao parece uma extensao natural da aba `Conversas`;
- os cards da lista continuam altos, enquanto as linhas da planilha pedem densidade e alinhamento;
- o gatilho de `Acoes` ficou com hierarquia visual errada;
- o conjunto inteiro ficou alienigena no app.

## 2. Causa Raiz

Hoje a arquitetura esta conceitualmente errada em tres pontos:

- `ConversationActionsSheet` foi montada como painel independente, nao como extensao da `ConversationList`;
- `SolarZapLayout` acopla a planilha ao `ChatArea` via `actionsSheet`, empurrando a conversa para baixo;
- `ConversationList` continua desenhando cards normais, sem modo compacto de linha alinhada com a planilha.

Enquanto isso nao mudar, qualquer ajuste cosmetico so vai maquiar o erro.

## 3. Objetivo da Versao Definitiva

Transformar `Acoes` em um `modo lateral integrado` da aba `Conversas`.

Na pratica:

- a coluna de leads continua sendo a propria lista de conversas da esquerda;
- ao clicar em `Acoes`, a lista entra em `modo compacto`;
- desse mesmo plano visual nasce a planilha para a direita;
- a planilha se comporta como uma extensao horizontal das linhas da lista;
- o chat continua abaixo e ao fundo, mas a superficie operacional parece uma coisa so;
- `Proxima Acao` continua visivel no topo, sem parecer um widget separado.

## 4. Principio de UX Que Vai Guiar a Correcao

`Acoes` nao e um painel.

`Acoes` e um modo de trabalho da propria coluna de conversas.

Portanto, a regra de design passa a ser:

- nao duplicar `Lead`;
- nao abrir card solto acima do chat;
- nao criar faixa grossa nem container "encaixotado";
- usar a estrutura existente da lista como ancora visual da planilha;
- fazer a abertura parecer uma expansao lateral da lista, nao um bloco novo despejado na tela.

## 5. Layout Alvo

## 5.1 Estrutura macro

Quando `Acoes` estiver fechado:

- tela normal de `Conversas`;
- lista de leads na esquerda;
- chat ao centro;
- painel direito segue a regra atual.

Quando `Acoes` estiver aberto:

- o painel direito fecha automaticamente;
- a lista de leads entra em `modo compacto`;
- surge uma superficie lateral conectada a essa lista, ocupando o espaco superior entre a borda direita da lista e a area do chat;
- essa superficie contem apenas as colunas operacionais;
- o chat permanece abaixo dessa superficie;
- a barra de envio desce junto com a conversa, acompanhando a nova altura ocupada pela planilha.

## 5.2 Como a tela deve ser lida visualmente

O usuario deve perceber assim:

1. a esquerda ficam os leads;
2. a direita do mesmo alinhamento ficam as colunas da planilha;
3. cada linha da lista corresponde exatamente a uma linha da planilha;
4. abaixo disso continua a conversa.

Ou seja: nao e `lista + painel + chat`.

E `lista expandida lateralmente + chat abaixo`.

## 5.3 Efeito de abertura

Ao clicar em `Acoes`:

- a lista troca do layout de card para layout de linha compacta;
- os elementos secundarios de cada conversa sobem, reduzem e simplificam;
- a planilha abre lateralmente da esquerda para a direita;
- a animacao deve dar sensacao de "dimensao lateral abrindo", nao de dropdown vertical.

Recomendacao:

- transicao curta de `180ms` a `220ms`;
- animar `width`, `opacity` e pequeno `translateX`;
- evitar slide exagerado;
- priorizar sensacao de encaixe, nao de drawer flutuante.

## 6. Regras Estruturais Obrigatorias

## 6.1 A coluna de leads sera a propria ConversationList

Nao deve existir coluna `Lead` dentro da planilha.

O lado esquerdo da experiencia ja e a coluna de leads.

Correcao obrigatoria:

- remover a coluna `Lead` de `ConversationActionsSheet`;
- usar as linhas renderizadas da `ConversationList` como primeira coluna congelada da experiencia.

## 6.2 A planilha nao pertence ao ChatArea

O `ChatArea` nao deve mais receber nem renderizar `actionsSheet`.

Correcao obrigatoria:

- remover o `actionsSheet` de `ChatArea`;
- mover a responsabilidade do layout da planilha para o container de workspace em `SolarZapLayout`.

## 6.3 A lista precisa de dois modos de linha

Precisaremos de dois modos para a lista:

- `default`: card atual;
- `actions`: linha compacta e alinhada com a grade da planilha.

No modo `actions`, cada conversa deve:

- perder respiros verticais excessivos;
- reduzir avatar, metadados e chips;
- esconder o que nao for essencial para a linha;
- ter altura fixa compartilhada com a grade lateral.

## 6.4 A planilha e o painel direito nao coexistem

Se abrir `Acoes`, o painel direito fecha.

Se abrir o painel direito, `Acoes` fecha.

Isso precisa ser tratado como regra de workspace, nao como detalhe de componente.

## 7. Posicionamento Correto do Botao Acoes

O botao atual esta errado em forma e hierarquia.

## 7.1 Como ele deve ser

Deve virar um botao compacto, no mesmo idioma visual dos botoes pequenos da barra superior.

Caracteristicas:

- formato pequeno, visualmente proximo dos icones do topo;
- sem cara de CTA grande;
- com tooltip `Acoes`;
- estado ativo bem discreto.

## 7.2 Onde ele deve ficar

Nao em uma linha isolada abaixo da toolbar.

Posicao recomendada:

- criar uma `faixa de operacao` fina no topo do workspace;
- do lado esquerdo dessa faixa fica o botao `Acoes`;
- imediatamente a direita dele fica a barra de `Proxima Acao`.

Para isso:

- encurtar um pouco a largura visual da busca na coluna esquerda;
- reorganizar a regiao superior para o gatilho nao parecer perdido;
- o botao `Acoes` precisa parecer ligado a `Proxima Acao`, nao a importacao/exportacao.

## 8. Comportamento da Barra Proxima Acao

A barra fina atual esta conceitualmente no caminho certo, mas precisa conviver com o novo trigger.

Regras:

- manter a barra fina;
- manter texto simples: `PROXIMA ACAO (data/hora): descricao`;
- se nao houver agendamento, mostrar `nao definida`;
- remover qualquer CTA redundante dessa barra;
- integrar o fundo ao proprio topo da area de conversa, sem caixa pesada;
- a barra precisa compartilhar a mesma faixa visual do botao `Acoes`.

## 9. Regras da Planilha de Acoes

## 9.1 Colunas

As colunas permanecem:

- `Ultima Acao`
- `Proxima Acao`
- `Tipo`
- `Data / Hora`
- `Duracao`
- `Responsavel`
- `Local`
- `Etapa`
- `Salvar`

## 9.2 Fonte de dados

Reaproveitar o que ja existe:

- `Ultima Acao` = titulo do ultimo agendamento do lead;
- `Proxima Acao` = titulo do agendamento em edicao;
- `Tipo`, `Data / Hora`, `Duracao`, `Responsavel`, `Local` = os mesmos campos do fluxo atual de agendamento;
- `Etapa` = etapa atual da pipeline;
- `Salvar` = cria ou atualiza o agendamento e sincroniza a proxima acao.

## 9.3 Densidade visual

A planilha precisa ser claramente mais densa que a versao atual.

Regras:

- cabecalho mais baixo;
- inputs com altura menor;
- menos padding horizontal;
- tipografia enxuta;
- linha unica sempre que possivel;
- nada de blocos grandes ou cards por linha.

## 9.4 Altura das linhas

Cada linha da planilha deve ter a mesma altura da conversa compactada ao lado.

Recomendacao inicial:

- altura base entre `68px` e `76px`;
- tudo centralizado verticalmente;
- multiline apenas em `Ultima Acao` e, se necessario, `Proxima Acao`.

## 10. Regra de Adaptacao de Largura

Esse ponto agora e obrigatorio.

A planilha nao pode ser desenhada com larguras fixas "de escritorio gigante" e depois despejada em qualquer viewport.

## 10.1 Estrategia recomendada

Usar grade responsiva com `minmax` e pesos diferentes por coluna.

Hierarquia recomendada:

- `Ultima Acao`: larga
- `Proxima Acao`: larga
- `Data / Hora`: media
- `Responsavel`: media
- `Tipo`: compacta
- `Duracao`: compacta
- `Local`: media
- `Etapa`: media
- `Salvar`: compacta

## 10.2 Regra de adaptacao

Para desktop padrao, a planilha deve tentar caber inteira sem scroll horizontal.

Implementacao recomendada:

- medir a largura disponivel do container;
- aplicar template de colunas com `clamp` ou `minmax`;
- reduzir paddings e tipografia antes de aceitar scroll horizontal;
- scroll horizontal passa a ser fallback, nao comportamento primario.

## 10.3 Ordem de sacrificio visual

Se a largura apertar:

1. reduzir padding horizontal;
2. reduzir largura de colunas medias;
3. reduzir tipografia secundaria;
4. so entao permitir scroll horizontal interno da grade.

Nao fazer:

- truncar campos de forma agressiva sem affordance;
- deixar metade da planilha fora da tela por padrao;
- estourar a conversa e o composer.

## 11. Solucao Tecnica Recomendada

## 11.1 Novo ownership do layout

`SolarZapLayout` passa a ser o dono da composicao visual do workspace `Conversas`.

Ele deve controlar:

- estado `isConversationActionsModeOpen`;
- fechamento do painel direito;
- distribuicao do espaco entre lista, planilha e chat;
- altura ocupada pela superficie de acoes;
- transicoes de abertura e fechamento.

## 11.2 ConversationList ganha modo actions

`ConversationList` deve ganhar props dedicadas para `actions mode`, por exemplo:

- `layoutMode: 'default' | 'actions'`
- `actionsToolbarVisible`
- `compactRowHeight`

No modo `actions`:

- o topo da lista muda;
- a linha de busca se reorganiza;
- o botao `Acoes` vira gatilho compacto;
- as conversas sao renderizadas em linhas densas.

## 11.3 ConversationActionsSheet vira somente colunas operacionais

Esse componente deixa de tentar ser "a planilha inteira".

Ele passa a renderizar apenas:

- cabecalho das colunas;
- linhas operacionais correspondentes aos leads visiveis;
- logica de salvar por linha.

Ele nao renderiza:

- coluna `Lead`;
- cabecalho duplicado de contexto;
- container que pareca card autonomo.

## 11.4 ChatArea volta a ser apenas chat

`ChatArea` deve voltar a ter responsabilidade simples:

- header;
- barra fina de `Proxima Acao`;
- mensagens;
- composer.

Sem `actionsSheet` acima da conversa.

## 12. Fases de Implementacao Corretiva

## Fase 1 - Desfazer a arquitetura errada

- remover `actionsSheet` de `ChatArea`;
- remover a coluna `Lead` da planilha;
- remover o container autossuficiente da planilha atual;
- mover o gatilho de `Acoes` para a faixa operacional correta.

Objetivo:

- eliminar o comportamento alienigena antes de polir.

## Fase 2 - Integrar lista + planilha

- criar `modo compacto` na `ConversationList`;
- alinhar alturas de linha entre lista e planilha;
- montar o container lateral integrado no `SolarZapLayout`;
- fazer o painel parecer extensao da lista.

Objetivo:

- corrigir a leitura espacial da feature.

## Fase 3 - Responsividade e densidade

- aplicar grade adaptativa por largura disponivel;
- revisar paddings, alturas de input e tipografia;
- garantir cabimento em resolucoes desktop comuns.

Objetivo:

- parar de desperdiçar largura e deixar o conjunto usavel.

## Fase 4 - Animacao e acabamento

- abertura lateral refinada;
- fechamento coordenado com painel direito;
- ajuste fino da faixa `Acoes + Proxima Acao`;
- estados vazios, loading e salvamento discretos.

Objetivo:

- deixar a experiencia com cara de produto final, nao de feature enxertada.

## 13. Arquivos Provaveis de Alteracao

- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ConversationActionsSheet.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/LeadNextActionInlineBar.tsx`

Possivel apoio:

- `src/components/solarzap/ActionsPanel.tsx`
- `src/types/solarzap.ts`
- `src/lib/leadNextActions.ts`

## 14. O Que Nao Precisa Mudar

Nao ha motivo para mexer na fundacao de dados agora.

Devemos reaproveitar:

- `appointments`
- `lead_tasks`
- sincronizacao de `proxima acao`
- integracao com calendario

Ou seja:

- esta rodada e de layout, composicao e experiencia;
- nao de modelagem nova no Supabase.

## 15. Criterios de Aceite da Versao Definitiva

A correcao so sera considerada pronta quando:

- a planilha nao parecer mais um painel separado;
- a lista de conversas for visualmente a primeira coluna da planilha;
- a abertura de `Acoes` parecer uma expansao lateral da lista;
- `Proxima Acao` e `Acoes` compartilharem a mesma faixa operacional;
- a conversa compactada tiver a mesma altura das colunas ao lado;
- a largura das colunas se adaptar ao viewport;
- o chat continuar legivel e estavel abaixo;
- o painel direito nao conflitar com `Acoes`;
- o resultado parecer nativo da tela `Conversas`.

## 16. Recomendacao Final

A proxima implementacao precisa ser tratada como `correcao estrutural`, nao como patch de UI.

Se fizermos so ajustes pontuais por cima da versao atual, vamos continuar lutando contra a arquitetura errada.

O caminho certo agora e:

1. recolocar a feature no lugar certo da hierarquia visual;
2. fazer a lista virar a primeira coluna real da experiencia;
3. so depois polir responsividade, motion e microdetalhes.
