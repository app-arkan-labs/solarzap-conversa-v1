# Plano de Acao: Aba Chat do CRM Interno com Paridade do SolarZap

Data: 2026-05-05  
Status: planejamento somente. Nenhuma alteracao deve ser executada a partir deste arquivo sem aprovacao.

## Objetivo

Corrigir a aba `Inbox` / chat do CRM interno do painel admin para ficar operacionalmente equivalente a aba de conversas do SolarZap original, sem afetar o SolarZap original e sem misturar dados entre os dominios.

O resultado esperado e:

- chat preenchendo a area util inteira do painel admin;
- UI/UX igual ao workspace de conversas do SolarZap;
- lista de leads com a mesma densidade e leitura visual do SolarZap;
- controles corretos de instancias WhatsApp e IA no topo do chat;
- eliminacao de contatos duplicados, contatos de grupos e notificacoes contaminando a lista de leads;
- status exibido no cliente vindo da etapa real do CRM, nao de `resolved` / `archived`.

## Regra de isolamento

Esta frente deve ficar 100% isolada do SolarZap original.

### Pode usar como referencia

- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/ActionsPanel.tsx`
- `src/components/solarzap/InstanceSelector.tsx`
- `src/hooks/useUserWhatsAppInstances.ts`
- `supabase/functions/whatsapp-webhook/index.ts`

### Nao pode alterar nem escrever

- `public.leads`
- `public.interacoes`
- `public.whatsapp_instances`
- hooks de escrita do SolarZap original em `src/hooks/domain/*`
- Edge Functions publicas de chat do SolarZap original, salvo leitura para referencia
- qualquer migration que modifique o fluxo de producao do SolarZap original

### Escopo permitido

- `src/modules/internal-crm/*`
- `supabase/functions/internal-crm-api/*`
- `supabase/functions/internal-crm-media-resolver/*`
- `supabase/functions/internal-crm-storage-intent/*`
- migrations novas apenas no schema `internal_crm`
- buckets ja separados `internal-crm-chat-delivery` e `internal-crm-chat-attachments`

## Diagnostico atual

### 1. Layout nao preenche a tela

Hoje `InternalCrmInboxPage.tsx` monta o chat dentro de um card:

- root com `gap-4`;
- container arredondado `rounded-[28px]`;
- borda, sombra e `backdrop-blur`;
- grid interna de 2/3 colunas.

Isso faz a aba parecer "algo dentro da aba", diferente do SolarZap original, que usa um workspace continuo de conversas. A correcao nao deve ser remendo de CSS; deve trocar a arquitetura da tela para o mesmo modelo estrutural do SolarZap.

### 2. Botoes sem sentido no topo

O CRM interno ainda expõe `Resolver` e `Arquivar` no header do chat e no painel de acoes. Esses botoes pertencem a uma logica de ticket, mas a operacao desejada e a do SolarZap:

- seletor de instancia WhatsApp no topo;
- indicacao de instancia conectada/pausada;
- controle de pausar/ativar agente de IA;
- busca na conversa;
- selecao de mensagens;
- abertura do painel lateral.

O status `open/resolved/archived` deve virar metadado tecnico interno, nao o eixo principal da UI.

### 3. Lista de leads apertada

`InternalCrmConversationList.tsx` usa linhas simples com filtros `Abertas`, `Resolvidas`, `Arquivadas`, `Todas`. A lista original do SolarZap tem:

- header proprio do produto;
- busca com filtros operacionais;
- linha de lead mais alta e respirada;
- avatar, nome, preview, horario, badges e unread;
- responsavel/escopo quando aplicavel;
- etapa do funil visivel.

O CRM interno deve copiar essa estrutura visual, adaptando os dados para `internal_crm.clients`, `internal_crm.deals`, `internal_crm.tasks` e `internal_crm.conversations`.

### 4. API trazendo leads de forma bugada

O fluxo critico esta em `supabase/functions/internal-crm-api/index.ts`, no `handleWebhookInbound`.

Pontos observados:

- `normalizeRemoteJid` nao bloqueia `@g.us`, `status@broadcast` ou `@broadcast`;
- um JID de grupo pode virar digitos e criar cliente falso;
- a deduplicacao depende de `wa_message_id`, mas a conversa nao tem constraint forte contra corrida de criacao;
- o webhook tem lookup global por telefone antes de respeitar escopo, o que reduz duplicata em um caso, mas pode mesclar clientes de contextos diferentes;
- mensagens/notificacoes administrativas podem voltar pelo webhook e contaminar a lista como conversas normais;
- o `fromMe` ja evita criar cliente novo quando nao acha cliente, mas ainda entra no fluxo de resolucao e pode atualizar conversas existentes.

### 5. Status do cliente nao reflete etapa real

A UI mostra `conversation.status` (`open/resolved/archived`) como se fosse status de atendimento. No CRM interno, o status comercial correto deve vir de:

- `internal_crm.deals.stage_code`, quando houver deal aberto;
- `internal_crm.clients.current_stage_code`, como denormalizacao sincronizada;
- `internal_crm.stage_history`, como auditoria da movimentacao.

O painel lateral ja le `current_stage_code`, mas a experiencia mistura isso com `conversation.status`, gerando leitura errada.

## Plano por fases

## Fase 0 - Congelar fronteiras e criar baseline

Objetivo: garantir que qualquer ajuste seja feito no modulo interno sem risco ao SolarZap original.

Acoes:

1. Registrar no PR/tarefa que o SolarZap original sera usado apenas como fonte visual.
2. Criar checklist de arquivos proibidos de alteracao funcional:
   `src/components/solarzap/*`, `src/hooks/domain/*`, `supabase/functions/whatsapp-webhook/*`, `public.*`.
3. Levantar snapshot do schema `internal_crm`:
   - total de clientes por telefone;
   - conversas por cliente/instancia;
   - mensagens por `wa_message_id`;
   - conversas com `remote_jid` de grupo;
   - clientes criados com telefone suspeito de grupo.
4. Definir fixtures de webhook para testes:
   - inbound normal;
   - outbound `fromMe`;
   - grupo `@g.us`;
   - status/broadcast;
   - `@lid` sem telefone;
   - mensagem duplicada;
   - notificacao administrativa.

Entregaveis:

- queries de auditoria em `docs/sql/` ou migration dry-run;
- fixtures em `tests/fixtures/internal-crm-webhooks/`;
- nenhum codigo de producao alterado ainda.

## Fase 1 - Refatorar shell visual do Inbox

Objetivo: a aba de chat deve ocupar a area util inteira, igual workspace de conversas.

Acoes:

1. Reescrever a estrutura de `InternalCrmInboxPage.tsx`.
2. Remover o card principal arredondado, sombra e `gap-4` que deixam o chat parecendo encaixado.
3. Usar cadeia de altura equivalente ao SolarZap:
   - root: `flex h-full min-h-0 min-w-0 overflow-hidden`;
   - workspace: `flex flex-1 min-h-0 min-w-0 overflow-hidden`;
   - coluna esquerda: scroll proprio;
   - coluna central: scroll somente no historico de mensagens;
   - painel direito: scroll proprio.
4. Manter o header global do Admin fora da area de scroll.
5. Adicionar `data-testid` permanentes:
   - `crm-inbox-root`;
   - `crm-inbox-workspace`;
   - `crm-inbox-list`;
   - `crm-inbox-chat-scroll`;
   - `crm-inbox-actions-panel`.

Arquivos:

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`

Aceite:

- o documento nao ganha scroll global por causa das mensagens;
- lista, mensagens e painel lateral rolam de forma independente;
- o chat fica colado ao workspace, sem card externo decorativo.

## Fase 2 - Portar header do chat para o padrao SolarZap

Objetivo: remover a logica de ticket e trazer os controles reais do SolarZap.

Acoes:

1. Remover da UI os botoes:
   - `Resolver`;
   - `Arquivar`;
   - filtros `Resolvidas` e `Arquivadas` da experiencia principal.
2. Criar `InternalCrmInstanceSelector`, inspirado em `InstanceSelector`, mas usando apenas `internal_crm.whatsapp_instances`.
3. No topo do chat, exibir:
   - avatar/nome do cliente;
   - etapa comercial atual;
   - seletor de instancia conectada;
   - badge de instancia pausada/desconectada;
   - toggle de IA por instancia;
   - toggle de IA por cliente/deal, se a regra for necessaria;
   - busca de mensagens;
   - selecao de mensagens;
   - abertura/fechamento do painel lateral.
4. Persistir selecao de instancia em chave separada:
   - `internal_crm_selected_instance_id`
   nunca `solarzap_selected_instance_id`.
5. Definir fallback de instancia:
   - conversa ja tem `whatsapp_instance_id`: usar ela;
   - senao, usar instancia conectada selecionada;
   - senao, mostrar estado `Sem conexao`.
6. Garantir que envio manual use a instancia selecionada quando a conversa ainda nao tiver instancia.

Arquivos:

- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- novo `src/modules/internal-crm/components/inbox/InternalCrmInstanceSelector.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/hooks/useInternalCrmWhatsappInstances.ts`
- `supabase/functions/internal-crm-api/index.ts`

Aceite:

- nenhum botao `Resolver`/`Arquivar` aparece no header do chat;
- operador consegue ver/trocar instancia interna;
- operador consegue pausar/ativar IA da instancia interna;
- nenhum estado usa storage/localStorage do SolarZap original.

## Fase 3 - Recriar lista de leads com densidade do SolarZap

Objetivo: a lista esquerda deve ficar visualmente igual a lista original, nao apertada e nao baseada em status de ticket.

Acoes:

1. Reescrever `InternalCrmConversationList.tsx` com base visual em `ConversationList.tsx`.
2. Trocar tabs `Abertas/Resolvidas/Arquivadas/Todas` por controles operacionais:
   - busca;
   - `Meus leads` / equipe, se aplicavel;
   - filtro de etapa;
   - filtro de instancia/canal, se houver mais de uma instancia.
3. Cada linha deve mostrar:
   - avatar de 48px;
   - nome do cliente;
   - preview da ultima mensagem;
   - horario;
   - badge unread;
   - etapa comercial;
   - responsavel, quando disponivel;
   - indicador de instancia/cor, quando disponivel;
   - proxima acao/follow-up, quando existir.
4. Preservar comportamento mobile:
   - lista ocupa a tela quando nenhuma conversa esta selecionada;
   - chat ocupa a tela apos selecao;
   - painel lateral vira sheet/drawer.

Arquivos:

- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/hooks/useInternalCrmApi.ts`
- `supabase/functions/internal-crm-api/index.ts`

Aceite:

- altura e leitura da linha ficam equivalentes ao SolarZap;
- etapa do lead aparece na linha;
- contatos nao ficam espremidos;
- filtros fazem sentido para CRM, nao para ticket.

## Fase 4 - Reestruturar painel lateral `STATUS`

Objetivo: o painel lateral deve ser a coluna operacional do SolarZap adaptada ao CRM interno.

Acoes:

1. Manter linguagem visual do `ActionsPanel`, mas remover qualquer interpretacao de `conversation.status`.
2. Mostrar no topo o status comercial real:
   - etapa atual do deal aberto prioritario;
   - fallback para `clients.current_stage_code`;
   - lifecycle secundario quando for cliente ativo/onboarding.
3. Quick actions previstas:
   - `Ligar Agora`;
   - `Video Chamada`;
   - `Agendar Reuniao`;
   - `Agendar Chamada`;
   - `Comentarios`;
   - `Ver Pipeline`;
   - `Gerar Checkout` quando houver deal/produto aplicavel.
4. Dados do cliente:
   - nome/empresa;
   - contato;
   - telefone;
   - email;
   - origem/canal;
   - etapa;
   - responsavel;
   - observacoes.
5. Blocos finais:
   - deal aberto principal;
   - proximas tarefas;
   - proxima agenda;
   - historico curto de etapa;
   - status de provisionamento, quando houver.
6. Ao salvar etapa pelo painel, usar a mesma action do pipeline (`move_deal_stage`) ou uma nova action interna que sincronize deal + cliente + historico.

Arquivos:

- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx`
- `supabase/functions/internal-crm-api/index.ts`
- `src/modules/internal-crm/components/pipeline/stageCatalog.ts`

Aceite:

- `STATUS` representa etapa comercial real;
- mudar etapa no painel atualiza pipeline e cliente;
- painel nao exibe `Resolvido`/`Arquivado` como status do cliente.

## Fase 5 - Corrigir contrato de status comercial

Objetivo: ter uma unica fonte de verdade para a etapa do cliente.

Acoes:

1. Definir regra de prioridade:
   - deal aberto principal mais recente;
   - se houver varios deals abertos, usar o selecionado no contexto ou o mais recentemente atualizado;
   - se nao houver deal, usar `clients.current_stage_code`.
2. Criar helper backend, por exemplo:
   - `resolveInternalCrmClientStage`;
   - `syncInternalCrmClientStageFromDeal`.
3. Garantir que `move_deal_stage` atualize:
   - `deals.stage_code`;
   - `deals.status`;
   - `clients.current_stage_code`;
   - `clients.lifecycle_status`;
   - `stage_history`.
4. Revisar `applyDealStageChange`, pois hoje ele calcula lifecycle usando campos do deal como fallback.
5. Expor no `list_conversations` os campos necessarios:
   - `current_stage_code`;
   - `stage_label`;
   - `stage_color`;
   - `primary_open_deal_id`;
   - `primary_open_deal_stage_code`.
6. Criar reparo de dados:
   - clientes com `current_stage_code` divergente do deal aberto;
   - stage history ausente para movimentos recentes;
   - conversas sem client/deal coerente.

Migrations internas possiveis:

- indice em `internal_crm.deals (client_id, status, updated_at desc)`;
- view ou RPC para `internal_crm.current_client_stage`;
- script de backfill de `clients.current_stage_code`.

Aceite:

- a etapa vista no chat bate com a coluna do pipeline;
- mover card no pipeline reflete no chat;
- mudar etapa pelo chat reflete no pipeline;
- `conversation.status` nao interfere na etapa exibida.

## Fase 6 - Blindar webhook contra grupos, broadcasts e JIDs invalidos

Objetivo: impedir que grupos e eventos tecnicos criem leads.

Acoes:

1. Criar normalizador dedicado no backend interno:
   - `normalizeInternalCrmRemoteJid`;
   - `isInternalCrmGroupOrBroadcastJid`;
   - `extractInternalCrmContactPhoneFromWebhook`.
2. Ignorar antes de qualquer lookup/criacao:
   - JID terminando em `@g.us`;
   - `status@broadcast`;
   - JID terminando em `@broadcast`;
   - payload sem telefone confiavel;
   - `@lid` sem telefone resolvido;
   - eventos sem `wa_message_id` quando forem duplicaveis.
3. Persistir log leve de ignorados em tabela interna, se necessario:
   - `internal_crm.webhook_ignored_events`;
   - `reason`;
   - `instance_id`;
   - `raw_remote_jid`;
   - `wa_message_id`;
   - `created_at`.
4. Nunca inserir cliente/conversa/mensagem para grupo.
5. Adicionar testes cobrindo `@g.us`, broadcast e `@lid`.

Arquivos:

- `supabase/functions/internal-crm-api/index.ts`
- nova migration em `supabase/migrations/*internal_crm_webhook_guardrails.sql`
- `tests/internal-crm-webhook*.test.ts`

Aceite:

- webhook de grupo retorna `ignored: true`;
- nenhum cliente novo nasce de grupo;
- nenhum contato de grupo aparece no Inbox.

## Fase 7 - Resolver duplicidade de contatos e conversas

Objetivo: tornar idempotente a entrada de leads.

Acoes:

1. Parar lookup global por telefone sem escopo. A resolucao deve respeitar um escopo canonico:
   - `linked_public_org_id`, quando o cliente interno estiver vinculado a uma org publica;
   - `owner_user_id`, quando for fallback interno;
   - ou um `internal_scope_key` explicito se decidirmos criar essa coluna.
2. Normalizar telefone uma vez e persistir sempre no mesmo formato.
3. Antes de criar cliente:
   - buscar `clients.primary_phone`;
   - buscar `client_contacts.phone`;
   - validar escopo;
   - atualizar cliente existente se for o mesmo.
4. Antes de criar conversa:
   - buscar conversa WhatsApp ativa por `client_id + whatsapp_instance_id`;
   - reabrir somente se for inbound real;
   - nao criar conversa nova por corrida.
5. Criar constraints internas depois do cleanup:
   - unique parcial para telefone por escopo em `internal_crm.clients`;
   - unique parcial para conversa ativa por `client_id + whatsapp_instance_id + channel`;
   - unique para mensagem por `whatsapp_instance_id + wa_message_id`, preferivel a unique global isolada.
6. Backfill:
   - agrupar clientes duplicados por telefone/escopo;
   - escolher cliente vencedor por `updated_at` e dados completos;
   - mover `client_contacts`, `conversations`, `deals`, `tasks`, `appointments`, `stage_history`;
   - auditar merges;
   - apagar ou marcar duplicados conforme risco.

Aceite:

- mesmo inbound enviado duas vezes nao duplica mensagem;
- duas chamadas simultaneas do webhook nao criam duas conversas;
- mesmo telefone no mesmo escopo converge no mesmo cliente;
- telefones iguais em escopos diferentes nao sao mesclados indevidamente.

## Fase 8 - Separar notificacoes administrativas do Inbox de leads

Objetivo: notificacoes internas nao podem virar lead nem poluir o chat do cliente.

Acoes:

1. Classificar mensagens de automacao por `channel`:
   - `whatsapp_lead`: mensagem comercial ao lead;
   - `whatsapp_admin`: notificacao operacional ao admin.
2. Para `whatsapp_admin`:
   - persistir em log/automacao, nao em conversa de lead;
   - marcar metadados `recipient_role: admin`;
   - usar `automation_runs` e `ai_action_logs` como trilha.
3. No webhook inbound/outbound:
   - se o telefone remoto estiver em `automation_settings.admin_notification_numbers`, nao criar cliente;
   - se `wa_message_id` ou metadata bater com notificacao admin enviada, atualizar status da notificacao, nao o Inbox;
   - respostas de admin devem ir para um painel/log de operacao, nao para lista de leads.
4. Revisar dedupe de `automation_runs`:
   - evitar `event_key` com timestamp quando o evento real ja tem id estavel;
   - garantir uma notificacao por evento relevante.
5. Criar teste de regressao para o caso visto no print:
   - mensagens de alerta de chamada agendada nao devem criar lead duplicado nem mover status indevido.

Arquivos:

- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/internal-crm-broadcast-worker/index.ts`, se necessario apenas para preservar separacao
- `src/modules/internal-crm/components/automations/*`

Aceite:

- alerta admin nao aparece como cliente novo;
- notificacao duplicada nao dispara em cascata;
- lead recebe apenas mensagens classificadas como `whatsapp_lead`.

## Fase 9 - Ajustar envio manual, midia e tempo real

Objetivo: manter o chat funcional apos a refatoracao visual.

Acoes:

1. Envio manual deve usar:
   - instancia selecionada;
   - telefone canonico do cliente;
   - conversation id existente ou criado de forma idempotente.
2. Se a instancia da conversa estiver desconectada:
   - bloquear envio;
   - sugerir troca para instancia conectada;
   - nao cair silenciosamente para outra instancia sem registrar.
3. Garantir que midia continua no contrato interno:
   - `internal-crm-storage-intent`;
   - `internal-crm-media-resolver`;
   - buckets `internal-crm-chat-*`.
4. Realtime:
   - invalidar conversas/mensagens;
   - nao duplicar notificacoes visuais;
   - marcar leitura somente para inbound de lead real.

Aceite:

- texto, imagem, video, audio e documento continuam funcionando;
- envio nao troca de instancia de forma invisivel;
- leitura/unread nao conta mensagem admin como lead.

## Fase 10 - Testes obrigatorios

### Frontend

- e2e do layout:
  - desktop 1365x768;
  - painel lateral aberto;
  - painel lateral fechado;
  - mobile;
  - historico longo;
  - lista longa.
- e2e de paridade:
  - header mostra seletor de instancia;
  - toggle de IA aparece;
  - `Resolver` e `Arquivar` nao aparecem;
  - lista mostra etapa e unread.

### Backend

- webhook inbound normal cria um cliente;
- webhook duplicado nao duplica;
- webhook de grupo e ignorado;
- broadcast/status e ignorado;
- `fromMe` nao cria cliente;
- notificacao admin nao cria cliente;
- mensagem de lead muda `novo_lead` para `respondeu` somente quando inbound real.

### Dados

- script de auditoria antes/depois:
  - duplicados por telefone;
  - conversas duplicadas por cliente/instancia;
  - mensagens duplicadas por `wa_message_id`;
  - clientes com `current_stage_code` divergente do deal;
  - eventos de grupo ignorados.

### Regressao SolarZap original

Mesmo sem alterar o original, rodar smoke para provar que nada foi quebrado:

- abrir aba Conversas do SolarZap original;
- enviar mensagem de texto em fluxo original;
- validar que `public.leads`, `public.interacoes` e `public.whatsapp_instances` seguem intactos;
- validar que testes do webhook original continuam passando.

## Ordem recomendada de execucao

1. Criar baseline/auditoria e fixtures.
2. Implementar guardrails de webhook contra grupo/broadcast/notificacao admin.
3. Implementar dedupe de cliente/conversa/mensagem no schema `internal_crm`.
4. Corrigir contrato de status comercial e backfill de etapas.
5. Refatorar shell visual do Inbox.
6. Portar lista esquerda para o padrao SolarZap.
7. Portar header do chat com instancia/IA.
8. Refatorar painel lateral `STATUS`.
9. Ajustar envio manual/midia/realtime.
10. Rodar e2e, backend tests e smoke do SolarZap original.

## Arquivos mais provaveis de alteracao

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx`
- novo `src/modules/internal-crm/components/inbox/InternalCrmInstanceSelector.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/hooks/useInternalCrmApi.ts`
- `src/modules/internal-crm/hooks/useInternalCrmWhatsappInstances.ts`
- `src/modules/internal-crm/types/index.ts`
- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/internal-crm-media-resolver/index.ts`
- novas migrations somente em `internal_crm`
- novos testes em `tests/e2e` e `tests/*internal-crm*`

## Criterios de pronto

- A aba chat do CRM interno ocupa a area util inteira e parece a aba de conversas do SolarZap.
- Nao existem botoes `Resolver` e `Arquivar` na UI principal.
- O topo do chat tem controles de instancia WhatsApp e IA.
- A lista de leads tem densidade, etapa, unread e contexto equivalentes ao SolarZap.
- Grupos, broadcasts e notificacoes admin nao criam leads.
- Mensagens duplicadas nao duplicam cliente/conversa/mensagem.
- Status do cliente no chat bate com a etapa do pipeline.
- Todas as alteracoes de banco ficam no schema `internal_crm`.
- O SolarZap original passa em smoke sem alteracao funcional.

## Decisao antes de implementar

Antes de executar, validar estas escolhas:

1. Se `conversation.status` deve continuar existindo apenas como campo tecnico invisivel ou se deve ser simplificado futuramente.
2. Qual sera o escopo canonico para dedupe de clientes internos: `linked_public_org_id`, `owner_user_id` ou novo `internal_scope_key`.
3. Se IA deve ser controlada somente por instancia ou tambem por cliente/deal.
4. Como tratar clientes duplicados ja existentes: merge automatico com auditoria ou lista para revisao manual.

## Resumo executivo

A correcao precisa ser feita em duas camadas ao mesmo tempo:

1. Produto/UI: copiar a experiencia real do SolarZap, removendo a camada de ticket e colocando instancia/IA/status comercial no lugar certo.
2. Dados/API: blindar o webhook interno com normalizacao, dedupe, bloqueio de grupos, separacao de notificacoes admin e sincronizacao real da etapa do CRM.

O caminho seguro e manter o SolarZap original intocado e reconstruir a aba do CRM interno sobre contratos proprios do schema `internal_crm`.
