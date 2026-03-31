# Blueprint — Aba 3: Inbox (CRM Interno)

> **Escopo:** Reformular completamente a Inbox do CRM interno para se assemelhar à aba Conversas do SolarZap (interface estilo WhatsApp), corrigir o bug crítico de duplicação de leads por mensagem, remover jargões técnicos (provisionar, instância, tokens), e simplificar o painel lateral.
>
> **Regra de Ouro:** Zero regressão no SolarZap público. Todas as alterações ficam dentro de `src/modules/internal-crm/` e das edge functions `internal-crm-api`.

---

## 1 · Diagnóstico dos Problemas (Estado Atual)

### 1.1 Bug Crítico: Cada mensagem cria um novo lead

**Causa raiz** — `handleWebhookInbound()` (edge function `internal-crm-api/index.ts`, ~linha 5162):

```
let client = await resolveScopedClient(schema, {
  ownerUserId,          // ← vem de instance.owner_user_id (pode ser null)
  primaryPhone: phone,
});
```

`resolveScopedClient()` (~linha 4492) filtra por `owner_user_id` em TODOS os lookups (`findScopedClientById`, `findScopedClientByContactPhone`, `findScopedClientByPrimaryField`). Se `owner_user_id` for `null` na instância ou diferente do que foi gravado no client, o lookup falha e um **novo client é criado** com nome `"Lead {phone}"` — gerando um card novo na lista de conversas a cada mensagem recebida.

**Correção necessária:** Na função `handleWebhookInbound`, o lookup deve:
1. Primeiro tentar encontrar o client **apenas por phone** (sem filtro de owner)
2. Só depois usar o `ownerUserId` como fallback para criação
3. Ao encontrar client existente, reaproveitar a conversa aberta daquele client+instance

### 1.2 Nomes aleatórios ("Lead 129805827908057")

Na criação de novo client dentro de `handleWebhookInbound`:
```js
company_name: `Lead ${phone}`,
primary_contact_name: `Contato ${phone}`,
```
O phone vem do `remoteJid` que pode ser algo como `5511999887766@s.whatsapp.net`. Após a correção 1.1, isso será raro (clients existentes serão reaproveitados), mas o fallback deve usar o `pushName` do payload do WhatsApp quando disponível.

### 1.3 Cabeçalho com "Nova Instância Interna"

O `InternalCrmInboxPage.tsx` (linha 182) mostra um botão "Nova instância interna" no header da página. Esse botão + o Dialog de cadastro de instância já existem na aba de Instâncias/Configurações e não fazem sentido aqui.

### 1.4 Lista de conversas mostra tokens técnicos

`InternalCrmConversationList.tsx` renderiza `TokenBadge` para `status`, `channel`, `current_stage_code`, `lifecycle_status` — exibindo códigos como `novo_lead`, `customer_onboarding`, `active_customer`, etc. em vez de rótulos humanos.

### 1.5 Chat area sem estilo WhatsApp

`InternalCrmChatArea.tsx` renderiza mensagens como retângulos arredondados (rounded-[24px]) com fundo primary sólido para outbound. Falta:
- Pattern de fundo estilo WhatsApp (como o SolarZap: `chat-bg-pattern`)
- Bolhas alinhadas à esquerda (inbound) e direita (outbound) com `rounded-tr-none` / `rounded-tl-none`
- Separadores de data entre mensagens
- Status de entrega (tick duplo, etc.)

### 1.6 Painel lateral (ActionsPanel) lotado de jargões

O `InternalCrmActionsPanel.tsx` mostra:
- Botão "Provisionar" (incompreensível para o usuário)
- Botão "Atualizar QR" (pertence à aba de instâncias)
- Botão "Nova Instancia" (duplicado)
- Seção "Deals abertos" com `One-time R$... · MRR R$...`
- Seção "Instância do canal" com botão "Conectar / atualizar QR"
- Seção "Provisionamento" com `TokenBadge` de status técnico

### 1.7 Sheet de ações mobile (ConversationActionsSheet) expõe "Provisionar"

O `InternalCrmConversationActionsSheet.tsx` tem botão "Provisionar conta SolarZap" e "Nova instância interna".

---

