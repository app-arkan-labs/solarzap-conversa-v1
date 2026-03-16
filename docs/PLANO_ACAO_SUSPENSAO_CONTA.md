# Plano de Ação — Suspensão Real de Contas

**Data:** 16/03/2026  
**Problema:** Ao suspender uma conta (org) via admin, o frontend exibe a tela de suspensão, mas os **workers de backend continuam disparando notificações, campanhas, IA e mensagens WhatsApp** normalmente.  
**Objetivo:** Quando `organizations.status = 'suspended'`, **todas as funcionalidades ficam congeladas** (nenhum dado é deletado, tudo é preservado para reativação futura).

---

## Estado Atual

| Camada | Status |
|--------|--------|
| Coluna `organizations.status` (active/suspended/churned) | ✅ Existe |
| RPC `get_org_status()` | ✅ Existe |
| Admin API: suspender/reativar org | ✅ Existe |
| Frontend: `ProtectedRoute` bloqueia UI com `OrgSuspendedScreen` | ✅ Existe |
| **Backend workers**: checagem de suspensão antes de enviar | ❌ NÃO existe |
| **Edge functions**: checagem de suspensão antes de processar | ❌ NÃO existe |
| **RLS**: bloqueio de INSERT/UPDATE para orgs suspensas | ❌ NÃO existe |
| **Evolution Proxy**: gate de suspensão no envio WhatsApp | ❌ NÃO existe |

---

## Fase 1 — Função Helper no Banco (Pré-requisito)

**Arquivo:** Nova migration `supabase/migrations/YYYYMMDD_org_suspension_guard.sql`

### 1.1 Criar função `is_org_suspended(uuid)`

```sql
CREATE OR REPLACE FUNCTION public.is_org_suspended(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT o.status = 'suspended' FROM public.organizations o WHERE o.id = p_org_id),
    true  -- se org não existir, tratar como suspensa por segurança
  );
$$;
```

### 1.2 Criar função auxiliar para edge functions

```sql
-- Retorna true se a org está ATIVA (não suspensa)
CREATE OR REPLACE FUNCTION public.assert_org_active(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT o.status INTO v_status
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;
```

**Esforço:** ~15 min  
**Risco:** Baixo — funções novas, não alteram nada existente

---

## Fase 2 — Bloquear Workers de Backend (CRÍTICO)

### 2.1 notification-worker

**Arquivo:** `supabase/functions/notification-worker/index.ts`  
**Ponto de inserção:** Após `fetchPending()` buscar os eventos pendentes, antes de processar cada batch.

**Mudança:**
```typescript
// Logo após buscar os pending events, filtrar orgs suspensas:
const { data: suspendedOrgs } = await supabase
  .from('organizations')
  .select('id')
  .eq('status', 'suspended');

const suspendedOrgIds = new Set((suspendedOrgs || []).map(o => o.id));

// Filtrar eventos — marcar como 'skipped_suspended' sem enviar
const activeEvents = pendingEvents.filter(e => {
  if (suspendedOrgIds.has(e.org_id)) {
    // Marcar como pulado pela suspensão (não deletar)
    skippedBySuspension.push(e.id);
    return false;
  }
  return true;
});

// Atualizar os pulados no banco
if (skippedBySuspension.length > 0) {
  await supabase
    .from('notification_events')
    .update({ status: 'skipped_suspended', processed_at: new Date().toISOString() })
    .in('id', skippedBySuspension);
}
```

**Esforço:** ~30 min  
**Risco:** Médio — requer teste do worker com org suspensa

---

### 2.2 broadcast-worker

**Arquivo:** `supabase/functions/broadcast-worker/index.ts`  
**Ponto de inserção:** Após resolver o `orgId` da campanha, antes de clamar recipients.

**Mudança:**
```typescript
// Após obter campaign.org_id, checar suspensão:
const { data: orgData } = await supabase
  .from('organizations')
  .select('status')
  .eq('id', campaign.org_id)
  .single();

if (orgData?.status === 'suspended') {
  // Pausar a campanha automaticamente
  await supabase
    .from('broadcast_campaigns')
    .update({ status: 'paused_suspended' })
    .eq('id', campaign.id);

  return jsonResponse(
    { error: 'org_suspended', message: 'Organização suspensa — campanha pausada automaticamente' },
    corsHeaders,
    403
  );
}
```

