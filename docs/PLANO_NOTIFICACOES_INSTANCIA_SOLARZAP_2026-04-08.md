# Plano: Centralizar Notificacoes Internas na Instancia SolarZap

## Objetivo

Alterar o SolarZap para que **todas as notificacoes internas** usem a instancia **SolarZap** conectada no **CRM do painel admin**, sem impactar os fluxos de disparo operacional/comercial.

Escopo desta mudanca:

- Notificacoes internas do produto SolarZap para clientes da plataforma.
- Resumos/digests enviados pelo modulo de notificacoes.
- Notificacoes internas do CRM admin que ja dependem da instancia padrao do CRM interno.
- Simplificacao da UI da aba `Notificacoes` para manter apenas destinatarios de WhatsApp e e-mail.

Fora de escopo:

- Disparos de campanha.
- Mensagens manuais no chat.
- Mensagens automaticas comerciais enviadas para leads/clientes.
- Qualquer fluxo de broadcast do SolarZap ou do CRM interno.

## Estado atual mapeado

### Frontend

- A configuracao exibida no menu de notificacoes esta em [src/components/solarzap/NotificationConfigPanel.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/NotificationConfigPanel.tsx).
- Hoje a UI permite:
  - escolher `Instancia de disparo`;
  - editar `Nome do Remetente`;
  - editar `E-mail de Resposta (Reply-To)`;
  - cadastrar destinatarios de WhatsApp;
  - cadastrar destinatarios de e-mail.
- O hook de persistencia esta em [src/hooks/useNotificationSettings.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useNotificationSettings.ts).

### Banco / modelo de dados

- A tabela publica `notification_settings` foi criada em [supabase/migrations/20260220093000_notifications_visits_proposals_digest_foundation.sql](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/migrations/20260220093000_notifications_visits_proposals_digest_foundation.sql).
- Hoje ela guarda, entre outros campos:
  - `whatsapp_instance_name`
  - `whatsapp_recipients`
  - `email_recipients`
  - `email_sender_name`
  - `email_reply_to`
- O CRM admin ja possui sua propria origem de envio em `internal_crm.automation_settings.default_whatsapp_instance_id`, criada em [supabase/migrations/20260329181000_internal_crm_arkan_blueprint.sql](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/migrations/20260329181000_internal_crm_arkan_blueprint.sql).

### Runtime de notificacoes

- O worker principal esta em [supabase/functions/notification-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/notification-worker/index.ts).
- O worker de digest esta em [supabase/functions/ai-digest-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/ai-digest-worker/index.ts).
- Ambos hoje usam `notification_settings.whatsapp_instance_name` para WhatsApp e `email_sender_name` / `email_reply_to` para e-mail.
- Ambos tambem usam o `evolution-proxy` para enviar WhatsApp.

### Ponto critico descoberto

- O `evolution-proxy` faz escopo por `public.whatsapp_instances` e por `org_id`, em [supabase/functions/evolution-proxy/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/evolution-proxy/index.ts).
- A instancia do painel admin vive no **CRM interno**, em `internal_crm.whatsapp_instances`, e nao em `public.whatsapp_instances`.
- Portanto, **nao basta trocar o nome da instancia no worker**.
- Para usar a instancia SolarZap do painel admin nas notificacoes do produto, sera necessario criar um caminho confiavel para resolver e enviar por essa instancia fora do escopo da org cliente.

## Comportamento desejado

### WhatsApp

- As notificacoes internas do SolarZap devem sair sempre pela instancia padrao do CRM admin.
- A origem dessa instancia deve ser `internal_crm.automation_settings.default_whatsapp_instance_id`.
- O usuario do SolarZap nao podera mais escolher uma instancia no menu de notificacoes.
- O usuario continuara podendo informar apenas os numeros destinatarios.

### E-mail

- O remetente deve ser fixo:
  - nome: `ARKAN SOLAR`
  - reply-to: `contato@arkanlabs.com.br`
- Essas informacoes nao poderao mais ser alteradas pela UI.
- O usuario continuara podendo informar apenas os destinatarios de e-mail.

### Limites de escopo

- Broadcasts e campanhas continuam usando suas proprias instancias selecionadas.
- Mensagens manuais e automacoes comerciais continuam com a logica atual.
- A mudanca vale somente para fluxos classificados como notificacao interna.

## Plano tecnico

## 1. Criar uma origem central de transporte para notificacoes internas

Criar um helper compartilhado no backend para resolver o canal fixo de notificacoes internas, por exemplo:

