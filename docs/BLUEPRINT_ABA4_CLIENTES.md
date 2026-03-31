# Blueprint — Aba 4: Clientes (CRM Interno)

> **Objetivo**: Replicar a experiência da aba **Contatos** do SolarZap (`ContactsView.tsx`)
> dentro do CRM interno, usando **apenas** o schema `internal_crm` e os endpoints da
> edge function `internal-crm-api`. Zero impacto no SolarZap público.

---

## 1. Estado Atual vs Estado Desejado

### 1.1 Estado Atual (CRM Interno)

| Componente | Arquivo | Problema |
|---|---|---|
| **InternalCrmClientsPage** | `src/modules/internal-crm/pages/InternalCrmClientsPage.tsx` | Layout em lista-tabela (`<Table>`) com colunas técnicas (MRR, Lifecycle, Health Score). Não tem layout split-panel. Modal de "Novo cliente" com campo "Lifecycle" técnico. Sheet lateral para abrir detalhe — repleto de jargão (Provisionar, MRR, One-time, Checkout). |
| **InternalCrmClientsView** | `src/modules/internal-crm/components/clients/InternalCrmClientsView.tsx` | Tabela plana com colunas: Empresa, Contato, Etapa, Lifecycle, Saúde, MRR, Próxima ação. Filtro por `stage_code` e `lifecycle_status`. Sem busca inline no sidebar left. |
| **InternalCrmClientDetail** | `src/modules/internal-crm/components/clients/InternalCrmClientDetail.tsx` | Cards: Resumo (com TokenBadge), Deals (mostra One-time/MRR), Conta SolarZap (botão "Provisionar conta SolarZap"), Timeline. Uso de `TokenBadge` com tokens técnicos em tudo. |
| **InternalCrmClientTimeline** | `src/modules/internal-crm/components/clients/InternalCrmClientTimeline.tsx` | Timeline com `TokenBadge` em cada entry. |

### 1.2 Estado Desejado (Copiar ContactsView do SolarZap)

A aba Clientes do SolarZap (`src/components/solarzap/ContactsView.tsx`) tem:

1. **Layout split-panel**: sidebar esquerda (lista de contatos) + painel direito (detalhes inline editáveis)
2. **Sidebar esquerda**:
   - Header com título "Contatos" + botões importar/exportar
   - Busca textual (`Search`)
   - Modo seleção com checkbox bulk-delete
   - Lista de contatos: avatar circular com iniciais, nome, telefone, badge colorido de etapa, FollowUpIndicator
   - Clique em contato → carrega detalhes no painel direito (desktop) ou abre tela inteira (mobile)
3. **Painel direito (detalhes)**:
   - Header com título "Detalhes do Contato" + botões Comentários, Salvar, Excluir
   - Avatar grande + nome (editável inline) + empresa (editável) + select de etapa colorido
   - Grid 2 colunas: "Informações de Contato" (telefone, email, endereço, cidade) e seção contextual
   - Observações (textarea)
   - Timeline (data cadastro, última interação, dias na etapa)
4. **Comentários**: modal `LeadCommentsModal` com textarea, filtro por data, lista de comentários

### 1.3 Adaptações para o CRM Interno

| SolarZap | CRM Interno (adaptação) |
|---|---|
| Dados do schema `public` (table `leads`) | Dados do schema `internal_crm` (table `clients`) via edge function |
| `onUpdateLead(contactId, data)` | `useInternalCrmMutation` com `action: 'upsert_client'` |
| `onDeleteLead(contactId)` | Novo endpoint `delete_client` na edge function |
| `LeadCommentsModal` (busca `comentarios_leads`) | Modal adaptado usando `internal_crm.client_notes` (nova tabela) ou reutilizando o campo `notes` do client |
| Campos solares (consumo_kwh, valor_estimado, tipo_cliente) | **Removidos** — substituídos por: Plano SolarZap (se assinante), Origem (source_channel), Observações |
| `PIPELINE_STAGES` do SolarZap | `useInternalCrmPipelineStages()` — etapas do CRM interno |
| `onToggleLeadAi` / `aiEnabled` | **Removido** — não se aplica ao CRM interno |
| `ImportContactsModal` / `ExportContactsModal` | Replicar: Importar via CSV com `upsert_client`, Exportar via CSV gerado no frontend |
| `AssignMemberSelect` | **Removido** por agora — CRM interno não tem multi-member por org |
| `FollowUpIndicator` | **Removido** — CRM interno não tem follow-up automático de leads |
| `LeadScopeSelect` (mine/team/all) | **Removido** — CRM interno é single-team |
| Propostas do Cliente | **Removido** — CRM interno não gera propostas solares |