**Esforço:** ~30 min  
**Risco:** Médio

---

### 2.3 process-reminders

**Arquivo:** `supabase/functions/process-reminders/index.ts`  
**Ponto de inserção:** Dentro do loop, após resolver `orgId` do lembrete (linha ~79), antes de enviar via Evolution API.

**Mudança:**
```typescript
// Após obter orgId:
if (orgId) {
  const { data: orgCheck } = await supabase
    .from('organizations')
    .select('status')
    .eq('id', orgId)
    .single();

  if (orgCheck?.status === 'suspended') {
    // Marcar como pulado, não enviar
    await supabase
      .from('reminders')
      .update({ status: 'skipped_suspended' })
      .eq('id', r.reminder_id);
    results.push({ id: r.reminder_id, status: 'skipped_suspended' });
    continue;
  }
}
```

**Esforço:** ~20 min  
**Risco:** Baixo

---

### 2.4 process-agent-jobs

**Arquivo:** `supabase/functions/process-agent-jobs/index.ts`  
**Mudança:** Mesma lógica — checar org status antes de executar cada job agendado.

**Esforço:** ~20 min

---

## Fase 3 — Bloquear Pipeline de IA e Webhook WhatsApp

### 3.1 ai-pipeline-agent

**Arquivo:** `supabase/functions/ai-pipeline-agent/index.ts`  
**Ponto de inserção:** No início do handler, após resolver `orgId`.

**Mudança:**
```typescript
// Antes de qualquer processamento de IA:
const { data: orgGuard } = await supabase
  .from('organizations')
  .select('status')
  .eq('id', orgId)
  .single();

if (orgGuard?.status === 'suspended') {
  console.log(`[ai-pipeline] Org ${orgId} suspensa — ignorando pipeline`);
  return new Response(JSON.stringify({ skipped: true, reason: 'org_suspended' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Esforço:** ~20 min  
**Risco:** Médio — precisa garantir que mensagens recebidas são armazenadas (leitura OK), mas IA não responde

---

### 3.2 whatsapp-webhook (recepção)

**Arquivo:** `supabase/functions/whatsapp-webhook/index.ts`  
**Estratégia:** Permitir **receber** mensagens (armazenar no banco para histórico) mas **não disparar** respostas automáticas, IA, ou notificações.

**Mudança:**
```typescript
// Após resolver orgId do webhook recebido:
const isOrgSuspended = orgData?.status === 'suspended';

// Salvar mensagem recebida normalmente (preservar histórico)
await saveInboundMessage(message);

