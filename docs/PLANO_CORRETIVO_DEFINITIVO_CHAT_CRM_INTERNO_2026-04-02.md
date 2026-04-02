# Plano Corretivo Definitivo: chat e multimídia do CRM Interno

Data: 2026-04-02
Status: planejamento somente. Nenhuma execução deve ser feita a partir deste arquivo até nova autorização.

## Objetivo

Corrigir de forma definitiva o inbox do CRM Interno do Painel Admin nos seguintes pontos:

- mídia presa em estado de carregamento
- interface do chat quebrada, sem comportamento de scroll correto
- links em mensagens de texto sem clique
- atualização incorreta ou ausente do nome do lead quando ele responde via WhatsApp

Tudo mantendo isolamento total entre:

- SolarZap principal
- CRM Interno do Painel Admin

Sem misturar tabelas, buckets, webhooks ou fluxos de persistência.

## Problemas relatados

### 1. Mídia aparece como:

- `Carregando imagem...`
- `Carregando vídeo...`

e fica presa assim.

### 2. A interface do chat está quebrada

Sintomas visíveis:

- o chat "carrega inteiro"
- o scroll não fica contido na área do histórico
- a página inteira passa a rolar
- o comportamento difere do SolarZap principal

### 3. URLs em texto não são clicáveis

Exemplo:

- `https://mygateway.com.br/maquininha`
- `https://meet.google.com/...`

Hoje aparecem como texto puro, sem abrir a página ao clicar.

### 4. Nome do lead não atualiza quando ele responde

Comportamento desejado, igual ao SolarZap principal:

- se o contato ainda não tem nome confiável, ele pode nascer provisoriamente
- quando o lead responde e o WhatsApp entrega `pushName` / nome real
- o CRM deve reconciliar e atualizar o nome do cliente/contato

Comportamento atual do CRM Interno:

- o contato pode nascer com nome incorreto
- em alguns casos nasce com nome do operador/instância
- quando depois chega o nome real do lead, o CRM Interno não reconcilia esse nome

## Diagnóstico técnico observado no código

## 1. Root cause da mídia travada em loading

### Estado atual

Em [MessageContent.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\solarzap\MessageContent.tsx), quando:

- `attachmentReady === false`

o componente exibe:

- `Carregando imagem...`
- `Carregando vídeo...`
- `Carregando áudio...`
- `Carregando documento...`

Ou seja:

- o loading preso não é um bug visual isolado
- ele significa que a linha em `internal_crm.messages` continuou com `attachment_ready = false`

### Onde isso é gerado

Em [internal-crm-api/index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\internal-crm-api\index.ts), no `handleWebhookInbound`:

- mensagens de mídia inbound são inseridas com:
  - `attachment_url = null`
  - `attachment_ready = false`
  - `attachment_mimetype`
  - `attachment_name`
- depois a função tenta disparar `internal-crm-media-resolver`

### Gap atual

O fluxo depende de despacho e resolução bem-sucedidos em tempo quase real.

Se ocorrer qualquer falha nesse trilho:

- invoke do resolver
- fetch do base64 no Evolution
- upload no bucket
- update da linha em `internal_crm.messages`

o chat fica eternamente no estado:

- `attachment_ready = false`

### Correção definitiva necessária

Implementar um trilho robusto de resolução com:

1. despacho resiliente
2. retry programado
3. diagnóstico de falha persistido
4. saída de fallback quando esgotar tentativas

### Ação corretiva definitiva

- revisar `internal-crm-media-resolver` para garantir que sempre atualize a linha alvo pelo `messageId`
- adicionar telemetria e reason codes claros no `attachment_error_message`
- criar retentativa automática de pendências:
  - via action `retryPending`
  - via cron/workflow separado do CRM Interno
- criar reparo de backlog para mídias já presas
- impedir loading infinito:
  - ao atingir limite de tentativas, marcar como erro terminal
  - renderizar fallback de erro/abrir arquivo, em vez de loading eterno

## 2. Root cause da interface quebrada e do scroll

### Estado atual

O `InternalCrmChatAreaFull` tem scroll local em:

- `ref={scrollRef}`
- `className="flex-1 min-h-0 overflow-y-auto ..."`

Mas o shell do inbox foi copiado parcialmente e não está perfeitamente alinhado com a hierarquia estável do SolarZap principal.

Arquivo:

- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)

### Sintoma estrutural provável

Hoje o inbox usa:

- `PageHeader`
- wrapper com `flex h-full min-h-0 flex-col`
- card com `flex-1 overflow-hidden`
- grid 2/3 colunas

