# BLUEPRINT TÉCNICO — 3 Novos Agentes de Pipeline SolarZap

**Versão:** 1.0  
**Data:** 2026-03-10  
**Autor:** Arquiteto Técnico (análise automatizada sobre código real)  
**Status:** Blueprint para revisão — NENHUMA implementação realizada

---

## ÍNDICE

1. [Resumo Executivo](#1-resumo-executivo)
2. [Arquitetura Atual Mapeada](#2-arquitetura-atual-mapeada)
3. [Pontos de Extensão](#3-pontos-de-extensão)
4. [Blueprint — Agente de Chamada Realizada](#4-blueprint--agente-de-chamada-realizada)
5. [Blueprint — Agente de Follow Up](#5-blueprint--agente-de-follow-up)
6. [Blueprint — Agente de Disparos](#6-blueprint--agente-de-disparos)
7. [Estrutura de Prompts dos Novos Agentes](#7-estrutura-de-prompts-dos-novos-agentes)
8. [Modelo de Dados / Persistência](#8-modelo-de-dados--persistência)
9. [Regras de Segurança / Não Regressão](#9-regras-de-segurança--não-regressão)
10. [Plano de Implementação](#10-plano-de-implementação)
11. [Plano de Testes e Validação](#11-plano-de-testes-e-validação)
12. [Hipóteses a Validar](#12-hipóteses-a-validar)
13. [Apêndice — Arquivos Afetados](#13-apêndice--arquivos-afetados)

---

## 1. RESUMO EXECUTIVO

Este blueprint descreve a implementação incremental de **3 novos agentes de pipeline** no SolarZap:

| # | Agente | Gatilho | Objetivo |
|---|--------|---------|----------|
| 1 | **Chamada Realizada** | Comentário de feedback salvo após ligação | Enviar mensagem pós-ligação (+5min) conduzindo ao próximo passo |
| 2 | **Follow Up** | Lead sem resposta (3h/1d/2d/3d/7d) | Reengajar leads inativos com sequência progressiva |
| 3 | **Disparos** | Lead de broadcast responde pela primeira vez | Qualificar leads outbound com prompt adaptado |

**Princípio fundamental:** ESTENDER o sistema existente, NÃO substituir. Cada agente reutiliza a infraestrutura atual (`ai-pipeline-agent`, `ai_stage_config`, `ACTIVE_PIPELINE_AGENTS`, `process-reminders`, Evolution API) com o mínimo de mudanças necessárias.

---

## 2. ARQUITETURA ATUAL MAPEADA

### 2.1 Fluxo Principal de Agentes

```
WhatsApp (inbound)
    ↓
supabase/functions/whatsapp-webhook/index.ts
    ├─ Valida: não é broadcast, lead existe, AI habilitada
    ├─ Insere interação em `interacoes` (tipo: mensagem_cliente)
    ├─ Detecta seller takeover (isFromMe → pausa AI)
    └─ Invoca: supabase.functions.invoke('ai-pipeline-agent', {
         body: { leadId, triggerType: 'incoming_message', interactionId, instanceName }
       })
           ↓
supabase/functions/ai-pipeline-agent/index.ts
    ├─ Quiet-window debounce (3.5s min silence, burst aggregation)
    ├─ Yield guard (impede runs duplicados)
    ├─ Carrega lead, ai_settings, ai_stage_config (prompt por etapa/org)
    ├─ Monta contexto: histórico, KB, FAQ, objeções, comentários CRM, proposta, slots
    ├─ Chama OpenAI gpt-4o com system prompt + chat history
    ├─ Pós-processamento: safety gate, humanização, auto-split
    ├─ Executa side-effects: V6(fields), V7(comments/followups), V9(appointments), V10(proposals), V11(stage_data)
    ├─ Envia mensagem via Evolution API → insere em `interacoes`
    └─ Move etapa (com gating para agendamento)
```

### 2.2 Onde Estão os Agentes Hoje

| Componente | Arquivo | O que faz |
|-----------|---------|-----------|
| Definição de agentes | `src/constants/aiPipelineAgents.ts` (L34-383) | `ACTIVE_PIPELINE_AGENTS[]` — 5 agentes: novo_lead, respondeu, nao_compareceu, proposta_negociacao, financiamento |
| Prompts PDF | `src/constants/aiPipelinePdfPrompts.ts` | Prompts detalhados por etapa |
| Config por org/etapa | Tabela `ai_stage_config` | `pipeline_stage`, `is_active`, `default_prompt`, `prompt_override`, `org_id` |
| UI de gestão | `src/components/solarzap/AIAgentsView.tsx` | Toggle ativo/inativo, editor de prompt, versionamento |
| Edge function | `supabase/functions/ai-pipeline-agent/index.ts` (3883 linhas) | Lógica central de execução |
| Invocação | `supabase/functions/whatsapp-webhook/index.ts` (~L1055) | Dispara ai-pipeline-agent na chegada de mensagem |
| Jobs agendados | `supabase/functions/process-reminders/index.ts` | Cron: processa lembretes via `claim_due_reminders` RPC |
| Stage guards | `src/hooks/domain/pipelineStageGuards.ts` | `assertLeadStageUpdateApplied()` |
| Stage moves | `src/hooks/domain/usePipeline.ts` | `moveToPipeline()` — frontend |
| Automações | `src/hooks/useAutomationSettings.ts` | `isDragDropEnabled()`, `getMessage()`, `PIPELINE_STAGE_ORDER` |
| Orquestrador frontend | `src/components/solarzap/SolarZapLayout.tsx` (L748+) | `handlePipelineStageChange()` — switch por etapa |

### 2.3 Como Prompts São Carregados

1. **Seed:** `ACTIVE_PIPELINE_AGENTS[].defaultPrompt` → usado para restaurar padrão na UI
2. **DB:** `ai_stage_config` filtrado por `org_id` + `pipeline_stage`
3. **Cascade:** `prompt_override` (org-specific) → `default_prompt` (global) → `STAGE_FALLBACK_PROMPT` (fallback)
4. **Montagem no edge function:** `ai-pipeline-agent/index.ts` (L2300-2320) — `stagePromptText = stageConfig.prompt_override || stageConfig.default_prompt`

### 2.4 Como o Sistema Decide Qual Agente Executar

**NÃO existe roteamento explícito por "agente".** O sistema usa a **etapa atual do lead** (`leads.status_pipeline`) para carregar o prompt correspondente de `ai_stage_config`. O "agente" é definido pelo prompt da etapa, não por um dispatcher separado.

Fluxo de decisão (em `ai-pipeline-agent/index.ts`):
```
1. const currentStage = normalizeStage(lead.status_pipeline)    // L2293
2. stageConfig = ai_stage_config WHERE org_id=X AND pipeline_stage=currentStage   // L2295-2305
3. Se não encontra → fallback para 'novo_lead'                  // L2303
4. Se config.is_active=false → STAGE_FALLBACK_PROMPT            // L2308-2312
5. stagePromptText = config.prompt_override || config.default_prompt  // L2316
6. System prompt montado com stagePromptText + contexto          // L2850+
```

### 2.5 Comentários e Ligações

**Fluxo atual de "Chamada Realizada":**
1. Vendedor clica para confirmar ligação → `CallConfirmModal` (`src/components/solarzap/CallConfirmModal.tsx`)
2. Modal multi-step: method → QR → confirm → **feedback textarea**
3. `onConfirm(true, feedback)` → `SolarZapLayout.handleCallConfirm()` (L616)
4. Move lead para `chamada_realizada` via `handlePipelineStageChange()` (L626)
5. Insere comentário: `comentarios_leads.insert({ texto: '[Feedback Ligacao]: ${feedback}', autor: 'Vendedor' })` (L644-655)
6. Abre modal `MoveToProposalModal` perguntando se quer ir para "Aguardando Proposta" (L660)

### 2.6 Broadcasts / Disparos

**Como leads de broadcast são criados:**
- `useBroadcasts.ts` → `upsertLeadForRecipient()` (L253-400)
- Lead criado com `canal = campaign.source_channel` (ex: 'cold_list', 'broadcast')
- `ai_enabled: true` (broadcast já cria lead com AI ativada)
- Mensagem de disparo salva em `interacoes` com `tipo: 'mensagem_vendedor'`, `wa_from_me: true`

**Como detectar se lead é de broadcast:**
- `leads.canal` contém valor definido no `source_channel` da campanha (ex: 'cold_list', 'broadcast')
- Pode-se cruzar `broadcast_recipients.lead_id` com `broadcast_recipients.campaign_id`

**Resposta de lead de broadcast:**
- Chega via `whatsapp-webhook` como qualquer mensagem inbound
- Atualmente invoca `ai-pipeline-agent` normalmente com a etapa do lead
- **NÃO existe distinção entre lead inbound e outbound** no roteamento do agente

### 2.7 Takeover Manual do Vendedor

- `whatsapp-webhook/index.ts` (L920-1025): detecta mensagem `isFromMe`
- Echo detection: compara com últimos 45s de outbound para evitar falso positivo
- Se não é echo: `leads.update({ ai_enabled: false, ai_paused_reason: 'human_takeover', ai_paused_at: NOW })`
- Log em `ai_action_logs` com `action_type: 'seller_message_takeover'`

### 2.8 Jobs Agendados (process-reminders)

- Edge function invocada por Supabase Cron
- `claim_due_reminders` RPC: busca até 50 lembretes vencidos, marca como processados
- Para cada lembrete: verifica instância WhatsApp ativa, envia via Evolution API
- Registra em `appointment_reminders` e `appointment_notification_logs`
- **Esta infraestrutura pode ser reutilizada** para o agendamento dos +5min do Agente de Chamada Realizada e para a sequência do Follow Up

### 2.9 Mudanças de Etapa

**Backend (ai-pipeline-agent):**
- `updateLeadStageSafe()` (L589-603): dual write `status_pipeline` + `pipeline_stage` + `stage_changed_at`
- Validação: `isValidTransition()` (L34) usando `STAGE_TRANSITION_MAP`
- Gating: `chamada_agendada`/`visita_agendada` só move com appointment válido

**Frontend (SolarZapLayout):**
- `handlePipelineStageChange()` (L750): `moveToPipeline()` → `onStageChanged()` → switch por etapa
- `moveToPipeline()` via `usePipeline.ts`: update `status_pipeline` + `stage_changed_at` + upsert deal

### 2.10 Tabelas Principais

| Tabela | Campos Relevantes |
|--------|------------------|
| `leads` | `id, org_id, user_id, status_pipeline, ai_enabled, ai_paused_reason, ai_paused_at, stage_changed_at, canal, source, lead_stage_data (JSONB), instance_name` |
| `interacoes` | `id, lead_id, org_id, user_id, mensagem, tipo, wa_from_me, instance_name, remote_jid, created_at` |
| `ai_stage_config` | `id, org_id, pipeline_stage, is_active, default_prompt, prompt_override, prompt_override_version` |
| `ai_settings` | `id, org_id, is_active, openai_api_key, assistant_identity_name, timezone, appointment_window_config` |
| `ai_agent_runs` | `id, org_id, lead_id, run_id, ...` (audit) |
| `ai_action_logs` | `id, org_id, lead_id, action_type, details (JSON), success, created_at` |
| `comentarios_leads` | `id, org_id, lead_id, texto, autor, created_at` |
| `lead_tasks` | `id, org_id, user_id, lead_id, title, notes, due_at, status, priority, channel, created_by` |
| `appointments` | `id, org_id, user_id, lead_id, type, status, start_at, end_at, title, outcome` |
| `appointment_reminders` | `id, lead_id, user_id, appointment_id, status, sent_at` |
| `broadcast_campaigns` | `id, org_id, source_channel, pipeline_stage, ai_enabled, status` |
| `broadcast_recipients` | `id, campaign_id, lead_id, phone, status, sent_at` |

---

## 3. PONTOS DE EXTENSÃO

### 3.1 Para Todos os 3 Agentes

| O que estender | Arquivo | Como |
|---------------|---------|------|
| Registrar novo agente | `src/constants/aiPipelineAgents.ts` | Adicionar entrada em `ACTIVE_PIPELINE_AGENTS[]` |
| Prompt padrão | `src/constants/aiPipelinePdfPrompts.ts` | Adicionar prompt ao map de prompts PDF |
| Config DB | `ai_stage_config` | Nova row por org com `pipeline_stage` correspondente |
| Roteamento | `supabase/functions/ai-pipeline-agent/index.ts` | Já funciona automaticamente por etapa — mas para agentes que NÃO são acionados por mensagem inbound, é necessário criar novo gatilho |
| UI gestão | `src/components/solarzap/AIAgentsView.tsx` | Já itera `ACTIVE_PIPELINE_AGENTS` — expansão automática |

### 3.2 O que NÃO Deve Ser Alterado

| Componente | Motivo |
|-----------|--------|
| `STAGE_TRANSITION_MAP` em `ai-pipeline-agent/index.ts` | Alterar transições válidas pode quebrar todos os agentes |
| Quiet-window/debounce logic | Mecanismo de estabilização de mensagens é crítico |
| Yield guard / burst winner | Controle de concorrência — não tocar |
| `whatsapp-webhook` trigger logic | O webhook já invoca `ai-pipeline-agent` para toda mensagem — suficiente |
| `process-reminders` base logic | Reutilizar, não reescrever |

---

## 4. BLUEPRINT — AGENTE DE CHAMADA REALIZADA

### 4.1 Visão Geral

| Item | Detalhe |
|------|---------|
| **Gatilho** | Comentário `[Feedback Ligacao]` salvo em `comentarios_leads` |
| **Delay** | +5 minutos após o comentário |
| **Guard** | Se etapa mudou antes do disparo → NÃO enviar |
| **Comportamento** | Ler contexto + comentário da ligação → enviar mensagem conduzindo ao próximo passo |
| **Etapa** | Lead está em `chamada_realizada` |

### 4.2 Gatilho Exato de Ativação

Ponto de entrada: `SolarZapLayout.tsx`, `handleCallConfirm()` (L616-678).

**Fluxo proposto (menor mudança):**

```
handleCallConfirm(completed=true, feedback)
    ├─ Move para 'chamada_realizada'             // já existe (L626)
    ├─ Insere comentário [Feedback Ligacao]       // já existe (L644)
    ├─ *** NOVO: Agenda job delayed +5min ***     // PONTO DE EXTENSÃO
    └─ Abre MoveToProposalModal                   // já existe (L660)
```

**Opção A (Recomendada) — Inserir `lead_tasks` com `due_at` = now + 5min:**
- Após inserir o comentário em `comentarios_leads`, inserir uma task em `lead_tasks` com:
  - `title: 'ai_post_call_agent'`
  - `due_at: new Date(Date.now() + 5 * 60000).toISOString()`
  - `status: 'open'`
  - `channel: 'whatsapp'`
  - `created_by: 'system'`
  - `notes: JSON.stringify({ comment_id, lead_stage_at_schedule: 'chamada_realizada' })`
- `process-reminders` (ou nova cron function) busca tasks do tipo `ai_post_call_agent` com `due_at <= NOW AND status='open'`

**Opção B — Nova tabela `scheduled_agent_jobs`:**
- Tabela dedicada com: `id, org_id, lead_id, agent_type, scheduled_at, executed_at, status, guard_stage, payload`
- Mais limpa semanticamente, mas requer nova tabela

**Recomendação:** Opção B — tabela dedicada `scheduled_agent_jobs`. Motivo: `lead_tasks` é visível ao usuário na UI e misturar tarefas de sistema com tarefas humanas criaria confusão. Uma tabela separada é mais segura e limpa.

### 4.3 Agendamento para +5 Minutos

**Onde agendar:** No `handleCallConfirm()` em `SolarZapLayout.tsx` (L644-660), logo após o insert do comentário.

```typescript
// Inserir em scheduled_agent_jobs
await supabase.from('scheduled_agent_jobs').insert({
  org_id: orgId,
  lead_id: parseInt(contact.id, 10),
  agent_type: 'post_call',
  scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  status: 'pending',
  guard_stage: 'chamada_realizada',
  payload: JSON.stringify({
    comment_text: normalizedFeedback,
    comment_id: commentInsertResult?.id || null,
    instance_name: contact.instanceName || null,
  }),
});
```

### 4.4 Execução do Job (+5min)

**Onde executar:** Nova edge function `process-agent-jobs` (ou estender `process-reminders`).

**Recomendação:** Nova edge function separada `supabase/functions/process-agent-jobs/index.ts` invocada por Supabase Cron a cada 1 minuto, seguindo o padrão de `process-reminders`.

**Lógica:**
```
1. SELECT * FROM scheduled_agent_jobs
   WHERE status = 'pending'
   AND scheduled_at <= NOW()
   AND agent_type IN ('post_call', 'follow_up')
   ORDER BY scheduled_at ASC
   LIMIT 20
   FOR UPDATE SKIP LOCKED

2. Para cada job:
   a. UPDATE scheduled_agent_jobs SET status = 'processing'
   b. SELECT status_pipeline FROM leads WHERE id = job.lead_id
   c. GUARD: se status_pipeline != job.guard_stage → SET status='cancelled', motivo='stage_changed'
   d. GUARD: se lead.ai_enabled = false → SET status='cancelled', motivo='ai_disabled'
   e. Invoke ai-pipeline-agent com:
      { leadId, triggerType: 'scheduled_post_call', instanceName, extraContext: { call_feedback: job.payload.comment_text } }
   f. SET status = 'completed', executed_at = NOW()
```

### 4.5 Comportamento do ai-pipeline-agent para triggerType: 'scheduled_post_call'

Mudança necessária no `ai-pipeline-agent/index.ts`:

1. Aceitar novo `triggerType` no payload: `'scheduled_post_call'`
2. Quando `triggerType === 'scheduled_post_call'`:
   - **Pular quiet-window/debounce** — não há mensagem inbound para esperar
   - **Não verificar anchorInteractionId** — o trigger não é uma interação
   - Carregar prompt de `ai_stage_config` onde `pipeline_stage = 'chamada_realizada'`
   - **Injetar o feedback da ligação como contexto extra** no system prompt:
     ```
     CONTEXTO_LIGACAO_REALIZADA:
     O vendedor acabou de realizar uma ligação com o lead e deixou o seguinte feedback:
     "${payload.extraContext.call_feedback}"
     
     Com base neste feedback, sua tarefa é enviar UMA mensagem ao lead sobre a ligação realizada,
     conduzindo para o próximo passo coerente (agendar visita, gerar proposta, pedir dados adicionais).
     ```
   - Enviar mensagem normalmente via Evolution API
   - Registrar em `ai_action_logs` com `action_type: 'post_call_agent_executed'`

### 4.6 Validação de Etapa Antes do Envio

```
// No process-agent-jobs, imediatamente antes de invocar ai-pipeline-agent:
const { data: freshLead } = await supabase
  .from('leads')
  .select('status_pipeline, ai_enabled')
  .eq('id', job.lead_id)
  .single();

if (freshLead.status_pipeline !== job.guard_stage) {
  // Stage mudou → cancelar
  await supabase.from('scheduled_agent_jobs')
    .update({ status: 'cancelled', cancelled_reason: 'stage_changed', executed_at: new Date().toISOString() })
    .eq('id', job.id);
  continue;
}

if (freshLead.ai_enabled === false) {
  await supabase.from('scheduled_agent_jobs')
    .update({ status: 'cancelled', cancelled_reason: 'ai_disabled', executed_at: new Date().toISOString() })
    .eq('id', job.id);
  continue;
}
```

### 4.7 Idempotência / Reprocessamento

- Cada job em `scheduled_agent_jobs` tem status: `pending → processing → completed/cancelled/failed`
- `FOR UPDATE SKIP LOCKED` impede processamento duplo
- Se o edge function crashar durante processing, o job fica em `processing` — necessário mecanismo de timeout/retry (ex: se `status='processing'` há mais de 5min, reverter para `pending` com `retry_count++`)

### 4.8 Respeito a Takeover Manual

- Guard verifica `lead.ai_enabled` — se vendedor assumiu (human_takeover → ai_enabled=false), job é cancelado
- **Dentro do ai-pipeline-agent:** o check `isLeadAiEnabledNow()` (L757) já existe e impede envio

### 4.9 Colisão com Outros Agentes

- O Agente de Chamada Realizada só dispara por job agendado (não por mensagem inbound)
- Se o lead responder antes dos 5min, o `ai-pipeline-agent` padrão responde normalmente (porque está em `chamada_realizada`, o prompt carregado será o da etapa)
- Se o lead NÃO respondeu e o job dispara, o agente envia proativamente
- **Risco:** se o lead responder nos últimos segundos antes do job, pode haver dupla mensagem → mitigar verificando se há outbound recente para o lead nos últimos 60s antes de enviar

---

## 5. BLUEPRINT — AGENTE DE FOLLOW UP

### 5.1 Visão Geral

| Item | Detalhe |
|------|---------|
| **Gatilho** | Última mensagem enviada sem resposta do lead |
| **Sequência** | 3h → 1d → 2d → 3d → 7d |
| **Guard** | Resposta do lead, mudança de etapa, takeover, arquivo, perda |
| **UI** | Contador visual de 5 luzes em Conversas, Contatos e Pipeline |
| **Pós-5** | Modal para vendedor: mover para Perdido com motivo obrigatório |

### 5.2 Máquina de Estados do Follow Up

```
                           lead responde
        ┌──────────────────────────────────────┐
        │                                      │
IDLE ──→ FU_1_PENDING ──→ FU_1_SENT ──→ FU_2_PENDING ──→ FU_2_SENT ──→ ...
                │              │                │              │
                │              │                │              │
            cancelado      cancelado        cancelado      cancelado
       (lead respondeu)  (stage mudou)  (takeover)      (arquivado)
```

**Estados por follow up:**
- `fu_step`: 0 (idle/aguardando) → 1 → 2 → 3 → 4 → 5
- `fu_status`: `idle | scheduled | sent | completed | cancelled | exhausted`
- `fu_next_at`: timestamp do próximo follow up agendado

### 5.3 Detecção de "Última Mensagem" Relevante

**Definição:** A última mensagem do **lado do atendimento** (vendedor ou bot) em `interacoes` onde `wa_from_me = true`, para o lead específico.

```sql
SELECT id, created_at FROM interacoes
WHERE lead_id = :lead_id
  AND wa_from_me = true
  AND tipo IN ('mensagem_vendedor', 'audio_vendedor')
ORDER BY created_at DESC
LIMIT 1;
```

### 5.4 Detecção de Ausência de Resposta

**Definição:** Não existe nenhuma interação do lead (`wa_from_me = false`, `tipo = 'mensagem_cliente'`) com `created_at` posterior à última mensagem outbound.

```sql
SELECT id FROM interacoes
WHERE lead_id = :lead_id
  AND wa_from_me = false
  AND tipo = 'mensagem_cliente'
  AND created_at > :last_outbound_created_at
LIMIT 1;
```

Se retornar 0 rows → lead não respondeu.

### 5.5 Agendamento da Sequência

**Onde:** Na tabela `scheduled_agent_jobs` (mesma do Agente de Chamada Realizada).

**Quando iniciar a sequência:**
- Após cada mensagem outbound (bot ou vendedor) onde não houve resposta do lead
- O `process-agent-jobs` verifica periodicamente se há leads sem resposta

**Abordagem recomendada:**

1. **No `ai-pipeline-agent`**, após enviar mensagem com sucesso (`didSendOutbound = true`), inserir job de follow-up:
```typescript
if (didSendOutbound) {
  await supabase.from('scheduled_agent_jobs').insert({
    org_id: leadOrgId,
    lead_id: leadId,
    agent_type: 'follow_up',
    scheduled_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // +3h
    status: 'pending',
    guard_stage: currentStage,
    payload: JSON.stringify({
      fu_step: 1,
      last_outbound_at: new Date().toISOString(),
      original_stage: currentStage,
    }),
  });
}
```

2. **No `process-agent-jobs`**, ao processar job `follow_up`:
   - Verificar se lead respondeu desde `last_outbound_at`
   - Se respondeu → cancelar toda sequência
   - Se não respondeu → invocar `ai-pipeline-agent` com `triggerType: 'follow_up'` e `fu_step`
   - Após envio, agendar próximo step:
     - Step 1 sent → agendar step 2 para +1d
     - Step 2 sent → agendar step 3 para +2d
     - Step 3 sent → agendar step 4 para +3d
     - Step 4 sent → agendar step 5 para +7d
     - Step 5 sent → marcar como `exhausted`

**Intervalos da sequência:**

| Step | Delay desde último outbound |
|------|-----------------------------|
| 1 | +3 horas |
| 2 | +1 dia (desde step 1) |
| 3 | +2 dias (desde step 2) |
| 4 | +3 dias (desde step 3) |
| 5 | +7 dias (desde step 4) |

### 5.6 Cancelamento / Reset da Sequência

**Quando cancelar:**
1. **Lead respondeu** → detectado no `process-agent-jobs` antes de executar
2. **Etapa mudou** → `guard_stage != current_stage`
3. **AI desabilitada** → `lead.ai_enabled = false`
4. **Lead arquivado/perdido** → `status_pipeline IN ('perdido', 'contato_futuro')`
5. **Takeover manual** → capturado por `ai_enabled = false`

**Reset:** Quando o lead responde, cancelar todos os jobs `follow_up` pendentes para aquele lead:
```sql
UPDATE scheduled_agent_jobs
SET status = 'cancelled', cancelled_reason = 'lead_responded'
WHERE lead_id = :lead_id
  AND agent_type = 'follow_up'
  AND status IN ('pending', 'scheduled');
```

**Onde fazer o reset:**
- No `whatsapp-webhook/index.ts`, ao receber mensagem inbound, antes de invocar `ai-pipeline-agent`:
  ```typescript
  // Cancelar follow-ups pendentes quando lead responde
  if (leadId && !isFromMe) {
    await supabase
      .from('scheduled_agent_jobs')
      .update({ status: 'cancelled', cancelled_reason: 'lead_responded' })
      .eq('lead_id', leadId)
      .eq('agent_type', 'follow_up')
      .in('status', ['pending']);
  }
  ```

### 5.7 Contador Visual de 5 Luzes

**Modelo de dados para UI:**

Novo campo na tabela `leads`:
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_state jsonb DEFAULT '{}';
-- Estrutura: { "step": 0, "status": "idle", "next_at": null, "last_sent_at": null }
```

OU: computar a partir de `scheduled_agent_jobs` em tempo real (consulta).

**Recomendação:** Campo `follow_up_state` na tabela `leads` para performance (evitar join complexo em toda listagem). Atualizado pelo `process-agent-jobs` a cada execução.

**Estrutura do JSON:**
```json
{
  "step": 2,
  "status": "sent",
  "next_at": "2026-03-11T14:00:00Z",
  "last_sent_at": "2026-03-10T14:00:00Z",
  "started_at": "2026-03-10T11:00:00Z"
}
```

**Componente UI — FollowUpIndicator:**

Novo componente React: `src/components/solarzap/FollowUpIndicator.tsx`

```tsx
// 5 luzes: ● ● ● ● ●
// Preenchida = step completado
// Piscando = step agendado/pendente
// Vazia = step futuro
// Todas preenchidas + sem resposta = exibir modal
```

**Onde renderizar:**
- `ConversationList.tsx` — junto ao item de conversa (badge inline)
- `PipelineView.tsx` — no card do lead (junto aos badges existentes)
- `ContactsView.tsx` — coluna ou badge no item de contato

### 5.8 Modal Após 5 Follow Ups

**Gatilho:** Quando `follow_up_state.step = 5` e `follow_up_state.status = 'exhausted'` (todos enviados, sem resposta).

**Novo componente:** `src/components/solarzap/FollowUpExhaustedModal.tsx`

**Comportamento:**
1. Modal aparece ao clicar no lead (ou via notificação inline)
2. Mensagem: "O lead {nome} não respondeu aos últimos 5 follow-ups."
3. Pergunta: "Deseja mover para Perdido e arquivar?"
4. Se sim → campo obrigatório de motivo de perda (select + textarea)
5. Ao confirmar:
   - `leads.update({ status_pipeline: 'perdido', lost_reason: motivo })`
   - `comentarios_leads.insert({ texto: '[Follow Up Esgotado]: ${motivo}', autor: 'Sistema' })`
   - Reset `follow_up_state` para `{ step: 0, status: 'idle' }`

**Motivos de perda (enum sugerido — HIPÓTESE A VALIDAR se já existe):**
- `sem_resposta` — Não respondeu
- `sem_interesse` — Desinteresse
- `concorrente` — Fechou com concorrente
- `timing` — Não é o momento
- `financeiro` — Sem condições financeiras
- `outro` — Outro (campo livre)

### 5.9 Persistência do Estado

- `leads.follow_up_state` (JSONB) — estado current
- `scheduled_agent_jobs` — fila de agendamento/execução
- `ai_action_logs` — auditoria de cada envio

### 5.10 Comportamento do ai-pipeline-agent para triggerType: 'follow_up'

Similar ao post_call:
1. Skip quiet-window (não é mensagem inbound)
2. Carregar prompt da etapa atual do lead
3. Injetar contexto extra:
   ```
   CONTEXTO_FOLLOW_UP (STEP {N}/5):
   O lead não responde há {tempo}. Esta é a tentativa de follow-up {N} de 5.
   Sua tarefa é reengajar a conversa de forma leve e natural, como vendedor.
   Use o contexto da conversa anterior, comentários do CRM e dados da empresa.
   NÃO repita a mesma mensagem dos follow-ups anteriores.
   ```
4. Enviar mensagem
5. Atualizar `leads.follow_up_state`
6. Agendar próximo step (ou marcar como exhausted se step=5)

---

## 6. BLUEPRINT — AGENTE DE DISPAROS

### 6.1 Visão Geral

| Item | Detalhe |
|------|---------|
| **Gatilho** | Lead originado de broadcast responde pela primeira vez |
| **Comportamento** | Mover para "Respondeu" + ativar Agente de Disparos (NÃO o agente de Respondeu) |
| **Prompt** | Similar ao Respondeu, mas adaptado para outbound (nós iniciamos o contato) |
| **Roteamento** | Baseado em `leads.canal` ou `broadcast_recipients.lead_id` |

### 6.2 Como Identificar Lead de Disparo

**Método principal:** `leads.canal` — quando o lead foi criado/atualizado por broadcast, `canal` recebe o `source_channel` da campanha (ex: 'cold_list', 'broadcast').

**Verificação no momento do trigger (whatsapp-webhook):**
```typescript
// Antes de invocar ai-pipeline-agent:
const isFromBroadcast = lead.canal && !['whatsapp', 'site', 'facebook', 'instagram', 'google_ads', 'indicacao'].includes(lead.canal);
```

**Verificação complementar (mais precisa):**
```sql
SELECT COUNT(*) FROM broadcast_recipients
WHERE lead_id = :lead_id AND status = 'sent';
```

**Recomendação:** Usar `leads.canal` como check primário (campo já existe, sem join extra). Enriquecer com flag se necessário.

### 6.3 Roteamento para o Agente de Disparos

**O problema:** Hoje, quando um lead em `novo_lead` responde:
1. `ai-pipeline-agent` executa com prompt de `novo_lead`
2. Move deterministic para `respondeu`
3. Próxima mensagem: carrega prompt de `respondeu`

**Para o Agente de Disparos, precisamos:**
1. Lead responde → `ai-pipeline-agent` executa
2. Detectar que lead é de broadcast
3. Carregar prompt de `disparos` ao invés de `respondeu`

**Mudança proposta (menor possível) em `ai-pipeline-agent/index.ts`:**

Após carregar `currentStage` e `stageConfig` (~L2295), inserir lógica de override:

```typescript
// NOVO: Roteamento para Agente de Disparos
let effectiveStage = currentStage;
if (currentStage === 'respondeu' || (currentStage === 'novo_lead' && aiRes?.target_stage === 'respondeu')) {
  // Verificar se lead é de broadcast
  const isFromBroadcast = lead.canal && !['whatsapp', 'site', 'facebook', 'instagram', 'google_ads', 'indicacao'].includes(lead.canal);
  
  if (isFromBroadcast) {
    // Tentar carregar config de 'disparos' ao invés de 'respondeu'
    const { data: disparosConfig } = await supabase
      .from('ai_stage_config')
      .select('*')
      .eq('org_id', leadOrgId)
      .eq('pipeline_stage', 'agente_disparos')
      .maybeSingle();
    
    if (disparosConfig?.is_active) {
      stageConfig = disparosConfig;
      effectiveStage = 'agente_disparos';
      console.log(`🎯 [${runId}] Routed to Agente de Disparos (lead.canal=${lead.canal})`);
    }
  }
}
```

**IMPORTANTE:** A etapa real do lead (`status_pipeline`) continua sendo `respondeu`. Apenas o **prompt** é substituído. Isso garante que:
- O lead siga a movimentação normal da pipeline
- Apenas o comportamento conversacional mude
- Nenhum fluxo existente seja quebrado

### 6.4 Garantia de que Agente "Respondeu" NÃO é Ativado

O roteamento acima faz o override do `stageConfig` — portanto o prompt de "respondeu" nunca é carregado para leads de broadcast. O agente de "Respondeu" fica intacto para leads inbound.

### 6.5 Diferenças de Prompt

| Aspecto | Respondeu | Disparos |
|---------|-----------|----------|
| Contexto de abertura | "Vi que você pediu simulação" | "Nós entramos em contato porque..." |
| Tom inicial | Confirmar interesse inbound | Apresentar-se e criar rapport |
| Qualificação | BANT completo | BANT adaptado (lead pode ser frio) |
| Objeções | Foco em avançar | Foco em justificar o contato e gerar interesse |
| Transição | chamada_agendada / visita_agendada | Mesmo, mas tolerância maior para "não quero" |

### 6.6 Compatibilidade com Leads Inbound

- O check `isFromBroadcast` é baseado em `leads.canal`
- Leads inbound normais têm `canal` = 'whatsapp', 'site', 'facebook', etc.
- **Zero impacto** em leads inbound — o if condition não é satisfeito

### 6.7 Compatibilidade com Automações Existentes

- A movimentação de etapa continua idêntica (`novo_lead → respondeu`)
- Os side-effects (V6, V7, V9, V10, V11) continuam funcionando
- A UI de pipeline não muda
- A diferença é APENAS o prompt carregado

---

## 7. ESTRUTURA DE PROMPTS DOS NOVOS AGENTES

### 7.1 Agente de Chamada Realizada — Estrutura do Prompt

```
PROTOCOLO_BASE: PIPELINE_PDF_V1
ETAPA: CHAMADA_REALIZADA
TIPO: AGENTE_POS_CHAMADA
OBJETIVO: Enviar mensagem pós-ligação conduzindo ao próximo passo.
ETAPAS_SEGUINTES: aguardando_proposta OU visita_agendada (conforme contexto).

CONTEXTO_OPERACIONAL (SEMPRE ATIVO):
- Este agente é ativado AUTOMATICAMENTE 5 minutos após o vendedor registrar
  o feedback da ligação.
- O feedback da ligação é o dado PRINCIPAL para contextualizar a mensagem.
- O agente deve se comportar como continuação natural da conversa,
  referenciando o que foi conversado na ligação.
- Acessar: comentários CRM, FAQ, objeções, KB, dados da empresa.

LOGICA_GERAL:
- Ler o feedback da ligação (injetado em CONTEXTO_LIGACAO).
- Com base no feedback + histórico da conversa:
  - Se o feedback indica interesse → conduzir para agendar visita ou gerar proposta.
  - Se faltam dados → solicitar o dado específico mencionado no feedback.
  - Se houve objeção na ligação → tratar a objeção com leveza e dados concretos.
  - Se foi combinado próximo passo → confirmar e executar.
- NUNCA inventar o que foi conversado na ligação — usar APENAS o feedback registrado.

REGRAS_OBRIGATORIAS:
- UMA mensagem principal, curta e natural.
- Referenciar EXPLICITAMENTE algo da ligação ("como conversamos agora há pouco...").
- Conduzir para próximo passo com CTA claro.
- NÃO repetir perguntas já respondidas (consultar comentários/histórico).
- NÃO enviar se etapa mudou.

CONDICOES_DE_BLOQUEIO:
- Etapa != chamada_realizada → NÃO enviar.
- ai_enabled = false → NÃO enviar.
- Outbound recente (<60s) → NÃO enviar.

USO_DE_CONTEXTO:
- COMENTARIOS: prioridade MÁXIMA para [Feedback Ligacao].
- FAQ/KB: usar para embasar próximo passo (ex: detalhes da visita técnica).
- DADOS_EMPRESA: mencionar diferencial se relevante ao contexto.

CRITERIOS_DE_TRANSICAO:
- NÃO mover etapa automaticamente neste agente.
- Apenas sugerir próximo passo — a movimentação será feita por interação subsequente.

DADOS_MINIMOS_A_SALVAR:
- comment: { text: resumo da ação pós-chamada, type: 'next_step' }

NAO_FAZER:
- Não inventar o que foi dito na ligação.
- Não enviar proposta sem dados.
- Não fazer múltiplas perguntas.
- Não usar tom formal/corporativo.

DIFERENCA_VS_RESPONDEU:
- Respondeu: qualifica do zero (lead acabou de responder).
- Chamada Realizada: continua de onde a ligação parou (tem contexto rico do feedback).
```

### 7.2 Agente de Follow Up — Estrutura do Prompt

```
PROTOCOLO_BASE: PIPELINE_PDF_V1
ETAPA: FOLLOW_UP (aplicado a qualquer etapa ativa)
TIPO: AGENTE_FOLLOW_UP
OBJETIVO: Reengajar lead que parou de responder.
STEP_ATUAL: {fu_step}/5

CONTEXTO_OPERACIONAL (SEMPRE ATIVO):
- Este agente é ativado quando o lead não responde após envio de mensagem.
- Usa o MESMO contexto operacional dos demais agentes (KB, FAQ, objeções, dados empresa).
- Deve agir como vendedor reengajando a conversa, NÃO como robô lembrando.

LOGICA_POR_STEP:
- STEP 1 (3h): Toque leve, pergunta curta. "Conseguiu ver minha mensagem?"
- STEP 2 (1d): Trazer dado novo ou benefício. "Aliás, esqueci de mencionar que..."
- STEP 3 (2d): Gerar micro-urgência sem pressão. "Só pra te avisar que..."
- STEP 4 (3d): Empatia + validação. "Sei que tá corrido. Só quero saber se..."
- STEP 5 (7d): Toque final, leve. "Última mensagem por aqui. Se fizer sentido..."

REGRAS_OBRIGATORIAS:
- CADA follow up deve ser DIFERENTE dos anteriores.
- Referenciar o contexto da última conversa (não mensagem genérica).
- Tom humano, leve, sem cobrança.
- 1-2 frases no máximo.
- Usar dados da conversa/CRM para personalizar.
- NÃO repetir pergunta já feita.

CONDICOES_DE_BLOQUEIO:
- Lead respondeu desde última mensagem → CANCELAR.
- Etapa mudou → CANCELAR.
- ai_enabled = false → CANCELAR.
- Lead em 'perdido' ou 'contato_futuro' → CANCELAR.

USO_DE_CONTEXTO:
- HISTORICO: ler últimas mensagens para referenciar.
- COMENTARIOS: usar para personalizar abordagem.
- KB/FAQ: incorporar benefícios ou dados relevantes.
- PROPOSTA: se existir, pode mencionar.

CRITERIOS_DE_TRANSICAO:
- NÃO mover etapa.
- Se lead responder → fluxo normal retoma (agente da etapa assume).

DADOS_MINIMOS_A_SALVAR:
- Atualizar follow_up_state no lead.
- Log em ai_action_logs.

NAO_FAZER:
- Não pressionar.
- Não ser repetitivo.
- Não enviar proposta/preço sem pedido.
- Não usar "Oi tudo bem?" em todo follow up.
- Não mover etapa.

DIFERENCA_VS_RESPONDEU:
- Respondeu: qualifica ativamente.
- Follow Up: reengaja passivamente — objetivo é OBTER resposta, não qualificar.
```

### 7.3 Agente de Disparos — Estrutura do Prompt

```
PROTOCOLO_BASE: PIPELINE_PDF_V1
ETAPA: RESPONDEU (etapa real do lead)
TIPO: AGENTE_DISPAROS
OBJETIVO: Qualificar lead outbound (originado por disparo/broadcast).
ETAPAS_SEGUINTES: chamada_agendada OU visita_agendada.

CONTEXTO_OPERACIONAL (SEMPRE ATIVO):
- O lead foi contatado ATIVAMENTE por nós via disparo.
- Ele NÃO solicitou informação — NÓS iniciamos o contato.
- O tom deve refletir essa dinâmica: apresentar-se, justificar contato,
  criar rapport ANTES de qualificar.
- Pode usar comentários, FAQ, objeções, KB, dados da empresa.
- Se o vendedor assumir manualmente, respeitar desativação.

LOGICA_GERAL:
- ABERTURA: reconhecer que nós entramos em contato + explicar brevemente o motivo.
  Ex: "Oi {nome}! Aqui é {agente}, da {empresa}. A gente te mandou uma mensagem sobre
  energia solar — vi que você respondeu! Antes de qualquer coisa: faz sentido
  pra você pensar em reduzir a conta de luz?"
- Se interesse confirmado → seguir qualificação semelhante ao Respondeu.
- Se interest duvidoso → investir 1-2 mensagens em rapport antes de qualificar.
- Se explicitamente não quer → encerrar com leveza: "Sem problemas! Se mudar de ideia..."

QUALIFICACAO:
- Seguir o mesmo modelo do agente Respondeu:
  - Segmento (casa, empresa, agro, usina)
  - Conta média
  - Timing
  - BANT (se caminho visita)
- Diferença: ser mais cuidadoso na abertura (lead é frio, não quente).

REGRAS_OBRIGATORIAS:
- Primeira mensagem SEMPRE justifica por que estamos falando com o lead.
- 1 pergunta por mensagem.
- Tom mais "consultivo" do que "vendedor" (lead não nos procurou).
- Coletar dados gradualmente (sem parecer formulário).

CONDICOES_DE_BLOQUEIO:
- Mesmas do agente Respondeu.
- Se lead.canal indica inbound (whatsapp, site, etc) → NÃO usar este agente.

USO_DE_CONTEXTO:
- Mesmos do Respondeu + referenciar campanha de disparo se possível.

CRITERIOS_DE_TRANSICAO:
- Mesmos do Respondeu: chamada_agendada ou visita_agendada.
- Critérios mínimos antes de mover: mesmos do Respondeu (BANT etc).

DADOS_MINIMOS_A_SALVAR:
- segment, timing, budget_fit, need_reason, decision_makers_present
- visit_datetime, address (se visita)
- Marcar lead como qualificado por agente de disparos

NAO_FAZER:
- Não dizer "você pediu simulação" (o lead NÃO pediu).
- Não ir direto para qualificação sem rapport.
- Não ser agressivo comercialmente.
- Não inventar preço/economia.

DIFERENCA_VS_RESPONDEU:
- Respondeu: "vi que você pediu simulação" (inbound).
- Disparos: "nós te contatamos porque..." (outbound).
- Respondeu: lead quente, pode qualificar rápido.
- Disparos: lead frio/morno, precisa de rapport antes.
```

---

## 8. MODELO DE DADOS / PERSISTÊNCIA

### 8.1 Nova Tabela: `scheduled_agent_jobs`

```sql
CREATE TABLE public.scheduled_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('post_call', 'follow_up', 'dispatch_response')),
  scheduled_at timestamptz NOT NULL,
  executed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  guard_stage text,  -- etapa esperada no momento da execução
  cancelled_reason text,
  retry_count integer DEFAULT 0,
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_scheduled_agent_jobs_pending
  ON scheduled_agent_jobs (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX idx_scheduled_agent_jobs_lead
  ON scheduled_agent_jobs (lead_id, agent_type, status);

CREATE INDEX idx_scheduled_agent_jobs_org
  ON scheduled_agent_jobs (org_id, status);
```

**Justificativa:** Tabela dedicada é mais segura que reutilizar `lead_tasks` (que é visível ao usuário) ou `appointment_reminders` (que é para lembretes de agendamento).

**Indispensável:** SIM — é o mecanismo central de agendamento para Chamada Realizada e Follow Up.

### 8.2 Novo Campo em `leads`: `follow_up_state`

```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_state jsonb DEFAULT '{}';

COMMENT ON COLUMN leads.follow_up_state IS
  'Estado do follow-up automático: { step, status, next_at, last_sent_at, started_at }';
```

**Indispensável:** SIM — necessário para renderizar o contador de 5 luzes sem joins pesados.

### 8.3 Novo Campo em `leads`: `lost_reason` (se não existir)

```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason text;

COMMENT ON COLUMN leads.lost_reason IS
  'Motivo de perda quando lead é movido para Perdido';
```

**HIPÓTESE A VALIDAR:** verificar se `lost_reason` já existe na tabela ou se é armazenado como comentário/outro campo.

### 8.4 Nova Row em `ai_stage_config` para Cada Agente

**Para Agente de Chamada Realizada:**
```sql
INSERT INTO ai_stage_config (org_id, pipeline_stage, is_active, default_prompt, prompt_override_version)
VALUES (:org_id, 'chamada_realizada', false, :prompt_chamada_realizada, 0);
```

**Para Agente de Disparos:**
```sql
INSERT INTO ai_stage_config (org_id, pipeline_stage, is_active, default_prompt, prompt_override_version)
VALUES (:org_id, 'agente_disparos', false, :prompt_disparos, 0);
```

**Para Agente de Follow Up:**
O follow-up não tem etapa fixa — ele pode operar em qualquer etapa. Opções:
- **Opção A:** Criar como config global `pipeline_stage = 'follow_up'` (recomendada)
- **Opção B:** Não usar ai_stage_config — prompt hardcoded no process-agent-jobs

**Recomendação:** Opção A — permite customização por org via UI existente.

### 8.5 Novo `agent_type` permitido em `scheduled_agent_jobs`

Valores: `'post_call'`, `'follow_up'`, `'dispatch_response'`

### 8.6 Resumo de Mudanças de Dados

| Mudança | Tipo | Indispensável | Risco de Regressão |
|---------|------|---------------|-------------------|
| Tabela `scheduled_agent_jobs` | CREATE TABLE | SIM | ZERO (tabela nova) |
| `leads.follow_up_state` | ADD COLUMN | SIM | ZERO (campo novo, default '{}') |
| `leads.lost_reason` | ADD COLUMN | CONDICIONAL | ZERO (campo novo, nullable) |
| Rows em `ai_stage_config` | INSERT | SIM | ZERO (novas rows, is_active=false) |
| Migration versionada | SQL migration file | SIM | Baixo (idempotente com IF NOT EXISTS) |

### 8.7 Migração Segura

- Todas as mudanças usam `ADD COLUMN IF NOT EXISTS` e `CREATE TABLE IF NOT EXISTS`
- Defaults são seguros (NULL, '{}', false)
- Novas rows em `ai_stage_config` criadas com `is_active = false` (opt-in manual)
- Nenhum dado existente é alterado ou deletado

---

## 9. REGRAS DE SEGURANÇA / NÃO REGRESSÃO

### 9.1 Fluxos que Podem Quebrar

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Follow-up enviado durante conversa ativa | MÉDIA | Guard: verificar se lead respondeu nos últimos X segundos antes de enviar |
| Dupla mensagem: agente normal + follow-up no mesmo momento | BAIXA | Guard: verificar se há outbound recente (<60s) para o lead |
| Agente de Disparos ativado para lead inbound | BAIXA | Check baseado em `leads.canal` com whitelist de canais inbound |
| Job do Agente Chamada Realizada enviado após vendedor já mover etapa | BAIXA | Guard: `guard_stage` verificado antes da execução |
| Follow-up continuar após takeover manual | BAIXA | Guard: verificar `ai_enabled` antes de executar |

### 9.2 Colisões entre Agentes

| Cenário | Resolução |
|---------|-----------|
| Follow-up agendado + Agente Chamada Realizada ao mesmo tempo | Não deve ocorrer: estão em etapas diferentes. Follow-up cancela se etapa mudar. |
| Lead de broadcast responde durante follow-up | Follow-up é cancelado pelo reset no webhook. Agente de Disparos assume. |
| Vendedor envia mensagem manual durante sequência de follow-up | ai_enabled → false (takeover). Follow-up cancelado no próximo check. |
| ai-pipeline-agent responde + follow-up job dispara quase simultâneo | Guard de outbound recente (<60s) impede duplicação. |

### 9.3 Riscos de Duplicidade de Mensagem

1. **Cenário:** `process-agent-jobs` dispara job, mas `ai-pipeline-agent` já respondeu por mensagem inbound
   - **Mitigação:** Verificar última interação outbound para o lead antes de invocar agente
   - **Código:** `SELECT created_at FROM interacoes WHERE lead_id=X AND wa_from_me=true ORDER BY created_at DESC LIMIT 1`
   - Se `created_at` < 60s atrás → abortar job

2. **Cenário:** Dois workers processam o mesmo job
   - **Mitigação:** `FOR UPDATE SKIP LOCKED` na query de claim + status `processing`

3. **Cenário:** ai-pipeline-agent processando mensagem inbound + process-agent-jobs processando follow-up
   - **Mitigação:** Reset de follow-ups no webhook ANTES de invocar ai-pipeline-agent

### 9.4 Riscos de Corrida / Concorrência

| Cenário | Mitigação |
|---------|-----------|
| Dois cron ticks processam o mesmo job | `FOR UPDATE SKIP LOCKED` |
| Lead responde durante o +5min do post-call | Guard verifica outbound recente antes de enviar |
| Job processing fica preso (edge function crash) | Revert jobs `processing` > 5min para `pending` (com retry_count++) |

### 9.5 Validações Obrigatórias Antes de Qualquer Envio

```
1. ✅ lead.ai_enabled !== false
2. ✅ lead.status_pipeline === job.guard_stage (para post_call e follow_up com guard)
3. ✅ Nenhum outbound para o lead nos últimos 60 segundos
4. ✅ Lead não respondeu desde o agendamento (para follow-up)
5. ✅ Lead não está em 'perdido', 'contato_futuro' (para follow-up)
6. ✅ Instância WhatsApp conectada e ativa
7. ✅ Quota AI/billing disponível
```

### 9.6 Testes Obrigatórios para Não Regressão

1. **Agentes existentes (novo_lead, respondeu, nao_compareceu, negociacao, financiamento) continuam funcionando identicamente**
2. **Leads inbound NÃO são afetados pelo Agente de Disparos**
3. **Follow-up NÃO é enviado quando lead respondeu**
4. **Follow-up NÃO é enviado quando vendedor assumiu**
5. **Post-call NÃO é enviado quando etapa mudou**
6. **Pipeline UI continua funcionando sem erros**

---

## 10. PLANO DE IMPLEMENTAÇÃO

### BLOCO 1 — Modelo de Dados

**Ações:**
1. Criar migration: `scheduled_agent_jobs` table
2. Criar migration: `leads.follow_up_state` column
3. Criar migration: `leads.lost_reason` column (se não existir — VALIDAR)
4. Inserir rows em `ai_stage_config` para `chamada_realizada`, `agente_disparos`, `follow_up` (is_active=false)
5. Aplicar migrations em staging

**Depende de:** Nada  
**Critério de pronto:** Tabelas/campos existem em staging. Queries de leitura/escrita funcionam. Dados existentes não afetados.  
**Checklist:**
- [ ] Migration executou sem erro
- [ ] `SELECT * FROM scheduled_agent_jobs` retorna 0 rows
- [ ] `SELECT follow_up_state FROM leads LIMIT 1` retorna `{}`
- [ ] `SELECT * FROM ai_stage_config WHERE pipeline_stage IN ('chamada_realizada', 'agente_disparos', 'follow_up')` retorna 3 rows (por org)
- [ ] Todos os leads existentes não afetados (spot check)

---

### BLOCO 2 — Edge Function: process-agent-jobs

**Ações:**
1. Criar `supabase/functions/process-agent-jobs/index.ts`
2. Implementar: claim jobs (FOR UPDATE SKIP LOCKED), guards, invoke ai-pipeline-agent, update status
3. Configurar Supabase Cron: `*/1 * * * *` (a cada minuto)
4. Implementar retry de jobs stuck (`processing` > 5min)

**Depende de:** Bloco 1  
**Critério de pronto:** Function deployada. Cron disparando. Jobs pendentes são processados. Jobs com guard falho são cancelados.  
**Checklist:**
- [ ] Edge function faz deploy sem erro
- [ ] Cron invoca a cada minuto (ver logs)
- [ ] Job inserido com `scheduled_at` no passado é processado
- [ ] Job com `guard_stage` diferente do lead atual é cancelado
- [ ] Job com `ai_enabled=false` é cancelado
- [ ] Jobs `processing` > 5min são revertidos para `pending`

---

### BLOCO 3 — Agente de Chamada Realizada

**Ações:**
1. Adicionar entry em `ACTIVE_PIPELINE_AGENTS` em `src/constants/aiPipelineAgents.ts` para `chamada_realizada`
2. Adicionar prompt padrão em `src/constants/aiPipelinePdfPrompts.ts`
3. Estender `ai-pipeline-agent/index.ts` para aceitar `triggerType: 'scheduled_post_call'`:
   - Skip quiet-window
   - Injetar `CONTEXTO_LIGACAO_REALIZADA` no system prompt
   - Verificar outbound recente antes de enviar
4. No `SolarZapLayout.tsx` → `handleCallConfirm()`: inserir job em `scheduled_agent_jobs` após salvar comentário
5. Testar end-to-end

**Depende de:** Bloco 1, Bloco 2  
**Critério de pronto:** Confirmar ligação → comentário salvo → +5min → mensagem enviada automaticamente. Se etapa mudou → mensagem NÃO enviada.  
**Checklist:**
- [ ] Agent aparece na UI de AIAgentsView (toggle on/off)
- [ ] Confirmar ligação com feedback cria job em `scheduled_agent_jobs`
- [ ] Job é processado após 5min
- [ ] Mensagem enviada referencia o feedback da ligação
- [ ] Se etapa mudou antes dos 5min → job cancelado
- [ ] Se ai_enabled=false → job cancelado
- [ ] Não há duplicação de mensagens

---

### BLOCO 4 — Agente de Disparos

**Ações:**
1. Adicionar entry virtual em `ACTIVE_PIPELINE_AGENTS` para `agente_disparos` (não é PipelineStage real — usar label especial na UI)
2. Adicionar prompt padrão de disparos
3. Estender `ai-pipeline-agent/index.ts` para override de prompt quando `leads.canal` indica broadcast + etapa é `respondeu`
4. Log específico em `ai_action_logs` quando roteamento para disparos ocorre

**Depende de:** Bloco 1  
**Critério de pronto:** Lead de broadcast responde → carrega prompt de Disparos (não de Respondeu). Lead inbound responde → carrega prompt de Respondeu normalmente.  
**Checklist:**
- [ ] Lead com `canal='cold_list'` que responde → log mostra "Routed to Agente de Disparos"
- [ ] Lead com `canal='whatsapp'` que responde → log mostra prompt de Respondeu
- [ ] Prompt de Disparos é editável na UI de AIAgentsView
- [ ] Movimentação de etapa funciona normalmente (novo_lead → respondeu)
- [ ] Side-effects (V6, V7, V9, V11) funcionam normalmente
- [ ] Nenhum impacto em leads existentes

---

### BLOCO 5 — Agente de Follow Up (Backend)

**Ações:**
1. Estender `ai-pipeline-agent/index.ts` para `triggerType: 'follow_up'`:
   - Skip quiet-window
   - Injetar `CONTEXTO_FOLLOW_UP` com step e histórico
   - Verificar lead respondeu, outbound recente, ai_enabled
2. No `ai-pipeline-agent/index.ts`: após `didSendOutbound = true`, inserir job follow_up step 1
3. No `whatsapp-webhook/index.ts`: ao receber inbound, cancelar follow-ups pendentes do lead
4. Em `process-agent-jobs`: lógica de follow-up sequencial (step N → step N+1)
5. Atualizar `leads.follow_up_state` a cada execução

**Depende de:** Bloco 1, Bloco 2  
**Critério de pronto:** Bot envia mensagem → se lead não responde em 3h → follow-up 1 enviado → sequência completa funciona → resposta do lead cancela sequência.  
**Checklist:**
- [ ] Após outbound, job follow_up step 1 agendado para +3h
- [ ] Follow-up 1 enviado após 3h sem resposta
- [ ] Follow-up 2 agendado para +1d após step 1
- [ ] Sequência completa: 3h → 1d → 2d → 3d → 7d
- [ ] Lead responde → todos follow-ups pendentes cancelados
- [ ] Etapa muda → follow-ups cancelados
- [ ] ai_enabled=false → follow-ups cancelados
- [ ] `follow_up_state` atualizado corretamente em cada step
- [ ] Follow-ups NÃO são disparados para leads em 'perdido' ou 'contato_futuro'

---

### BLOCO 6 — Agente de Follow Up (UI)

**Ações:**
1. Criar componente `FollowUpIndicator.tsx` (5 luzes)
2. Integrar em `ConversationList.tsx` (inline badge)
3. Integrar em `PipelineView.tsx` (card badge)
4. Integrar em `ContactsView.tsx` (badge/coluna)
5. Criar componente `FollowUpExhaustedModal.tsx` (modal pós-5 attempts)
6. Campo de motivo de perda obrigatório no modal
7. Integrar modal no `SolarZapLayout.tsx`

**Depende de:** Bloco 5  
**Critério de pronto:** Indicador visual correto em todas as abas. Modal aparece após 5 follow-ups sem resposta. Movimentação para Perdido com motivo funciona.  
**Checklist:**
- [ ] 5 luzes renderizam em Conversas, Pipeline e Contatos
- [ ] Luzes refletem estado real (preenchida=enviado, vazia=futuro)
- [ ] Modal aparece ao interagir com lead com `step=5, status=exhausted`
- [ ] Modal exige motivo antes de permitir ação
- [ ] Mover para Perdido salva `lost_reason` e cria comentário
- [ ] Indicador reseta quando lead responde
- [ ] Performance aceitável (sem queries pesadas em listagens)

---

### BLOCO 7 — Prompts e Configuração

**Ações:**
1. Escrever prompts production-ready para os 3 agentes
2. Adicionar ao `aiPipelinePdfPrompts.ts`
3. Criar/atualizar script `update_stage_prompts.ts` para novos agentes
4. Seed prompts em staging e produção
5. Validar na UI que prompts são editáveis

**Depende de:** Blocos 3, 4, 5 (para poder testar os prompts)  
**Critério de pronto:** Prompts padrão salvos no DB. Editáveis via UI. Restaurar padrão funciona.  
**Checklist:**
- [ ] Prompts aparecem na UI de AIAgentsView
- [ ] Edição e salvamento funcionam
- [ ] Restaurar padrão restaura o prompt correto
- [ ] Versionamento incrementa ao salvar

---

### BLOCO 8 — Testes e Rollout

**Ações:**
1. Testes unitários para guards e validações
2. Testes de integração para fluxo completo de cada agente
3. Testes E2E com smoke tests
4. Rollout gradual: ativar em 1 org de teste → validar → ativar para todas

**Depende de:** Todos os blocos anteriores  
**Critério de pronto:** Todos os testes passam. Nenhum fluxo existente quebrado. Agentes novos funcionam em org de teste.

---

## 11. PLANO DE TESTES E VALIDAÇÃO

### 11.1 Testes Unitários

| Teste | Componente | O que valida |
|-------|-----------|------|
| `guard_stage_check` | process-agent-jobs | Job é cancelado se etapa mudou |
| `guard_ai_enabled` | process-agent-jobs | Job é cancelado se AI está desabilitada |
| `guard_outbound_recent` | process-agent-jobs | Job é cancelado se há outbound nos últimos 60s |
| `follow_up_reset_on_response` | whatsapp-webhook | Follow-ups pendentes são cancelados quando lead responde |
| `broadcast_lead_detection` | ai-pipeline-agent | Detecta lead de broadcast corretamente |
| `inbound_lead_not_affected` | ai-pipeline-agent | Lead inbound NÃO é roteado para Agente de Disparos |
| `follow_up_state_update` | process-agent-jobs | `follow_up_state` é atualizado corretamente |
| `lost_reason_required` | FollowUpExhaustedModal | Motivo de perda é obrigatório |

### 11.2 Testes de Integração

| Teste | Fluxo |
|-------|-------|
| `post_call_full_flow` | Confirmar ligação → comentário → job agendado → +5min → mensagem enviada → log registrado |
| `post_call_stage_change` | Confirmar ligação → mover etapa antes de 5min → job cancelado → mensagem NÃO enviada |
| `follow_up_full_sequence` | Outbound → 3h sem resposta → FU1 → 1d → FU2 → ... → FU5 → exhausted |
| `follow_up_cancel_on_response` | Outbound → agendar FU1 → lead responde → FU1 cancelado → sequência limpa |
| `dispatch_agent_routing` | Lead broadcast responde → prompt de Disparos carregado (não Respondeu) |
| `dispatch_agent_inbound_safe` | Lead inbound responde → prompt de Respondeu carregado normalmente |

### 11.3 Testes E2E

| Teste | Cenário completo |
|-------|-----------------|
| `e2e_post_call` | Login → abrir lead → confirmar chamada → escrever feedback → aguardar 5min → verificar mensagem no WhatsApp |
| `e2e_follow_up_indicator` | Pipeline → lead sem resposta → verificar luzes preenchendo → modal pós-5 |
| `e2e_broadcast_response` | Criar campanha → enviar → lead responde → verificar prompt usado |

### 11.4 Casos Específicos de Concorrência / Edge Cases

| Caso | Expectativa |
|------|------------|
| Lead responde 1 segundo antes do job de follow-up | Follow-up cancelado, agente normal responde |
| Vendedor envia mensagem manual imediatamente após confirmar ligação | ai_enabled=false → job cancelado |
| Dois cron ticks processam jobs simultâneamente | `FOR UPDATE SKIP LOCKED` garante 1 procesamento por job |
| Lead de broadcast responde com "não quero" | Agente de Disparos encerra com leveza (não qualifica) |
| Comentário de ligação salvo mas lead já movido para proposta | Guard_stage impede envio do post_call |
| Follow-up step 3 enviado, lead responde, bot responde, silêncio novamente | Nova sequência de follow-up inicia do step 1 |
| Modal de perda: usuário tenta confirmar sem motivo | Botão desabilitado até motivo preenchido |

---

## 12. HIPÓTESES A VALIDAR

| # | Hipótese | Como validar | Impacto se falsa |
|---|----------|-------------|-----------------|
| H1 | `leads.lost_reason` já existe na tabela | `SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='lost_reason'` | Se não existe, criar migration |
| H2 | `leads.canal` é confiável para detectar broadcast | Verificar valores reais de `canal` no banco de produção | Se não confiável, usar join com `broadcast_recipients` |
| H3 | Supabase Cron suporta frequência de 1 minuto | Verificar configuração do Supabase Cloud | Se não, usar 5min e ajustar delays |
| H4 | `ai_stage_config` aceita pipeline_stage que não corresponde a uma PipelineStage real (ex: 'agente_disparos', 'follow_up') | Verificar se há constraint CHECK ou ENUM na coluna | Se restrito, usar stage existente + campo adicional |
| H5 | Edge functions podem ser invocadas por edge functions (`process-agent-jobs` invocando `ai-pipeline-agent`) | Testar invocação cross-function em Supabase Cloud | Se não, inline a lógica do agente no process-agent-jobs |
| H6 | O campo `instance_name` está disponível no lead no momento do agendamento do job (para envio posterior) | Verificar se `leads.instance_name` é preenchido de forma confiável | Se não, buscar instância ativa da org no momento do envio |
| H7 | Existe campo `source` distinto de `canal` na tabela `leads` | Verificar schema real | Se existir, pode ser usado adicionalmente na detecção de broadcast |
| H8 | `process-reminders` já roda como Cron — pode-se adicionar lógica de agent jobs junto ou é recomendável separar | Avaliar acoplamento e risco de timeout | Se junto: menos infra, mais risco. Se separado: mais infra, menos risco |
| H9 | O `ai-pipeline-agent` atual pode ser invocado sem `interactionId` (para triggers agendados) | Verificar se o código falha sem interactionId | Se falha, estender para aceitar invocação sem interaction |

---

## 13. APÊNDICE — ARQUIVOS AFETADOS

### Arquivos a CRIAR (novos)

| Arquivo | Propósito |
|---------|-----------|
| `supabase/migrations/YYYYMMDD_scheduled_agent_jobs.sql` | CREATE TABLE scheduled_agent_jobs + ADD COLUMN follow_up_state + lost_reason |
| `supabase/functions/process-agent-jobs/index.ts` | Edge function para processar jobs agendados |
| `src/components/solarzap/FollowUpIndicator.tsx` | Componente visual de 5 luzes |
| `src/components/solarzap/FollowUpExhaustedModal.tsx` | Modal pós-5 follow-ups |

### Arquivos a ESTENDER (mudança cirúrgica)

| Arquivo | Linha(s) | Mudança |
|---------|----------|---------|
| `src/constants/aiPipelineAgents.ts` | L34 (`ACTIVE_PIPELINE_AGENTS`) | Adicionar 3 entries: chamada_realizada, follow_up, agente_disparos |
| `src/constants/aiPipelinePdfPrompts.ts` | Final do arquivo | Adicionar prompts dos 3 novos agentes |
| `supabase/functions/ai-pipeline-agent/index.ts` | ~L1600 (handler principal) | Aceitar novos `triggerType`s: 'scheduled_post_call', 'follow_up'. Override de prompt para broadcast leads (~L2295). |
| `supabase/functions/whatsapp-webhook/index.ts` | ~L1050 (antes de invocar ai-pipeline-agent) | Cancelar follow-ups pendentes ao receber inbound |
| `src/components/solarzap/SolarZapLayout.tsx` | L644-660 (handleCallConfirm) | Inserir job em `scheduled_agent_jobs` após salvar comentário |
| `src/components/solarzap/ConversationList.tsx` | Na renderização de cada item | Renderizar `FollowUpIndicator` |
| `src/components/solarzap/PipelineView.tsx` | Na renderização de cada card | Renderizar `FollowUpIndicator` |
| `src/components/solarzap/ContactsView.tsx` | Na renderização de cada item | Renderizar `FollowUpIndicator` |
| `src/components/solarzap/AIAgentsView.tsx` | Nenhuma mudança necessária | Já itera `ACTIVE_PIPELINE_AGENTS` automaticamente |

### Arquivos que NÃO DEVEM ser alterados

| Arquivo | Motivo |
|---------|--------|
| `src/hooks/domain/pipelineStageGuards.ts` | Guards de pipeline são globais — não tocar |
| `src/hooks/domain/usePipeline.ts` | Lógica de movimentação — não alterar |
| `src/hooks/useAutomationSettings.ts` | Settings de automação — não alterar |
| `src/contexts/AutomationContext.tsx` | Contexto de automação — não alterar |
| `supabase/functions/process-reminders/index.ts` | Sistema de lembretes — reutilizar padrão, não alterar |
| Quiet-window / yield guard / burst logic (ai-pipeline-agent L1600-2100) | Mecanismo crítico de estabilização — não tocar |
| `STAGE_TRANSITION_MAP` (ai-pipeline-agent L16-31) | Mapa de transições — não alterar |

---

*Fim do Blueprint — v1.0*
