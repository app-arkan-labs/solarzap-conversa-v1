# Plano de acao: ajuste completo de multimidia do CRM Interno

Data: 2026-04-02
Status: planejamento apenas. Nenhuma execucao, deploy, migration, commit ou alteracao funcional foi realizada neste passo.

## Objetivo

Restaurar e completar o fluxo de multimidia do CRM Interno do Painel Admin para:

- imagem
- video
- documentos
- audio
- gifs
- figurinhas/stickers

copiando o motor e o backend do SolarZap principal, mas mantendo isolamento total entre os dois CRMs:

- sem reutilizar tabelas do dominio `public` do SolarZap conversas
- sem compartilhar buckets de chat
- sem compartilhar webhook de mensagens
- sem compartilhar edge function de inbox entre os dois dominios

Ao final da execucao autorizada, a entrega devera incluir:

- commit das alteracoes
- push/deploy da stack Solarzap na VPS/Portainer
- deploy das edge functions
- aplicacao das migrations no Supabase

As credenciais sensiveis fornecidas pelo usuario nao serao gravadas neste arquivo.

## Diagnostico real encontrado no codigo

### 1. Bucket atual do CRM Interno e privado, mas o frontend envia `publicUrl`

Hoje o bucket `internal-crm-media` foi criado como privado em:

- `supabase/migrations/20260328000300_internal_crm_rls.sql`

Trecho atual:

- bucket `internal-crm-media`
- `public = false`

Ao mesmo tempo, o envio atual do inbox faz:

- upload direto em `internal-crm-media`
- `getPublicUrl(...)`
- envia essa URL para o WhatsApp/Evolution

Arquivo atual:

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`

Impacto:

- a URL usada no envio nao e realmente publica
- imagem/video/documento/audio podem falhar no Evolution
- a propria renderizacao no chat pode falhar dependendo da politica do bucket

### 2. O schema `internal_crm.messages` ainda nao tem o contrato de multimidia do SolarZap

Tabela base criada em:

- `supabase/migrations/20260328000450_internal_crm_inbox_campaigns_ai.sql`

Hoje existem apenas:

- `attachment_url`
- `message_type`

Faltam colunas que o motor principal usa para resolver e renderizar midia com seguranca:

- `attachment_ready`
- `attachment_mimetype`
- `attachment_name`
- `attachment_size`
- `attachment_error`
- `attachment_error_message`
- `attachment_attempt_count`
- `attachment_last_attempt_at`

Impacto:

- o CRM Interno nao consegue repetir o fluxo de placeholder -> resolver -> midia pronta
- nao ha retentativa estruturada
- nao ha metadado suficiente para renderizacao correta de audio/video/documentos/gifs/stickers

### 3. O webhook inbound do CRM Interno identifica midia, mas nao salva o anexo nem chama resolver assincrono

Arquivo atual:

- `supabase/functions/internal-crm-api/index.ts`

Estado atual:

- `handleWebhookInbound` reconhece `imageMessage`, `videoMessage`, `audioMessage`, `documentMessage` e `stickerMessage`
- mapeia tipo para `dbMessageType`
- grava apenas `body`, `message_type`, `wa_message_id`, `remote_jid`, `delivery_status`, `metadata`
- nao grava `attachment_url`
- nao grava `attachment_mimetype`
- nao grava `attachment_name`
- nao grava `attachment_ready = false`
- nao chama um resolver de midia como o SolarZap principal

Impacto:

- entrada de imagem/video/audio/documento/sticker vira basicamente placeholder textual
- o chat nao recebe URL real para renderizar o anexo

### 4. O frontend do CRM Interno aceita audio no input, mas classifica audio como documento

Arquivo atual:

- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`

Estado atual:

- o `input` aceita `audio/*`
- `getFileType(file)` retorna somente `image | video | document`
- audio cai como `document`
- nao existe gravacao com `MediaRecorder`
- nao existe fluxo dedicado para voice note

Impacto:

- audio enviado pelo operador nao segue o motor do SolarZap
- audios podem ser enviados em rota errada ou exibidos como documento

### 5. O envio atual do CRM Interno nao cobre GIF/sticker

Arquivo atual:

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `supabase/functions/internal-crm-api/index.ts`

Estado atual:

- nao existe rota de envio `sendSticker`
- nao existe deteccao de `.gif`
- nao existe fallback GIF -> sticker -> image como no SolarZap

Enquanto isso, o SolarZap principal ja tem suporte em:

- `src/hooks/domain/useChat.ts`
- `src/lib/evolutionApi.ts`
- `supabase/functions/evolution-proxy/index.ts`

Impacto:

- GIFs e figurinhas nao funcionam no CRM Interno

### 6. O tipo frontend do CRM Interno esta incompleto para multimidia

Arquivo atual:

- `src/modules/internal-crm/types/index.ts`

Hoje o tipo `InternalCrmMessage` tem:

- `attachment_url`

Mas nao tem:

- `attachment_ready`
- `attachment_mimetype`
- `attachment_name`
- `attachment_size`
- `attachment_error`
- `metadata` para distinguir sticker/gif

Impacto:

- mesmo que o backend passe a entregar o contrato completo, o frontend atual ainda nao consumira tudo

## Fonte de verdade a copiar do SolarZap principal

O plano vai copiar a logica do SolarZap principal a partir destes pontos:

### Motor frontend de envio

- `src/hooks/domain/useChat.ts`

Trechos que devem ser replicados/adaptados:

- upload via intent
- fallback de bucket
- `sendMedia`
- `sendAudio`
- GIF tratado primeiro como sticker
- fallback de video para document
- persistencia de metadados de anexo

### Motor frontend de renderizacao

- `src/components/solarzap/MessageContent.tsx`

Ja esta parcialmente sendo reutilizado pelo CRM Interno, mas sem o contrato de dados completo.

### Backend de upload/entrega

- `supabase/functions/storage-intent/index.ts`

### Backend de resolucao assincrona de midia inbound

- `supabase/functions/media-resolver/index.ts`

### Transporte WhatsApp / Evolution

- `src/lib/evolutionApi.ts`
- `supabase/functions/evolution-proxy/index.ts`

Observacao:

- para manter isolamento, a recomendacao e copiar/adaptar o comportamento para edge functions e buckets proprios do CRM Interno
- nao reutilizar diretamente tabelas `public.interacoes` nem o webhook `whatsapp-webhook`

## Arquitetura recomendada para manter os dois CRMs separados

### Separacao de dominio

SolarZap principal continua usando:

- tabela: `public.interacoes`
- webhook: `supabase/functions/whatsapp-webhook`
- resolver: `supabase/functions/media-resolver`
- buckets: `chat-delivery` / `chat-attachments`

CRM Interno passara a usar:

- tabela: `internal_crm.messages`
- webhook: `supabase/functions/internal-crm-api?action=webhook_inbound`
- resolver proprio: `supabase/functions/internal-crm-media-resolver`
- upload intent proprio: `supabase/functions/internal-crm-storage-intent`
- bucket proprio de entrega: `internal-crm-chat-delivery`
- opcional bucket proprio de compat/fallback: `internal-crm-chat-attachments`

### Recomendacao de bucket

Recomendacao principal:

- NAO transformar `internal-crm-media` no bucket de entrega do chat
- manter `internal-crm-media` intocado para nao quebrar a intencao original de bucket privado
- criar bucket publico proprio para entrega de midia do chat interno:
  - `internal-crm-chat-delivery`
- criar bucket fallback/compat somente se necessario:
  - `internal-crm-chat-attachments`

Motivo:

- copia o motor do SolarZap principal
- evita conflito de finalidade com o bucket privado ja existente
- mantem isolacao entre CRM Interno e SolarZap principal

## Escopo tecnico da execucao futura

## Fase 0 - Preparacao segura

Antes de executar:

- revisar worktree local, porque o repositorio ja esta com arquivos modificados fora deste escopo
- garantir que nao vamos sobrescrever alteracoes do usuario
- criar branch de trabalho
- mapear envs necessarios para:
  - Supabase CLI
  - edge functions
  - Evolution
  - Portainer/VPS

Saida esperada:

- branch pronta
- lista de arquivos tocados so deste escopo

## Fase 1 - Migration de paridade multimidia para `internal_crm.messages`

Criar nova migration para ampliar o schema do CRM Interno sem tocar no SolarZap principal.

### 1.1 Colunas novas em `internal_crm.messages`

Adicionar:

- `attachment_ready boolean not null default true`
- `attachment_mimetype text`
- `attachment_name text`
- `attachment_size bigint`
- `attachment_error boolean not null default false`
- `attachment_error_message text`
- `attachment_attempt_count integer not null default 0`
- `attachment_last_attempt_at timestamptz`

Opcional recomendado para distinguir variantes sem expandir demais o enum:

- manter `message_type` como `image|video|audio|document`
- usar `metadata.media_variant` com valores:
  - `sticker`
  - `gif`
  - `voice_note`

### 1.2 Indices

Adicionar indice para pendencias de midia:

- `idx_internal_crm_messages_media_pending_retry`

Filtro:

