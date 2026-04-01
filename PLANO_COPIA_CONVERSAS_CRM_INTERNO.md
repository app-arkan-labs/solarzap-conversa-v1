# PLANO: Copiar Aba Conversas do SolarZap → CRM Interno

## Contexto
O CRM Interno (`/admin/crm/inbox`) tem uma aba de Conversas simplificada. O objetivo é copiar **100% do visual e comportamento** da aba Conversas do SolarZap (produto) para o CRM Interno, com pequenas adaptações nos botões e sem conflitos de banco de dados.

---

## PROBLEMA 1: Mensagens Enviadas Não Aparecem

### Diagnóstico
O `append_message` no Edge Function (`internal-crm-api`) **já envia via Evolution API e grava no banco** com `direction: 'outbound'`. A mensagem é inserida na tabela `internal_crm.messages` com `delivery_status: 'sent'` ou `'failed'`.

Porém, o webhook `handleWebhookInbound` **não trata os eventos `MESSAGES_UPDATE` e `SEND_MESSAGE`**. Isso significa:
- Mensagens enviadas via Evolution podem gerar um evento `SEND_MESSAGE` que tenta ser processado como mensagem de texto inbound, falhando silenciosamente.
- O status de delivery (`sent` → `delivered` → `read`) nunca é atualizado.
- Além disso, o evento `MESSAGES_UPSERT` é disparado quando a própria instância envia, e como `fromMe` não é filtrado, **a mensagem enviada pode ser re-inserida como "inbound"** ou ignorada.

### Correções Necessárias (Edge Function)
1. **Filtrar `fromMe` no webhook** — No `MESSAGES_UPSERT`, checar `key.fromMe === true` e ignorar (a mensagem outbound já foi inserida pelo `append_message`).
2. **Tratar `MESSAGES_UPDATE`** — Atualizar `delivery_status` da mensagem quando Evolution reporta `sent`/`delivered`/`read`.
3. **Tratar `SEND_MESSAGE`** — Ignorar ou usar para confirmar delivery da mensagem outbound.

---

## PROBLEMA 2: Layout & Componentes da Aba Conversas

### Estado Atual (CRM Interno)
| Componente | Arquivo | Status |
|---|---|---|
| InternalCrmInboxPage | `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx` | Simplificado |
| InternalCrmConversationList | `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx` | Básico (sem emoji avatar, sem pipeline badge, sem assign) |
| InternalCrmChatArea | `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx` | Básico (sem emoji picker, sem anexos, sem áudio, sem reações, sem busca) |
| InternalCrmActionsPanel | `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx` | 3-col grid, sem dados editáveis, sem propostas |
| InternalCrmMessageComposer | `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx` | Apenas texto |

### Estado Desejado (Copiar do SolarZap)
| Funcionalidade | SolarZap Component | Adaptação |
|---|---|---|
| **Chat completo** — emoji, anexos, áudio, reações, busca, reply, forward | `ChatArea.tsx` | Adapter: traduzir `InternalCrmMessage` → `Message` format do SolarZap |
| **Sidebar lateral (ActionsPanel)** — STATUS header, toggle follow-up, ações rápidas 2-col, dados editáveis, propostas | `ActionsPanel.tsx` | Remover: "Gerar Proposta", "Agendar Visita" → "Agendar Chamada"; Remover: Consumo kWh, Valor Estimado |
| **Lista de conversas** — avatar emoji, unread badge, pipeline badge, assign member | `ConversationList.tsx` | Adapter: traduzir `InternalCrmConversationSummary` → `Conversation` format |
| **Sidebar toggle** — clicar para abrir/fechar ActionsPanel com slide | `SolarZapLayout.tsx` toggle behavior | Copiar lógica de toggle |

---

## PLANO DE AÇÃO DETALHADO

### FASE 1 — Fix Mensagens Enviadas (Backend)
**Arquivo**: `supabase/functions/internal-crm-api/index.ts`

#### 1.1 Filtrar `fromMe` no webhook MESSAGES_UPSERT
- Na função `handleWebhookInbound`, após extrair `messageNode`, verificar se `key.fromMe === true`.
- Se `fromMe`, ignorar a mensagem (ela já foi gravada pelo `append_message`).
- Retornar `{ ok: true, ignored: true, reason: 'from_me_outbound' }`.