## 2 · Design Alvo (Referência: SolarZap Conversas)

### 2.1 Layout geral (3 colunas)

```
┌──────────────┬─────────────────────────┬──────────────┐
│  Lista de    │                         │   Painel     │
│  Conversas   │    Área de Chat         │   Lateral    │
│  (340px)     │    (flex-1)             │   (340px)    │
│              │                         │              │
│  • Avatar    │  • Chat bg pattern      │  Ações       │
│  • Nome      │  • Bolhas WhatsApp      │  Rápidas     │
│  • Preview   │  • Data separators      │              │
│  • Horário   │  • Delivery status      │  Resumo      │
│  • Unread    │                         │              │
│    badge     │                         │  Tarefas     │
│              │                         │              │
│              │  ┌─────────────────┐    │  Agenda      │
│              │  │ Composer        │    │              │
│              │  └─────────────────┘    │              │
└──────────────┴─────────────────────────┴──────────────┘
```

### 2.2 Painel lateral simplificado

**Seções (nesta ordem, como no SolarZap):**

1. **Ações Rápidas** — grid 2×3:
   - 📞 Ligar Agora (bg-blue-500)
   - 📹 Vídeo Chamada (bg-cyan-500)
   - 📅 Agendar Reunião (bg-purple-500)
   - 💬 Comentários (bg-secondary)
   - 🏷️ Ver Pipeline (bg-indigo-500)
   - ✅ Resolver / 📦 Arquivar (bg-emerald-500 / bg-zinc-700) — toggle baseado no status

2. **Resumo do Cliente** — Nome, empresa, telefone, email, etapa (select editável), observações

3. **Tarefas Abertas** — lista compacta das tasks vinculadas ao client

4. **Agenda** — próximos compromissos do client

**Removidos:** Provisionar, QR, Nova Instância, Deals abertos (MRR/One-time), Instância do canal, Provisionamento.

### 2.3 Ações Rápidas — Comportamento

| Botão | Ação |
|---|---|
| Ligar Agora | `window.open('tel:' + phone)` |
| Vídeo Chamada | toast "Em desenvolvimento" |
| Agendar Reunião | Abre `InternalCrmAppointmentModal` (já existe) com `appointment_type: 'meeting'` |
| Comentários | Abre sheet/modal de notas da conversa (reutilizar `DealCommentsSheet` adaptado para `client_id`) |
| Ver Pipeline | Redireciona para aba Pipeline com filtro no client |
| Resolver/Arquivar | Muda `conversation.status` |

---

## 3 · Plano de Ação (12 Etapas)

### Etapa 1 — Corrigir bug de duplicação de leads no webhook (CRÍTICA)

**Arquivo:** `supabase/functions/internal-crm-api/index.ts`  
**Função:** `handleWebhookInbound()` (~linha 5162)

**Mudança:** Antes de chamar `resolveScopedClient` com `ownerUserId`, fazer um lookup direto por `primary_phone` sem filtro de owner:

```ts
// ANTES: resolveScopedClient com ownerUserId filtra tudo e não acha o client
// DEPOIS: lookup global por phone primeiro

const phone = normalizePhone(remoteJid || rawRemoteJid || '');
// ...existing code...

// === NOVO: Lookup direto por telefone (sem owner filter) ===
let client: Record<string, unknown> | null = null;

// 1. Buscar por primary_phone direto (sem owner scope)
const { data: clientByPhone } = await schema
  .from('clients')
  .select('*')
  .eq('primary_phone', phone)
  .order('updated_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (clientByPhone?.id) {
  client = clientByPhone;
} else {
  // 2. Buscar por client_contacts.phone (sem owner scope)
  const { data: contactByPhone } = await schema
    .from('client_contacts')
    .select('client_id')
    .eq('phone', phone)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactByPhone?.client_id) {
    const { data: clientByContact } = await schema
      .from('clients')
      .select('*')
      .eq('id', contactByPhone.client_id)
      .maybeSingle();
    if (clientByContact?.id) client = clientByContact;
  }
}

// 3. Fallback: resolveScopedClient original (com owner)
if (!client?.id) {
  client = await resolveScopedClient(schema, {
    ownerUserId,
    primaryPhone: phone,
  });
}

// 4. Se ainda não encontrou, criar (usando pushName do payload)
if (!client?.id) {
  const pushName =
    asString(messageNode.pushName) ||
    asString((messageNode.key as Record<string, unknown> | undefined)?.pushName) ||
    asString(body.pushName) ||
    asString((body.data as Record<string, unknown> | undefined)?.pushName);

  const displayName = pushName || phone;

  const createdClient = await schema.from('clients').insert({
    company_name: displayName,
    primary_contact_name: displayName,
    primary_phone: phone,
    source_channel: 'whatsapp',
    owner_user_id: ownerUserId,
    current_stage_code: 'novo_lead',
    lifecycle_status: 'lead',
    last_contact_at: nowIso(),
  }).select('*').single();

  if (createdClient.error || !createdClient.data?.id) {
    throw { status: 500, code: 'webhook_client_upsert_failed', error: createdClient.error };
  }
  client = createdClient.data;
}
```

