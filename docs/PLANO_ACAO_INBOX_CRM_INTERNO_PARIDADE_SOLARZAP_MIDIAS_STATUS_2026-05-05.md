# Plano de acao - Inbox CRM interno com paridade SolarZap

Data: 2026-05-05

## Objetivo

Corrigir a aba `/admin/crm/inbox` do CRM interno para ficar visualmente e funcionalmente alinhada ao Inbox original do SolarZap, sem alterar absolutamente nada do SolarZap original e mantendo banco, storage, edge functions e regras de negocio isoladas no escopo `internal_crm`.

## Regra de isolamento

1. Usar `src/components/solarzap/**` somente como referencia visual e comportamental.
2. Nao editar componentes, hooks, tabelas, buckets ou funcoes usadas pelo SolarZap original.
3. Qualquer ajuste de banco deve ficar em `internal_crm.*` ou nos buckets `internal-crm-chat-delivery` e `internal-crm-chat-attachments`.
4. Qualquer ajuste de Edge Function deve ficar nas funcoes internas do CRM:
   - `internal-crm-api`
   - `internal-crm-media-resolver`
   - `internal-crm-storage-intent`
5. Antes de aplicar migration, validar que o SQL nao toca schema publico nem buckets do SolarZap original.

## Diagnostico atual

### 1. Aba lateral direita abre sozinha

O Inbox interno inicia a lateral de status aberta em `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`:

```tsx
const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);
```

No SolarZap original, o comportamento correto e iniciar fechado:

```tsx
const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
```

### 2. Interface parece uma aba dentro da aba

O route wrapper atual usa `InternalCrmPageLayout mode="immersive"`, mas esse modo ainda aplica largura maxima e padding:

- `max-w-[1680px]`
- `mx-auto`
- `px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5`

Isso cria o efeito de "card interno" e reduz a area util do chat. O Inbox precisa ocupar toda a area disponivel do painel admin, do mesmo jeito que o SolarZap ocupa todo o shell.

### 3. Mensagens ficam centralizadas demais

O chat interno limita a coluna de mensagens:

```tsx
className="flex min-h-full max-w-3xl mx-auto flex-col space-y-1 py-2 px-4"
```

No SolarZap original, a lista de mensagens nao usa `max-w-3xl mx-auto`; o espaco horizontal e aproveitado pelo canvas do chat, mantendo apenas limite nos bubbles.

### 4. Lista de leads esta apertada e poluida

Hoje cada lead pode exibir mais de um chip:

- etapa comercial, exemplo `Respondeu`
- instancia, exemplo `Rodrigo Mentoria` ou `SolarZap`
- proxima acao, exemplo `Novo lead LP para abordar`

O usuario pediu para remover os chips de instancia e proxima acao da lista. A lista deve mostrar uma unica indicacao de etapa do Pipeline, com densidade e espacamento iguais ao SolarZap original.

### 5. Status do cliente esta incoerente

A tela mistura fontes diferentes de etapa:

- `conversation.current_stage_code`
- `client.current_stage_code`
- `deal.stage_code`
- `primary_open_deal_stage_code`

Por isso o mesmo lead pode aparecer como `Novo Lead` e `Respondeu` ao mesmo tempo. O status visivel deve ter uma unica fonte de verdade: a etapa do Pipeline, preferindo o deal aberto principal.

### 6. Midias nao carregam

Foi verificado que existe storage separado para o CRM interno:

- `internal-crm-chat-delivery`
- `internal-crm-chat-attachments`

A tabela `internal_crm.messages` tambem possui contrato para midia:

- `attachment_url`
- `attachment_ready`
- `attachment_mimetype`
- `attachment_name`
- `attachment_size`
- `attachment_error`
- `attachment_error_message`
- `attachment_attempt_count`
- `attachment_last_attempt_at`

O problema nao parece ser falta de lugar separado para armazenar midia. O problema esta na esteira de resolucao: muitas mensagens de `image`, `audio`, `video` e `document` ficam presas com `attachment_ready=false` e sem `attachment_url`, gerando o estado infinito de "Carregando audio..." ou "Carregando imagem...".

