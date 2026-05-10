# Plano de acao - Midias recebidas no CRM interno

Data: 2026-05-10

## Objetivo

Corrigir definitivamente o recebimento de midias no Inbox do CRM interno (`/admin/crm/inbox`) para imagem, audio, video, sticker e documento, mantendo isolamento total do SolarZap original.

O SolarZap original nao deve ser alterado. A correcao deve ficar restrita a:

- `internal_crm.*`
- `internal-crm-api`
- `internal-crm-media-resolver`
- `internal-crm-storage-intent`, se necessario
- buckets exclusivos do CRM interno:
  - `internal-crm-chat-delivery`
  - `internal-crm-chat-attachments`
  - `internal-crm-media`, somente se for usado como legado/compatibilidade
- frontend em `src/modules/internal-crm/**`

## Diagnostico inicial

### 1. O banco e o storage ja tem estrutura para midia

O CRM interno ja possui colunas em `internal_crm.messages`:

- `message_type`
- `attachment_url`
- `attachment_ready`
- `attachment_mimetype`
- `attachment_name`
- `attachment_size`
- `attachment_error`
- `attachment_error_message`
- `attachment_attempt_count`
- `attachment_last_attempt_at`
- `wa_message_id`
- `remote_jid`
- `metadata`

Tambem existem buckets separados do SolarZap original:

- `internal-crm-chat-delivery`
- `internal-crm-chat-attachments`
- `internal-crm-media`

Portanto, o problema nao e falta de tabela/bucket. O problema esta na esteira:

webhook de entrada -> mensagem pendente -> resolver de midia -> Evolution -> upload no storage -> atualizacao da mensagem -> renderizacao no chat.

### 2. Estado observado em producao

Consulta feita em producao nas ultimas 36 horas:

- `audio`: 1 mensagem, `attachment_ready=false`, sem `attachment_url`
- `image`: 1 mensagem, `attachment_ready=false`, sem `attachment_url`
- duplicidade ativa de conversa nao e a causa deste problema
- as mensagens de midia existem no banco, mas ficam pendentes
- `attachment_error_message` estava como `MANUAL_RETRY_REQUESTED`
- `attachment_attempt_count` estava `0`

Isso indica que o webhook reconhece a midia e grava a mensagem, mas a resolucao efetiva nao esta chegando ao ponto de baixar/uploadar o arquivo.

### 3. Function de midia esta viva

Foi feito teste seguro com `messageId` ficticio na `internal-crm-media-resolver`.

Resultado:

- function respondeu
- auth/runtime/env basico estao vivos
- retorno foi `message_not_found`, que e o esperado para um ID ficticio

Logo, nao parece ser function totalmente fora do ar. A falha esta mais provavelmente no payload de resolucao, na chamada para Evolution ou no fluxo de retry/estado.

### 4. Diferenca critica em relacao ao SolarZap original

O SolarZap original chama a Evolution para baixar midia passando o objeto completo da mensagem:

```json
{
  "message": messageData
}
```

No CRM interno, o resolver hoje tenta baixar midia principalmente com:

```json
{
  "message": {
    "key": {
      "id": "wa_message_id"
    }
  },
  "convertToMp4": false
}
```

Isso e mais fraco e pode falhar em versoes/configuracoes da Evolution que precisam do payload completo com `key`, `message`, `mediaKey`, `directPath`, `url`, `mimetype`, etc.

Ponto importante: as mensagens recentes do CRM interno ja salvam o payload completo da Evolution dentro de:

```text
metadata.data
metadata.data.key
metadata.data.message
```

Ou seja: o dado necessario para resolver a midia provavelmente ja esta no banco, mas o `internal-crm-media-resolver` nao esta usando esse payload completo como estrategia principal/fallback.

### 5. Risco de loading infinito

Quando a midia nao resolve, a interface pode ficar presa em:

- `Carregando audio...`
- `Carregando imagem...`
- `Carregando video...`
- `Carregando documento...`

Isso acontece quando:

- `attachment_ready=false`
- `attachment_url=null`
- `attachment_error=false` ou erro e resetado para retry sem nova tentativa efetiva

O estado correto precisa ser:

- loading apenas enquanto a tentativa esta em andamento ou dentro da janela curta de retry;
- erro claro quando resolver falhar;
- botao de retry manual;
- job de retry em lote para backlog.