**Também:** Na busca de conversa existente, remover o filtro `eq('status', 'open')` e aceitar também `'resolved'` (reabrindo se necessário):

```ts
// ANTES:
// .eq('status', 'open')
// DEPOIS:
let conversation = (await schema
  .from('conversations')
  .select('*')
  .eq('client_id', client.id)
  .eq('whatsapp_instance_id', instance.id)
  .in('status', ['open', 'resolved'])
  .order('updated_at', { ascending: false })
  .limit(1)
  .maybeSingle()).data;

if (conversation?.id && conversation.status === 'resolved') {
  // Reabrir conversa ao receber nova mensagem
  await schema.from('conversations').update({
    status: 'open',
    updated_at: nowIso(),
  }).eq('id', conversation.id);
  conversation.status = 'open';
}
```

---

### Etapa 2 — Reescrever InternalCrmConversationList (estilo WhatsApp)

**Arquivo:** `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`

Objetivo: Remover `TokenBadge` técnicos, usar layout estilo WhatsApp (avatar circular, nome, preview truncada, horário, badge de unread).

**Layout de cada item:**

```
┌─────────────────────────────────────────┐
│  [Avatar]  Nome do Cliente        14:32 │
│            Preview da mensagem...  (3)  │
└─────────────────────────────────────────┘
```

**Mudanças:**
- Avatar: círculo com inicial do nome (como SolarZap `ConversationList`)
- Nome: `client_company_name || primary_contact_name || primary_phone`
- Sub-texto: `last_message_preview` truncado (1 linha)
- Horário: formatado como "14:32", "Ontem", "12/03"
- Badge de unread: bolinha verde com número (como SolarZap)
- Remover TODOS os `TokenBadge` de status/channel/stage/lifecycle
- Manter search bar e filtro de status (all/aberta/resolvida/arquivada) — renomear para termos simples

---

### Etapa 3 — Reescrever InternalCrmChatArea (bolhas WhatsApp)

**Arquivo:** `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx`

**Mudanças:**
- Background: `chat-bg-pattern` (mesma classe do SolarZap)
- Bolhas: `bg-chat-sent rounded-tr-none ml-auto` para outbound, `bg-chat-received rounded-tl-none mr-auto` para inbound
- Notas internas: borda tracejada amber (como já é, mas com ícone 📝)
- Separadores de dia entre mensagens (como SolarZap: "Hoje", "Ontem", "12/03/2026")
- Status de entrega: ✓ (pending), ✓✓ (sent), ✓✓ azul (delivered/read)
- Remover tokens de `conversation.status`, `conversation.channel`, `instance.status` do header
- Header simplificado: avatar + nome + telefone + botão "Ações" (mobile) + botão "Resolver"/"Arquivar"
- Max-width das bolhas: 75% (como WhatsApp)

---

### Etapa 4 — Reescrever InternalCrmActionsPanel

**Arquivo:** `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx`

**Estrutura nova (4 seções):**