### 7. Duplicidade, grupos e notificacoes

Ja existe logica no webhook interno para ignorar JIDs de grupo/broadcast e migration recente com guardrails de deduplicacao por `whatsapp_instance_id` + `wa_message_id`. Mesmo assim, a correcao precisa validar em producao que:

- contatos de grupo nao viram lead;
- webhooks repetidos nao duplicam mensagens;
- conversas duplicadas antigas nao reaparecem;
- notificacoes nao sao disparadas duas vezes para o mesmo evento.

## Plano de execucao

### Etapa 0 - Congelamento e baseline

1. Criar branch exclusiva para esta correcao.
2. Registrar screenshot atual de `/admin/crm/inbox` em desktop e mobile.
3. Rodar `git status` e separar qualquer alteracao nao relacionada.
4. Confirmar que o escopo de alteracao sera apenas:
   - `src/pages/Admin.tsx`
   - `src/modules/internal-crm/**`
   - `supabase/functions/internal-crm-*`
   - `supabase/migrations/*internal_crm*`, se necessario
   - testes relacionados ao CRM interno

Criterio de aceite: nenhum arquivo em `src/components/solarzap/**` alterado.

### Etapa 1 - Fazer o Inbox ocupar a tela toda

1. Ajustar a rota do Inbox em `src/pages/Admin.tsx` para nao usar wrapper com padding/largura maxima.
2. Criar ou adaptar um modo de layout interno, por exemplo `mode="workspace"`, com:
   - `w-full`
   - `h-full`
   - `min-h-0`
   - `max-w-none`
   - `px-0 py-0`
   - `overflow-hidden`
3. Remover aparencia de card/container externo no root do Inbox.
4. Manter apenas divisorias reais entre lista, conversa e painel lateral.
5. Validar que a tela preenche toda a area entre a sidebar do admin e o limite direito da janela.

Criterio de aceite: `/admin/crm/inbox` nao pode parecer um modulo dentro de outro modulo; deve ocupar a area util do painel como o SolarZap original.

### Etapa 2 - Aba lateral direita fechada por padrao

1. Alterar o estado inicial de `isDetailsPanelOpen` para `false`.
2. Garantir que nenhum efeito, localStorage ou selecao automatica reabra a aba durante o carregamento.
3. A aba lateral so deve abrir por acao explicita do usuario:
   - botao de status/detalhes no header;
   - botao de pipeline/acoes que explicitamente pede a lateral;
   - clique em comando que naturalmente abre detalhes.
4. Em mobile, a lateral deve abrir como drawer, tambem fechada por padrao.

Criterio de aceite: ao recarregar `/admin/crm/inbox`, a lateral de status sempre inicia fechada.

### Etapa 3 - Redimensionamento entre leads e conversa

1. Replicar o comportamento do SolarZap original usando implementacao propria no CRM interno.
2. Adicionar estado `leadListWidth` no Inbox interno.
3. Criar handle vertical entre lista de leads e chat com `cursor-col-resize`.
4. Usar limites seguros:
   - minimo: 300 px
   - padrao: 360 px
   - maximo: 520 px ou 40% da largura disponivel
5. Persistir a largura em chave exclusiva, por exemplo:
   - `internal_crm_inbox_lead_list_width`
6. Desabilitar selecao de texto durante o drag.
7. Em telas pequenas, ignorar resize e usar layout responsivo.

Criterio de aceite: o usuario consegue arrastar a divisoria e aumentar/diminuir a lista de leads sem quebrar o chat.

### Etapa 4 - Mensagens usando melhor o espaco

1. Remover `max-w-3xl mx-auto` do container de mensagens.
2. Manter o canvas do chat em largura total.
3. Preservar o limite dos bubbles, alinhamento esquerda/direita e spacing do SolarZap original.
4. Revisar estados de data, mensagens vazias, loading e scroll para nao criarem centralizacao artificial.
5. Garantir que midias grandes respeitem limite visual sem forcar a conversa para o centro.

Criterio de aceite: as mensagens ocupam o espaco como no SolarZap, com bubbles alinhados nas laterais corretas e sem coluna estreita central.