- `attachment_ready = false`
- `message_type in ('image','video','audio','document')`

### 1.3 Backfill inicial

Backfill seguro para mensagens existentes:

- se `attachment_url is not null`, marcar `attachment_ready = true`
- se existir nome em `body` para docs/videos, popular `attachment_name` quando possivel
- manter mensagens antigas sem URL como historico textual, sem apagar nada

## Fase 2 - Bucket e policies de armazenamento exclusivos do CRM Interno

Criar migration nova para storage do chat interno, sem mexer em `chat-delivery`.

### 2.1 Buckets novos

Criar:

- `internal-crm-chat-delivery` com `public = true`
- `internal-crm-chat-attachments` com `public = true` apenas se o fallback for necessario

### 2.2 Policies

Criar policies equivalentes ao escopo do CRM Interno:

- leitura para usuarios com `internal_crm.current_user_crm_role() <> 'none'`
- escrita para `internal_crm.current_user_can_write()`
- service role full access

### 2.3 Manter bucket legado

- nao remover `internal-crm-media`
- nao migrar usos nao relacionados ao chat sem necessidade

## Fase 3 - Edge function `internal-crm-storage-intent`

Criar edge function nova, copiada/adaptada de `storage-intent`.

Arquivo novo:

- `supabase/functions/internal-crm-storage-intent/index.ts`

Responsabilidades:

- validar usuario autenticado e permissao de CRM
- resolver org correta do admin CRM
- decidir modo de envio:
  - `image`
  - `video`
  - `document`
  - `audio`
  - `sticker`
- gerar signed upload URL
- devolver URL final de entrega no bucket interno do CRM
- aplicar mesma politica do SolarZap para videos grandes:
  - ate limite suportado: `video`
  - acima do limite: `document`

Observacao:

- para GIF, a function deve devolver metadado indicando tentativa de envio como sticker

## Fase 4 - Edge function `internal-crm-media-resolver`

Criar funcao propria, copiando o comportamento de `media-resolver`, mas apontando para:

- tabela `internal_crm.messages`
- buckets `internal-crm-chat-delivery` / `internal-crm-chat-attachments`
- schema do CRM Interno

Arquivo novo:

- `supabase/functions/internal-crm-media-resolver/index.ts`

Responsabilidades:

- baixar base64 da midia no Evolution
- subir arquivo nos buckets do CRM Interno
- atualizar `internal_crm.messages`
- transcrever audio com OpenAI quando houver `OPENAI_API_KEY`
- tratar sticker como `message_type = image` com `metadata.media_variant = 'sticker'`
- tratar GIF com `metadata.media_variant = 'gif'`
- registrar falhas, tentativas e timeout
- expor acao `retryPending`

## Fase 5 - Refatorar `internal-crm-api` para fluxo completo de multimidia

Arquivo:

- `supabase/functions/internal-crm-api/index.ts`

### 5.1 `append_message`

Evoluir a action atual para aceitar e persistir:

- `attachment_url`
- `attachment_ready`
- `attachment_mimetype`
- `attachment_name`
- `attachment_size`
- `metadata.media_variant`

Regras:

- texto continua como esta
- imagem/video/documento usam URL de entrega do bucket interno
- audio usa rota propria de voice note/media
- GIF tenta `sendSticker` primeiro
- se sticker falhar, fazer fallback para `sendMedia(image)`
- video grande faz fallback para `document`

### 5.2 Nova action opcional `append_media_message`

Recomendacao:

- criar action explicita para midia em vez de sobrecarregar tudo em `append_message`

Vantagens:

- contrato mais limpo
- validacao melhor
- menor chance de regressao nas mensagens texto

### 5.3 Webhook inbound

Hoje ele identifica o tipo, mas nao completa o anexo.

Ajustes:

- para `imageMessage`, `videoMessage`, `audioMessage`, `documentMessage`, `stickerMessage`
  - inserir placeholder em `internal_crm.messages`
  - gravar `attachment_ready = false`
  - gravar `attachment_mimetype`
  - gravar `attachment_name`
  - gravar `metadata.media_variant` quando for sticker/gif/voice_note
  - invocar `internal-crm-media-resolver`

### 5.4 Delivery status e deduplicacao

Manter e consolidar:

- `SEND_MESSAGE` ignorado como ack
- `MESSAGES_UPDATE` atualizando `delivery_status`
- filtro `fromMe`
- deduplicacao por `wa_message_id`

### 5.5 Preview da conversa

Padronizar `last_message_preview` com placeholders consistentes:

- `Imagem`
- `Video`
- `Documento`
- `Audio`
- `Sticker`
- `GIF`