```tsx
// Seção 1: Ações Rápidas
const quickActions = [
  { id: 'call', label: 'Ligar Agora', icon: Phone, color: 'bg-blue-500 hover:bg-blue-600' },
  { id: 'video_call', label: 'Vídeo Chamada', icon: Video, color: 'bg-cyan-500 hover:bg-cyan-600' },
  { id: 'schedule', label: 'Agendar Reunião', icon: Calendar, color: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'comments', label: 'Comentários', icon: MessageSquare, color: 'bg-secondary hover:bg-secondary/90' },
  { id: 'pipeline', label: 'Ver Pipeline', icon: Kanban, color: 'bg-indigo-500 hover:bg-indigo-600' },
  { id: 'resolve', label: 'Resolver', icon: CheckCheck, color: 'bg-emerald-500 hover:bg-emerald-600' },
];

// Seção 2: Resumo do Cliente (editável)
// Nome, Telefone, Email, Etapa (dropdown), Observações (textarea)

// Seção 3: Tarefas
// Lista de tasks abertas do client (compacta)

// Seção 4: Agenda
// Próximos appointments vinculados ao client
```

**Removidos completamente:**
- Botão Provisionar
- Botão Atualizar QR
- Botão Nova Instância
- Seção "Deals abertos" (MRR, One-time)
- Seção "Instância do canal"
- Seção "Provisionamento"

**Props novas necessárias:**
- `onScheduleMeeting: () => void` — abre InternalCrmAppointmentModal
- `onOpenComments: () => void` — abre modal de comentários
- `onNavigatePipeline: () => void` — navega para pipeline

---

### Etapa 5 — Reescrever InternalCrmConversationActionsSheet (mobile)

**Arquivo:** `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx`

Espelhar as mesmas seções do ActionsPanel (Etapa 4) dentro de um `Sheet` mobile. Remover botões de Provisionar, Nova Instância, Conectar QR.

---

### Etapa 6 — Reescrever InternalCrmInboxPage (integração)

**Arquivo:** `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`

**Mudanças:**
- Remover o botão "Nova instância interna" do header
- Remover o `Dialog` de cadastro de instância (todo o state: `instanceDialogOpen`, `instanceDraft`, `saveInstance`)
- Remover `handleProvision` e `connectInstance`
- Header simplificado: apenas ícone + título "Conversas" + subtítulo
- Adicionar state para `appointmentModalOpen` e `commentsModalOpen`
- Passar para o ActionsPanel os callbacks de schedule/comments/pipeline
- Adicionar `InternalCrmAppointmentModal` (já importável de `@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal`)
- Adicionar modal/sheet de comentários (reaproveitar DealCommentsSheet adaptado ou criar `ClientNotesSheet`)

---

### Etapa 7 — Criar ClientNotesSheet (comentários do lead)

**Arquivo novo:** `src/modules/internal-crm/components/inbox/ClientNotesSheet.tsx`

Baseado no `LeadCommentsModal` do SolarZap:
- Sheet lateral (não modal central)
- Lista de notas/comentários do client
- Textarea para adicionar nova nota
- Filtro por data
- Autor automático (user logado)

**Backend:** Usar tabela `internal_crm.deal_notes` (já possui `save_deal_notes` no backend) ou criar par `client_notes`. Verificar se existe tabela de notas por client.

**Alternativa:** Se não existir tabela de notas por client, usar um novo endpoint `save_client_notes` que grava na tabela `internal_crm.messages` com `message_type: 'note'` e `direction: 'system'` (sem conversa associada), OU grava em `internal_crm.tasks` com tipo `note`.

**Decisão:** Reaproveitar `DealCommentsSheet` (já funcional com textarea + save) passando o `deal_id` do deal aberto do client. Se não houver deal aberto, criar uma nota na conversa como mensagem tipo `note`.

---

### Etapa 8 — Ajustar hook useInternalCrmInbox

**Arquivo:** `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`

**Mudanças mínimas:**
- Remover `upsertInstanceMutation` e `connectInstanceMutation` dos retornos (não serão mais usados pela Inbox)
- Adicionar `appointmentMutation` para criar/atualizar appointments do InternalCrmAppointmentModal
- Expor `clientDetailQuery` no retorno (já está, mas garantir que é acessível para o ActionsPanel)

---

### Etapa 9 — Ajustar InternalCrmMessageComposer

**Arquivo:** `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx`

