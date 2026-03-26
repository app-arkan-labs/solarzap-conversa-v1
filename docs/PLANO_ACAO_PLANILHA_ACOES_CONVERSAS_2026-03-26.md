# Plano de Acao: Planilha de Acoes na Aba Conversas

Data: 2026-03-26  
Status: proposta de implementacao antes da execucao

## 1. Objetivo

Criar uma experiencia de `planilha de acoes` dentro da aba `Conversas`, usando:

- as conversas atuais como linhas;
- um cabecalho horizontal com colunas operacionais;
- o mesmo motor de agendamento que ja existe hoje;
- a `Proxima Acao` sempre visivel na conversa;
- sem transformar a tela em um Frankenstein de paineis soltos.

## 2. O que Voce Esta Pedindo, em termos de produto

Voce nao quer mais uma feature isolada de `proxima acao`.

Voce quer um `workspace operacional` dentro de `Conversas`, onde o vendedor consiga:

1. olhar a fila de leads;
2. ver a proxima acao de forma persistente;
3. editar varias proximas acoes em formato de planilha;
4. salvar cada linha criando ou atualizando um evento real no calendario;
5. continuar dentro do contexto da conversa, sem pular de tela.

Essa diferenca e importante, porque muda a arquitetura da tela:

- antes: feature pontual dentro do chat;
- agora: modo operacional completo da aba `Conversas`.

## 3. Analise do Estado Atual

Hoje `Conversas` esta organizada em tres zonas:

- esquerda: `ConversationList`
- centro: `ChatArea`
- direita: `ActionsPanel`

Ja temos tres pecas importantes prontas:

- a barra fina de `Proxima Acao` no topo do chat;
- o fluxo de salvar agendamento via `AppointmentModal`;
- a sincronizacao entre agendamento e `lead_tasks`.

O que ainda nao existe:

- um modo de edicao em massa por linha;
- sincronizacao visual entre linha da conversa e colunas editaveis;
- uma regra de exclusao mutua entre `painel direito` e `painel de acoes a esquerda`.

## 4. Decisao de UX Recomendada

## 4.1 Nao fazer como modal

Nao recomendo modal para essa planilha.  
Isso viraria uma segunda tela em miniatura e mataria o contexto de conversa.

## 4.2 Nao fazer como tela separada

Tambem nao recomendo mandar isso para `Dashboard` ou para uma rota nova.  
O valor da ideia e exatamente estar dentro de `Conversas`.

## 4.3 Fazer como modo de trabalho da aba Conversas

A melhor solucao e transformar isso em um `modo operacional` da tela `Conversas`.

Proposta:

- adicionar um botao `Acoes` na coluna esquerda;
- esse botao abre um `painel-planilha` acoplado ao workspace de conversas;
- esse painel usa as conversas filtradas como linhas;
- o painel direito fecha automaticamente se estiver aberto;
- a barra de `Proxima Acao` continua visivel no topo do chat;
- o chat permanece na tela, mas refluindo para baixo conforme o painel-planilha ocupa a parte superior.

## 5. Decisao Estrutural Mais Importante

## 5.1 O botao Acoes nao deve ser mais um icone pequeno

Ele nao deve entrar como mais um icone na fileira de:

- filtro
- audio
- importar/exportar

Isso deixaria a funcao importante demais para um affordance pequeno demais.

### Recomendacao

Criar uma `faixa de workspace` logo abaixo do bloco de busca/toolbar da lista:

- lado esquerdo: botao `Acoes`
- lado direito: faixa de `Proxima Acao`

Assim:

- o botao fica visualmente ligado ao modo operacional;
- a `Proxima Acao` fica ao lado direito dele, como voce pediu;
- a faixa vira um "modo da tela", nao um botao perdido.

## 6. Layout Recomendado

## 6.1 Estrutura final da tela Conversas

### Linha 1

Cabecalho normal da conversa e da lista, como ja existe.