### Etapa 5 - Lista de leads igual ao padrao esperado

1. Ajustar `InternalCrmConversationList` para densidade e espacamento semelhantes ao SolarZap original.
2. Cada item deve conter:
   - avatar;
   - nome do lead;
   - preview da ultima mensagem;
   - horario;
   - contador de nao lidas, quando houver;
   - um unico badge de etapa do Pipeline.
3. Remover da linha do lead:
   - chip de instancia (`Rodrigo Mentoria`, `SolarZap`, etc.);
   - chip de `next_action` (`Novo lead LP para abordar`, etc.);
   - qualquer badge duplicado de status.
4. Manter filtros no topo quando forem uteis, mas sem poluir cada item da lista.

Criterio de aceite: nenhum lead deve exibir `Rodrigo Mentoria`, `SolarZap` ou `Novo lead LP para abordar` como status/chip na lista.

### Etapa 6 - Fonte unica de status: Pipeline

1. Criar helper unico no CRM interno para resolver etapa visivel, por exemplo:
   - `resolveInternalCrmPipelineStage(conversation, clientDetail, stageCatalog)`
2. Prioridade da etapa:
   - `primary_open_deal_stage_code`
   - deal aberto principal em `clientDetail.deals`
   - `client.current_stage_code`, apenas como snapshot sincronizado
   - `conversation.current_stage_code`, apenas fallback legado
3. O backend `listConversations` ja retorna dados de pipeline:
   - `stage_label`
   - `stage_color`
   - `primary_open_deal_id`
   - `primary_open_deal_stage_code`
4. O frontend deve usar esses campos e nao recalcular status por fontes divergentes.
5. Quando um lead responder e a etapa atual do Pipeline for `novo_lead`, a promocao para `respondeu` deve atualizar o deal aberto principal, depois sincronizar client/conversation como snapshot.
6. Header do chat, lista de leads e painel lateral devem renderizar exatamente a mesma etapa resolvida.

Criterio de aceite: um lead nunca aparece como `Novo Lead` e `Respondeu` ao mesmo tempo.

### Etapa 7 - Midias do CRM interno

1. Confirmar que os buckets internos existem e continuam separados:
   - `internal-crm-chat-delivery`
   - `internal-crm-chat-attachments`
