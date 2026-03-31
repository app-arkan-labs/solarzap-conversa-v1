# Plano de Acao - Central de Integracoes do CRM Interno

## 1. Objetivo

Criar e operar uma aba de Central de Integracoes para o CRM Interno do SolarZap com a mesma experiencia visual da Central de Integracoes atual, mas sem envolver nada do CRM principal do produto.

O objetivo pratico e:

- manter a mesma UI base da Central atual;
- manter a mesma logica operacional de instancias WhatsApp;
- usar somente o dominio `internal_crm` no backend interno;
- impedir qualquer dependencia de hooks, tabelas ou fluxos do CRM principal multi-tenant.

---

## 2. Regra de Arquitetura Obrigatoria

Esta entrega deve respeitar as guardrails abaixo:

1. Zero escrita do CRM Interno em tabelas runtime do produto principal.
2. Zero uso de hooks do produto principal como `useUserWhatsAppInstances`, `useIntegrations`, `useAISettings`, `useLeads`, `useChat` e similares.
3. Toda leitura e escrita da feature deve passar pelo `internal-crm-api` e pelo schema `internal_crm`.
4. Nenhuma instancia WhatsApp do CRM Interno pode depender de `public.whatsapp_instances`.
5. O comportamento da feature deve ser copy-first na UI e isolated-first na camada de dados.

---

## 3. Diagnostico Confirmado do Codigo

### 3.1 Origem da UI atual

A Central de Integracoes atual do produto vive em:

- `src/components/solarzap/IntegrationsView.tsx`

Na pratica, a tela atual e centrada em WhatsApp:

- criar instancia;
- exibir QR Code;
- consultar status;
- desconectar;
- excluir;
- alternar IA por instancia;
- trocar cor visual da instancia.

### 3.2 O que o CRM Interno ja tinha pronto

O CRM Interno ja possuia base propria para suportar a feature:

- tabela `internal_crm.whatsapp_instances`;
- action `list_instances` no `internal-crm-api`;
- action `upsert_instance` no `internal-crm-api`;
- action `connect_instance` no `internal-crm-api`;
- consumo parcial dessas instancias na Inbox interna;
- Google Calendar proprio ja desacoplado em `internal_crm.google_calendar_connections`.

### 3.3 Gap real identificado

Faltavam os pontos abaixo para a aba ficar equivalente na pratica:

1. rota propria no Admin do CRM Interno;
2. item proprio na sidebar do CRM Interno;
3. hook proprio do modulo interno para lifecycle completo da instancia;
4. actions internas para:
   - consultar status;
   - desconectar;
   - excluir;
5. sincronizacao automatica do webhook interno para:
   - `CONNECTION_UPDATE`;
   - `QRCODE_UPDATED`.

---

## 4. Escopo Real da Paridade

Pela analise do codigo, a paridade real da Central de Integracoes atual e o modulo de WhatsApp.

O Google Calendar do CRM Interno ja existe, mas na aba `Calendarios`.

Portanto, a entrega correta para ficar "igualzinho ao que ja funciona hoje" e:

- espelhar a Central atual para WhatsApp dentro do CRM Interno;
- manter Google Calendar onde ele ja esta no CRM Interno;
- nao inventar acoplamento entre integracoes internas e integracoes do tenant principal.

Se houver decisao futura de consolidar Google Calendar dentro da mesma tela interna, isso deve ser tratado como Fase 2, sem mudar a regra de isolamento.

---

## 5. Estrutura Alvo da Solucao

### 5.1 Frontend

Nova rota do CRM Interno:

- `/admin/crm/integrations`

Arquivos principais da feature:

- `src/modules/internal-crm/pages/InternalCrmIntegrationsPage.tsx`
- `src/modules/internal-crm/components/integrations/InternalCrmIntegrationsView.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmWhatsappInstances.ts`

### 5.2 Backend

Edge Function central:

- `supabase/functions/internal-crm-api/index.ts`

Actions internas necessarias:

- `list_instances`
- `upsert_instance`
- `connect_instance`
- `get_instance_status`
- `disconnect_instance`
- `delete_instance`

### 5.3 Persistencia

Tabela usada exclusivamente pelo CRM Interno:

- `internal_crm.whatsapp_instances`

Campos importantes da feature:

- `instance_name`
- `display_name`
- `status`
- `ai_enabled`
- `assistant_identity_name`
- `assistant_prompt_override`
- `phone_number`
- `webhook_url`
- `qr_code_base64`
- `metadata`

Observacao:

- a cor visual da instancia deve ficar em `metadata.color` no dominio `internal_crm`;
- nao deve existir dependencia de coluna da tabela publica do produto principal.

---

## 6. Plano de Execucao Definitivo

## Fase 1 - Isolamento de Navegacao

1. Adicionar rota nova em `/admin/crm/integrations`.
2. Adicionar item `Integracoes` na sidebar do CRM Interno.
3. Proteger a rota com `InternalCrmGuard`.

Resultado esperado:

- a feature aparece somente no contexto do CRM Interno;
- nenhuma navegacao do CRM principal e alterada.

## Fase 2 - Copy-first da UI

1. Copiar a linguagem visual da `IntegrationsView` atual.
2. Recriar o layout interno com:
   - `PageHeader`;
   - card de conexoes WhatsApp;
   - bloco de criacao de instancia;
   - painel de QR Code;
   - lista de instancias;
   - toggle de IA;
   - seletor de cor;
   - acoes por instancia.
3. Remover qualquer dependencia do contexto `IntegrationsContext` do produto principal.

Resultado esperado:

- a tela fica visualmente equivalente;
- a camada de dados passa a ser 100 por cento interna.

## Fase 3 - Hook interno dedicado

1. Criar `useInternalCrmWhatsappInstances` dentro do modulo `src/modules/internal-crm`.
2. Consumir somente `useInternalCrmInstances` e `useInternalCrmMutation`.
3. Implementar os fluxos:
   - listar instancias;
   - criar instancia;
   - conectar e obter QR;
   - consultar status;
   - desconectar;
   - excluir;
   - alternar IA;
   - alterar cor.
4. Sincronizar via Realtime em `internal_crm.whatsapp_instances`.

Resultado esperado:

- toda a feature interna passa a viver dentro do namespace de query keys do CRM Interno;
- nenhuma query do runtime publico e compartilhada.

## Fase 4 - Hardening do internal-crm-api

1. Estender `ACTION_PERMISSIONS` com:
   - `get_instance_status`;
   - `disconnect_instance`;
   - `delete_instance`.
2. Implementar handlers dedicados para essas actions.
3. Garantir que `upsert_instance` preserve `metadata` e aceite cor visual em `metadata.color`.
4. Garantir que `connect_instance` registre webhook interno com eventos:
   - `MESSAGES_UPSERT`;
   - `MESSAGES_UPDATE`;
   - `SEND_MESSAGE`;
   - `CONNECTION_UPDATE`;
   - `QRCODE_UPDATED`.
5. Garantir auditoria nas actions sensiveis.

Resultado esperado:

- o CRM Interno passa a ter o mesmo ciclo de vida operacional das instancias da feature atual;
- sem tocar o dominio do tenant publico.

## Fase 5 - Sincronizacao por Webhook

1. Atualizar `webhook_inbound` do `internal-crm-api` para tratar:
   - `QRCODE_UPDATED`;
   - `CONNECTION_UPDATE`.
2. Persistir no `internal_crm.whatsapp_instances`:
   - `status`;
   - `phone_number`;
   - `qr_code_base64`.
3. Manter o fluxo de mensagens inbound existente.

Resultado esperado:

- a UI interna nao depende apenas de clique manual para refletir estado e QR;
- a experiencia fica equivalente a uma central operacional de integracoes.

