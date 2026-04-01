# Plano de Ação Minucioso — Copiar 100% a Aba Pipeline do SolarZap para o CRM Interno do Painel Admin

Data: 2026-03-31
Status: planejamento para aprovação antes de implementação

## 1. Objetivo

Copiar a aba Pipeline do SolarZap para o CRM Interno do Painel Admin com paridade real de layout, comportamento e fluxo, trocando apenas a linguagem e os conceitos específicos de energia solar pelo contexto comercial do CRM interno.

O resultado final não pode ser um "kanban parecido". Tem que ser uma réplica funcional do Pipeline do SolarZap, preservando:

- barra superior, filtros e estrutura visual
- colunas horizontais com scroll e comportamento mobile
- cards ricos com ações rápidas
- drawer/modal de detalhe e edição
- quick actions por etapa
- drag and drop confiável
- estados visuais de arraste
- fluxo de ganho/perda
- indicadores operacionais por card
- comportamento desktop e mobile

## 2. Diagnóstico Confirmado no Código

### 2.1. O Pipeline do Admin hoje não é uma cópia do SolarZap

O Pipeline do SolarZap é um componente rico e orquestrado, hoje concentrado principalmente em:

- `src/components/solarzap/PipelineView.tsx`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/hooks/domain/usePipeline.ts`
- modais e blocos auxiliares como `EditLeadModal`, `LeadCommentsModal`, `ProposalModal`, `ProposalReadyModal`, `MarkAsLostModal`, `AssignMemberSelect`, `StageBadges` e `FollowUpIndicator`

O Pipeline do CRM Interno hoje é um scaffold bem menor, concentrado em:

- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/components/pipeline/DealCard.tsx`
- `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`
- `src/modules/internal-crm/components/pipeline/PipelineFilters.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmPipeline.ts`

Isso explica a sensação de que a aba está "péssima" e "quebrada": ela não foi construída como espelho do SolarZap; foi reescrita em versão reduzida.

### 2.2. Há um descompasso grave de códigos de etapa entre banco, edge function e frontend

Achado confirmado:

- o seed do banco em `supabase/migrations/20260328000400_internal_crm_seed.sql` define etapas como `lead_entrante`, `contato_iniciado`, `qualificado`, `demo_agendada`, `proposta_enviada`, `aguardando_pagamento`, `ganho` e `perdido`
- a edge function `supabase/functions/internal-crm-api/index.ts` contém `LEGACY_STAGE_CODE_MAP` convertendo essas etapas para um blueprint posterior (`novo_lead`, `respondeu`, `agendou_reuniao`, `negociacao`, `fechou`, `nao_fechou`)
- o frontend do pipeline do Admin hardcodeia outro conjunto de estágios diretamente na UI (`novo_lead`, `respondeu`, `agendou_reuniao`, `chamada_agendada`, `chamada_realizada`, `nao_compareceu`, `negociacao`, `fechou`, `nao_fechou`)

Conclusão: hoje a modelagem do funil já nasce quebrada porque não existe uma enum canônica única compartilhada entre seed, API e interface.

### 2.3. O drag and drop atual está frágil por desenho, não só por detalhe de CSS

Problemas confirmados ou altamente prováveis no desenho atual do DnD do Admin:

1. O board do Admin não replica o contrato de arraste do SolarZap; ele simplifica a estrutura e depende apenas de estado local (`draggingDealId`) para concluir o drop.
2. O SolarZap serializa também o item em `application/json` como fallback; o Admin não faz isso.
3. O `handleDrop` do Admin não recebe o evento de drop, então perde a possibilidade de fallback via `dataTransfer` se o estado local falhar.
4. O fluxo especial de drop em colunas terminais do Admin só intercepta `fechou` e `nao_fechou`, mas o seed legado usa `ganho` e `perdido`. Isso quebra ou deixa inconsistente o fluxo de ganho/perda dependendo do stage retornado pela API.
5. O Pipeline do SolarZap desabilita drag no mobile e oferece fallback por navegação entre etapas; o Admin não reproduz esse comportamento completo.

### 2.4. O módulo tem sinais objetivos de inconsistência de contrato

Achado confirmado pelo TypeScript:

- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx` usa a action `save_deal_notes`
- `src/modules/internal-crm/types/index.ts` não inclui `save_deal_notes` em `InternalCrmApiAction`

Ou seja: a aba atual já está inconsistente até no contrato tipado básico.

### 2.5. Faltam funcionalidades centrais que existem no SolarZap

O SolarZap Pipeline hoje entrega uma superfície muito mais rica. O Admin está sem, ou com stub, pelo menos os seguintes pontos:

- ação de conversa a partir do card
- ação de ligação/chamada real
- ação de proposta/oferta com fluxo completo
- indicadores visuais ricos por card
- atribuição real de responsável com seletor usável
- bloco de próxima ação por etapa
- navegação mobile por etapa com UX equivalente
- análise de perdas
- import/export na experiência do board
- comportamento de quick actions equivalente
- suporte fiel a scroll horizontal, drag visual e feedback de coluna ativa
- densidade visual do card do SolarZap

## 3. Meta de Entrega

O aceite desta tarefa deve ser:

1. O board do CRM Interno deve parecer e se comportar como o Pipeline do SolarZap em desktop e mobile.
2. O drag and drop deve funcionar de forma estável entre todas as colunas válidas.
3. Colunas terminais devem abrir fluxo correto de ganho/perda sem depender de nomes legados quebrados.
4. Os cards precisam exibir informações equivalentes ao SolarZap, adaptadas para deals/clientes do CRM interno.
5. Nenhuma escrita do Pipeline do Admin pode tocar em `public.leads`, `public.deals` ou qualquer tabela operacional do app cliente.
6. Nenhum placeholder do tipo "Em breve" pode permanecer em ações principais do board.

## 4. Estratégia de Cópia

### 4.1. Regra principal

Não fazer mais uma reinterpretação do Pipeline do SolarZap.

Fazer `copy-first` do fluxo visual e comportamental do SolarZap, e só então adaptar:

- entidade de dados: `Contact` -> `Deal + Client`
- textos: solar -> comercial interno
- CTAs: proposta solar -> proposta comercial / checkout / provisionamento
- métricas do card: consumo -> bundle comercial / status de pagamento / próximo passo

### 4.2. O que deve ser copiado 1:1

- esqueleto visual do board
- organização das colunas
- scroll horizontal e snap mobile
- barra superior e distribuição dos filtros
- layout do card
- dropdown de ações por card
- feedback visual de drag
- comportamento de board em mobile
- mecânica de quick action por etapa
- modal/sheet de detalhe com edição

### 4.3. O que deve ser adaptado

- nomes de etapas e rótulos visuais que mencionem energia solar
- CTA de proposta e visita
- badges e conteúdo interno do card
- fluxo de ganho e pós-ganho
- dados que vêm do backend do `internal_crm`

## 5. Decisão Arquitetural Obrigatória

### 5.1. Adotar uma stage model canônica única

O Pipeline do CRM Interno precisa parar de viver com três dialetos de stage_code.

Decisão proposta:

- adotar como enum canônica do board o mesmo encadeamento estrutural do SolarZap
- manter somente um conjunto de stage codes em banco, edge function, hooks e UI
- tratar qualquer stage legado apenas como compatibilidade temporária de migração, nunca mais como estado normal da aplicação

### 5.2. Encadeamento canônico proposto para o CRM Interno

Os códigos seguirão a estrutura do SolarZap para maximizar a cópia fiel do board. Os rótulos serão adaptados para o comercial interno:

| Código canônico | Rótulo no CRM Interno | Observação |
|---|---|---|
| `novo_lead` | Novo Lead | entrada do funil |
| `respondeu` | Respondeu | primeiro engajamento |
| `chamada_agendada` | Reunião Agendada | agenda comercial |
| `chamada_realizada` | Reunião Realizada | call/demo concluída |
| `nao_compareceu` | Não Compareceu | no-show |
| `aguardando_proposta` | Aguardando Oferta | preparando proposta/check-out |
| `proposta_pronta` | Oferta/Checkout Pronto | material pronto para envio |
| `visita_agendada` | Demo Estratégica Agendada | substitui referência de visita solar |
| `visita_realizada` | Demo Estratégica Realizada | etapa de apresentação aprofundada |
| `proposta_negociacao` | Negociação | negociação comercial |
| `financiamento` | Aprovação Financeira | validação financeira/plano |
| `aprovou_projeto` | Proposta Aprovada | aceite comercial |
| `contrato_assinado` | Contrato Assinado | fechamento formal |
| `projeto_pago` | Pagamento Confirmado | pagamento aprovado |
| `aguardando_instalacao` | Aguardando Provisionamento | trocar instalação por provisionamento |
| `projeto_instalado` | Conta Provisionada | entrega/provisionamento concluído |
| `coletar_avaliacao` | Pedir Depoimento / NPS | pós-entrega |
| `contato_futuro` | Contato Futuro | retomada futura |
| `perdido` | Perdido / Desqualificado | saída terminal |

### 5.3. Migração dos estágios legados

Mapeamento obrigatório de dados já existentes:

| Stage legado atual | Stage canônico novo | Regra |
|---|---|---|
| `lead_entrante` | `novo_lead` | direto |
| `contato_iniciado` | `respondeu` | direto |
| `qualificado` | `respondeu` | temporário; pode evoluir depois para regra mais refinada |
| `demo_agendada` | `chamada_agendada` | direto |
| `proposta_enviada` | `proposta_negociacao` | proposta já enviada, logo entra em negociação |
| `aguardando_pagamento` | `contrato_assinado` | contrato fechado aguardando pagamento |
| `ganho` | `projeto_pago` ou `contrato_assinado` | condicional por `payment_status` |
| `perdido` | `perdido` | direto |
| `agendou_reuniao` | `chamada_agendada` | remover alias intermediário |
| `negociacao` | `proposta_negociacao` | remover alias curto |
| `fechou` | `contrato_assinado` ou `projeto_pago` | condicional por pagamento |
| `nao_fechou` | `perdido` | remover alias interno |

## 6. Plano de Implementação por Frente

## 6.1. Frente A — Canonicalização de etapas e contratos

### Arquivos a tocar

- `supabase/migrations/*` nova migration de canonicalização
- `supabase/functions/internal-crm-api/index.ts`
- `src/modules/internal-crm/types/index.ts`
- `src/modules/internal-crm/components/pipeline/types.ts`
- `src/modules/internal-crm/components/InternalCrmUi.tsx`
- `src/modules/internal-crm/pages/InternalCrmClientsPage.tsx`
- `src/modules/internal-crm/components/campaigns/CrmClientSelector.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`
- `src/modules/internal-crm/components/dashboard/cards/PipelineMovementChart.tsx`

### Tarefas

1. Criar migration SQL para atualizar `internal_crm.pipeline_stages` para o conjunto canônico novo.
2. Migrar `deals.stage_code`, `clients.current_stage_code` e `stage_history.from_stage_code/to_stage_code` para os códigos novos.
3. Manter `LEGACY_STAGE_CODE_MAP` apenas como fallback temporário para compatibilidade de payload antigo, com plano explícito de remoção depois da migração validada.
4. Incluir `save_deal_notes` em `InternalCrmApiAction` no frontend.
5. Centralizar metadados de etapa do CRM Interno em um único arquivo ou constante compartilhada do módulo, eliminando hardcodes espalhados.
6. Atualizar todos os consumidores de stage code do módulo internal-crm para usar esse catálogo único.

### Critério de aceite da frente A

- nenhum componente do CRM Interno usa mais stage codes divergentes
- a API e o frontend falam a mesma enum
- `save_deal_notes` fica tipado corretamente

## 6.2. Frente B — Camada de dados do board com payload rico

### Arquivos a tocar

- `supabase/functions/internal-crm-api/index.ts`
- `src/modules/internal-crm/hooks/useInternalCrmPipeline.ts`
- novo hook sugerido: `src/modules/internal-crm/hooks/useInternalCrmPipelineBoard.ts`

### Problema atual

Hoje `list_deals` retorna o deal com `client_company_name` e `items`, mas ainda falta densidade suficiente para um card estilo SolarZap.

Para paridade real, o board precisa de metadados adicionais por card, como:

- nome do contato principal
- telefone e email principais
- canal de origem
- responsável com nome legível
- próxima tarefa aberta
- próxima reunião agendada
- data da última interação relevante
- resumo dos itens do deal
- status de pagamento
- status de provisionamento
- link para conversa, se existir

### Tarefas

1. Enriquecer `list_deals` para retornar um payload pronto para card de board, evitando N+1 no frontend.
2. Incluir joins ou agregações com `clients`, `tasks`, `appointments`, `deal_items`, `customer_app_links` e, se fizer sentido, `conversations`.
3. Adicionar snapshot legível de owner/responsável; não manter `owner_user_id` cru na UI final.
4. Preparar a camada de dados para filtros equivalentes ao SolarZap: busca, etapa, responsável e canal/origem.
5. Manter `useInternalCrmPipeline` como agregador leve por coluna, ou substituí-lo por `useInternalCrmPipelineBoard` se a modelagem do board crescer o suficiente.

### Critério de aceite da frente B

- um card do Pipeline do Admin consegue ser renderizado com a mesma densidade do SolarZap sem gambiarra de dados paralelos espalhados no componente

## 6.3. Frente C — Orquestrador do Pipeline do CRM Interno

### Decisão

O Admin precisa de uma camada de orquestração equivalente ao papel que `SolarZapLayout.tsx` cumpre para o Pipeline do SolarZap.

### Arquivos a tocar

- `src/modules/internal-crm/pages/InternalCrmPipelinePage.tsx`
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- novo arquivo sugerido: `src/modules/internal-crm/components/pipeline/InternalCrmPipelineController.tsx`

### Tarefas

1. Tirar de `InternalCrmPipelineView.tsx` a responsabilidade de ser ao mesmo tempo página, orquestrador e renderizador.
2. Criar um controller/container para:
   - carregar dados do board
   - montar view models dos cards
   - abrir modais e sheets
   - orquestrar quick actions
   - coordenar agendamento, ganho, perda, checkout e provisionamento
3. Manter `InternalCrmPipelineView.tsx` o mais próximo possível da estrutura do `src/components/solarzap/PipelineView.tsx`.

### Critério de aceite da frente C

- o fluxo da aba passa a ser organizado como o SolarZap: controller com dados e ações + view rica de board

## 6.4. Frente D — Cópia visual 1:1 da view do SolarZap

### Arquivos-fonte a copiar como referência direta

- `src/components/solarzap/PipelineView.tsx`
- `src/components/solarzap/PageHeader.tsx`
- `src/components/solarzap/StageBadges.tsx`
- `src/components/solarzap/FollowUpIndicator.tsx`
- `src/components/solarzap/AssignMemberSelect.tsx`

### Arquivos-destino esperados

- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/components/pipeline/InternalCrmStageBadges.tsx`
- `src/modules/internal-crm/components/pipeline/InternalCrmNextAction.tsx`
- `src/modules/internal-crm/components/pipeline/InternalCrmAssignOwnerSelect.tsx`
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineFilters.tsx` ou adaptação do filtro atual

### Tarefas

1. Copiar a estrutura do header do SolarZap: filtros, busca, ações globais, comportamento responsivo.
2. Copiar a estrutura do container horizontal com scroll e snap mobile.
3. Copiar o layout de coluna do SolarZap, inclusive badge de contagem e total monetário.
4. Copiar o layout do card do SolarZap e adaptar os campos internos:
   - avatar -> iniciais da empresa/contato ou ícone consistente
   - nome -> título do deal ou empresa, conforme UX final definida
   - subtítulo -> empresa/contato principal
   - valor -> total do deal com MRR + one-time
   - linha auxiliar inferior -> resumo do bundle comercial, status de pagamento ou próxima ação
5. Copiar a UX mobile do SolarZap, inclusive barra de busca mobile, chip de etapa atual e navegação de etapa.
6. Remover definitivamente a aparência atual do `DealCard` se ela continuar divergindo da estrutura do SolarZap.

### Critério de aceite da frente D

- a interface do board do Admin deve ser reconhecível como a mesma interface do SolarZap, não como uma releitura

## 6.5. Frente E — Ações rápidas e modais com equivalentes internos

### Problema atual

O card do Admin oferece poucas ações, e ao menos uma delas ainda responde com toast de placeholder.

### Tarefas

1. Substituir o menu de ações do card pelo menu do SolarZap adaptado ao contexto interno.
2. Garantir equivalentes para as ações abaixo:
   - Ver Cliente
   - Ver Conversa
   - Ligar Agora
   - Agendar Reunião
   - Gerar Oferta / Checkout
   - Agendar Demo Estratégica
   - Mover para etapa
   - Marcar como Perdido
   - Excluir deal, se essa ação existir no escopo aprovado
3. Transformar o `DealDetailPanel` em uma experiência tão rica quanto o modal/sheet do SolarZap, com:
   - dados do cliente
   - informações do deal
   - notas/comentários
   - movimentação de etapa
   - status comercial e financeiro
   - ações de checkout e provisionamento
4. Fazer o fluxo de ganho abrir modal equivalente ao fechamento real do CRM interno:
   - produto/plano
   - valor
   - método de pagamento
   - geração de checkout quando aplicável
5. Fazer o fluxo de perda exigir motivo, sem atalhos silenciosos.
6. Substituir o agendamento placeholder por integração real com `list_appointments` e `upsert_appointment`.

### Critério de aceite da frente E

- não sobra nenhuma ação principal do board respondendo com stub ou placeholder

## 6.6. Frente F — Correção definitiva do drag and drop

### Decisão

Primeiro replicar fielmente o contrato de DnD do SolarZap. Só se isso ainda mostrar instabilidade real nos testes, partir para migração posterior de ambos os boards para `@dnd-kit`.

### Tarefas

1. Portar o mesmo padrão de handlers do SolarZap para o board interno:
   - `handleDragStart(e, item)`
   - `handleDragOver(e, stage)`
   - `handleDragLeave(e)`
   - `handleDrop(e, stage)`
   - `handleDragEnd(e)`
2. Passar a usar `dataTransfer` com `text/plain` e `application/json`.
3. Garantir que o `handleDrop` receba o evento e tenha fallback via payload serializado.
4. Eliminar dependência de nomes de etapa legados nos fluxos especiais de drop.
5. Manter feedback visual de coluna ativa igual ao SolarZap.
6. Em mobile, desabilitar drag exatamente como o SolarZap e expor fallback de navegação entre etapas por botões.
7. Garantir que o drop em etapas terminais abra modal correto em vez de mover silenciosamente.
8. Garantir persistência da etapa via `move_deal_stage` com atualização de board e toast consistente.

### Hipótese principal para a quebra atual

A quebra do DnD hoje provavelmente é combinação de:

- modelagem de etapas inconsistente
- fluxo especial de terminal atrelado a stage codes errados
- implementação simplificada em relação ao SolarZap
- ausência de fallback robusto por `dataTransfer`

### Critério de aceite da frente F

- arrastar entre colunas comuns funciona
- arrastar para colunas terminais abre modal correto
- cancelar modal não deixa o card em estado inconsistente
- mobile não tenta arrastar e mantém UX equivalente por navegação lateral

## 6.7. Frente G — Filtros e atribuição de responsável

### Problema atual

O CRM Interno não tem um seletor real de responsável no board. O componente existente `AssignOwnerSelect.tsx` é apenas um input de `user_id`, o que é inadequado para uma UI de paridade com o SolarZap.

### Tarefas

1. Introduzir um catálogo real de membros/responsáveis do CRM Interno.
2. Criar action backend própria para isso, se necessário, em vez de depender de input livre de `user_id`.
3. Implementar seletor visual de owner com UX equivalente ao `AssignMemberSelect` do SolarZap.
4. Adicionar filtro por responsável no topo do board.

### Critério de aceite da frente G

- nenhum fluxo de owner depende de digitação manual de `user_id`

## 6.8. Frente H — Conteúdo dos cards e equivalentes visuais

### Conteúdo mínimo obrigatório por card

- nome/título principal
- empresa e contato principal
- valor do deal
- dias na etapa
- próximo passo
- status comercial relevante
- resumo do bundle comercial
- responsável

### Equivalentes visuais propostos em relação ao SolarZap

| Bloco do SolarZap | Equivalente no CRM Interno |
|---|---|
| `StageBadges` | badges de status comercial, pagamento, trial, onboarding, provisionamento |
| `FollowUpIndicator` | progresso de automação comercial ou próxima tarefa pendente |
| `AssignMemberSelect` | seletor real de owner do CRM |
| linha de consumo `kWh/mês` | resumo do produto/plano ou do combo vendido |
| CTA de próxima ação por etapa | CTA comercial interno por stage |

## 7. Sequência Recomendada de Execução

### Ordem exata

1. Canonicalizar stages e contratos tipados.
2. Atualizar API e payload do board.
3. Criar controller do Pipeline interno.
4. Reescrever a view do board como cópia estrutural do `PipelineView.tsx`.
5. Portar e adaptar menu de ações e modais.
6. Corrigir o drag and drop com o mesmo contrato do SolarZap.
7. Implementar filtros por owner/origem/etapa.
8. Atualizar consumidores colaterais de stage code no módulo internal-crm.
9. Executar testes manuais e automação de regressão.
10. Só então substituir definitivamente a aba atual em produção.

## 8. Critérios de Aceite Funcionais

### Desktop

- board horizontal com todas as colunas corretamente ordenadas
- drag and drop fluido
- menus de ação completos
- detalhe do deal sem perda de contexto
- filtros funcionando em conjunto
- totais por coluna corretos

### Mobile

- scroll horizontal com snap
- etapa atual destacada
- busca mobile equivalente ao SolarZap
- navegação por etapas sem depender de drag

### Dados

- zero gravação em tabelas do domínio público do app cliente
- `move_deal_stage`, `save_deal_notes`, `upsert_appointment` e `create_deal_checkout_link` funcionando no fluxo
- stages persistidos com enum canônica única

## 9. Testes Obrigatórios

### Testes manuais

1. Abrir board com dados reais e validar renderização de todas as colunas.
2. Arrastar um deal entre duas colunas comuns.
3. Arrastar um deal para a coluna terminal de perda e confirmar captura de motivo.
4. Arrastar um deal para a trilha de fechamento e validar modal correto.
5. Editar notas, fechar o detalhe e reabrir.
6. Filtrar por busca, etapa, owner e origem em conjunto.
7. Validar experiência mobile.

### Testes automatizados recomendados

1. Teste de mapping de stage codes legado -> canônico.
2. Teste de `useInternalCrmPipelineBoard` para agrupamento por coluna.
3. Teste de drag/drop com persistência de etapa.
4. Teste de regressão de colunas terminais.
5. Teste de renderização mobile do board.

## 10. Riscos e Mitigações

### Risco 1 — A migração de stages quebrar outras abas do CRM Interno

Mitigação:

- atualizar no mesmo lote todos os consumidores conhecidos de stage_code
- manter compatibilidade temporária na edge function durante a transição

### Risco 2 — O payload do board ficar pesado demais

Mitigação:

- enriquecer `list_deals` com foco estrito no board
- limitar quantidade e campos a dados realmente usados na UI

### Risco 3 — O DnD nativo continuar instável

Mitigação:

- primeiro portar o contrato do SolarZap fielmente
- se persistir instabilidade reproduzível, abrir segunda fase para migrar ambos os boards para `@dnd-kit` sem alterar a UI

## 11. Escopo Exato dos Primeiros Commits de Implementação

### Commit lógico 1

- migration de canonicalização de stages
- ajuste de tipos (`save_deal_notes`, enum canônica, catálogos)
- atualização dos consumidores de stage_code

### Commit lógico 2

- enriquecimento do backend do board
- hook/controller do Pipeline interno

### Commit lógico 3

- cópia estrutural do `PipelineView.tsx` para o módulo internal-crm
- novo layout visual do board

### Commit lógico 4

- ações rápidas, modais, agendamento, ganho/perda, checkout
- drag and drop finalizado

### Commit lógico 5

- testes, polimento, responsividade, validação final

## 12. Conclusão Objetiva

O problema não é um único bug de drag and drop. O Pipeline do CRM Interno está quebrado porque foi montado sobre uma combinação de:

- cópia incompleta da interface fonte
- enum de etapas inconsistente entre camadas
- contrato tipado incompleto
- camada de dados ainda pobre para um card de paridade real

O caminho correto não é corrigir pontualmente a tela atual. O caminho correto é:

1. canonizar o modelo de etapas
2. enriquecer o backend do board
3. copiar estruturalmente o Pipeline do SolarZap
4. adaptar apenas o domínio comercial interno
5. fechar o DnD em cima dessa base correta

Esse é o plano recomendado para atingir a cópia real que você pediu, sem deixar o Admin preso em mais uma versão improvisada da aba.