---

## 2. Arquivos Impactados

| # | Arquivo | Ação |
|---|---|---|
| 1 | `src/modules/internal-crm/pages/InternalCrmClientsPage.tsx` | **Reescrever** — layout split-panel inspirado no ContactsView |
| 2 | `src/modules/internal-crm/components/clients/InternalCrmClientsView.tsx` | **Deletar** — será absorvido pela page |
| 3 | `src/modules/internal-crm/components/clients/InternalCrmClientDetail.tsx` | **Deletar** — será absorvido pela page como painel inline |
| 4 | `src/modules/internal-crm/components/clients/InternalCrmClientTimeline.tsx` | **Manter e simplificar** — remover TokenBadge, usar textos claros |
| 5 | `src/modules/internal-crm/hooks/useInternalCrmClients.ts` | **Modificar** — adicionar `deleteClientMutation` |
| 6 | `src/modules/internal-crm/components/clients/CrmClientCommentsModal.tsx` | **Criar** — modal de comentários baseado no `LeadCommentsModal` do SolarZap |
| 7 | `src/modules/internal-crm/components/clients/CrmImportClientsModal.tsx` | **Criar** — importar clientes via CSV chamando `upsert_client` |
| 8 | `src/modules/internal-crm/components/clients/CrmExportClientsModal.tsx` | **Criar** — exportar clientes para CSV |
| 9 | `supabase/functions/internal-crm-api/index.ts` | **Modificar** — adicionar `delete_client`, `list_client_notes`, `add_client_note`, `delete_client_note` |
| 10 | `src/modules/internal-crm/types/index.ts` | **Modificar** — adicionar `InternalCrmClientNote` type, actions |

---

## 3. Plano de Execução — 10 Etapas

### Etapa 1 — Atualizar Types (`types/index.ts`)

Adicionar ao union `InternalCrmApiAction`:
```ts
| 'delete_client'
| 'list_client_notes'
| 'add_client_note'
| 'delete_client_note'
```

Adicionar novo type:
```ts
export type InternalCrmClientNote = {
  id: string;
  client_id: string;
  author_name: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
};
```

### Etapa 2 — Backend: Adicionar Endpoints na Edge Function

**2a) `delete_client`** — Soft delete (ou hard delete se sem deals ativos):
```ts
async function deleteClient(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const clientId = asString(payload.client_id);
  if (!clientId) throw { status: 400, code: 'invalid_payload' };
  const schema = crmSchema(serviceClient);

  // Check if has open deals
  const { count } = await schema
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'open');

  if ((count || 0) > 0) {
    throw { status: 400, code: 'action_not_allowed', error: 'Cliente possui deals abertos. Feche os deals antes de excluir.' };
  }

  const before = (await schema.from('clients').select('*').eq('id', clientId).maybeSingle()).data;
  
  const { error } = await schema.from('clients').delete().eq('id', clientId);
  if (error) throw { status: 500, code: 'client_delete_failed', error };

  await writeAuditLog(serviceClient, identity, 'delete_client', req, {
    target_type: 'client',
    target_id: clientId,
    client_id: clientId,
    before,
    after: null,
  });

  return { ok: true };
}
```