sempre preservando legenda/caption quando existir.

## Fase 6 - Tipos do CRM Interno

Arquivo:

- `src/modules/internal-crm/types/index.ts`

Expandir `InternalCrmMessage` com:

- `attachment_ready: boolean | null`
- `attachment_mimetype: string | null`
- `attachment_name: string | null`
- `attachment_size: number | null`
- `attachment_error: boolean | null`
- `attachment_error_message: string | null`
- `metadata: Record<string, unknown> | null`

Motivo:

- o frontend precisa do mesmo contrato de renderizacao que o SolarZap usa

## Fase 7 - Frontend: copiar o motor de envio do SolarZap para o CRM Interno

### 7.1 Mover a logica do page component para um hook/servico proprio

Hoje o envio esta muito concentrado em:

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`

Criar camada propria, por exemplo:

- `src/modules/internal-crm/hooks/useInternalCrmChatMedia.ts`

Responsabilidades:

- upload via `internal-crm-storage-intent`
- envio de anexo
- envio de audio gravado
- envio de GIF/sticker
- fallback de video -> document
- retorno padronizado para invalidacao e toast

### 7.2 Copiar do `useChat.ts` o que interessa

Replicar/adaptar:

- tratamento de GIF
- tratamento de sticker
- `sendMedia`
- `sendAudio`
- metadados de anexo
- persistencia de `wa_message_id`

Sem reaproveitar diretamente:

- queries de `public.interacoes`
- hooks do SolarZap principal em modo write

## Fase 8 - Frontend: concluir `InternalCrmChatAreaFull`

Arquivo:

- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`

### 8.1 Corrigir tipagem do arquivo

Hoje:

- audio vira `document`

Passar para:

- `image`
- `video`
- `audio`
- `document`

### 8.2 Adicionar gravacao de audio

Copiar do `src/components/solarzap/ChatArea.tsx`:

- `MediaRecorder`
- controle de permissao
- cronometro
- blob final
- envio via handler proprio do CRM Interno

### 8.3 Adicionar caption/legenda para anexos

Hoje o fluxo interno envia arquivo sem UX de legenda.

Implementar:

- preview do arquivo
- campo de legenda opcional
- confirmacao de envio

### 8.4 GIF e sticker

Fluxo recomendado:

- `.gif` e `image/gif`:
  - primeiro tenta sticker
  - fallback para image
- `.webp`:
  - se o usuario escolher enviar como figurinha, usar sticker
  - caso contrario, tratar como image

### 8.5 Renderizacao usando `MessageContent`

Continuar usando:

- `src/components/solarzap/MessageContent.tsx`

Mas agora passando o contrato completo:

- `attachmentUrl`
- `attachmentType`
- `attachmentReady`
- `attachmentName`

E, se necessario, evoluir `MessageContent` de forma neutra apenas para ler:

- `metadata.media_variant = 'sticker' | 'gif'`

Somente se a mudanca for generica e sem quebrar o SolarZap principal.

## Fase 9 - Frontend: `InternalCrmInboxPage`

