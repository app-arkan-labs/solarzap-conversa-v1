# Plano de Ação — Correção da Importação de Contatos

> Criado: 2026-03-16
> Status: **AGUARDANDO REVISÃO**

---

## Problemas Identificados

### Bug 1 — Vendedor responsável não é atribuído (Import Normal)

**Arquivo:** `src/components/solarzap/ImportContactsModal.tsx`

O frontend monta corretamente o campo `assigned_to_user_id` no payload (linhas ~396-399):
```ts
const assigneeId = (selectedAssigneeId || fallbackAssigneeId).trim();
if (assigneeId) {
  contact['assigned_to_user_id'] = assigneeId;
}
```

O backend (`import_leads_batch` RPC) valida contra `organization_members` e cai no fallback `v_actor_user_id` (o usuário logado):
```sql
v_assigned_to_user_id := coalesce(v_valid_assignee, v_actor_user_id);
```

**Causa raiz provável:**
- O `listMembers()` pode falhar silenciosamente, deixando `selectedAssigneeId` como string vazia (`''`).
- `fallbackAssigneeId` vale `user?.id || ''`, que pode ser `''` se `user` ainda não carregou.
- No RPC, `assigned_to_user_id` do JSON vira `NULL` → `v_valid_assignee` fica `NULL` → cai em `v_actor_user_id`.
- Se o `auth.uid()` não está na tabela `organization_members`, o lead termina com `assigned_to_user_id` do actor, mas na UI aparece como "Não atribuído" pois o nome/email não é encontrado na lista de membros.

### Bug 2 — Broadcast ignora o vendedor selecionado

**Arquivo:** `src/hooks/useBroadcasts.ts`

A função `upsertLeadForRecipient` **hardcoda** `user.id` em todos os INSERT/UPDATE, ignorando completamente `campaign.assigned_to_user_id`:

```ts
// Linha 324 (insert)
assigned_to_user_id: user.id,  // ❌ deveria ser campaign.assigned_to_user_id

// Linha 348 (fallback insert)
assigned_to_user_id: user.id,  // ❌

// Linha 380 (update)
assigned_to_user_id: user.id,  // ❌
```

### Falta 3 — Não permite múltiplos vendedores com distribuição round-robin

Atualmente ambos os modais permitem selecionar apenas **um** vendedor. Não há suporte para seleção múltipla com distribuição percentual proporcional.

### Falta 4 — Sem seletor de etapa do pipeline na importação normal

O `ImportContactsModal` não tem campo para escolher a etapa do pipeline. Cada lead importado cai em `novo_lead` por padrão (a menos que o CSV tenha uma coluna mapeada para `status_pipeline`).

O `BroadcastCampaignModal` também hardcoda `pipeline_stage: 'novo_lead'` na linha 338.

---

## Plano de Ação

### Fase 1 — Correções de Bug (Prioridade Máxima)

#### 1.1 — Corrigir atribuição no Broadcast (`useBroadcasts.ts`)

**O quê:** Trocar `user.id` por `campaign.assigned_to_user_id || user.id` em todos os pontos de `upsertLeadForRecipient`.

**Onde:**
| Linha aprox. | Contexto | Mudança |
|---|---|---|
| ~324 | `baseInsertPayload` | `assigned_to_user_id: campaign.assigned_to_user_id \|\| user.id` |
| ~348 | `fallbackPayload` | `assigned_to_user_id: campaign.assigned_to_user_id \|\| user.id` |
| ~380 | `fullUpdatePayload` | `assigned_to_user_id: campaign.assigned_to_user_id \|\| user.id` |

**Risco:** Baixo — só altera qual UUID é gravado.

---

#### 1.2 — Blindar `selectedAssigneeId` na importação normal (`ImportContactsModal.tsx`)

**O quê:**
- Garantir que `selectedAssigneeId` NUNCA fique vazio se houver membros carregados.
- Mover fallback para `user.id` diretamente no state init: `useState<string>(user?.id ?? '')`.
- Adicionar log de debug na chamada `onImport` para facilitar troubleshooting.

**Risco:** Baixo.

---

### Fase 2 — Seletor de Etapa do Pipeline