2. Confirmar policies de storage restritas ao CRM interno e service role.
3. Corrigir e redeployar `internal-crm-media-resolver`.
4. Validar variaveis da funcao:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EVOLUTION_API_URL`
   - `EVOLUTION_API_KEY`
   - `EDGE_INTERNAL_API_KEY`
   - `OPENAI_API_KEY`, apenas para transcricao de audio se usado
5. Corrigir textos corrompidos de placeholder no resolver, como `VÃ­deo` e `Ãudio`.
6. Garantir que todo webhook de midia grave:
   - `wa_message_id`
   - `metadata.instance_name`
   - `message_type`
   - `attachment_mimetype`
   - `attachment_name`, quando existir
   - `attachment_ready=false`
7. Garantir que o dispatch para `internal-crm-media-resolver` aconteca apos inserir a mensagem.
8. Usar `retryPending` para reprocessar backlog de midias antigas em lotes.
9. Se a Evolution nao retornar base64 apos tentativas, marcar erro real em vez de loading infinito:
   - `attachment_ready=true`
   - `attachment_error=true`
   - `attachment_error_message='MAX_ATTEMPTS_EXHAUSTED'` ou erro especifico
10. No frontend, renderizar:
   - loading apenas enquanto `attachment_ready=false`;
   - midia real quando `attachment_url` existir;
   - estado de falha com acao de retry quando `attachment_error=true`.

Criterio de aceite: imagem, audio, video e documento carregam no CRM interno sem usar storage do SolarZap original.

### Etapa 8 - Duplicados, grupos e notificacoes

1. Validar filtros de JID:
   - ignorar `@g.us`;
   - ignorar broadcasts/status;
   - ignorar payload sem telefone individual valido.
2. Garantir idempotencia por `whatsapp_instance_id` + `wa_message_id`.
3. Manter conversas ativas unicas por:
   - `client_id`
   - `whatsapp_instance_id`
   - `channel='whatsapp'`
   - status `open` ou `resolved`
4. Registrar eventos ignorados em `internal_crm.webhook_ignored_events`.
5. Garantir que notificacao seja disparada somente quando a mensagem foi inserida de fato, nao quando o webhook foi duplicado.
6. Rodar teste manual enviando o mesmo payload duas vezes.

Criterio de aceite: contatos de grupo nao aparecem no CRM, mensagens duplicadas nao entram e notificacoes duplicadas nao disparam.

### Etapa 9 - QA visual e funcional

Validar em desktop:

1. `/admin/crm/inbox` abre com lateral direita fechada.
2. Inbox preenche a tela toda do painel admin.
3. Lista de leads tem largura correta e pode ser redimensionada.
4. Mensagens usam a area horizontal corretamente.
5. Header tem controles de IA e instancia como no SolarZap, sem botoes sem sentido.
6. Leads mostram somente uma etapa de Pipeline.
7. Midias reais carregam: imagem, audio, video e documento.

Validar em mobile/tablet:

1. Lista e conversa nao sobrepoem.
2. Painel lateral abre como drawer ou overlay controlado.
3. Resize fica desativado quando nao houver espaco util.
4. Texto nao vaza dos itens de lead ou botoes.

Validar banco:

```sql
select message_type, attachment_ready, attachment_error, count(*)
from internal_crm.messages
where message_type in ('image', 'video', 'audio', 'document')
group by 1, 2, 3
order by 1, 2, 3;
```

```sql
select id, public
from storage.buckets
where id in ('internal-crm-chat-delivery', 'internal-crm-chat-attachments');
```

```sql
select current_stage_code, primary_open_deal_stage_code, stage_label, count(*)
from internal_crm.conversations
group by 1, 2, 3
order by count(*) desc;
```

## Ordem recomendada

1. Layout full-screen e lateral fechada.
2. Redimensionamento da lista de leads.
3. Ajuste visual da lista e remocao dos chips indesejados.
4. Fonte unica de status do Pipeline.
5. Correcao da esteira de midias.
6. Backfill de midias pendentes.
7. Validacao de duplicidade, grupos e notificacoes.
8. QA final com screenshots comparando CRM interno e SolarZap original.

## Arquivos provaveis de alteracao

- `src/pages/Admin.tsx`
- `src/modules/internal-crm/components/InternalCrmPageLayout.tsx`
- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/lib/*`
- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/internal-crm-media-resolver/index.ts`
- `supabase/functions/internal-crm-storage-intent/index.ts`, se necessario
- `supabase/migrations/*internal_crm*`, somente se o contrato atual nao bastar

## O que nao deve ser alterado

- `src/components/solarzap/**`
- tabelas publicas do SolarZap original
- buckets do SolarZap original
- Edge Functions publicas do SolarZap original
- regras de negocio do app original fora do CRM interno

## Plano de rollback

1. Como as alteracoes sao isoladas no CRM interno, rollback de frontend deve ser revertido por commit.
2. Migrations novas devem ser aditivas sempre que possivel.
3. Caso uma migration precise ser revertida, criar migration de rollback tambem limitada a `internal_crm`.
4. Edge Functions devem ser redeployadas por versao anterior somente das funcoes `internal-crm-*`.

## Criterio final de aceite

O trabalho so deve ser considerado concluido quando:

1. `/admin/crm/inbox` estiver visualmente no mesmo padrao operacional do SolarZap original.
2. A lateral direita abrir somente por clique.
3. Lista, chat e painel ocuparem a tela de forma ergonomica.
4. O divisor entre leads e conversa for arrastavel.
5. Imagem, audio, video e documento carregarem corretamente.
6. Cada lead exibir exatamente uma etapa, vinda do Pipeline.
7. Chips indesejados de instancia e proxima acao forem removidos da lista.
8. Grupos, duplicados e notificacoes repetidas estiverem bloqueados no webhook interno.
9. Nenhuma parte do SolarZap original tiver sido alterada.