Mas a tela do Admin aparenta não estar herdando uma cadeia completa de:

- `height fixed`
- `min-h-0`
- `overflow-hidden`

até o container final do chat.

Resultado:

- o `overflow-y-auto` do histórico perde a referência
- o navegador passa a rolar a página inteira
- o histórico deixa de se comportar como viewport de chat

### Outro ponto importante

O `InternalCrmChatAreaFull` foi copiado de uma versão intermediária do chat do SolarZap, mas não do shell completo do workspace de conversas.

Então hoje existe descompasso entre:

- page shell do CRM Interno
- grid/layout do painel admin
- área de mensagens
- painel lateral

### Correção definitiva necessária

Refazer o shell do inbox com a mesma estratégia estrutural do workspace estável do SolarZap:

1. page container com altura controlada
2. card principal com `overflow-hidden`
3. grid interna com `min-h-0` em todos os níveis
4. coluna do histórico como único scroll principal
5. painel lateral com scroll independente
6. remover qualquer altura herdada que force scroll do documento inteiro

### Ação corretiva definitiva

- reauditar toda a cadeia de altura no Admin shell
- alinhar `InternalCrmInboxPage` ao padrão mais estável do SolarZap
- validar:
  - desktop
  - mobile
  - painel lateral aberto/fechado
  - muitas mensagens
  - mensagens com mídia grande

## 3. Root cause dos links não clicáveis

### Estado atual

Em [MessageContent.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\solarzap\MessageContent.tsx):

- mensagens `text` são renderizadas com um `<p>`
- não existe linkificação do texto plano

Hoje URLs só ficam clicáveis quando:

- são attachment URLs
- ou são âncoras específicas de documento/imagem/áudio/vídeo

Mas texto puro como:

- `https://mygateway.com.br/maquininha`

continua sendo só texto.

### Correção definitiva necessária

Adicionar uma camada segura de "linkify" para texto puro.

### Ação corretiva definitiva

Criar utilitário próprio, por exemplo:

- `renderLinkifiedText`

Regras:

- detectar `http://` e `https://`
- transformar em `<a>`
- `target="_blank"`
- `rel="noopener noreferrer"`
- preservar quebras de linha
- não quebrar mensagens já renderizadas como mídia
- tratar pontuação no final da URL

Escopo ideal:

- aplicar de forma compartilhada no `MessageContent`
- beneficiar SolarZap principal e CRM Interno
- sem alterar o comportamento de anexos

## 4. Root cause do nome do lead não atualizar

### Estado atual no CRM Interno

Em [internal-crm-api/index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\internal-crm-api\index.ts):

- se o cliente não existe, ele é criado usando `pushName` quando disponível
- depois o fluxo só garante:
  - telefone
  - contato principal
  - conversa
  - mensagem

Mas não existe uma rotina de reconciliação posterior do nome.

### Ponto crítico adicional

O `handleWebhookInbound` atual também aceita `fromMe` no fluxo principal.

Isso abre uma regressão importante:

- mensagens outbound podem entrar no trilho de criação/resolução de cliente
- dependendo do payload, o nome do operador/instância pode contaminar o cliente

Ou seja, o problema não é apenas "falta atualizar depois".

Também existe risco de:

- semear o cliente com nome errado no primeiro evento outbound

### Como o SolarZap principal resolve melhor

O SolarZap principal usa o fluxo canônico de lead em:

- [leadCanonical.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\_shared\leadCanonical.ts)
- [whatsapp-webhook/index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\whatsapp-webhook\index.ts)

Lá o webhook:

- separa melhor os eventos
- usa `pushName`
- passa por resolução canônica do lead
- consegue convergir telefone + identidade com muito menos deriva

### Correção definitiva necessária

No CRM Interno, precisamos separar duas coisas:

1. mensagens outbound e acks de status
2. identidade do lead em mensagens inbound

### Ação corretiva definitiva

#### 4.1 Blindagem contra `fromMe`

No CRM Interno:

- `fromMe` não pode criar cliente novo por nome do operador
- `fromMe` não pode enriquecer nome do cliente
- `fromMe` deve servir apenas para:
  - persistência da própria mensagem outbound quando aplicável
  - status de entrega/read
  - matching por `wa_message_id`

#### 4.2 Reconciliação de nome inbound

Quando chegar mensagem inbound com `pushName`:

- se o cliente atual estiver com nome provisório ou degradado, atualizar
- se o contato primário estiver com placeholder, atualizar

Regras de placeholder/provisório:

- igual ao telefone
- vazio
- genérico (`Cliente`, `Contato`, similares)
- igual ao nome da instância / operador
- igual ao nome criado por evento outbound indevido

#### 4.3 Fonte de verdade do nome

Prioridade recomendada:

1. `pushName` inbound do lead
2. nome já confirmado manualmente por operador
3. nome legado já confiável
4. telefone apenas como fallback temporário

#### 4.4 Persistência segura

Atualizar:

- `internal_crm.clients.primary_contact_name`
- `internal_crm.clients.company_name` apenas quando fizer sentido
- `internal_crm.client_contacts.name`

Sem sobrescrever nome manualmente corrigido por operador se ele já estiver confiável.

#### 4.5 Função canônica própria do CRM Interno

Recomendação definitiva:

criar uma rotina própria do CRM Interno, inspirada no `leadCanonical`, por exemplo:

- `resolveInternalCrmClientIdentityByPhone`

Objetivo:

- convergir telefone
- nome
- contato principal
- regras de confiabilidade do nome

Sem depender do schema `public`.

## Escopo do corretivo definitivo

## Fase 1 - Corrigir mídia presa em loading

Entregas:

- revisar `internal-crm-media-resolver`
- garantir update de `attachment_ready`
- implementar retry de pendências
- criar ferramenta de backfill para mensagens travadas
- render de fallback quando a mídia falhar de forma terminal

Aceite:

- nenhuma mídia nova fica eternamente em `Carregando...`

## Fase 2 - Corrigir shell e scroll do inbox

Entregas:

- alinhar `InternalCrmInboxPage` ao shell estável do SolarZap
- revisar `min-h-0`, `overflow-hidden`, `flex-1`
- isolar scroll do histórico
- isolar scroll do painel lateral
- impedir scroll do documento inteiro quando o chat estiver aberto

Aceite:

- o histórico rola dentro da área de mensagens
- a página não "estoura" verticalmente

## Fase 3 - Adicionar links clicáveis

Entregas:

- criar utilitário de linkify
- aplicar no render de mensagens texto
- abrir links em nova aba
- manter segurança e preservação de layout

Aceite:

- qualquer `https://...` em mensagem texto vira link clicável

## Fase 4 - Corrigir reconciliação de nome do lead

Entregas:

- bloquear criação/enriquecimento indevido por `fromMe`
- criar heurística de placeholder/provisório
- atualizar cliente/contato quando chegar `pushName` inbound confiável
- portar a estratégia canônica do SolarZap para o CRM Interno, sem misturar schemas

Aceite:

- contato não nasce mais com nome do operador
- quando o lead responder com nome real, o CRM Interno atualiza corretamente

## Fase 5 - Testes obrigatórios

### 5.1 Mídia

- imagem inbound
- vídeo inbound
- áudio inbound
- documento inbound
- gif inbound
- sticker inbound
- retries do resolver

### 5.2 Layout

- histórico com muitas mensagens
- mídia alta/larga
- painel lateral aberto
- painel lateral fechado
- desktop e mobile

### 5.3 Linkify

- URL isolada
- URL no meio do texto
- múltiplas URLs
- URL com pontuação no final

### 5.4 Nome do lead

- contato novo sem pushName
- contato novo com pushName
- contato já criado com placeholder
- lead responde depois e atualiza o nome
- evento `fromMe` não contamina o nome

## Arquivos mais prováveis de alteração futura

- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)
- [InternalCrmChatAreaFull.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\inbox\InternalCrmChatAreaFull.tsx)
- [MessageContent.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\solarzap\MessageContent.tsx)
- [internal-crm-api/index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\internal-crm-api\index.ts)
- [internal-crm-media-resolver/index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\internal-crm-media-resolver\index.ts)
- novo utilitário de linkify no frontend
- novos testes unitários e possivelmente smoke tests específicos do CRM Interno

## Resumo executivo

Os quatro problemas têm uma raiz comum:

- o CRM Interno está com uma cópia parcial do motor do SolarZap, mas ainda sem a parte de robustez operacional e sem a camada canônica de identidade do lead

O corretivo definitivo precisa fazer quatro coisas ao mesmo tempo:

1. endurecer o pipeline de mídia
2. restaurar o shell/scroll correto do inbox
3. linkificar texto puro
4. separar definitivamente outbound status de inbound identity, para o nome do lead convergir igual ao SolarZap principal

## Regra deste plano

Não executar nada ainda.

Próximo passo somente quando o usuário mandar:

- implementar o corretivo definitivo deste arquivo
