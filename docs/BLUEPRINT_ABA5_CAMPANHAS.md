# Blueprint — Aba 5: Campanhas (CRM Interno)

## Objetivo
Replicar a experiência da aba **Disparos em Massa** (`BroadcastView.tsx`) do SolarZap no módulo CRM interno, utilizando **exclusivamente** o schema `internal_crm` e os componentes em `src/modules/internal-crm`. Zero conflito com o SolarZap público.

---

## 1. Diagnóstico do Estado Atual

### Arquivos existentes
| Arquivo | Linhas | Papel |
|---------|--------|-------|
| `src/modules/internal-crm/pages/InternalCrmCampaignsPage.tsx` | 5 | Página shell, renderiza `InternalCrmCampaignsView` |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx` | ~200 | Grid de cards com TokenBadge, botões "Rodar lote", "Editar" |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx` | ~170 | Modal com Textarea para destinatários (`nome;telefone;client_id`) |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel.tsx` | ~35 | 5 MetricCards agregados (campanhas ativas, total, pendentes, enviados, falhas) |
| `src/modules/internal-crm/components/campaigns/InternalCrmRecipientSelector.tsx` | ~40 | Textarea com validação de linhas `nome;telefone` |
| `src/modules/internal-crm/hooks/useInternalCrmCampaigns.ts` | ~35 | Módulo que compõe queries e mutations |

### Problemas identificados

| # | Problema | Impacto |
|---|---------|---------|
| P1 | **Layout pobre** — grid de cards sem cards visuais ricos, sem barra de progresso por campanha | UX fraca vs. SolarZap |
| P2 | **TokenBadge** no status da campanha — mostra `draft`, `running`, `paused`, `completed`, `canceled` em tokens técnicos cinza | Confuso |
| P3 | **Modal de criação primitivo** — apenas nome, instância, status, mensagens separadas por linha, e destinatários colados em Textarea | Vs. SolarZap que tem wizard 5 etapas |
| P4 | **Sem upload CSV/XLSX** — a seleção de destinatários é manual via Textarea `nome;telefone` | Inviável para campanhas grandes |
| P5 | **Sem seleção de clientes do CRM** — não há opção de selecionar clientes existentes no CRM interno | Perda de funcionalidade |
| P6 | **Sem timer/intervalo** — o CRM não permite configurar intervalo entre mensagens | O worker envia tudo de uma vez |
| P7 | **Botão "Rodar lote"** exposto — conceito técnico de batch que não deveria ser visível ao usuário | Confuso |
| P8 | **Sem painel de status em tempo real** — não há dialog/sheet mostrando destinatários individuais com status | Sem acompanhamento |
| P9 | **Sem variação de mensagens** — SolarZap permite N variações; CRM coloca uma por linha no Textarea | Risco de bloqueio WhatsApp |
| P10 | **Sem confirmação de delete** — não há AlertDialog para confirmar exclusão/cancelamento | Risco de ação acidental |

### Referência do SolarZap (o que queremos replicar)

#### `BroadcastView.tsx` (~410 linhas)
- **PageHeader** com título "Disparos em Massa", subtitle, botão "Comprar créditos" + "Nova Campanha"
- **Grid responsivo** `lg:grid-cols-2` com cards visuais ricos:
  - Badge colorido por status (draft=cinza, running=azul, paused=âmbar, completed=verde, canceled=vermelho)
  - Barra de progresso com contadores (`enviadas/total`)
  - Grid 3 colunas: Enviadas | Falhas | Timer
  - Botões: Detalhes | Iniciar/Retomar | Pausar | Cancelar | Deletar
- **`BroadcastStatusPanel`** — Dialog modal com progresso em tempo real, lista de destinatários com ícone de status, polling a cada 4s
- **`AlertDialog`** para confirmar exclusão

#### `BroadcastCampaignModal.tsx` (~850 linhas)
- **Wizard 5 etapas** com barra de progresso:
  1. **Configuração**: instância, nome, origem, etapa pipeline, responsável, tipo de cliente
  2. **Upload**: toggle CSV/XLSX vs. "Leads do CRM" (BroadcastLeadSelector), preview da lista
  3. **Mensagens**: N variações com Textarea, adicionar/remover, contagem de caracteres
  4. **Timer**: Slider + presets (15s, 1m, 5m, 1h, 1d) + randomização anti-bloqueio
  5. **Preview**: resumo de todos os dados antes de salvar/iniciar

#### `BroadcastStatusPanel.tsx` (~200 linhas)
- Dialog com grid de métricas (Status, Enviadas, Falhas, Tempo estimado)
- Barra de progresso
- Badges de contadores
- ScrollArea com lista de destinatários e ícone de status
- Botões Pausar/Retomar/Cancelar

---

## 2. Estrutura de Banco de Dados (já existente)

Tabelas no schema `internal_crm` (migration `20260328000450`):

```sql
internal_crm.broadcast_campaigns (
  id uuid PK,
  name text NOT NULL,
  whatsapp_instance_id uuid FK → whatsapp_instances,
  messages jsonb DEFAULT '[]',
  status text CHECK IN ('draft','running','paused','completed','canceled'),
  sent_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  owner_user_id uuid,
  target_filters jsonb DEFAULT '{}',
  created_at timestamptz,
  updated_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
)