**Mudanças:**
- Adicionar ícone de emoji (futuro, pode ser placeholder)
- Adicionar ícone de anexo (📎) (futuro, pode ser placeholder)
- Botão de envio com ícone Send (já tem)
- Placeholder: "Digite uma mensagem..." (mais natural que "Digite a mensagem para o cliente interno")
- Enter simples envia (já tem Ctrl+Enter, adicionar Enter sem shift como no SolarZap)

---

### Etapa 10 — Deploy da edge function corrigida

Após alterações na Etapa 1, fazer `npx supabase functions deploy internal-crm-api`.

---

### Etapa 11 — Limpeza de dados duplicados (orientação)

Fornecer SQL para o admin identificar e consolidar clients duplicados gerados pelo bug:

```sql
-- Identificar clients com mesmo telefone (duplicados pelo bug)
SELECT primary_phone, count(*) as cnt, array_agg(id) as client_ids
FROM internal_crm.clients
WHERE primary_phone IS NOT NULL AND primary_phone != ''
GROUP BY primary_phone
HAVING count(*) > 1
ORDER BY cnt DESC;
```

> **Nota:** A execução do merge de duplicados é manual e deve ser feita pelo admin após análise, NÃO automaticamente.

---

### Etapa 12 — Validação & checklist anti-regressão

- [ ] Build: `npx tsc --noEmit` zero errors
- [ ] Nenhum import de módulos do SolarZap público nos arquivos do CRM
- [ ] Nenhuma referência a tabelas `public.leads`, `public.comentarios_leads`, `public.contacts` nos componentes — tudo via `internal_crm` schema
- [ ] Testar webhook com mensagem de phone existente → deve encontrar client existente
- [ ] Testar webhook com phone novo → deve criar client com pushName (não "Lead {phone}")
- [ ] Conversa resolvida deve reabrir ao receber nova mensagem
- [ ] Lista de conversas mostra nomes reais, não "Lead 123..."
- [ ] Painel lateral não mostra "Provisionar", "MRR", "QR", "Instância"
- [ ] Botão "Nova instância interna" removido do header
- [ ] Bolhas de chat alinhadas corretamente (outbound=direita, inbound=esquerda)
- [ ] Separadores de data entre mensagens

---

## 4 · Mapa de Arquivos Impactados

| Arquivo | Ação | Etapa |
|---|---|---|
| `supabase/functions/internal-crm-api/index.ts` | Modificar `handleWebhookInbound()` | 1 |
| `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx` | Reescrever | 2 |
| `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx` | Reescrever | 3 |
| `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx` | Reescrever | 4 |
| `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx` | Reescrever | 5 |
| `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx` | Reescrever | 6 |
| `src/modules/internal-crm/components/inbox/ClientNotesSheet.tsx` | Criar | 7 |
| `src/modules/internal-crm/hooks/useInternalCrmInbox.ts` | Modificar | 8 |
| `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx` | Modificar | 9 |

**Total:** 7 arquivos reescritos/modificados + 1 arquivo criado + 1 edge function modificada.

---

## 5 · Referências de Design (SolarZap)

### ConversationList item (SolarZap)
```
Avatar (40px circle) | Nome (bold)            Horário
                     | Preview (1 line, muted)  (3) badge
```

### ChatArea bubbles (SolarZap)
```
.bg-chat-sent.rounded-tr-none.ml-auto      → outbound (direita)
.bg-chat-received.rounded-tl-none.mr-auto  → inbound (esquerda)
max-width: 78% (mobile) / 65% (desktop)
```

### ActionsPanel quick actions (SolarZap)
```
📞 Ligar Agora       | 📹 Vídeo Chamada
📅 Agendar Reunião   | 📄 Gerar Proposta  ← REMOVER no CRM
🏠 Agendar Visita    | 💬 Comentários
🏷️ Ver Pipeline
```

### Adaptação para CRM:
```
📞 Ligar Agora       | 📹 Vídeo Chamada
📅 Agendar Reunião   | 💬 Comentários
🏷️ Ver Pipeline     | ✅ Resolver/📦 Arquivar
```

Sem "Gerar Proposta" e sem "Agendar Visita" (substituído por "Agendar Reunião").