#### 2.1 — Adicionar dropdown de etapa no `ImportContactsModal.tsx`

**O quê:** Novo campo `<Select>` na step "upload" que permite escolher a etapa padrão da pipeline. Se o CSV tiver coluna mapeada para `status_pipeline`, ela tem prioridade; caso contrário, o valor default selecionado é aplicado.

**UI (desktop):**
- Grid de 2 colunas no bloco de configuração existente
- Nova row com: `Etapa do Pipeline (padrão)` dropdown à esquerda

**UI (mobile):**
- Stack vertical (já acontece naturalmente com `md:grid-cols-2`)

**Onde modifica:**
| Arquivo | O quê |
|---|---|
| `ImportContactsModal.tsx` | Novo state `defaultPipelineStage`, novo `<Select>` com `PIPELINE_STAGES`, aplicar no `getMappedContacts()` como fallback |
| `ImportedContact` interface | Adicionar `status_pipeline_default?: string` |
| `import_leads_batch` RPC | Reconhecer campo `status_pipeline_default` como fallback (opcional — pode ser feito só no frontend) |

**Decisão de design:** aplicar frontend-only. No `getMappedContacts()`, se `status_pipeline` veio vazio do CSV, usar `defaultPipelineStage` em vez de `'novo_lead'`.

---

#### 2.2 — Adicionar dropdown de etapa no `BroadcastCampaignModal.tsx`

**O quê:** No Step 1 (Setup), adicionar dropdown para escolher a etapa do pipeline em vez de hardcodar `'novo_lead'`.

**Onde modifica:**
| Arquivo | O quê |
|---|---|
| `BroadcastCampaignModal.tsx` | Novo state `pipelineStage`, novo `<Select>`, usar no submit (`pipeline_stage: pipelineStage`) |

---

### Fase 3 — Multi-Vendedor com Distribuição Round-Robin

#### 3.1 — Criar componente `MultiAssigneeSelector`

**O quê:** Novo componente reutilizável que permite selecionar múltiplos vendedores.

**Arquivo:** `src/components/solarzap/MultiAssigneeSelector.tsx`

**Funcionalidades:**
- Lista de membros com checkbox ao lado de cada um
- Badge mostrando quantidade selecionada e percentual: `"João (33%) · Maria (33%) · Pedro (34%)"`
- Botão "Selecionar todos"
- Proporcionalidade automática: 2 selecionados = 50% cada, 3 = ~33% cada, etc.
- Props: `members: MemberDto[]`, `selectedIds: string[]`, `onChange: (ids: string[]) => void`, `isLoading: boolean`

**Comportamento visual:**
- **Desktop:** Dropdown multi-select com popover listando membros com checkboxes
- **Mobile:** Mesmo dropdown, full-width, com scroll

#### 3.2 — Lógica de distribuição round-robin no frontend

**O quê:** Quando há múltiplos vendedores, distribuir os contatos proporcionalmente antes de enviar ao backend.

**Onde:**

**ImportContactsModal.tsx** — no `getMappedContacts()`:
```ts
// Pseudo-código
const assignees = selectedAssigneeIds; // string[]
if (assignees.length > 0) {
  contacts.forEach((contact, index) => {
    contact.assigned_to_user_id = assignees[index % assignees.length];
  });
}
```

**BroadcastCampaignModal.tsx** — no submit:
- Armazenar lista de assignees no campo `assigned_to_user_ids` (novo campo no `BroadcastCampaignInput`).
- Na hora de criar a campanha, escolher 1 assignee principal para o campo `assigned_to_user_id` do registro da campanha.
- Na hora de criar os leads (em `upsertLeadForRecipient`), distribuir round-robin pelos assignees.

**Alternativa para Broadcast:** Como os leads são criados 1 a 1 durante o envio, precisamos passar a lista de vendedores no campo da campanha e distribuir na criação.