internal_crm.broadcast_recipients (
  id uuid PK,
  campaign_id uuid FK → broadcast_campaigns ON DELETE CASCADE,
  client_id uuid FK → clients,
  contact_id uuid FK → client_contacts,
  recipient_name text,
  recipient_phone text NOT NULL,
  status text CHECK IN ('pending','processing','sent','failed','skipped','canceled'),
  attempt_count int DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz,
  updated_at timestamptz
)
```

### Alteração necessária na tabela `broadcast_campaigns`
Adicionar coluna `interval_seconds` para suportar o timer configurável:

```sql
ALTER TABLE internal_crm.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS interval_seconds integer NOT NULL DEFAULT 15;
```

---

## 3. Backend Existente (Edge Function)

### ACL (já configurado)
```
list_campaigns: { minCrmRole: 'read_only', requireMfa: true }
upsert_campaign: { minCrmRole: 'sales', requireMfa: true }
update_campaign_status: { minCrmRole: 'sales', requireMfa: true }
run_campaign_batch: { minCrmRole: 'sales', requireMfa: true }
```

### Funções existentes
- `listCampaigns()` — lista campanhas com contadores de recipients
- `upsertCampaign()` — cria/atualiza campanha com recipients
- `updateCampaignStatus()` — muda status (running/paused/canceled/completed)
- `runCampaignBatch()` — invoca `internal-crm-broadcast-worker`

### Alterações necessárias no backend

#### 3a. `upsertCampaign` — Aceitar `interval_seconds`
Adicionar campo `interval_seconds` ao upsert da campanha.

#### 3b. `listCampaigns` — Retornar `interval_seconds`
Já retorna `...campaign` (spread), então o campo virá automaticamente após a migration.

#### 3c. Nova action: `delete_campaign`
```
delete_campaign: { minCrmRole: 'sales', requireMfa: true }
```
Deleta campanha (CASCADE remove recipients) com audit log.

#### 3d. Nova action: `list_campaign_recipients`
```
list_campaign_recipients: { minCrmRole: 'read_only', requireMfa: true }
```
Retorna destinatários de uma campanha específica para o painel de status.

---

## 4. Plano de Execução — 10 Etapas

### Etapa 1 — Migration SQL (adicionar `interval_seconds` à tabela)
**Arquivo**: `supabase/migrations/20260331200000_crm_campaign_interval.sql`
```sql
ALTER TABLE internal_crm.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS interval_seconds integer NOT NULL DEFAULT 15;
```

### Etapa 2 — Atualizar tipo TypeScript
**Arquivo**: `src/modules/internal-crm/types/index.ts`

Adicionar `interval_seconds` ao `InternalCrmCampaign`:
```diff
 export type InternalCrmCampaign = {
   id: string;
   name: string;
   whatsapp_instance_id: string | null;
   status: 'draft' | 'running' | 'paused' | 'completed' | 'canceled';
   sent_count: number;
   failed_count: number;
   owner_user_id: string | null;
   target_filters: Record<string, unknown>;
   messages: Array<string>;
+  interval_seconds: number;
   recipients_total?: number;
   recipients_pending?: number;
   recipients_sent?: number;
   recipients_failed?: number;
   created_at: string;
   updated_at: string;
 };