// Bloquear TUDO que gera saída:
if (isOrgSuspended) {
  console.log(`[webhook] Org ${orgId} suspensa — mensagem salva, pipeline bloqueado`);
  return new Response('OK', { status: 200 });
  // NÃO chamar: ai-pipeline-agent, sendPresence, sendReaction, notification dispatch
}
```

**Esforço:** ~45 min  
**Risco:** Alto — webhook é complexo, precisa teste cuidadoso

---

## Fase 4 — Gate no Evolution Proxy (Defesa em Profundidade)

### 4.1 evolution-proxy

**Arquivo:** `supabase/functions/evolution-proxy/index.ts`  
**Estratégia:** Adicionar checagem de suspensão como **última barreira** antes de qualquer envio WhatsApp.

**Mudança:**
```typescript
// Para rotas de ENVIO (sendText, sendReaction, sendMedia, etc.):
if (isSendRoute(targetPath)) {
  // Resolver org_id pela instância WhatsApp
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('org_id')
    .eq('instance_name', instanceName)
    .single();

  if (instance?.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('status')
      .eq('id', instance.org_id)
      .single();

    if (org?.status === 'suspended') {
      return new Response(
        JSON.stringify({ error: 'org_suspended', message: 'Envio bloqueado — conta suspensa' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}
```

**Esforço:** ~45 min  
**Risco:** Médio — precisa mapear todas as rotas de envio vs leitura

---

## Fase 5 — RLS: Bloquear Escritas para Orgs Suspensas

**Arquivo:** Nova migration `supabase/migrations/YYYYMMDD_rls_suspension_write_block.sql`

### Tabelas que precisam de bloqueio de escrita (INSERT/UPDATE/DELETE):

| Tabela | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|
| `broadcast_campaigns` | Bloquear | Bloquear | Bloquear |
| `broadcast_recipients` | Bloquear | Bloquear | Bloquear |
| `leads` | Permitir* | Bloquear | Bloquear |
| `interacoes` | Permitir* | Bloquear | Bloquear |
| `proposals` / `propostas` | Bloquear | Bloquear | Bloquear |
| `whatsapp_instances` | Bloquear | Bloquear | Bloquear |
| `notification_settings` | Bloquear | Bloquear | Bloquear |
| `contact_lists` | Bloquear | Bloquear | Bloquear |
| `scheduled_messages` | Bloquear | Bloquear | Bloquear |
| `credit_balances` | Bloquear | Bloquear | Bloquear |
| `usage_events` | Bloquear | Bloquear | Bloquear |

> \* `leads` e `interacoes` INSERT permitido **apenas via service_role** (webhook recebendo mensagens). Bloqueado para `authenticated` role.

### Exemplo de policy ajustada:

```sql
-- Bloquear INSERT em broadcast_campaigns para orgs suspensas
DROP POLICY IF EXISTS broadcast_campaigns_auth_insert ON broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_insert
  ON broadcast_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

-- Bloquear UPDATE em broadcast_campaigns para orgs suspensas
DROP POLICY IF EXISTS broadcast_campaigns_auth_update ON broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_update
  ON broadcast_campaigns FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );
```

### SELECT continua liberado:
```sql
-- SELECT permitido (usuário pode visualizar dados, tela de suspensão pode mostrar info)
-- Manter policies de SELECT existentes sem alteração
```

**Esforço:** ~1-2 horas (muitas tabelas)  
**Risco:** Médio — precisa auditar cada tabela para não quebrar fluxos legítimos

---

## Fase 6 — Bloqueios Adicionais em Edge Functions

### 6.1 stripe-checkout / stripe-pack-checkout
- Bloquear criação de novos checkouts para orgs suspensas (exceto reativação)
- **Exceção:** Permitir pagamento de débito pendente se for fluxo de reativação

### 6.2 proposal-composer / proposal-share
- Bloquear geração e compartilhamento de propostas

### 6.3 kb-ingest
- Bloquear ingestão de novos documentos na base de conhecimento

### 6.4 google-ads-oauth / meta-oauth
- Bloquear novas conexões OAuth

### 6.5 ai-digest-worker
- Pular orgs suspensas no cron de digest

### 6.6 whatsapp-connect
- Bloquear criação de novas instâncias e refresh de QR code
- Permitir apenas desconexão (cleanup)

**Esforço:** ~2 horas total  
**Risco:** Baixo-Médio por função

---

## Fase 7 — Frontend: Melhorias na Experiência de Suspensão

### 7.1 Tela OrgSuspendedScreen — Melhorar

**Arquivo:** `src/components/admin/OrgSuspendedScreen.tsx`

- Mostrar motivo da suspensão
- Mostrar data da suspensão
- Botão "Regularizar Pagamento" → redirecionar para Stripe billing portal
- Informar que dados estão preservados e conta pode ser reativada
- Contato de suporte

### 7.2 Permitir acesso a /billing e /pricing mesmo suspensa

**Arquivo:** `src/components/ProtectedRoute.tsx` (já parcialmente implementado)

- Garantir que rotas de billing ficam acessíveis para o cliente poder pagar
- Mover check de suspensão APÓS check de rota de billing:

```typescript
const isBillingRoute = location.pathname === '/pricing' || location.pathname === '/billing';

if (orgStatus === 'suspended' && !isBillingRoute) {
  return <OrgSuspendedScreen reason={suspensionReason} />;
}
```

**Esforço:** ~1 hora  
**Risco:** Baixo

---

## Fase 8 — Logging e Auditoria

### 8.1 Log de ações bloqueadas

Criar tabela `_admin_suspension_log`:
```sql
CREATE TABLE IF NOT EXISTS public._admin_suspension_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  blocked_action text NOT NULL,   -- 'notification_send', 'broadcast_dispatch', 'ai_pipeline', etc.
  blocked_at timestamptz NOT NULL DEFAULT now(),
  details jsonb
);

-- Apenas service_role pode escrever
ALTER TABLE _admin_suspension_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_suspension_log_deny_all
  ON _admin_suspension_log FOR ALL TO authenticated
  USING (false);
```

Cada worker, ao bloquear uma ação, insere registro nesta tabela para rastreabilidade.

### 8.2 Dashboard admin — Ações bloqueadas

Adicionar contador de "Ações bloqueadas por suspensão" no painel admin para visibilidade.

**Esforço:** ~1 hora  
**Risco:** Baixo

---

## Fase 9 — Reativação Automática

### 9.1 Stripe Webhook — Reativação pós-pagamento

**Arquivo:** `supabase/functions/stripe-webhook/index.ts`

Quando receber evento `invoice.paid` ou `checkout.session.completed` para uma org suspensa:

```typescript
// Se org está suspensa e pagamento foi confirmado:
if (org.status === 'suspended' && event.type === 'invoice.paid') {
  await supabase
    .from('organizations')
    .update({
      status: 'active',
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null
    })
    .eq('id', orgId);

  // Reativar campanhas que foram pausadas pela suspensão
  await supabase
    .from('broadcast_campaigns')
    .update({ status: 'paused' })  // volta a 'paused' normal, usuário decide retomar
    .eq('org_id', orgId)
    .eq('status', 'paused_suspended');

  console.log(`[stripe-webhook] Org ${orgId} reativada após pagamento`);
}
```

**Esforço:** ~45 min  
**Risco:** Médio — precisa testar fluxo completo

---

## Ordem de Execução Recomendada

| Prioridade | Fase | Descrição | Impacto |
|-----------|------|-----------|---------|
| 🔴 P0 | Fase 1 | Função helper `is_org_suspended()` | Pré-requisito |
| 🔴 P0 | Fase 2 | Workers (notification, broadcast, reminders, agent-jobs) | **Resolve o bug reportado** |
| 🔴 P0 | Fase 3 | AI pipeline + webhook WhatsApp | Bloqueia respostas automáticas |
| 🔴 P0 | Fase 4 | Gate no evolution-proxy | Defesa em profundidade |
| 🟠 P1 | Fase 5 | RLS bloqueio de escritas | Impede ações via API direta |
| 🟠 P1 | Fase 7 | Frontend melhorias | UX do cliente suspensa |
| 🟡 P2 | Fase 6 | Edge functions adicionais | Cobertura completa |
| 🟡 P2 | Fase 8 | Logging de ações bloqueadas | Auditoria/rastreabilidade |
| 🟢 P3 | Fase 9 | Reativação automática pós-pagamento | Autoatendimento |

---

## Checklist de Validação

- [ ] Suspender org via admin → notificações pendentes NÃO são enviadas
- [ ] Suspender org → campanhas de broadcast são pausadas automaticamente
- [ ] Suspender org → lembretes NÃO são enviados
- [ ] Suspender org → IA NÃO responde mensagens WhatsApp recebidas
- [ ] Suspender org → mensagens recebidas via WhatsApp SÃO armazenadas (histórico preservado)
- [ ] Suspender org → evolution-proxy bloqueia qualquer envio da org
- [ ] Suspender org → frontend mostra tela de suspensão
- [ ] Suspender org → cliente consegue acessar /billing para regularizar
- [ ] Suspender org → INSERT/UPDATE via RLS são bloqueados para `authenticated`
- [ ] Reativar org → todas as funcionalidades voltam ao normal
- [ ] Reativar org → campanhas pausadas voltam ao estado 'paused' (não auto-retomam)
- [ ] Nenhum dado é deletado em nenhum momento do fluxo
- [ ] Log de ações bloqueadas registrado na tabela de auditoria

---

## Estimativa Total

| Prioridade | Esforço Estimado |
|-----------|-----------------|
| P0 (Fases 1-4) | ~3-4 horas |
| P1 (Fases 5, 7) | ~2-3 horas |
| P2 (Fases 6, 8) | ~3 horas |
| P3 (Fase 9) | ~1 hora |
| **Testes + Validação** | ~2 horas |

---

## Notas Importantes

1. **Nada é deletado** — status `skipped_suspended` e `paused_suspended` preservam tudo
2. **Mensagens recebidas continuam sendo salvas** — histórico intacto para quando reativar
3. **Billing/Pricing continua acessível** — cliente pode se regularizar sozinho
4. **Defense-in-depth** — múltiplas camadas de bloqueio (worker + RLS + proxy)
5. **Idempotente** — suspender uma org já suspensa não causa efeito colateral