- `supabase/functions/_shared/internalNotificationTransport.ts`

Responsabilidades:

- ler `internal_crm.automation_settings`;
- resolver `default_whatsapp_instance_id`;
- buscar a instancia correspondente em `internal_crm.whatsapp_instances`;
- validar se a instancia esta `connected`;
- devolver um contrato unico com:
  - `whatsappInstanceId`
  - `whatsappInstanceName`
  - `emailSenderName = 'ARKAN SOLAR'`
  - `emailReplyTo = 'contato@arkanlabs.com.br'`

Observacao importante:

- esse helper deve ser a nova fonte de verdade para **notification-worker** e **ai-digest-worker**.
- `notification_settings.whatsapp_instance_name`, `email_sender_name` e `email_reply_to` deixam de ser fonte de runtime.

## 2. Resolver o envio WhatsApp sem depender do escopo da org cliente

Como o `evolution-proxy` hoje so aceita instancias em `public.whatsapp_instances`, existem duas abordagens possiveis. A recomendada e a primeira.

### Abordagem recomendada

Extrair um helper compartilhado de envio direto para Evolution, reaproveitando o padrao ja usado no CRM interno em [supabase/functions/internal-crm-api/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/internal-crm-api/index.ts), para que:

- `notification-worker` envie usando `internal_crm.whatsapp_instances.instance_name`;
- `ai-digest-worker` envie usando `internal_crm.whatsapp_instances.instance_name`;
- o envio nao fique preso ao `org_id` da org cliente.

### Abordagem alternativa

Estender o `evolution-proxy` com um modo interno confiavel para aceitar instancias do schema `internal_crm`.

Risco da alternativa:

- aumenta o acoplamento de um proxy ja sensivel;
- mistura dois dominios diferentes de instancias no mesmo endpoint.

## 3. Atualizar o `notification-worker`

Arquivo-alvo:

- [supabase/functions/notification-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/notification-worker/index.ts)

Alteracoes planejadas:

- parar de exigir `settings.whatsapp_instance_name` como origem de envio;
- continuar usando `notification_settings` apenas para:
  - toggle global;
  - toggle de canais;
  - destinatarios;
  - toggles por tipo de evento;
- resolver a instancia central via helper compartilhado;
- usar remetente fixo de e-mail via helper compartilhado;
- registrar erro explicito se a instancia central do admin nao estiver configurada ou conectada.

Novos codigos de erro sugeridos:

- `admin_notification_instance_missing`
- `admin_notification_instance_disconnected`
- `admin_notification_transport_unavailable`

## 4. Atualizar o `ai-digest-worker`

Arquivo-alvo:

- [supabase/functions/ai-digest-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/ai-digest-worker/index.ts)

Alteracoes planejadas:

- manter `notification_settings` como fonte de habilitacao e destinatarios;
- deixar de usar `settings.whatsapp_instance_name`;
- deixar de usar `settings.email_sender_name` e `settings.email_reply_to` como fonte de envio;
- passar a usar a mesma origem central do admin:
  - instancia SolarZap do CRM admin para WhatsApp;
  - `ARKAN SOLAR` + `contato@arkanlabs.com.br` para e-mail.

## 5. Simplificar a UI da aba `Notificacoes`

Arquivo principal:

- [src/components/solarzap/NotificationConfigPanel.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/NotificationConfigPanel.tsx)

Alteracoes planejadas:

- remover o bloco `Instancia de disparo`;
- remover os inputs editaveis:
  - `Nome do Remetente`
  - `E-mail de Resposta (Reply-To)`
- manter apenas:
  - toggle global;
  - toggle WhatsApp;
  - campo/lista de destinatarios WhatsApp;
  - toggle E-mail;
  - campo/lista de destinatarios de e-mail.

Texto de apoio sugerido:

- WhatsApp: `As notificacoes sao enviadas pela instancia SolarZap configurada no painel admin.`
- E-mail: `Os e-mails saem como ARKAN SOLAR e respostas vao para contato@arkanlabs.com.br.`

Importante:

- o toggle de WhatsApp nao deve mais bloquear por ausencia de seletor local;
- se quisermos preservar visibilidade operacional, mostrar apenas um status informativo, nunca um campo editavel.

## 6. Ajustar o contrato do hook de configuracoes

Arquivo-alvo:

- [src/hooks/useNotificationSettings.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useNotificationSettings.ts)

Alteracoes planejadas:

- manter compatibilidade com os campos atuais do banco por enquanto;
- parar de depender deles na UI principal;
- opcionalmente marcar internamente `whatsapp_instance_name`, `email_sender_name` e `email_reply_to` como legados/deprecados.