```

Adicionar novo type `InternalCrmCampaignRecipient`:
```ts
export type InternalCrmCampaignRecipient = {
  id: string;
  campaign_id: string;
  client_id: string | null;
  recipient_name: string | null;
  recipient_phone: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped' | 'canceled';
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
```

Adicionar novas actions ao `InternalCrmApiAction`:
```diff
+ | 'delete_campaign'
+ | 'list_campaign_recipients'
```

### Etapa 3 — Atualizar edge function: `upsertCampaign`, adicionar `deleteCampaign` e `listCampaignRecipients`
**Arquivo**: `supabase/functions/internal-crm-api/index.ts`

#### 3a. ACL — adicionar:
```ts
delete_campaign: { minCrmRole: 'sales', requireMfa: true },
list_campaign_recipients: { minCrmRole: 'read_only', requireMfa: true },
```

#### 3b. `upsertCampaign` — adicionar `interval_seconds`:
No trecho do `upsert`, depois de `status`:
```ts
interval_seconds: Math.max(10, Math.min(86400, asNumber(payload.interval_seconds, 15))),
```

#### 3c. Nova função `deleteCampaign`:
```ts
async function deleteCampaign(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const campaignId = asString(payload.campaign_id);
  if (!campaignId) throw { status: 400, code: 'invalid_payload' };

  const before = (await crmSchema(serviceClient)
    .from('broadcast_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()).data;

  if (!before) throw { status: 404, code: 'not_found' };

  // Cancel if running
  if (before.status === 'running') {
    await crmSchema(serviceClient)
      .from('broadcast_campaigns')
      .update({ status: 'canceled', finished_at: nowIso(), updated_at: nowIso() })
      .eq('id', campaignId);
  }

  const { error } = await crmSchema(serviceClient)
    .from('broadcast_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) throw { status: 500, code: 'campaign_delete_failed', error };

  await writeAuditLog(serviceClient, identity, 'delete_campaign', req, {
    target_type: 'campaign',
    target_id: campaignId,
    before,
    after: null,
  });

  return { ok: true };
}
```

#### 3d. Nova função `listCampaignRecipients`:
```ts
async function listCampaignRecipients(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const campaignId = asString(payload.campaign_id);
  if (!campaignId) throw { status: 400, code: 'invalid_payload' };

  const { data, error } = await crmSchema(serviceClient)
    .from('broadcast_recipients')
    .select('id, campaign_id, client_id, recipient_name, recipient_phone, status, attempt_count, last_error, created_at, updated_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw { status: 500, code: 'campaign_recipients_query_failed', error };

  return { ok: true, recipients: data || [] };
}
```

#### 3e. Router cases:
```ts
case 'delete_campaign':
  result = await deleteCampaign(serviceClient, identity, payload, req);
  break;
case 'list_campaign_recipients':
  result = await listCampaignRecipients(serviceClient, payload);
  break;
```

### Etapa 4 — Reescrever `InternalCrmCampaignsView.tsx`
**Arquivo**: `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx`

Reescrever completamente para replicar o design de `BroadcastView.tsx`:

**Layout**:
```
┌─────────────────────────────────────────────────┐
│ PageHeader: "Campanhas" + botão "Nova Campanha" │
├─────────────────────────────────────────────────┤
│ StatusPanel: 5 metric cards agregados           │
├─────────────────────────────────────────────────┤
│ Grid lg:2 com CampaignCards:                    │
│ ┌──────────────────┐ ┌──────────────────┐       │
│ │ Nome   [Badge]   │ │ Nome   [Badge]   │       │
│ │ Progresso ████░░ │ │ Progresso ████░░ │       │
│ │ Env│Falh│Timer   │ │ Env│Falh│Timer   │       │
│ │ [Det][▶][⏸][🗑]  │ │ [Det][▶][⏸][🗑]  │       │
│ └──────────────────┘ └──────────────────┘       │
└─────────────────────────────────────────────────┘
```

**Mudanças vs. versão atual**:
- Badges coloridos por status (não mais TokenBadge)
- Barra de progresso `<Progress>` por campanha
- Grid 3 colunas: Enviadas (verde) | Falhas (vermelho) | Timer
- Botões: Detalhes | Iniciar/Retomar | Pausar | Cancelar | Deletar
- Remove "Rodar lote" (fica encapsulado no Iniciar)
- AlertDialog para confirmar exclusão
- Timer exibido com `formatBroadcastInterval()`

### Etapa 5 — Reescrever `InternalCrmCampaignModal.tsx` (wizard 5 etapas)
**Arquivo**: `src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx`

Reescrever completamente como wizard 5 etapas:

**Etapa 1 — Configuração**:
- Instância WhatsApp (select das instâncias conectadas)
- Nome da campanha
- (Não inclui: origem de leads, tipo de cliente, etapa pipeline, responsável — estes são conceitos do SolarZap público, não do CRM interno)

**Etapa 2 — Destinatários**:
- Toggle: "Upload CSV/XLSX" | "Clientes do CRM"
- Upload: drag-and-drop + file input, parse via `parseContactsFile()`, preview dos contatos
- CRM: `CrmClientSelector` — lista de clientes do CRM com busca, filtro por etapa, checkbox multi-select

**Etapa 3 — Mensagens**:
- N variações com Textarea individual
- Adicionar/remover variação
- Contagem de caracteres
- Placeholder: `{{name}}` para personalização

**Etapa 4 — Timer**:
- Slider com min=10s, max=86400s
- Presets: 15s, 1m, 5m, 1h, 1d
- Input numérico direto
- Info sobre randomização anti-bloqueio (+/-30%)

**Etapa 5 — Preview**:
- Resumo: campanha, instância, contatos, intervalo, mensagens cadastradas
- Botões: "Salvar rascunho" | "Salvar e iniciar disparo"

### Etapa 6 — Criar `CrmClientSelector.tsx`
**Arquivo novo**: `src/modules/internal-crm/components/campaigns/CrmClientSelector.tsx`

Componente para selecionar clientes do CRM interno como destinatários:
- Busca por nome/telefone
- Filtro por `current_stage_code`
- Checkbox + "Selecionar todos"
- Badge com contagem de selecionados
- ScrollArea com lista renderizada
- Usa `useInternalCrmClients()` do hook existente

### Etapa 7 — Reescrever `InternalCrmCampaignStatusPanel.tsx` → Dialog de acompanhamento
**Arquivo**: `src/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel.tsx`

**Renomear** para painel de detalhes em tempo real (Dialog, não cards):
- Dialog aberto por campanha específica
- Grid de métricas: Status | Enviadas | Falhas | Tempo estimado
- Barra de progresso
- Badges: Enviado | Falhou | Pendente
- ScrollArea com lista de destinatários e status individual (ícone + badge)
- Botões: Pausar | Retomar | Cancelar
- Polling com `useQuery` + `refetchInterval: 4000`

### Etapa 8 — Criar `InternalCrmCampaignSummaryCards.tsx`
**Arquivo novo**: `src/modules/internal-crm/components/campaigns/InternalCrmCampaignSummaryCards.tsx`

Os 5 MetricCards agregados que ficam acima do grid (extraídos do StatusPanel atual):
- Campanhas ativas | Destinatários | Pendentes | Enviados | Falhas

### Etapa 9 — Remover `InternalCrmRecipientSelector.tsx`
**Arquivo**: `src/modules/internal-crm/components/campaigns/InternalCrmRecipientSelector.tsx`

Será substituído pelo wizard com upload + `CrmClientSelector`.

### Etapa 10 — Build check + deploy

---

## 5. Arquivos Impactados

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/20260331200000_crm_campaign_interval.sql` | **Criar** |
| `src/modules/internal-crm/types/index.ts` | **Modificar** — campos + types |
| `supabase/functions/internal-crm-api/index.ts` | **Modificar** — ACL + 2 funções + router + upsert patch |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx` | **Reescrever** |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx` | **Reescrever** |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel.tsx` | **Reescrever** |
| `src/modules/internal-crm/components/campaigns/CrmClientSelector.tsx` | **Criar** |
| `src/modules/internal-crm/components/campaigns/InternalCrmCampaignSummaryCards.tsx` | **Criar** |
| `src/modules/internal-crm/components/campaigns/InternalCrmRecipientSelector.tsx` | **Remover** |
| `src/modules/internal-crm/hooks/useInternalCrmCampaigns.ts` | **Modificar** — add deleteCampaignMutation + listRecipients query |

**Total**: 4 modificados, 3 criados, 1 reescrito (3 componentes reescritos), 1 removido

---

## 6. Checklist Anti-Regressão

- [ ] Nenhum import de `useBroadcasts`, `BroadcastCampaign` do SolarZap público
- [ ] Todas as queries usam `invokeInternalCrmApi()` e o schema `internal_crm`
- [ ] Nenhum acesso direto a `supabase.from('broadcast_campaigns')` (que iria ao schema `public`)
- [ ] `parseContactsFile` de `@/utils/contactsImport` é utilitário puro (sem side effects) — seguro reutilizar
- [ ] `formatBroadcastInterval` e `clampBroadcastTimerSeconds` de `@/utils/broadcastTimer` são puros — seguro reutilizar
- [ ] `PageHeader` de `@/components/solarzap/PageHeader` é componente de layout sem lógica de negócio — seguro reutilizar
- [ ] Não tocar em `BroadcastView.tsx`, `useBroadcasts.ts`, ou qualquer arquivo `public.broadcast_*`
- [ ] Build com `tsc --noEmit` deve passar com 0 erros
- [ ] Remover a referência de `useInternalCrmCampaigns.ts` ao `InternalCrmRecipientSelector` (ou ajustar se necessário)