| Arquivo | Mudança |
|---|---|
| `BroadcastCampaignInput` (interface) | Adicionar `assigned_to_user_ids?: string[]` |
| `broadcast_campaigns` (tabela) | Adicionar coluna `assigned_to_user_ids text[]` (array de UUIDs) |
| `useBroadcasts.ts` → `createCampaign` | Salvar `assigned_to_user_ids` na campanha |
| `useBroadcasts.ts` → `upsertLeadForRecipient` | Usar index do recipient para round-robin entre os IDs |
| `BroadcastCampaignModal.tsx` | Substituir Select único por `MultiAssigneeSelector` |
| `ImportContactsModal.tsx` | Substituir Select único por `MultiAssigneeSelector` |

#### 3.3 — Migração DB para broadcast (se necessário)

**Arquivo:** `supabase/migrations/2026031XXXXX_broadcast_multi_assignee.sql`

```sql
ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS assigned_to_user_ids text[];
```

> **Nota:** A `import_leads_batch` RPC **não precisa de mudança** pois o frontend já faz o round-robin e envia cada lead com seu `assigned_to_user_id` individual.

---

#### 3.4 — Integrar `MultiAssigneeSelector` nos dois modais

**ImportContactsModal.tsx:**
- Substituir o `<Select>` de assignee pelo `<MultiAssigneeSelector>`
- State muda de `selectedAssigneeId: string` para `selectedAssigneeIds: string[]`
- `getMappedContacts()` distribui round-robin

**BroadcastCampaignModal.tsx:**
- Substituir o `<Select>` de assignee pelo `<MultiAssigneeSelector>`
- State muda de `assignedToUserId: string` para `assignedToUserIds: string[]`
- Submit envia `assigned_to_user_ids` e `assigned_to_user_id = ids[0]`

---

### Fase 4 — Responsividade Mobile

#### 4.1 — Revisão `ImportContactsModal.tsx`

- O grid `md:grid-cols-2` já funciona (stack em mobile, 2 colunas em desktop).
- Verificar que novo seletor de etapa e multi-assignee não quebram no mobile.
- Ajustar max-height do popover do multi-select para `max-h-[50vh]` em mobile.
- Testar com viewport 375px (iPhone SE).

#### 4.2 — Revisão `BroadcastCampaignModal.tsx`

- Step 1 (Setup) já tem layout responsivo.
- Garantir que novos campos (etapa + multi-assignee) empilhem verticalmente em mobile.
- Testar todas as 5 steps com viewport mobile.

---

## Ordem de Execução

| Passo | Descrição | Arquivos |
|---|---|---|
| **1** | Fix broadcast assignee (bug crítico) | `useBroadcasts.ts` |
| **2** | Fix import assignee (blindagem) | `ImportContactsModal.tsx` |
| **3** | Seletor de etapa — import | `ImportContactsModal.tsx` |
| **4** | Seletor de etapa — broadcast | `BroadcastCampaignModal.tsx` |
| **5** | Componente `MultiAssigneeSelector` | novo arquivo |
| **6** | Multi-assignee no import modal | `ImportContactsModal.tsx` |
| **7** | Multi-assignee no broadcast modal + migração DB | `BroadcastCampaignModal.tsx`, `useBroadcasts.ts`, nova migração |
| **8** | Testes de responsividade mobile | ambos modais |

---

## Estimativa de Impacto

| Item | Arquivos alterados | Risco |
|---|---|---|
| Fix bugs de assignee | 2 | Baixo |
| Seletor de etapa | 2 | Baixo |
| Multi-assignee + round-robin | 5 + 1 novo + 1 migração | Médio |
| Responsividade | 2 | Baixo |

---

## Critérios de Aceite

- [ ] Leads importados via CSV ficam com o vendedor correto no banco (verificar via Supabase)
- [ ] Leads criados via broadcast ficam com vendedor correto
- [ ] Ao selecionar 2 vendedores e importar 10 contatos, 5 ficam para cada
- [ ] Ao selecionar 3 vendedores e importar 9 contatos, 3 ficam para cada
- [ ] Dropdown de etapa funciona e aplica a etapa ao lead
- [ ] Etapa do CSV tem prioridade sobre dropdown (import normal)
- [ ] UI funciona corretamente em mobile (375px) e desktop (1440px+)
- [ ] Broadcast com etapa customizada cria leads na etapa correta