**2b) `list_client_notes`** — Busca notas na tabela `client_notes`:
```ts
async function listClientNotes(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const clientId = asString(payload.client_id);
  if (!clientId) throw { status: 400, code: 'invalid_payload' };
  const schema = crmSchema(serviceClient);

  const { data, error } = await schema
    .from('client_notes')
    .select('id, client_id, author_name, author_user_id, body, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw { status: 500, code: 'client_notes_query_failed', error };
  return { ok: true, notes: data || [] };
}
```

**2c) `add_client_note`**:
```ts
async function addClientNote(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
) {
  const clientId = asString(payload.client_id);
  const body = asString(payload.body);
  if (!clientId || !body) throw { status: 400, code: 'invalid_payload' };
  const authorName = asString(payload.author_name) || identity.email || 'Admin';
  const schema = crmSchema(serviceClient);

  const { data, error } = await schema
    .from('client_notes')
    .insert({ client_id: clientId, author_name: authorName, author_user_id: identity.user_id, body })
    .select('*')
    .single();

  if (error) throw { status: 500, code: 'client_note_insert_failed', error };
  return { ok: true, note: data };
}
```

**2d) `delete_client_note`**:
```ts
async function deleteClientNote(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const noteId = asString(payload.note_id);
  if (!noteId) throw { status: 400, code: 'invalid_payload' };
  const schema = crmSchema(serviceClient);

  const { error } = await schema.from('client_notes').delete().eq('id', noteId);
  if (error) throw { status: 500, code: 'client_note_delete_failed', error };
  return { ok: true };
}
```

**2e) ACL**: Todas 4 ações requerem role `owner | sales | cs` (mínimo).

**2f) Router cases**:
```ts
case 'delete_client': return json(await deleteClient(serviceClient, identity, payload, req));
case 'list_client_notes': return json(await listClientNotes(serviceClient, payload));
case 'add_client_note': return json(await addClientNote(serviceClient, identity, payload));
case 'delete_client_note': return json(await deleteClientNote(serviceClient, payload));
```

### Etapa 3 — Migration SQL: Criar tabela `client_notes`

```sql
-- Migration: create client_notes table
CREATE TABLE IF NOT EXISTS internal_crm.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  author_user_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON internal_crm.client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON internal_crm.client_notes(created_at DESC);
```

### Etapa 4 — Hook: Adicionar mutations ao `useInternalCrmClients.ts`

```ts
// Adicionar:
const deleteClientMutation = useInternalCrmMutation({
  invalidate: [internalCrmQueryKeys.clients({})],
});

const listNotesQuery = useInternalCrmQuery<{ notes: InternalCrmClientNote[] }>(
  'list_client_notes',
  { client_id: selectedClientId },
  { enabled: !!selectedClientId }
);

const addNoteMutation = useInternalCrmMutation({
  invalidate: selectedClientId
    ? [['internal-crm', 'list_client_notes', { client_id: selectedClientId }]]
    : [],
});

const deleteNoteMutation = useInternalCrmMutation({
  invalidate: selectedClientId
    ? [['internal-crm', 'list_client_notes', { client_id: selectedClientId }]]
    : [],
});
```

### Etapa 5 — Criar `CrmClientCommentsModal.tsx`

Modal baseado no `LeadCommentsModal.tsx` do SolarZap:
- Textarea para adicionar nota
- Botão enviar (chama `add_client_note`)
- Filtro por datas (de/até)
- Lista de notas com autor, data, texto
- Botão excluir (hover) — chama `delete_client_note`