## Hipotese principal

A causa mais provavel e que o CRM interno deixou de baixar midia porque o resolver nao passa para a Evolution o objeto completo da mensagem que chegou no webhook.

Depois da correcao de conversas duplicadas, as mensagens passaram a ser registradas corretamente na conversa canonica, mas o pipeline de midia continuou dependente de uma chamada incompleta para Evolution.

## Plano de execucao

### Etapa 0 - Baseline e seguranca

1. Criar branch exclusiva para a correcao.
2. Registrar `git status` antes de qualquer alteracao.
3. Garantir que nenhum arquivo do SolarZap original sera alterado:
   - nao editar `src/components/solarzap/**`
   - nao editar `src/hooks/domain/useChat.ts`
   - nao editar `supabase/functions/whatsapp-webhook`
   - nao editar `supabase/functions/media-resolver`
   - nao editar buckets/tabelas publicas do SolarZap original
4. Registrar baseline de producao:
   - quantidade de mensagens de midia pendentes;
   - quantidade por `message_type`;
   - ultimos `attachment_error_message`;
   - se `metadata.data.message` existe nos pendentes.

Criterio de aceite: escopo comprovadamente restrito ao CRM interno.

### Etapa 1 - Corrigir contrato do webhook interno

Arquivo alvo:

- `supabase/functions/internal-crm-api/index.ts`

Alteracoes:

1. Ao receber webhook de midia, montar um payload minimo e completo para resolucao, por exemplo:

```ts
const resolverMessagePayload = {
  key: messageNode.key,
  message: messageNode.message,
  messageType: rawMsgType,
};
```

2. Salvar esse payload em `metadata.media_resolver_message` ou reutilizar de forma padronizada `metadata.data`.
3. Garantir que o payload salvo contenha:
   - `key.id`
   - `key.remoteJid`
   - `key.fromMe`
   - `message.imageMessage`, `audioMessage`, `videoMessage`, `documentMessage` ou `stickerMessage`
   - `mimetype`
   - `fileName`, quando existir
   - campos tecnicos de midia que a Evolution precisa, como `mediaKey`, `directPath`, `url`, `fileEncSha256`, `fileSha256`, quando vierem no payload
4. Na chamada imediata para `internal-crm-media-resolver`, enviar tambem:

```ts
{
  messageId,
  waMessageId,
  instanceName,
  mimeType,
  fileName,
  messageType,
  mediaVariant,
  evolutionMessage: resolverMessagePayload
}
```

Criterio de aceite: o resolver recebe o objeto completo da mensagem, nao apenas `wa_message_id`.

### Etapa 2 - Corrigir `internal-crm-media-resolver`

Arquivo alvo:

- `supabase/functions/internal-crm-media-resolver/index.ts`

Alteracoes:

1. Alterar `fetchMediaBase64` para aceitar `evolutionMessage`.
2. Priorizar a chamada igual ao SolarZap original:

```json
{
  "message": evolutionMessage
}
```

3. Fallbacks em ordem:
   - payload completo recebido na chamada;
   - `row.metadata.media_resolver_message`;
   - `row.metadata.data`;
   - formato atual com apenas `key.id`;
   - `chat/findMessage`, se ainda fizer sentido.
4. Logar apenas metadados seguros:
   - `messageId`
   - prefixo de `waMessageId`
   - `message_type`
   - estrategia usada
   - status HTTP
   - erro truncado
5. Nunca logar base64, chave de API, service role, payload completo com dados sensiveis.
6. Aceitar respostas variadas da Evolution:
   - `base64`
   - `data.base64`
   - `message.base64`
   - `data.message.base64`, se aplicavel
   - `mimetype` retornado pela Evolution para sobrescrever fallback quando vier.

Criterio de aceite: imagem/audio/video/documento resolvem usando o mesmo formato robusto do SolarZap original, mas dentro da function interna.

### Etapa 3 - Corrigir estados de erro e retry

Arquivos alvo:

- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/internal-crm-media-resolver/index.ts`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`

Alteracoes:

1. Quando o dispatch para resolver falhar antes de iniciar:
   - `attachment_ready=true`
   - `attachment_error=true`
   - `attachment_error_message='RESOLVER_DISPATCH_FAILED:...'`