Recomendacao:

- nao remover colunas nesta primeira entrega;
- primeiro remover uso funcional;
- depois avaliar cleanup de schema em etapa separada.

## 7. Alinhar o comportamento do CRM admin sem quebrar o que ja funciona

Arquivos de referencia:

- [src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx)
- [supabase/functions/internal-crm-api/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/internal-crm-api/index.ts)

Situacao atual:

- o CRM admin ja possui `default_whatsapp_instance_id` e `admin_notification_numbers`.
- as automacoes internas do admin ja usam esse padrao para `whatsapp_admin`.

Plano:

- nao mexer na regra de disparo comercial do CRM admin;
- usar o `default_whatsapp_instance_id` como fonte unica tambem para os workers publicos de notificacao;
- validar no deploy que a instancia selecionada ali e realmente a `SolarZap`.

## 8. Garantir explicitamente que broadcasts e disparos comerciais nao sejam tocados

Arquivos a preservar:

- [supabase/functions/broadcast-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/broadcast-worker/index.ts)
- [supabase/functions/admin-broadcast-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/admin-broadcast-worker/index.ts)
- [supabase/functions/internal-crm-broadcast-worker/index.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/internal-crm-broadcast-worker/index.ts)
- [src/components/solarzap/BroadcastCampaignModal.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/BroadcastCampaignModal.tsx)
- [src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx](C:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx)

Regra de seguranca:

- nenhuma alteracao nesses fluxos alem de testes de regressao.
- a selecao de instancia nesses modulos deve continuar existindo.

## Testes necessarios

## Unitarios

- novo teste para resolver a instancia central de notificacoes.
- novo teste para falha quando `default_whatsapp_instance_id` nao existir ou nao estiver conectado.
- novo teste para garantir e-mail sempre com:
  - `ARKAN SOLAR`
  - `contato@arkanlabs.com.br`
- manter testes atuais de normalizacao de destinatarios:
  - [tests/unit/notification_recipients.test.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/tests/unit/notification_recipients.test.ts)
  - [tests/unit/notification_recipient_editor.test.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/tests/unit/notification_recipient_editor.test.ts)

## E2E

Atualizar [tests/e2e/notification-recipients-config.spec.ts](C:/Users/rosen/Downloads/solarzap-conversa-main/tests/e2e/notification-recipients-config.spec.ts):

- remover passos ligados ao seletor de instancia;
- remover expectativa de erro `Selecione uma instancia`;
- validar persistencia apenas dos destinatarios;
- validar que o toggle de WhatsApp nao depende mais de instancia local da org.

## Smoke de runtime

Apos implementacao, validar:

1. Notificacao de evento do SolarZap para uma org cliente sai pela instancia SolarZap do admin.
2. Digest diario/semanal sai pela mesma instancia.
3. Notificacoes internas do CRM admin continuam saindo pela instancia padrao do CRM interno.
4. Broadcast do cliente continua saindo pela instancia escolhida na campanha.
5. Broadcast do admin continua saindo pela instancia escolhida no CRM interno.

## Ordem de execucao recomendada

1. Criar helper compartilhado de transporte central.
2. Adaptar `notification-worker`.
3. Adaptar `ai-digest-worker`.
4. Simplificar `NotificationConfigPanel`.
5. Atualizar testes unitarios e E2E.
6. Rodar smoke test focado em notificacoes internas e regressao de broadcasts.

## Riscos e cuidados

- O maior risco e quebrar o envio por WhatsApp ao tentar usar a instancia do CRM admin por um caminho que ainda esta preso ao `org_id` da org cliente.
- O segundo risco e alterar sem querer fluxos de broadcast/comercial.
- O terceiro risco e deixar a UI simples, mas o backend ainda respeitando valores antigos de `whatsapp_instance_name`, `email_sender_name` ou `email_reply_to`.

Mitigacoes:

- centralizar a origem do transporte no backend;
- manter colunas legadas por compatibilidade, mas ignoradas em runtime;
- cobrir a fronteira com testes explicitos de "notificacao interna" vs "broadcast/comercial".

## Resultado esperado ao final

- A aba `Notificacoes` fica enxuta e operacional.
- O cliente configura apenas quem recebe.
- O sistema decide automaticamente por onde enviar.
- Toda notificacao interna do SolarZap usa a instancia SolarZap do painel admin.
- O e-mail sai sempre com identidade fixa da operacao.
- Disparos comerciais e campanhas continuam independentes.