Layout **idêntico** ao `LeadCommentsModal`:
```
┌────────────────────────────────────────────┐
│ 💬 Comentários - {company_name}           │
├────────────────────────────────────────────┤
│ [Textarea: Adicionar comentário...]  [▶]  │
│                                            │
│ 📅 De: [____] Até: [____]  [x]           │
│ 3 de 5 comentários                         │
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │ Admin        31/03/26 às 14:30  [🗑] │  │
│ │ Reunião marcada para semana que vem  │  │
│ └──────────────────────────────────────┘  │
│ ┌──────────────────────────────────────┐  │
│ │ Vendedor     30/03/26 às 10:15  [🗑] │  │
│ │ Cliente pediu demonstração           │  │
│ └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### Etapa 6 — Criar `CrmImportClientsModal.tsx`

Modal baseado no `ImportContactsModal.tsx` do SolarZap:
- Upload de CSV
- Mapeamento de colunas: Nome/Empresa, Telefone, Email, Origem
- Preview das linhas
- Botão "Importar" que chama `upsert_client` para cada linha
- Progress bar

### Etapa 7 — Criar `CrmExportClientsModal.tsx`

Modal baseado no `ExportContactsModal.tsx` do SolarZap:
- Gera CSV com colunas: Empresa, Contato, Telefone, Email, Origem, Etapa, Status, Última Interação
- Download automático

### Etapa 8 — Simplificar `InternalCrmClientTimeline.tsx`

- Remover `TokenBadge` — usar texto simples com cores inline
- Traduzir status (`open` → "Aberto", `done` → "Concluído", `won` → "Fechou", `lost` → "Não fechou")
- Remover referência a "Deal" — usar "Negociação"

### Etapa 9 — Reescrever `InternalCrmClientsPage.tsx` (arquivo principal)

Layout split-panel inspirado no `ContactsView.tsx`:

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR ESQUERDA (w-80)        │ PAINEL DIREITO (flex-1)        │
│                                │                                 │
│ 🏢 Clientes  [📥][📤][+ Novo] │ 📧 Detalhes do Cliente         │
│                                │     [💬 Comentários] [💾 Salvar]│
│ [🔍 Pesquisar clientes...]     │     [🗑 Excluir]               │
│                                │                                 │
│ [☐ Selecionar] [🗑 Excluir(3)]│ 👤 Avatar   Nome (editável)    │
│                                │              Empresa (editável) │
│ ┌────────────────────────────┐ │              [Etapa ▾] colorido │
│ │ AA  Empresa Alpha          │ │                                 │
│ │     João Silva  •          │ │ ── Informações de Contato ──── │
│ │     (11) 99999-0000        │ │ 📞 Telefone (editável)         │
│ │                            │ │ 📧 E-mail (editável)           │
│ │ BB  Beta Corp        ██   │ │ 📍 Endereço / Cidade           │
│ │     Maria Santos  •        │ │                                 │
│ │     (21) 88888-0000        │ │ ── Dados Comerciais ────────── │
│ │                            │ │ 🏷 Origem: WhatsApp            │
│ │ CC  Gamma Ltd              │ │ 📊 Status: Ativo               │
│ │     Pedro Lima    •        │ │                                 │
│ │     (31) 77777-0000        │ │ ── Observações ──────────────  │
│ └────────────────────────────┘ │ [Textarea]                      │
│                                │                                 │
│                                │ ── Timeline ──────────────────  │
│                                │ 📅 Cadastro: 01/03/26           │
│                                │ 🕐 Última interação: 30/03/26   │
│                                │ ⏱ 5 dias na etapa atual         │
└──────────────────────────────────────────────────────────────────┘
```

**Comportamento mobile**: sidebar lista ocupa tela inteira → clique abre detalhe em tela inteira com botão "← Voltar".

**Mapeamento de campos do client CRM para o formulário inline**:

| Campo do formulário | Campo em `internal_crm.clients` | Editável |
|---|---|---|
| Nome | `primary_contact_name` | ✅ |
| Empresa | `company_name` | ✅ |
| Telefone | `primary_phone` | ✅ |
| E-mail | `primary_email` | ✅ |
| Etapa | `current_stage_code` | ✅ (select com cores) |
| Origem | `source_channel` | ✅ (select) |
| Status | `lifecycle_status` | ✅ (select com labels humanizadas) |
| Observações | `notes` | ✅ (textarea) |

**Labels humanizadas para lifecycle_status**:
- `lead` → "Lead"
- `customer_onboarding` → "Em Integração"
- `active_customer` → "Cliente Ativo"
- `churn_risk` → "Risco de Cancelamento"
- `churned` → "Cancelado"