Arquivo:

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`

Trocar o envio atual por fluxo completo:

- remover upload direto no bucket privado `internal-crm-media`
- usar `internal-crm-storage-intent`
- passar handlers:
  - `onSendAttachment`
  - `onSendAudio`
  - opcionalmente `onSendSticker`

Tambem ajustar:

- invalidacoes
- toasts
- limites de arquivo
- mensagens de erro

## Fase 10 - Backfill operacional para mensagens ja quebradas

Criar rotina controlada para mensagens antigas do CRM Interno que entraram como placeholder.

Opcoes recomendadas:

### 10.1 Backfill por consulta

Selecionar mensagens em `internal_crm.messages` onde:

- `message_type in ('image','video','audio','document')`
- `attachment_url is null`
- `wa_message_id is not null`

### 10.2 Resolver best-effort

Se houver dados suficientes no `metadata` e no `wa_message_id`:

- chamar `internal-crm-media-resolver`

Se nao houver dados suficientes:

- manter a mensagem textual
- registrar em relatorio de backfill manual

## Fase 11 - Testes obrigatorios

### 11.1 Unitarios

Criar/ajustar testes para:

- `append_message` com imagem
- `append_message` com video
- `append_message` com documento
- `append_message` com audio
- GIF -> sticker -> fallback image
- webhook inbound com `stickerMessage`
- webhook inbound com `audioMessage`
- parse/render em `MessageContent`
- contrato dos tipos internos

Arquivos de teste recomendados:

- `tests/unit/internalCrmMediaFlow.test.ts`
- `tests/unit/internalCrmWebhookMedia.test.ts`
- `tests/unit/internalCrmMessageContent.test.ts`

### 11.2 Integracao local

Rodar pelo menos:

- `npm run typecheck`
- `npm run test:unit`

Se necessario:

- testes especificos por arquivo com `vitest run`

### 11.3 Smoke manual

No CRM Interno:

- enviar imagem
- enviar documento
- enviar video pequeno
- enviar video grande e confirmar fallback para documento
- gravar audio
- enviar GIF
- enviar figurinha
- receber imagem
- receber documento
- receber video
- receber audio
- receber figurinha

Validar em cada caso:

- envio no WhatsApp real
- persistencia no `internal_crm.messages`
- renderizacao no chat
- status `sent/delivered/read`
- preview na lista de conversas

## Fase 12 - Deploy quando houver autorizacao explicita

Somente executar depois do comando do usuario.

### 12.1 Git

- revisar `git status`
- garantir que nao houve colisao com alteracoes locais do usuario
- `git add` apenas dos arquivos deste escopo
- `git commit -m "..."` com mensagem clara

### 12.2 Supabase migrations

Aplicar migrations novas do CRM Interno.

Ordem recomendada:

1. migration de colunas de multimidia em `internal_crm.messages`
2. migration de buckets/policies de entrega interna
3. eventuais backfills

### 12.3 Edge functions

Deployar:

- `internal-crm-api`
- `internal-crm-storage-intent`
- `internal-crm-media-resolver`

Se houver mudanca compartilhada realmente necessaria:

- `evolution-proxy`

### 12.4 Build frontend

- `npm run build`

### 12.5 VPS / Portainer

Stack alvo:

- `solarzap`

Fluxo previsto:

- atualizar codigo na origem da stack
- rebuild/redeploy da stack Solarzap no Portainer
- validar logs do container web

### 12.6 Validacao pos deploy

Validar:

- login no admin
- inbox do CRM Interno abre normalmente
- envio real de 6 tipos de midia
- recebimento real de 6 tipos de midia
- edge functions respondendo
- migrations aplicadas

## Rollback planejado

Se houver falha:

### 1. Frontend

- voltar para o commit anterior estavel
- rebuild da stack

### 2. Edge functions

- redeploy da versao anterior de:
  - `internal-crm-api`
  - `internal-crm-storage-intent`
  - `internal-crm-media-resolver`

### 3. Banco

As migrations devem ser desenhadas com rollback claro ou, no minimo:

- sem apagar dados existentes
- sem alterar tabelas do SolarZap principal
- so expandindo `internal_crm` e storage do CRM Interno

## Arquivos previstos na execucao

### Migrations novas

- `supabase/migrations/<timestamp>_internal_crm_messages_media_contract.sql`
- `supabase/migrations/<timestamp>_internal_crm_chat_delivery_bucket.sql`

### Edge functions novas

- `supabase/functions/internal-crm-storage-intent/index.ts`
- `supabase/functions/internal-crm-media-resolver/index.ts`

### Edge functions alteradas

- `supabase/functions/internal-crm-api/index.ts`

### Frontend alterado

- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/hooks/useInternalCrmApi.ts`
- `src/modules/internal-crm/types/index.ts`

### Possivel camada nova

- `src/modules/internal-crm/hooks/useInternalCrmChatMedia.ts`

## Criterios de aceite

O trabalho sera considerado concluido quando:

1. imagem funcionar em envio e recebimento
2. video funcionar em envio e recebimento
3. documento funcionar em envio e recebimento
4. audio funcionar em envio e recebimento
5. GIF funcionar em envio e recebimento
6. figurinha funcionar em envio e recebimento
7. lista de conversas mostrar preview coerente
8. detalhe da conversa renderizar a midia corretamente
9. status de entrega atualizar sem duplicar mensagem
10. nenhum dado do SolarZap principal for misturado com o CRM Interno
11. buckets, webhook e resolver forem exclusivos do CRM Interno
12. houver commit, deploy da stack, deploy das edge functions e migrations aplicadas

## Resumo executivo da recomendacao

O problema nao e um unico bug de tela. O CRM Interno esta com um fluxo multimidia incompleto em quatro camadas ao mesmo tempo:

- storage
- schema
- webhook/backend
- frontend de envio/renderizacao

A correcao certa e copiar o motor completo do SolarZap principal para um trilho proprio do CRM Interno, com:

- schema ampliado
- bucket proprio de entrega
- storage-intent proprio
- media-resolver proprio
- webhook interno completando os anexos
- chat interno com audio/GIF/sticker de verdade

Tudo isso mantendo os dois CRMs separados.