#### 1.2 Tratar evento MESSAGES_UPDATE
- Adicionar handler para `event === 'MESSAGES_UPDATE'`.
- Extrair `wa_message_id` e novo `status` do payload.
- Fazer `UPDATE internal_crm.messages SET delivery_status = novo_status WHERE wa_message_id = X`.

#### 1.3 Tratar evento SEND_MESSAGE
- Ignorar ou usar para confirmar que a msg foi enviada.
- `{ ok: true, ignored: true, reason: 'send_message_ack' }`.

---

### FASE 2 — Adaptar ChatArea (Frontend)
**Novo arquivo**: `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx`

#### 2.1 Criar adapter de tipos
Criar um helper que converte `InternalCrmMessage` → SolarZap `Message` format:
```typescript
function adaptMessage(msg: InternalCrmMessage): Message {
  return {
    id: msg.id,
    contactId: msg.conversation_id,
    content: msg.body || '',
    timestamp: new Date(msg.created_at),
    isFromClient: msg.direction === 'inbound',
    isRead: !!msg.read_at,
    status: msg.delivery_status === 'failed' ? 'failed' : 'sent',
    isAutomation: false,
    instanceName: undefined,
    waMessageId: msg.wa_message_id || undefined,
    remoteJid: msg.remote_jid || undefined,
    attachment_url: msg.attachment_url || undefined,
    attachment_type: mapMessageType(msg.message_type),
    attachment_ready: !!msg.attachment_url,
  };
}
```

#### 2.2 Copiar ChatArea do SolarZap
- Copiar `ChatArea.tsx` como base para `InternalCrmChatAreaFull.tsx`.
- Adaptar props para usar os dados do Internal CRM.
- Remover dependências de `useLeads`, `useChat` etc. (usar props).
- Manter: emoji picker, anexo upload, áudio gravação, reações, busca em mensagens, reply, forward, seleção de mensagens, drag-drop.
- **Envio de anexos**: Adaptar para fazer upload via `append_message` com `attachment_url` (precisa de novo action no edge function — ver Fase 4).

#### 2.3 Integrar na InternalCrmInboxPage
- Substituir `InternalCrmChatArea` por `InternalCrmChatAreaFull`.
- Passar os handlers de send, attachment, audio, reaction.

---

### FASE 3 — Copiar ActionsPanel (Sidebar Lateral)
**Novo arquivo**: `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`

#### 3.1 Copiar ActionsPanel do SolarZap
- Copiar a struct de `ActionsPanel.tsx`.
- **Manter 100%**:
  - Header com 🔥 STATUS e botão X para fechar
  - Badge de etapa com cor
  - Follow-up toggle (se disponível)
  - Grid de Ações Rápidas (2 colunas)
  - Dados do Cliente editáveis (nome, empresa, telefone, email, endereço)
  - Observações
  - Botão Salvar (aparece quando há mudanças)

#### 3.2 Adaptações nos botões
**Ações Rápidas finais (2-col grid)**:
| Botão | Cor | Ícone | Ação |
|---|---|---|---|
| Ligar Agora | blue-500 | Phone | `tel:` link |
| Vídeo Chamada | cyan-500 | Video | Google Meet |
| Agendar Reunião | purple-500 | Calendar | AppointmentModal |
| Agendar Chamada | orange-500 | PhoneCall | AppointmentModal (tipo='chamada') |
| Comentários | secondary | MessageSquare | NotesSheet |
| Ver Pipeline | indigo-500 | Kanban | Navegar para pipeline |

**Removidos**: "Gerar Proposta", "Agendar Visita"
**Adicionado**: "Agendar Chamada" (no lugar de "Agendar Visita")

#### 3.3 Remover campos de energia solar
- Remover: `Consumo (kWh)`, `Valor Estimado (R$)`, `Tipo (Residencial/Comercial)`.
- Remover: Seção de Propostas.
- Manter: Nome, Empresa, Telefone, Email, Canal (Origin), Endereço, Cidade, CEP, Observações.

#### 3.4 Dados editáveis via Edge Function
- Criar nova action `update_client_info` no edge function para salvar alterações nos dados do cliente.
- Campos: `company_name`, `primary_contact_name`, `primary_phone`, `primary_email`, `notes`, e metadata para endereço.

---

### FASE 4 — Melhoria no Chat Engine (Anexos, Áudio, Reações)