### Linha 2

Faixa operacional:

- coluna esquerda: botao `Acoes`
- coluna centro/direita: barra fina de `Proxima Acao`

### Linha 3 em diante

Quando `Acoes` estiver fechado:

- layout atual normal

Quando `Acoes` estiver aberto:

- o painel direito fecha;
- abre um `Actions Spreadsheet Panel` vindo da esquerda para a direita;
- a area central superior vira a planilha;
- a area do chat e da caixa de mensagem descem.

## 6.2 Regra de convivencia dos paineis

Precisamos instituir regra clara:

- `Painel direito de detalhes` e `Planilha de Acoes` nunca ficam abertos ao mesmo tempo.

Se o usuario clicar em `Acoes` com o painel direito aberto:

- fecha o painel direito;
- abre a planilha.

Se o usuario abrir o painel direito com a planilha aberta:

- fecha a planilha;
- abre o painel direito.

## 7. Modelo de Interacao da Planilha

## 7.1 Linhas

Cada linha da planilha representa uma conversa visivel na lista filtrada.

A `ConversationList` vira a primeira coluna congelada da experiencia.

## 7.2 Cabecalho

As colunas desejadas:

- `Ultima Acao`
- `Proxima Acao`
- `Tipo`
- `Data / Hora`
- `Duracao`
- `Responsavel`
- `Local`
- `Etapa`
- `Salvar`

## 7.3 Fonte de cada coluna

### Ultima Acao

Nao vem da `lead_task` diretamente nesta experiencia.  
Vem do `titulo do ultimo agendamento` do lead.

### Proxima Acao

Campo de titulo do novo agendamento ou do agendamento aberto atual.

### Tipo

Mesmo enum do `AppointmentModal`.

### Data / Hora

Mesma regra do modal.

### Duracao

Mesma regra do modal.

### Responsavel

Mesma lista de responsaveis do modal.

### Local

Mesmo campo do modal.

### Etapa

So leitura por enquanto, vindo da etapa atual da pipeline do lead.

### Salvar

Acao por linha:

- cria novo agendamento;
- ou atualiza agendamento vinculado;
- e sincroniza a `Proxima Acao`.

## 8. Regra de Negocio Recomendada

## 8.1 O motor continua sendo appointments + lead_tasks

Nao devemos criar uma terceira modelagem so para a planilha.

O fluxo ideal e:

1. vendedor edita a linha;
2. ao salvar, criamos ou atualizamos `appointments`;
3. sincronizamos `lead_tasks` para manter a `Proxima Acao`;
4. a barra fina do chat reflete isso imediatamente.

## 8.2 O que conta como Ultima Acao nesta tela

Na planilha:

- `Ultima Acao` = ultimo `appointment.title` conhecido do lead

Na faixa do chat:

- `Proxima Acao` continua vindo do estado operacional sincronizado

Isso e importante porque a planilha e uma visao operacional de agenda, nao um historico completo de acao manual.

## 8.3 Quando a linha salva

Regras:

- se houver `linkedAppointmentId`, editar o evento existente;
- se nao houver, criar um novo evento;
- sempre sincronizar `lead_task` aberta do lead;
- se a linha ficar incompleta, `Salvar` fica desabilitado.

## 9. Recomendacao de UX para a Planilha

## 9.1 Nao usar tabela tradicional pesada

Nao recomendo uma tabela de aparencia "enterprise cinza".  
Ficaria alienigena dentro do SolarZap.

## 9.2 Usar planilha compacta com cells editaveis

Visual recomendado:

- header sticky;
- primeira coluna congelada na esquerda;
- scroll horizontal para colunas;
- inputs pequenos por celula;
- select compacto;
- salvar por linha;
- row height fixa.

## 9.3 Precisamos normalizar a altura das linhas

Hoje as linhas da `ConversationList` tem altura variavel.