**Labels humanizadas para source_channel**:
- `whatsapp` → "WhatsApp"
- `instagram` → "Instagram"
- `google_ads` → "Google Ads"
- `indicacao` → "Indicação"
- `manual` → "Manual"
- `landing_page` → "Landing Page"

**Cores das etapas do CRM interno** — obtidas de `useInternalCrmPipelineStages()`:
```ts
const STAGE_COLORS: Record<string, string> = {
  novo_lead: 'bg-blue-500',
  respondeu: 'bg-orange-500',
  reuniao_agendada: 'bg-purple-500',
  reuniao_realizada: 'bg-green-500',
  nao_compareceu: 'bg-red-500',
  proposta_enviada: 'bg-cyan-500',
  negociacao: 'bg-yellow-500',
  contrato_fechado: 'bg-emerald-600',
  em_integracao: 'bg-teal-500',
  ativo: 'bg-green-600',
  perdido: 'bg-gray-500',
};
```
Nota: fallback `bg-primary` para stage_codes não mapeados.

### Etapa 10 — Build Check + Validação

```
npx tsc --noEmit 2>&1
```

**Checklist anti-regressão**:
- [ ] `InternalCrmClientsPage` renderiza split-panel desktop + full-screen mobile
- [ ] Busca filtra por empresa, contato, email, telefone
- [ ] Edição inline salva via `upsert_client`
- [ ] Delete client funciona (com check de deals abertos)
- [ ] Comentários: listar, adicionar, excluir
- [ ] Import CSV funciona
- [ ] Export CSV funciona
- [ ] Select de etapa mostra cores corretas
- [ ] Nenhum TokenBadge visível
- [ ] Termos "MRR", "One-time", "Lifecycle", "Provisionar" → removidos
- [ ] Timeline legível com textos em português
- [ ] Zero import do schema `public` — tudo via `internal-crm-api`
- [ ] `npx tsc --noEmit` → 0 erros

---

## 4. Componentes Reutilizados do SolarZap (Referência Visual, Não Import Direto)

| Componente SolarZap | Usado como referência para |
|---|---|
| `ContactsView.tsx` | Layout geral split-panel, lista de contatos, painel de detalhes |
| `LeadCommentsModal.tsx` | `CrmClientCommentsModal.tsx` (layout idêntico) |
| `ImportContactsModal.tsx` | `CrmImportClientsModal.tsx` (lógica CSV idêntica, endpoint diferente) |
| `ExportContactsModal.tsx` | `CrmExportClientsModal.tsx` (lógica CSV idêntica, dados diferentes) |
| `PageHeader.tsx` | Reutilizar diretamente (já compartilhado) |

**Nenhum import direto de componentes do SolarZap** — todo código é reescrito dentro de `src/modules/internal-crm/`.

---

## 5. Segurança

- Todos os endpoints protegidos pelo ACL existente (`requireRole(['owner','sales','cs'])`)
- `delete_client` verifica deals abertos antes de excluir
- `client_notes` tem `ON DELETE CASCADE` no `client_id` FK
- CSV import sanitiza telefone via `normalizePhone()` existente no backend
- Zero acesso direto ao Supabase client — tudo via edge function

---

## 6. Dependências Externas

- `date-fns` — já presente no projeto (usado no modal de comentários para filtro de datas)
- Todos os UI components (`Dialog`, `Sheet`, `Table`, `Input`, `Select`, etc.) — já presentes
- `PageHeader` — já compartilhado entre SolarZap e CRM

---

## 7. Estimativa de Complexidade

| Etapa | Risco |
|---|---|
| 1. Types | Baixo |
| 2. Backend endpoints | Médio (nova tabela + 4 funções) |
| 3. Migration SQL | Baixo |
| 4. Hook mutations | Baixo |
| 5. CommentsModal | Baixo (cópia adaptada) |
| 6. ImportModal | Médio (parse CSV) |
| 7. ExportModal | Baixo |
| 8. Timeline simplify | Baixo |
| 9. ClientsPage rewrite | **Alto** (arquivo principal, ~600 linhas) |
| 10. Build check | Baixo |