#### 4.1 Nova action: `send_attachment`
No edge function, criar handler que:
1. Recebe o arquivo (base64 ou URL).
2. Faz upload para storage do Supabase (bucket `internal-crm-attachments`).
3. Envia via Evolution API (`sendMedia`).
4. Insere na `internal_crm.messages` com `attachment_url`, `message_type: 'image'|'audio'|'video'|'document'`.

#### 4.2 Nova action: `send_audio`
Similar ao `send_attachment`, mas específico para áudio gravado no browser.

#### 4.3 Nova action: `send_reaction`
Envia emoji reaction via Evolution API e registra no metadata da mensagem.

#### 4.4 Tratar attachments no webhook inbound
Ao receber mensagem com attachment da Evolution:
- Extrair `mediaUrl`, `mediaType` do payload.
- Salvar na `internal_crm.messages` com `attachment_url` e `message_type` correto.

---

### FASE 5 — Copiar ConversationList (Lista Lateral)

#### 5.1 Melhorar lista de conversas
- Manter funcionalidades existentes (busca, filtro de status).
- Adicionar: avatar com iniciais coloridas (já existe).
- Verificar responsividade mobile.
- A lista já funciona bem — foco menor aqui.

---

### FASE 6 — Toggle da Sidebar (Abrir/Fechar ActionsPanel)
**Arquivo**: `InternalCrmInboxPage.tsx`

#### 6.1 Copiar lógica de toggle
- Adicionar state `isDetailsPanelOpen`.
- No ChatArea, ao clicar ícone de panel (já existe `onOpenActions`), toggle para true.
- No ActionsPanel, botão X → toggle para false.
- Renderizar condicionalmente a 3ª coluna.
- Em mobile: usar Sheet/Drawer.

---

## ISOLAMENTO DE BANCO DE DADOS (Sem Conflitos)

| Aspecto | SolarZap (Produto) | CRM Interno |
|---|---|---|
| Schema | `public` | `internal_crm` |
| Mensagens | `public.interacoes` | `internal_crm.messages` |
| Leads/Contatos | `public.leads` | `internal_crm.clients` + `internal_crm.client_contacts` |
| Conversas | Implícito (1 lead = 1 conversa) | `internal_crm.conversations` |
| Instâncias WhatsApp | `public.whatsapp_instances` | `internal_crm.whatsapp_instances` |
| Edge Function | `evolution-proxy` + `whatsapp-webhook` | `internal-crm-api` |
| Webhook URL | `/functions/v1/whatsapp-webhook` | `/functions/v1/internal-crm-api?action=webhook_inbound` |

✅ **Nenhuma tabela é compartilhada.** Os schemas são completamente isolados.
✅ **Instâncias WhatsApp são separadas** — cada CRM tem suas próprias instâncias registradas na Evolution API com webhooks diferentes.
✅ **Nenhum hook do SolarZap é importado** no CRM Interno — apenas componentes de UI são reutilizados/copiados.

---

## ORDEM DE EXECUÇÃO

| Etapa | Descrição | Impacto |
|---|---|---|
| **1** | Fix webhook (fromMe filter + MESSAGES_UPDATE) | Mensagens enviadas param de duplicar / status atualiza |
| **2** | Copiar ActionsPanel (sidebar) com adaptações | Visual alinhado ao SolarZap |
| **3** | Copiar ChatArea completo com adapters | Chat com emoji, áudio, anexos, reações |
| **4** | Integrar toggle sidebar na InternalCrmInboxPage | Comportamento de abrir/fechar a lateral |
| **5** | Novas actions no Edge Function (attachments, audio, reactions, update_client_info) | Suporte backend para funcionalidades do chat |
| **6** | Testar end-to-end | Verificar sem conflitos |

---

## ESTIMATIVA DE ARQUIVOS ALTERADOS/CRIADOS

### Alterados
- `supabase/functions/internal-crm-api/index.ts` — Fix webhook + novas actions
- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx` — Integrar novos componentes
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts` — Novos handlers (attachment, audio, reaction)
- `src/modules/internal-crm/types.ts` — Novos types se necessário

### Criados
- `src/modules/internal-crm/components/inbox/InternalCrmChatAreaFull.tsx` — Chat completo
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx` — Sidebar completa
- `src/modules/internal-crm/utils/messageAdapter.ts` — Adapter de tipos Internal → SolarZap Message

### Não alterados (SolarZap produto)
- Nenhum arquivo do SolarZap (`src/components/solarzap/*`) será modificado.
- Os componentes são **copiados**, não importados diretamente.