2. Quando o resolver iniciar:
   - `attachment_ready=false`
   - `attachment_error=false`
   - `attachment_error_message='RESOLVER_STARTED'`
   - incrementar `attachment_attempt_count`
3. Quando a Evolution nao retornar base64:
   - manter `attachment_ready=false` se ainda houver retries automaticos;
   - marcar `attachment_ready=true` apenas quando esgotar tentativas;
   - `attachment_error=true`
   - `attachment_error_message='FATAL_NO_BASE64:<estrategia/status>'`
4. Quando estourar tentativas:
   - `attachment_ready=true`
   - `attachment_error=true`
   - `attachment_error_message='MAX_ATTEMPTS_EXHAUSTED'`
5. O frontend deve exibir:
   - loading quando `attachment_ready=false`;
   - midia quando `attachment_url` existir;
   - erro com retry quando `attachment_ready=true` e `attachment_error=true`.
6. Remover qualquer fluxo que deixe `attachment_ready=false` indefinidamente sem tentativa ativa.

Criterio de aceite: nao existe loading infinito de midia.

### Etapa 4 - Reprocessar backlog de midias pendentes

Depois de corrigir e deployar as functions:

1. Rodar `retryPending` na `internal-crm-media-resolver` em lote pequeno:

```json
{
  "action": "retryPending",
  "maxBatch": 10,
  "minAgeSeconds": 5,
  "maxAttempts": 5
}
```

2. Validar resultado.
3. Se resolver, rodar lotes maiores:

```json
{
  "action": "retryPending",
  "maxBatch": 50,
  "minAgeSeconds": 5,
  "maxAttempts": 5
}
```

4. Registrar:
   - quantas resolveram;
   - quantas falharam por `FATAL_NO_BASE64`;
   - quantas falharam por storage;
   - quantas ficaram em `MAX_ATTEMPTS_EXHAUSTED`.

Criterio de aceite: backlog atual deixa de ficar pendente silenciosamente.

### Etapa 5 - Garantir storage correto e isolado

Arquivos alvo:

- `supabase/functions/internal-crm-media-resolver/index.ts`
- migration nova somente se necessario.

Alteracoes:

1. Usar preferencialmente `internal-crm-chat-attachments` para midias recebidas.
2. Usar `internal-crm-chat-delivery` para midias enviadas pelo operador.
3. Nao usar `chat-attachments` do SolarZap original.
4. Confirmar policies:
   - `service_role` pode inserir/atualizar;
   - usuarios autenticados do CRM interno podem ler;
   - escrita por usuario apenas quando passar por fluxo controlado.
5. Padronizar path:

```text
inbound/{conversation_id}/{message_id}/{timestamp}_{filename}
```

ou, se preferir menor:

```text
{message_id}/{timestamp}_{filename}
```

6. Salvar no metadata:
   - `storage_bucket`
   - `storage_path`
   - `resolver_source`
   - `resolver_strategy`

Criterio de aceite: midia recebida do CRM interno nunca cai em bucket do SolarZap original.

### Etapa 6 - Corrigir renderizacao no Inbox

Arquivos alvo:

- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`

Alteracoes:

1. Verificar se `MessageContent` renderiza corretamente:
   - imagem
   - video
   - audio
   - documento
   - sticker/gif
2. Se depender de componente do SolarZap original, manter apenas como referencia ou componente compartilhavel sem alterar comportamento do original.
3. Garantir que URL publica do bucket abre no navegador.
4. Garantir que audio usa `<audio controls>` ou player equivalente.
5. Garantir que documento tenha nome, tamanho e link de download/abrir.
6. Garantir que erro mostre botao `Tentar novamente`.
7. Evitar que `retry_message_media` dependa de MFA para retry automatico invisivel. O retry automatico deve ser service-side; MFA pode continuar apenas para retry manual de usuario, se for regra de seguranca.

Criterio de aceite: todos os tipos de midia aparecem no chat depois que `attachment_url` e preenchido.

### Etapa 7 - Observabilidade

Adicionar logs/auditoria no CRM interno:

1. `MEDIA_RESOLVER_DISPATCHED`
2. `MEDIA_RESOLVER_STARTED`
3. `MEDIA_RESOLVER_EVOLUTION_STRATEGY_OK`
4. `MEDIA_RESOLVER_EVOLUTION_STRATEGY_FAILED`
5. `MEDIA_RESOLVER_STORAGE_OK`
6. `MEDIA_RESOLVER_STORAGE_FAILED`
7. `MEDIA_RESOLVER_COMPLETED`
8. `MEDIA_RESOLVER_EXHAUSTED`

Campos seguros:

- `message_id`
- `conversation_id`
- `message_type`
- `attempt`
- `strategy`
- `status`
- `duration_ms`

Nao logar:

- base64
- service role
- API key
- conteudo completo de documento/midia
- telefone completo quando nao for necessario

Criterio de aceite: proxima falha de midia mostra exatamente em qual etapa parou.

### Etapa 8 - Testes obrigatorios

Testes manuais em producao ou staging conectado a instancia interna:

1. Enviar imagem para a instancia do CRM interno.
2. Enviar audio/voz.
3. Enviar video curto.
4. Enviar PDF.
5. Enviar sticker ou GIF, se aplicavel.
6. Confirmar que cada mensagem:
   - entra na conversa correta;
   - nao cria conversa duplicada;
   - `attachment_ready` muda para `true`;
   - `attachment_url` e preenchida;
   - aparece no Inbox;
   - nao usa bucket do SolarZap original.
7. Enviar a mesma midia/webhook repetido e validar idempotencia por `whatsapp_instance_id + wa_message_id`.
8. Enviar midia em grupo e validar que continua ignorado.

Testes tecnicos:

1. `npm run test:boundary`
2. `npm run build`
3. `npm run typecheck`
   - se continuar falhando por erros preexistentes do pipeline, registrar separadamente.
4. Consulta SQL pos-deploy:

```sql
select
  message_type,
  count(*) as total,
  count(*) filter (where attachment_ready is false) as pending,
  count(*) filter (where attachment_url is not null) as with_url,
  count(*) filter (where attachment_error is true) as errored
from internal_crm.messages
where message_type in ('image','video','audio','document')
  and created_at >= now() - interval '24 hours'
group by 1
order by 1;
```

Criterio de aceite: midias novas resolvem e pendencias antigas nao ficam silenciosas.

### Etapa 9 - Deploy

Ordem recomendada:

1. Commit da correcao.
2. Aplicar migration somente se houver mudanca de schema/policy.
3. Deploy das Edge Functions:
   - `internal-crm-api`
   - `internal-crm-media-resolver`
4. Reprocessar backlog via `retryPending`.
5. Build do frontend.
6. Deploy da VPS via Portainer.
7. Validar `/admin/crm/inbox`.
8. Rodar consulta de pos-deploy.

## Criterios finais de aceite

1. Imagem recebida aparece no CRM interno.
2. Audio recebido aparece e toca no CRM interno.
3. Video recebido aparece e toca no CRM interno.
4. Documento recebido aparece com link/nome.
5. Sticker/GIF recebido nao fica preso em loading.
6. Nenhuma midia recebida usa bucket do SolarZap original.
7. Nenhuma midia recebida cria conversa duplicada.
8. Nenhuma midia de grupo vira lead/conversa.
9. Pendencias antigas sao resolvidas ou marcadas com erro real.
10. Nao existe estado infinito de `Carregando midia...`.

## Rollback

Se a correcao causar regressao:

1. Reverter deploy das functions `internal-crm-api` e `internal-crm-media-resolver` para a versao anterior.
2. Reverter frontend para imagem anterior no Portainer.
3. Nao apagar midias ja salvas nos buckets internos.
4. Se houver migration apenas aditiva, manter colunas/policies; se houver policy nova quebrando acesso, aplicar migration corretiva especifica.
5. Manter mensagens com `attachment_error=true` para auditoria e retry posterior.

## Arquivos provaveis de alteracao

- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/internal-crm-media-resolver/index.ts`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`
- `src/modules/internal-crm/types/index.ts`, se o contrato de metadata precisar ser tipado
- `supabase/migrations/*internal_crm*`, somente se for preciso ajustar storage/policies ou criar tabela de auditoria

## Observacao importante

O ajuste deve copiar o comportamento funcional do SolarZap original, especialmente o envio do objeto completo da mensagem para a Evolution, mas sem mexer em nenhum arquivo, bucket ou tabela do SolarZap original.