Para a planilha funcionar bem, a altura precisa ser consistente quando o modo `Acoes` estiver ativo.

### Regra recomendada

No modo `Acoes`:

- nome do lead com truncamento;
- ultima mensagem com truncamento;
- follow-up compacto;
- altura de linha fixa.

Sem isso, o alinhamento da planilha com a lista vai ficar quebrado.

## 10. Ajustes de UI Solicitados que Devem Entrar Juntos

## 10.1 Remover botao Definir da barra de Proxima Acao

Correto.  
Depois que a planilha existir, o `Definir` perde o sentido como CTA principal.

## 10.2 Remover botao Proxima Acao de Acoes Rapidas

Correto.  
A entrada principal passa a ser o botao `Acoes`.

## 10.3 Remover ligar e video da barra superior do chat

### Recomendacao

No desktop:

- remover da barra superior do chat

No mobile:

- manter acessiveis no drawer ou em algum fallback

Porque no mobile o painel lateral nao e persistente.  
Se removermos sem fallback, criamos regressao real.

## 11. Arquitetura Tecnica Recomendada

## 11.1 Novo estado de modo da tela

Adicionar em `SolarZapLayout` algo como:

- `conversationWorkbenchMode: 'default' | 'actions_sheet'`

E derivar a exclusao mutua com:

- `isDetailsPanelOpen`

## 11.2 Novo componente principal

Criar:

- `src/components/solarzap/ConversationActionsSheet.tsx`

Responsavel por:

- render do header da planilha;
- render das colunas;
- render das linhas alinhadas com a lista;
- controle de edicao local por linha;
- salvar linha a linha.

## 11.3 Componentes auxiliares recomendados

- `ConversationActionsSheetHeader.tsx`
- `ConversationActionsSheetRow.tsx`
- `ConversationActionsToolbar.tsx`

Se preferirmos comecar mais compacto:

- um unico `ConversationActionsSheet.tsx`

## 11.4 Reaproveitamento do AppointmentModal

Nao devemos copiar a logica do modal para a planilha.

O ideal e extrair a logica reutilizavel de:

- validacao
- normalizacao de datas
- default do responsavel
- create/update de appointment

para um helper compartilhado.

### Sugestao

Extrair para algo como:

- `src/lib/appointments/appointmentDrafts.ts`

ou

- `src/lib/appointments/appointmentFormAdapters.ts`

Assim:

- `AppointmentModal` usa esse core;
- `ConversationActionsSheet` usa esse mesmo core.

## 11.5 Dados necessarios por linha

Cada linha vai precisar de:

- `contact`
- `pipelineStage`
- ultimo appointment do lead
- proxima acao aberta
- linked appointment da proxima acao, se houver
- membros responsaveis

## 11.6 Estrategia de dados recomendada

### Opcao incremental

Usar os dados ja carregados em cliente:

- `filteredConversations`
- `appointments`
- `leadTasks`

e montar um `row model` por `leadId`.

### Opcao ideal de performance

Criar um RPC ou view de leitura no Supabase para trazer:

- ultimo agendamento por lead
- proximo agendamento / task vinculada
- responsavel
- etapa

em uma chamada so.

### Recomendacao pratica

Fase 1:

- sem migration
- montar em cliente

Fase 2 opcional:

- otimizar com RPC se a lista ficar lenta em orgs grandes

## 12. Arquivos que Certamente Entram

- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/ActionsPanel.tsx`
- `src/components/solarzap/AppointmentModal.tsx`
- `src/hooks/useAppointments.ts`
- `src/hooks/useLeadTasks.ts`

Novos:

- `src/components/solarzap/ConversationActionsSheet.tsx`
- possivelmente `src/lib/appointments/...` para compartilhamento de logica

## 13. Sequencia Ideal de Implementacao

## Fase 1. Refactor estrutural do workspace

Objetivo:

- preparar `Conversas` para ter dois modos: normal e planilha

Escopo:

- novo estado `actions_sheet`
- regra de exclusao mutua com painel direito
- remocao dos botoes do topo do chat no desktop
- remocao do CTA `Definir`
- remocao do botao `Proxima Acao` de `Acoes Rapidas`

## Fase 2. Criacao da faixa operacional superior

Objetivo:

- posicionar corretamente `Acoes` e `Proxima Acao`

Escopo:

- botao `Acoes` abaixo do bloco de importar/exportar
- alinhamento visual com a barra de `Proxima Acao`
- manter a barra fina sempre visivel

## Fase 3. Shell da planilha

Objetivo:

- colocar a estrutura visivel sem salvar nada ainda

Escopo:

- `ConversationActionsSheet`
- header sticky
- colunas
- rows alinhadas
- scroll horizontal

## Fase 4. Ligacao com dados reais

Objetivo:

- popular a planilha com dados de verdade

Escopo:

- ultimo appointment por lead
- proxima acao atual
- etapa
- responsavel

## Fase 5. Edicao e salvamento por linha

Objetivo:

- transformar a planilha em ferramenta operacional de verdade

Escopo:

- create/update de appointment
- sincronizacao com `lead_tasks`
- feedback visual por linha
- invalidacao/realtime

## Fase 6. Polimento operacional

Objetivo:

- deixar isso realmente usavel por vendedor

Escopo:

- loading por linha
- dirty state por linha
- confirmacao de alteracao
- estados vazios
- truncamento
- teclas e foco

## 14. Principais Riscos

## 14.1 Alinhamento visual entre lista e planilha

Esse e o risco numero 1.

Se a altura das linhas variar, a planilha vai parecer quebrada.

## 14.2 Duplicar logica do AppointmentModal

Esse e o risco numero 2.

Se copiarmos a logica do modal para a planilha, vamos criar regressao futura.

## 14.3 Performance em bases grandes

Esse e o risco numero 3.

Se cada linha depender de muita derivacao pesada em cliente, a planilha pode ficar lenta.

## 14.4 Mobile

Esse e o risco numero 4.

A experiencia completa de planilha nao cabe inteira em mobile.

### Recomendacao

No mobile:

- manter apenas a experiencia atual;
- esconder o modo `Acoes` ou oferecer um fallback simplificado.

Nao recomendo tentar entregar a planilha completa no mobile na primeira iteracao.

## 15. Criterios de Aceite

A implementacao so sera considerada pronta quando:

1. existir um botao `Acoes` no workspace de `Conversas`;
2. a barra de `Proxima Acao` continuar sempre visivel;
3. o botao `Definir` tiver sido removido;
4. o botao `Proxima Acao` tiver saido de `Acoes Rapidas`;
5. os botoes `ligar` e `video` tiverem saido do topo do chat no desktop;
6. abrir `Acoes` fechar o painel direito;
7. a planilha usar as conversas como linhas;
8. as colunas pedidas existirem;
9. salvar uma linha criar ou atualizar um evento real no calendario;
10. a `Proxima Acao` da conversa refletir o resultado salvo;
11. a tela continuar coesa visualmente;
12. nenhuma funcionalidade atual de conversa, detalhe ou agendamento quebrar.

## 16. Recomendacao Final

Sim, a ideia e boa.

Mas ela so vai funcionar bem se tratarmos isso como `modo operacional da aba Conversas`, e nao como mais um componente solto.

O caminho ideal e:

- manter a barra fina de `Proxima Acao`;
- criar um botao `Acoes` como gatilho de modo;
- abrir uma planilha acoplada ao workspace;
- reaproveitar integralmente o motor de `appointments` e sincronizacao com `lead_tasks`;
- manter painel direito e planilha mutuamente exclusivos.

Essa e a versao mais funcional, mais coerente com a UX e com menor chance de virar outra camada alienigena dentro do SolarZap.