## Fase 6 - Validacao de Boundary

1. Rodar `npm run test:boundary`.
2. Confirmar que o modulo interno nao importa hooks proibidos.
3. Confirmar que o `internal-crm-api` continua preso ao schema `internal_crm` e a bridges permitidas.

Resultado esperado:

- a feature continua dentro das guardrails arquiteturais do projeto.

## Fase 7 - Build e Smoke Test

1. Rodar `npm run build`.
2. Validar no navegador:
   - abrir `/admin/crm/integrations`;
   - criar instancia;
   - exibir QR;
   - conectar;
   - verificar status;
   - desconectar;
   - excluir.
3. Validar reflexo no inbox/campanhas, se a instancia estiver conectada.

Resultado esperado:

- a feature compila e funciona ponta a ponta.

---

## 7. Status Atual da Implementacao

Itens ja executados no codigo:

1. rota `/admin/crm/integrations` criada;
2. item `Integracoes` criado na sidebar do CRM Interno;
3. `InternalCrmIntegrationsPage` criada;
4. `InternalCrmIntegrationsView` criada com UI espelhada da Central atual;
5. `useInternalCrmWhatsappInstances` criado;
6. actions `get_instance_status`, `disconnect_instance` e `delete_instance` adicionadas ao `internal-crm-api`;
7. `webhook_inbound` interno atualizado para `QRCODE_UPDATED` e `CONNECTION_UPDATE`;
8. suporte de cor visual isolado em `internal_crm.whatsapp_instances.metadata.color`;
9. validacao de boundary aprovada;
10. build do frontend aprovado.

---

## 8. Passos Finais para Publicacao

1. publicar frontend com a nova rota do admin;
2. publicar `internal-crm-api` atualizado;
3. verificar variaveis de ambiente da edge function:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EVOLUTION_API_URL`
   - `EVOLUTION_API_KEY`
   - `EDGE_INTERNAL_API_KEY`
4. executar smoke test manual com usuario `crm_role = owner` ou `ops`;
5. monitorar erros de webhook e de Evolution nas primeiras conexoes.

---

## 9. Criterios de Aceite

1. A aba existe em `/admin/crm/integrations`.
2. A aba usa a mesma linguagem visual da Central atual.
3. Nenhum hook do CRM principal e importado pelo modulo interno.
4. Nenhuma tabela runtime do schema `public` e usada para essa feature.
5. E possivel criar instancia interna e obter QR Code.
6. E possivel consultar status da instancia interna.
7. E possivel desconectar a instancia interna.
8. E possivel excluir a instancia interna.
9. O webhook interno atualiza QR e status automaticamente.
10. O build e os testes de boundary passam sem regressao.

---

## 10. Riscos e Observacoes

1. Se o ambiente da Evolution API estiver instavel, a criacao e o refresh de QR podem falhar mesmo com o frontend correto.
2. Se o `internal-crm-api` nao for publicado junto do frontend, a rota nova abre mas as acoes de instancia ficam quebradas.
3. O escopo desta entrega replica a Central atual real, que hoje e essencialmente WhatsApp. Google Calendar interno continua corretamente na aba `Calendarios`.
4. Qualquer tentativa futura de unificar cards de Google, Meta ou outras integracoes deve continuar seguindo a regra de isolamento do `internal_crm`.

---

## 11. Resumo Executivo

O plano correto para a Central de Integracoes do CRM Interno nao e reaproveitar hooks ou tabelas do SolarZap principal. O plano correto e:

1. copiar a UI;
2. trocar toda a camada de dados para `internal_crm`;
3. fechar o ciclo operacional no `internal-crm-api`;
4. validar com boundary test e build;
5. publicar frontend e edge function juntos.

Esse e o caminho de menor risco, maior coerencia arquitetural e menor chance de vazamento entre CRM Interno e CRM principal.