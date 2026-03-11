# BLUEPRINT FINAL — 3 Novos Agentes de Pipeline SolarZap

**Versão:** 2.1 (Final)  
**Data:** 2026-03-10  
**Base:** Revisão técnica sobre blueprint v1.0 + inspeção direta do código + v2.1 patch (fila órfã + decisão post-call)  
**Status:** Pronto para implementação

---

## ÍNDICE

1. [Resumo Executivo](#1-resumo-executivo)
2. [Correções Aplicadas vs Blueprint v1](#2-correções-aplicadas-vs-blueprint-v1)
3. [Arquitetura Atual Mapeada](#3-arquitetura-atual-mapeada)
4. [Blueprint Final — Agente de Chamada Realizada](#4-blueprint-final--agente-de-chamada-realizada)
5. [Blueprint Final — Agente de Follow Up](#5-blueprint-final--agente-de-follow-up)
6. [Blueprint Final — Agente de Disparos](#6-blueprint-final--agente-de-disparos)
7. [Modelo de Dados Final](#7-modelo-de-dados-final)
8. [Orquestração e Jobs](#8-orquestração-e-jobs)
9. [UI / Configuração](#9-ui--configuração)
10. [Regras de Segurança / Não Regressão](#10-regras-de-segurança--não-regressão)
11. [Plano Final de Implementação](#11-plano-final-de-implementação)
12. [Plano Final de Testes](#12-plano-final-de-testes)
13. [Hipóteses a Validar](#13-hipóteses-a-validar)
14. [Lista de Arquivos Afetados](#14-lista-de-arquivos-afetados)

---

## 1. RESUMO EXECUTIVO

### 1.1 Escopo

3 novos agentes de pipeline, implementados por extensão incremental, sem reescrita:

| # | Agente | Gatilho | Diferencial vs v1 |
|---|--------|---------|-------------------|
| 1 | **Chamada Realizada** | Comentário `[Feedback Ligacao]` salvo + job +5min | Guard de resposta do lead adicionado; prioridade do comentário no prompt explícita |
| 2 | **Follow Up** | Última mensagem outbound (bot ou vendedor) sem resposta | Operação INDEPENDENTE do toggle `ai_enabled`; unicidade de sequência garantida; fonte de verdade definida; estados fechados |
| 3 | **Disparos** | Lead de broadcast responde | Detecção determinística via `broadcast_recipients` (não por heurística de `canal`); roteamento fechado |

### 1.2 Princípio Fundamental

ESTENDER, NÃO SUBSTITUIR. Cada agente reutiliza a infraestrutura existente (`ai-pipeline-agent`, `ai_stage_config`, `ACTIVE_PIPELINE_AGENTS`, `process-reminders`, Evolution API). As mudanças são cirúrgicas e aditivas.

---

## 2. CORREÇÕES APLICADAS VS BLUEPRINT V1

| # | Ponto Frágil na v1 | Correção na v2 |
|---|-------------------|---------------|
| 1 | Follow Up dependia de `ai_enabled` para funcionar | Follow Up tem flag própria `follow_up_enabled` INDEPENDENTE de `ai_enabled`. Toggle separado na aba IA. |
| 2 | Possibilidade de múltiplas sequências paralelas de follow up | Regra de unicidade: máximo 1 sequência ativa por lead. Nova outbound elegível cancela a anterior e inicia nova. |
| 3 | Fonte de verdade do follow up dividida e não sincronizada | Fonte de verdade = `scheduled_agent_jobs`. Cache UI = `leads.follow_up_step` (int simples). Sincronização unidirecional: job → lead. |
| 4 | Estados (pending/scheduled/sent/exhausted) inconsistentes | Dois domínios separados: status do JOB (pending/processing/completed/cancelled/failed) vs step do CICLO (0-5 no lead). |
| 5 | Modal de follow up exaurido sem gatilho determinístico | Gatilho: `leads.follow_up_step = 5` + flag `follow_up_exhausted_seen = false`. Modal controlado por flag, sem repetição. |
| 6 | Detecção de lead de disparo por `canal` — frágil, heurística | Detecção determinística via `SELECT EXISTS FROM broadcast_recipients WHERE lead_id = X AND status = 'sent'`. |
| 7 | Guard de resposta do lead no Agente de Chamada Realizada incompleto | Guard explícito: verificar se existe inbound do lead posterior ao agendamento do job. Se sim → cancelar. |
| 8 | Agente de Disparos poderia afetar leads inbound | Isolamento garantido: check baseado em `broadcast_recipients`, não em `canal`. Lead sem row em `broadcast_recipients` NUNCA é roteado para Disparos. |
| 9 | Encaixe dos novos agentes na UI de AIAgentsView incerto | `chamada_realizada` JÁ é `PipelineStage` válido. Para `follow_up` e `agente_disparos`: usar seção separada na UI (NÃO estender `PipelineStage`). |
| 10 | Prioridade do comentário de ligação no prompt indefinida | Definida: comentário de ligação é CONTEXTO PRINCIPAL, injetado como bloco destacado no system prompt, acima do histórico. |
| 11 | `lost_reason` marcado como hipótese | Confirmado: NÃO existe na tabela. Migration necessária. |
| 12 | `ai_stage_config` poderia ter constraint no `pipeline_stage` | Confirmado: é TEXT sem CHECK/ENUM. Aceita valores arbitrários. Seguro para novas stages. |

---

## 3. ARQUITETURA ATUAL MAPEADA

### 3.1 Fluxo de Agentes (Sem Mudanças)

```
WhatsApp (inbound)
    ↓
whatsapp-webhook/index.ts
    ├─ Grava em interacoes
    ├─ Detecta seller takeover (isFromMe → ai_enabled=false)
    └─ Invoca ai-pipeline-agent via supabase.functions.invoke()
        ↓
ai-pipeline-agent/index.ts
    ├─ Quiet-window debounce (3.5s min, burst aggregation)
    ├─ Yield guard
    ├─ Carrega lead, ai_settings, ai_stage_config
    ├─ Monta contexto (histórico, KB, comentários, proposta, slots)
    ├─ OpenAI gpt-4o (json_object format)
    ├─ Side-effects (V6, V7, V9, V10, V11)
    ├─ Envia via Evolution API → interacoes
    └─ Move etapa (com gating)
```

### 3.2 Toggle `ai_enabled` — Ciclo de Vida Completo

| Quem seta `false` | Onde | Motivo |
|-------------------|------|--------|
| Vendedor envia mensagem (frontend) | `useChat.ts` L360 | `ai_paused_reason: 'human_takeover'` |
| Webhook detecta isFromMe | `whatsapp-webhook/index.ts` L938-990 | `ai_paused_reason: 'human_takeover'` (com echo detection) |
| Toggle manual do vendedor | `useLeads.ts` L800 (`toggleLeadAiMutation`) | `ai_paused_reason: 'manual'` |

| Quem seta `true` | Onde | Motivo |
|------------------|------|--------|
| Broadcast cria/atualiza lead | `useBroadcasts.ts` L333/L372 | Reset: `ai_enabled: true, ai_paused_reason: null` |
| Instance AI reabilitada | `useUserWhatsAppInstances.ts` L837 | Batch update de todos leads da instância |
| Toggle manual do vendedor | `useLeads.ts` L800 | Reativação manual |

| Quem lê `ai_enabled` | Onde | Efeito |
|----------------------|------|--------|
| ai-pipeline-agent L1823 | Gate check | `lead.ai_enabled === false` → bloqueia TODA execução do agente |
| ai-pipeline-agent L742 | `isLeadAiEnabledNow()` | Re-check antes de enviar mensagem |

**IMPLICAÇÃO CRÍTICA PARA O FOLLOW UP:**
O toggle `ai_enabled` é uma chave geral que desliga TODA IA conversacional para o lead. O Agente de Follow Up precisa de um mecanismo SEPARADO para continuar operando mesmo quando `ai_enabled = false`.

### 3.3 Onde os Agentes São Definidos

| Componente | Arquivo | Detalhes |
|-----------|---------|----------|
| Array de agentes | `src/constants/aiPipelineAgents.ts` L34 | `ACTIVE_PIPELINE_AGENTS: PipelineAgentDef[]` — 5 agentes: novo_lead, respondeu, nao_compareceu, proposta_negociacao, financiamento |
| Tipo do stage | `src/types/solarzap.ts` L9-28 | `PipelineStage` = union de 19 strings. Inclui `'chamada_realizada'`. NÃO inclui `'follow_up'` ou `'agente_disparos'`. |
| Prompts PDF | `src/constants/aiPipelinePdfPrompts.ts` | Map de prompts detalhados por stage |
| Config por org | Tabela `ai_stage_config` | `pipeline_stage TEXT` (sem constraint) + `is_active`, `default_prompt`, `prompt_override`, `org_id` |
| UI de gestão | `src/components/solarzap/AIAgentsView.tsx` L511 | Itera `ACTIVE_PIPELINE_AGENTS.map(agent => ...)` |
| Stages inativas | `INACTIVE_STAGES_REASONS` em aiPipelineAgents.ts L366 | `chamada_realizada: 'Operação manual do vendedor'` |

### 3.4 Como Prompts São Carregados (ai-pipeline-agent)

```
L2287: currentStage = normalizeStage(lead.status_pipeline)
L2288: stageConfig = SELECT * FROM ai_stage_config WHERE org_id=X AND pipeline_stage=currentStage
L2296: fallback → pipeline_stage = 'novo_lead'
L2304: se is_active=false → STAGE_FALLBACK_PROMPT (FAQ genérica)
L2308: stagePromptText = stageConfig.prompt_override || stageConfig.default_prompt
```

### 3.5 Payload do ai-pipeline-agent

Aceita JSON arbitrário. Campos usados atualmente:
- `leadId` (obrigatório)
- `instanceName` (obrigatório)
- `interactionId` (usado para anchor check; pode ser null)
- `triggerType` (apenas logado, L3899; default: 'incoming_message')

**O handler NÃO valida `triggerType` nem bloqueia payloads com campos extras.** Isso permite injetar novos campos como `extraContext` sem alterar a interface.

### 3.6 Broadcast — Como Leads São Criados/Atualizados

1. `useBroadcasts.ts` chama `upsert_lead_canonical` RPC com `source: campaign.source_channel || 'cold_list'`
2. RPC: se lead é NOVO → INSERT com `source = p_source` (canal recebe DEFAULT 'whatsapp' do schema)
3. RPC: se lead EXISTE → UPDATE NÃO altera `source` nem `canal`
4. Depois do RPC, `useBroadcasts.ts` faz UPDATE direto (L310-380): `canal = campaign.source_channel || 'cold_list'`
5. Insere row em `broadcast_recipients` com `lead_id`, `campaign_id`, `status: 'sent'`

**Consequência:**
- `leads.canal` = valor do último broadcast que tocou o lead (pode ser sobrescrito)
- `leads.source` = valor do PRIMEIRO canal de criação (não sobrescrito, mas defaults para 'whatsapp' via RPC onde canal não é parâmetro)
- `broadcast_recipients.lead_id` = vínculo DETERMINÍSTICO entre lead e campanha de broadcast

---

## 4. BLUEPRINT FINAL — AGENTE DE CHAMADA REALIZADA

### 4.1 O QUE JÁ EXISTE

| Item | Localização | Estado |
|------|------------|--------|
| Stage `chamada_realizada` no `PipelineStage` type | `src/types/solarzap.ts` L14 | ✅ Já existe como stage válida |
| Visual da stage (icon, color) | `PIPELINE_STAGES['chamada_realizada']` em solarzap.ts L189 | ✅ `{ title: 'Chamada Realizada', icon: '✅', color: 'bg-green-500' }` |
| Fluxo de confirmar ligação | `SolarZapLayout.tsx` L616-678 (`handleCallConfirm`) | ✅ Move lead + salva comentário `[Feedback Ligacao]` |
| Comentários CRM | Tabela `comentarios_leads` + leitura em ai-pipeline-agent L2470+ | ✅ O agente já injeta comentários de CRM no system prompt |
| Stage marcada como inativa | `INACTIVE_STAGES_REASONS['chamada_realizada']` | ✅ `'Operação manual do vendedor'` — será removida |

### 4.2 O QUE SERÁ ESTENDIDO

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| Adicionar entry em `ACTIVE_PIPELINE_AGENTS` | `aiPipelineAgents.ts` | Stage: `'chamada_realizada'`, com prompt padrão |
| Remover de `INACTIVE_STAGES_REASONS` | `aiPipelineAgents.ts` L370 | Remover `chamada_realizada: '...'` |
| Adicionar prompt PDF | `aiPipelinePdfPrompts.ts` | Prompt de pós-chamada detalhado |
| Adicionar no `DEFAULT_PROMPTS_BY_STAGE` | `aiPipelineAgents.ts` L399 | Entry para `chamada_realizada` |
| Agendar job +5min após feedback | `SolarZapLayout.tsx` L644-660 | INSERT em `scheduled_agent_jobs` após INSERT em `comentarios_leads` |
| Aceitar `triggerType: 'scheduled_post_call'` | `ai-pipeline-agent/index.ts` | Skip quiet-window, injetar contexto da ligação, guards extras |
| Row em ai_stage_config por org | Migration SQL | `pipeline_stage = 'chamada_realizada'`, `is_active = false` |

### 4.3 O QUE NÃO DEVE SER ALTERADO

- `handleCallConfirm()` base logic (move stage + salva comentário) — manter intacto, apenas adicionar INSERT de job
- `CallConfirmModal.tsx` — nenhuma mudança
- `MoveToProposalModal` flow — continua abrindo normalmente após ligação
- Quiet-window / yield guard / burst logic — não tocar
- `STAGE_TRANSITION_MAP` — não alterar

### 4.4 Gatilho e Job Agendado

**Ponto de inserção:** `SolarZapLayout.tsx`, `handleCallConfirm()`, L644-660, logo APÓS o insert do comentário em `comentarios_leads`:

```typescript
// NOVO: Agendar job para Agente de Chamada Realizada (+5min)
if (contact.id && orgId) {
  void supabase.from('scheduled_agent_jobs').insert({
    org_id: orgId,
    lead_id: parseInt(contact.id, 10),
    agent_type: 'post_call',
    scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    status: 'pending',
    guard_stage: 'chamada_realizada',
    payload: {
      comment_text: normalizedFeedback,
      instance_name: contact.instanceName || null,
    },
  });
}
```

### 4.5 Guards Antes do Envio (process-agent-jobs)

Antes de invocar `ai-pipeline-agent` para um job `post_call`, executar TODOS os checks:

```
1. ✅ lead.status_pipeline === 'chamada_realizada' (guard_stage)
2. ✅ lead.ai_enabled = true (DECISÃO v2.1: post-call respeita pausa geral da IA)
      → Se false: CANCELAR com cancelled_reason='ai_paused'
3. ✅ instance WhatsApp conectada (buscar instância ativa)
4. ✅ Nenhum outbound para o lead nos últimos 60 segundos
5. ✅ Lead NÃO respondeu desde o agendamento do job
6. ✅ Quota/billing disponível (checkLimit)
```

**Guard de resposta do lead (CORREÇÃO vs v1):**

```sql
SELECT EXISTS (
  SELECT 1 FROM interacoes
  WHERE lead_id = :lead_id
    AND wa_from_me = false
    AND tipo = 'mensagem_cliente'
    AND created_at > :job_created_at
) AS lead_responded;
```

Se `lead_responded = true`:
- Cancelar job com `cancelled_reason = 'lead_responded_before_execution'`
- Motivo: se o lead já respondeu, o agente de pipeline da etapa atual responde naturalmente pela lógica normal — enviar post-call seria incoerente

**DECISÃO (v2.1):** O guard de `ai_enabled` É usado para post-call. Se `lead.ai_enabled = false`, o job é cancelado com `cancelled_reason = 'ai_paused'`. Motivo: pausa manual sem mensagem do vendedor indicava que o vendedor quer controle total — disparar um post-call automático 5 minutos depois contradiz essa expectativa. O guard de outbound recente (<60s) já cobria takeover por mensagem, mas este guard cobre a pausa manual silenciosa.

### 4.6 Comportamento do ai-pipeline-agent para `triggerType: 'scheduled_post_call'`

**Mudança localizada no handler (ai-pipeline-agent/index.ts):**

Após o payload ser carregado (~L1600), antes da quiet-window (~L1830):

```typescript
const isScheduledTrigger = payload.triggerType === 'scheduled_post_call'
                        || payload.triggerType === 'follow_up';

if (isScheduledTrigger) {
  // Skip quiet-window debounce (não há mensagem inbound)
  // Skip anchor interaction check (trigger não é interação)
  // Skip burst aggregation (trigger é unitário)
  // interactionId pode ser null — PERMITIR
}
```

**Injeção do contexto de ligação no system prompt:**

Na montagem do system prompt (~L2850), quando `triggerType === 'scheduled_post_call'`:

```
=== CONTEXTO DA LIGAÇÃO (PRIORIDADE MÁXIMA) ===
O vendedor realizou uma ligação com o lead há 5 minutos e registrou:
"${payload.extraContext.comment_text}"

INSTRUÇÕES:
- Sua mensagem DEVE referenciar o que foi conversado na ligação.
- Use o feedback acima como o dado PRINCIPAL para contextualizar a mensagem.
- Conduza para o próximo passo (agendar visita, gerar proposta, ou pedir dado faltante).
- NÃO invente o que foi conversado — use APENAS o feedback registrado.
=== FIM DO CONTEXTO DA LIGAÇÃO ===
```

**Prioridade de contexto (CORREÇÃO vs v1):**
1. **CONTEXTO DA LIGAÇÃO** (bloco acima) — injetado ANTES do histórico de chat
2. Comentários CRM (já carregados pela lógica existente)
3. Histórico de mensagens (últimas 30)
4. KB / FAQ / objeções

**Dados mínimos para disparo:**
- `payload.extraContext.comment_text` deve existir e ser non-empty
- Se vazio → cancelar job com `cancelled_reason = 'empty_comment'`

### 4.7 Auditoria

Registrar em `ai_action_logs`:
```json
{
  "action_type": "post_call_agent_executed",
  "details": {
    "runId": "...",
    "job_id": "...",
    "comment_text_length": 42,
    "lead_stage_at_execution": "chamada_realizada",
    "guard_checks_passed": true
  }
}
```

---

## 5. BLUEPRINT FINAL — AGENTE DE FOLLOW UP

### 5.1 DECISÃO ARQUITETURAL CRÍTICA: INDEPENDÊNCIA DO `ai_enabled`

O Agente de Follow Up opera **INDEPENDENTEMENTE** do toggle geral `ai_enabled` do lead.

| Conceito | Controle | Onde |
|----------|---------|------|
| IA conversacional geral | `leads.ai_enabled` (boolean) | Toggle na aba Conversas + auto-disable por takeover |
| Agente de Follow Up | `ai_stage_config.is_active` para `pipeline_stage = 'follow_up'` + `leads.follow_up_enabled` (boolean, novo campo) | Toggle na aba Inteligência Artificial por org + toggle por lead |

**Regra explícita:**
- `ai_enabled = false` + `follow_up_enabled = true` → Follow Up ENVIA mensagens ✅
- `ai_enabled = true` + `follow_up_enabled = false` → Follow Up NÃO envia ❌
- `ai_enabled = false` + `follow_up_enabled = false` → Follow Up NÃO envia ❌
- `ai_enabled = true` + `follow_up_enabled = true` → Follow Up ENVIA mensagens ✅

**Consequência para o ai-pipeline-agent:**
Quando `triggerType === 'follow_up'`, o gate de `lead.ai_enabled` (L1823) deve ser **PULADO**. No lugar, verificar `lead.follow_up_enabled`.

### 5.2 O QUE JÁ EXISTE

| Item | Localização | Estado |
|------|------------|--------|
| Tabela `lead_tasks` | Migrations | Existe, mas é para tarefas do vendedor — NÃO usar para jobs de sistema |
| Tabela `appointment_reminders` | Migrations | Existe, mas é para lembretes de agendamento — NÃO reutilizar |
| Cron `process-reminders` | `supabase/functions/process-reminders/index.ts` | ✅ Padrão `claim + loop + process + update` reutilizável |
| RPC `claim_due_reminders` | `20260128_calendar_module.sql` L199 | ✅ Padrão de `FOR UPDATE SKIP LOCKED` reutilizável |
| Sistema de comentários | `comentarios_leads` | ✅ Para logging de ações do follow-up |
| Campo `lead_stage_data` (JSONB) | `leads` | Existe mas é namespaced por stage com campos controlados (`STAGE_DATA_ALLOWED_FIELDS`) — NÃO adequado para follow-up state |

### 5.3 O QUE SERÁ ESTENDIDO

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| Tabela `scheduled_agent_jobs` | Nova migration | Tabela de jobs agendados (compartilhada com post_call) |
| Campo `follow_up_enabled` em `leads` | Nova migration | Boolean, default `true`, controle independente por lead |
| Campo `follow_up_step` em `leads` | Nova migration | Int (0-5), cache do step atual para UI |
| Campo `follow_up_exhausted_seen` em `leads` | Nova migration | Boolean, controle de exibição do modal |
| Campo `lost_reason` em `leads` | Nova migration | Text, motivo de perda (confirmado: NÃO existe) |
| Edge function `process-agent-jobs` | Nova edge function | Cron job processor para todos os agentes agendados |
| RPC `claim_due_agent_jobs` | Nova migration | Claim atômico com `FOR UPDATE SKIP LOCKED` |
| Componente `FollowUpIndicator` | Novo componente React | 5 luzes visuais |
| Componente `FollowUpExhaustedModal` | Novo componente React | Modal pós-5 follow-ups |
| Aceitar `triggerType: 'follow_up'` | `ai-pipeline-agent/index.ts` | Skip quiet-window, injetar contexto, PULAR gate de ai_enabled |
| Cancelar follow-ups no webhook | `whatsapp-webhook/index.ts` ~L1050 | Reset quando lead responde |
| Inserir follow-up job no ai-pipeline-agent | `ai-pipeline-agent/index.ts` após outbound | Agendar step 1 quando bot envia mensagem |
| Inserir follow-up job no webhook | `whatsapp-webhook/index.ts` após seller message | Agendar step 1 quando vendedor envia mensagem |
| Seção de configuração do follow-up na aba IA | `AIAgentsView.tsx` | Seção separada (NÃO no array ACTIVE_PIPELINE_AGENTS) |
| Config global por org | `ai_stage_config` row com `pipeline_stage = 'follow_up'` | Toggle via UI |

### 5.4 O QUE NÃO DEVE SER ALTERADO

- `leads.ai_enabled` lifecycle — continua funcionando exatamente como hoje
- `useLeads.ts` `toggleLeadAiMutation` — NÃO deve afetar `follow_up_enabled`
- `whatsapp-webhook/index.ts` seller takeover — NÃO deve desabilitar follow-up
- `lead_stage_data` JSONB namespace system — NÃO usar para follow-up state
- `STAGE_DATA_NAMESPACE_BY_STAGE` / `STAGE_DATA_ALLOWED_FIELDS` — não tocar

### 5.5 Unicidade de Sequência

**REGRA:** No máximo 1 sequência de follow up ativa por lead a qualquer momento.

**Implementação:**

Antes de inserir um novo job de follow up:
```sql
-- 1. Cancelar TODOS os jobs follow_up pendentes para o lead
UPDATE scheduled_agent_jobs
SET status = 'cancelled', cancelled_reason = 'new_outbound_superseded'
WHERE lead_id = :lead_id
  AND agent_type = 'follow_up'
  AND status = 'pending';

-- 2. Inserir o novo job step 1
INSERT INTO scheduled_agent_jobs (...) VALUES (...);

-- 3. Resetar step no lead
UPDATE leads SET follow_up_step = 0 WHERE id = :lead_id;
```

**Garantia estrutural adicional:**
Na RPC `claim_due_agent_jobs`, filtrar apenas 1 job `follow_up` por lead:
```sql
-- Em caso de race condition, apenas o job mais recente por lead é processado
DISTINCT ON (lead_id) ... ORDER BY lead_id, scheduled_at DESC
```

### 5.6 Fonte de Verdade

| Conceito | Fonte de verdade | Uso |
|----------|-----------------|-----|
| Sequência de follow up (operacional) | `scheduled_agent_jobs` WHERE `agent_type = 'follow_up'` AND `lead_id = X` | Cron: o que executar, quando |
| Step atual do ciclo (cache UI) | `leads.follow_up_step` (int, 0-5) | Frontend: renderizar 5 luzes |
| Follow up exaurido visto | `leads.follow_up_exhausted_seen` (boolean) | Frontend: controlar exibição do modal |
| Configuração do agente (org-level) | `ai_stage_config` WHERE `pipeline_stage = 'follow_up'` | Aba IA: habilitado/desabilitado + prompt |
| Habilitação por lead | `leads.follow_up_enabled` (boolean) | Guards: permitir envio independent de ai_enabled |

**Fluxo de sincronização (unidirecional: job → lead):**

```
process-agent-jobs executa job follow_up step N
    ├─ Envia mensagem com sucesso
    ├─ UPDATE leads SET follow_up_step = N WHERE id = :lead_id
    ├─ Se N = 5: UPDATE leads SET follow_up_exhausted_seen = false WHERE id = :lead_id
    └─ Agenda próximo step (se N < 5)
```

```
Lead responde (via whatsapp-webhook)
    ├─ UPDATE scheduled_agent_jobs SET status='cancelled' WHERE lead_id=X AND agent_type='follow_up' AND status='pending'
    └─ UPDATE leads SET follow_up_step = 0 WHERE id = :lead_id
```

### 5.7 Estados — Dois Domínios Separados

**Domínio 1: Status do JOB (`scheduled_agent_jobs.status`)**

```
pending ──→ processing ──→ completed
    │            │
    ↓            ↓
cancelled     failed
```

| Status | Significado |
|--------|------------|
| `pending` | Aguardando `scheduled_at` para ser processado |
| `processing` | Sendo processado pelo cron (claim ativo) |
| `completed` | Executado com sucesso |
| `cancelled` | Cancelado por guard (lead respondeu, etapa mudou, nova sequência iniciada, etc) |
| `failed` | Erro na execução (retry possível) |

**Transições válidas:**
- `pending → processing` (claim pelo cron)
- `processing → completed` (execução ok)
- `processing → failed` (erro; pode ser revertido para `pending` se retry_count < 3)
- `pending → cancelled` (guard check ou reset)
- `processing → cancelled` (guard check durante execução)

**Domínio 2: Step do CICLO (`leads.follow_up_step`)**

| Step | Significado |
|------|------------|
| 0 | Sem follow up ativo (idle) |
| 1 | Follow up 1 enviado |
| 2 | Follow up 2 enviado |
| 3 | Follow up 3 enviado |
| 4 | Follow up 4 enviado |
| 5 | Follow up 5 enviado (exaurido) |

**Transições válidas:**
- `0 → 1` (primeiro follow up enviado)
- `N → N+1` (próximo follow up enviado)
- `5 → 0` (reset por resposta do lead ou ação do vendedor)
- `N → 0` (reset por resposta do lead ou nova sequência)

### 5.8 Gatilho Operacional — Quando Inicia a Sequência

**Regra:** A sequência de follow up inicia quando uma mensagem outbound é enviada (por bot OU por vendedor) e não há resposta do lead.

**Ponto de inserção para mensagens do BOT:**
No `ai-pipeline-agent/index.ts`, APÓS envio com sucesso (`didSendOutbound = true`, ~L3700):

```typescript
if (didSendOutbound) {
  // Cancelar follow-ups anteriores + agendar step 1
  await cancelAndScheduleFollowUp(supabase, leadId, leadOrgId, instanceName, currentStage);
}
```

**Ponto de inserção para mensagens do VENDEDOR:**
No `whatsapp-webhook/index.ts`, quando detecta `isFromMe` + é mensagem real (não echo):

```typescript
if (isSellerMessage && !isEcho) {
  // Seller takeover desliga AI geral → NÃO afeta follow-up
  // Mas seller mandou mensagem → agendar follow-up para continuar acompanhando
  if (lead.follow_up_enabled !== false) {
    await cancelAndScheduleFollowUp(supabase, leadId, orgId, instanceName, lead.status_pipeline);
  }
}
```

**NOTA:** Quando o vendedor manda mensagem, `ai_enabled` é setado para `false` (takeover), mas `follow_up_enabled` permanece `true` (se estava ativo). O follow up continua operando independente.

**Quando NÃO iniciar sequência:**
- Lead em `perdido`, `contato_futuro`, `projeto_instalado`, `coletar_avaliacao` (stages terminais)
- `follow_up_enabled = false` no lead
- Agente de follow up desabilitado por org (`ai_stage_config` para `follow_up` com `is_active = false`)

### 5.9 Cancelamento da Sequência

| Evento | Ação | Onde |
|--------|------|------|
| Lead responde (inbound) | Cancelar todos jobs follow_up pendentes + reset step = 0 | `whatsapp-webhook/index.ts` antes de invocar ai-pipeline-agent |
| Nova mensagem outbound | Cancelar jobs anteriores + agendar nova sequência step 1 | ai-pipeline-agent/whatsapp-webhook (como descrito em 5.8) |
| Lead movido para stage terminal | Jobs com guard_stage diferente serão cancelados no process | `process-agent-jobs` guard check |
| Follow up desabilitado por lead | Cancelar todos jobs follow_up pendentes para o lead (`cancelled_reason='lead_fu_disabled'`) + reset step=0 | Hook de toggle do `follow_up_enabled` |
| Follow up desabilitado por org | **Cancelar** todos jobs follow_up pendentes da org (`cancelled_reason='org_agent_disabled'`) + reset step=0 em todos leads afetados | `updateStageConfig('follow_up', { is_active: false })` no hook + query batch |

### 5.10 Intervalos da Sequência

| Step | Delay desde último outbound/step anterior | Tipo de mensagem |
|------|-------------------------------------------|-----------------|
| 1 | +3 horas | Toque leve |
| 2 | +1 dia | Dado novo / benefício |
| 3 | +2 dias | Micro-urgência |
| 4 | +3 dias | Empatia |
| 5 | +7 dias | Toque final |

### 5.11 Guards Antes do Envio (process-agent-jobs)

Para cada job `follow_up`:

```
1. ✅ ai_stage_config('follow_up') is_active = true para a org
      → Se false: CANCELAR o job com cancelled_reason='org_agent_disabled'
        (não apenas ignorar — impede fila órfã que dispara ao reativar)
2. ✅ lead.follow_up_enabled = true (NÃO verifica ai_enabled)
      → Se false: CANCELAR o job com cancelled_reason='lead_fu_disabled'
3. ✅ Lead NÃO respondeu desde o agendamento do job:
      SELECT EXISTS (SELECT 1 FROM interacoes WHERE lead_id = X 
        AND wa_from_me = false AND tipo = 'mensagem_cliente' 
        AND created_at > job.created_at)
4. ✅ Nenhum outbound para o lead nos últimos 60s
5. ✅ Stage NÃO é terminal (perdido, contato_futuro, projeto_instalado, coletar_avaliacao)
6. ✅ Instance WhatsApp conectada
7. ✅ Quota/billing disponível
```

**NOTA:** Guard 2 verifica `follow_up_enabled`, NÃO `ai_enabled`. Isso garante independência.

**REGRA ANTI-FILA-ÓRFÃ:** Guards 1 e 2, quando falham, CANCELAM o job (status='cancelled') em vez de pular silenciosamente. Isso impede que jobs antigos acumulem na fila e disparem quando o agente for reativado.

### 5.12 Comportamento do ai-pipeline-agent para `triggerType: 'follow_up'`

**Diferenças vs trigger normal:**
1. **Skip quiet-window** (não é mensagem inbound)
2. **Skip anchor check** (não tem interactionId)
3. **PULAR gate de `lead.ai_enabled`** (L1823) — verificar `lead.follow_up_enabled` no lugar
4. Carregar prompt de `ai_stage_config` WHERE `pipeline_stage = 'follow_up'`
5. Injetar contexto do step:

```
=== FOLLOW UP (STEP {N}/5) ===
O lead não responde há {tempo_desde_ultimo_outbound}.
Este é o follow-up {N} de 5.

INSTRUÇÕES POR STEP:
- Step 1: Toque leve, pergunta curta.
- Step 2: Trazer dado novo ou benefício.
- Step 3: Micro-urgência sem pressão.
- Step 4: Empatia + validação.
- Step 5: Última mensagem, tom de despedida leve.

OBRIGATÓRIO:
- Cada follow up DEVE ser DIFERENTE dos anteriores.
- Referenciar a última conversa (usar histórico).
- 1-2 frases no máximo.
- NÃO repetir perguntas já feitas.
=== FIM DO FOLLOW UP ===
```

6. Após envio:
   - `UPDATE leads SET follow_up_step = N WHERE id = :lead_id`
   - Se N < 5: agendar próximo step em `scheduled_agent_jobs`
   - Se N = 5: `UPDATE leads SET follow_up_exhausted_seen = false WHERE id = :lead_id` (trigger do modal)

### 5.13 Modal de Follow Up Exaurido

**Gatilho:** Lead com `follow_up_step = 5` E `follow_up_exhausted_seen = false`.

**Detecção:**
- Query de leads no frontend já carrega `follow_up_step` e `follow_up_exhausted_seen`
- Componente verifica a condição ao renderizar o lead (NÃO usa polling)

**Onde aparece:**
- `ConversationList.tsx` — ao clicar/abrir conversa de lead com step=5 e seen=false
- `PipelineView.tsx` — badge no card + ao clicar no lead

**Quem pode ver:** Qualquer membro da org que tenha acesso ao lead.

**Comportamento:**
1. Modal com mensagem: "O lead {nome} não respondeu aos últimos 5 follow-ups."
2. Opções:
   - **"Mover para Perdido"** → campo obrigatório de motivo (select + textarea opcional)
   - **"Manter na etapa atual"** → apenas dismiss
   - **"Desabilitar follow-up para este lead"** → `follow_up_enabled = false`
3. Ao confirmar qualquer opção: `UPDATE leads SET follow_up_exhausted_seen = true`
4. Se "Mover para Perdido":
   - `leads.update({ status_pipeline: 'perdido', lost_reason: motivo })` via `handlePipelineStageChange()`
   - `comentarios_leads.insert({ texto: '[Follow Up Esgotado]: ${motivo}', autor: 'Sistema' })`
   - `leads.update({ follow_up_step: 0, follow_up_enabled: false })`

**Anti-repetição:** O campo `follow_up_exhausted_seen = true` garante que o modal NÃO reaparece após dismiss/ação. Reset para `false` apenas quando step chega a 5 novamente (nova sequência completa).

**O que acontece se o vendedor ignorar o modal?**
- O modal aparece a cada acesso/abertura do lead enquanto `follow_up_exhausted_seen = false`
- Não bloqueia nenhuma ação — é informativo/sugestivo
- Sem timer de auto-dismiss

**Motivos de perda (enum sugerido):**
- `sem_resposta` — Não respondeu
- `sem_interesse` — Sem interesse
- `concorrente` — Fechou com concorrente
- `timing` — Não é o momento
- `financeiro` — Sem condições financeiras
- `outro` — Outro (campo livre obrigatório)

### 5.14 Conflitos entre Follow Up e Outros Mecanismos

| Cenário | Resolução |
|---------|-----------|
| IA geral pausada (ai_enabled=false) + follow_up_enabled=true | Follow up ENVIA normalmente. Gate no ai-pipeline-agent é PULADO para triggerType=follow_up. |
| Vendedor manda mensagem → ai_enabled=false (takeover) | Follow up continua elegível. Nova sequência é agendada pela mensagem do vendedor. |
| Bot respondeu + follow up step 2 agendado para +1d + vendedor manda mensagem manual | Mensagem do vendedor cancela follow-up step 2 pendente e agenda novo step 1 (+3h). |
| Follow up step 3 prestes a disparar + lead responde 1 segundo antes | Guard no process-agent-jobs verifica inbound recente → cancela job. Webhook cancela todos pendentes. |

---

## 6. BLUEPRINT FINAL — AGENTE DE DISPAROS

### 6.1 O QUE JÁ EXISTE

| Item | Localização | Estado |
|------|------------|--------|
| Leads de broadcast com vínculo à campanha | `broadcast_recipients` table: `lead_id + campaign_id + status='sent'` | ✅ Determinístico |
| `leads.canal` preenchido por broadcasts | `useBroadcasts.ts` L372 | ✅ Mas canal é SOBRESCRITO — não é origin confiável |
| Agente de Respondeu | `ACTIVE_PIPELINE_AGENTS[1]` | ✅ Continuará existindo para leads inbound |
| Stage `respondeu` no pipeline | `PipelineStage` type | ✅ Usado pelo Agente de Disparos (mesma stage real) |

### 6.2 O QUE SERÁ ESTENDIDO

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| Override de prompt em ai-pipeline-agent | `ai-pipeline-agent/index.ts` ~L2295 | Quando lead é de broadcast e stage é `respondeu`: carregar prompt de `agente_disparos` |
| Row em ai_stage_config | Migration | `pipeline_stage = 'agente_disparos'`, `is_active = false`, com prompt dedicado |
| Seção na UI de IA | `AIAgentsView.tsx` | Seção separada "Agentes Especiais" (NÃO no array ACTIVE_PIPELINE_AGENTS) |
| Prompt PDF para disparos | `aiPipelinePdfPrompts.ts` | Prompt com tom outbound |

### 6.3 O QUE NÃO DEVE SER ALTERADO

- Agente de Respondeu (prompt, toggle, config) — intocado
- Stage `respondeu` no pipeline — o lead continua em `respondeu`, apenas o PROMPT muda
- Movimentação de etapa (novo_lead → respondeu) — continua automática pelo agente
- Side-effects V6, V7, V9, V10, V11 — continuam operando normalmente
- `STAGE_TRANSITION_MAP` — não alterar

### 6.4 Detecção Determinística de Lead de Broadcast (CORREÇÃO vs v1)

**Problema no v1:** Usava `leads.canal` com whitelist de canais inbound. Frágil porque:
- `canal` pode ser sobrescrito por broadcasts (um lead inbound que recebe broadcast mudaria para 'cold_list')
- Canal 'other' é ambíguo
- Novos canais precisariam de atualização da whitelist

**Solução v2:** Verificar diretamente na tabela `broadcast_recipients`:

```sql
SELECT EXISTS (
  SELECT 1 FROM broadcast_recipients
  WHERE lead_id = :lead_id
    AND status = 'sent'
  LIMIT 1
) AS is_from_broadcast;
```

**Vantagens:**
- Determinístico: lead tem row em `broadcast_recipients` → é de broadcast. Sem row → não é.
- Não depende de `canal` (que pode ser sobrescrito)
- Não depende de whitelist/heurística
- Funciona mesmo para leads que existiam antes do broadcast

**Performance:**
- Query simples com índice existente: `idx_broadcast_recipients_campaign_status` (campaign_id, status)
- Precisa de novo índice em `(lead_id)` para performance — incluir na migration

### 6.5 Roteamento no ai-pipeline-agent

**Ponto de inserção:** APÓS carregar `stageConfig` para `currentStage` (~L2295), ANTES de montar o prompt:

```typescript
// ROTEAMENTO PARA AGENTE DE DISPAROS
let effectiveAgentType = 'standard';
if (currentStage === 'respondeu') {
  // Check determinístico: lead veio de broadcast?
  const { count } = await supabase
    .from('broadcast_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('status', 'sent')
    .limit(1);
  
  if ((count ?? 0) > 0) {
    // Tentar carregar config do agente de disparos
    const { data: disparosConfig } = await supabase
      .from('ai_stage_config')
      .select('*')
      .eq('org_id', leadOrgId)
      .eq('pipeline_stage', 'agente_disparos')
      .maybeSingle();
    
    if (disparosConfig?.is_active) {
      stageConfig = disparosConfig;
      effectiveAgentType = 'disparos';
      console.log(`🎯 [${runId}] Routed to Agente de Disparos (broadcast lead detected via broadcast_recipients)`);
    }
  }
}
```

**Regra de transição da lógica:**
1. Se `currentStage !== 'respondeu'` → agente padrão da etapa (sem check de broadcast)
2. Se `currentStage === 'respondeu'` e lead TEM row em `broadcast_recipients` com `status='sent'` → agente de disparos
3. Se `currentStage === 'respondeu'` e lead NÃO TEM row → agente de respondeu (padrão)
4. Se agente de disparos desabilitado (`is_active = false`) → fallback para agente de respondeu

### 6.6 Isolamento de Comportamento

**Lead inbound NUNCA é roteado para Disparos:**
- Check baseado em `broadcast_recipients`, não em `canal`
- Lead sem row em `broadcast_recipients` → condição `(count ?? 0) > 0` é `false` → skip
- Mesmo que `canal` = 'cold_list' por algum motivo legacy, sem row em `broadcast_recipients` → sem roteamento

**Lead de broadcast NÃO é bloqueado na pipeline:**
- A etapa real do lead continua sendo `respondeu`
- Apenas o PROMPT é substituído (não a stage)
- Movimentação (respondeu → chamada_agendada / visita_agendada) funciona normalmente
- Side-effects (V6, V7, V9, V11) operam sobre a stage real `respondeu`

**Colisão com Agente de Respondeu:**
- Impossível: o check é mutuamente exclusivo (lead tem ou não row em broadcast_recipients)
- Se o agente de disparos está desabilitado, o lead usa o agente de respondeu normalmente (fallback)

### 6.7 Continuidade na Pipeline

Após o lead ser qualificado pelo Agente de Disparos:
- Move para `chamada_agendada` ou `visita_agendada` (mesma lógica do Respondeu)
- A partir dessa etapa, o check de broadcast NÃO é mais executado (só roda em `currentStage === 'respondeu'`)
- Lead segue pipeline normalmente com agentes padrão

### 6.8 Auditoria

Log no ai-pipeline-agent quando roteamento ocorre:
```json
{
  "action_type": "agent_routed_to_disparos",
  "details": {
    "runId": "...",
    "lead_id": 123,
    "lead_canal": "cold_list",
    "broadcast_recipient_found": true,
    "effective_agent": "disparos"
  }
}
```

---

## 7. MODELO DE DADOS FINAL

### 7.1 Nova Tabela: `scheduled_agent_jobs`

```sql
CREATE TABLE IF NOT EXISTS public.scheduled_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('post_call', 'follow_up')),
  scheduled_at timestamptz NOT NULL,
  executed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  guard_stage text,
  cancelled_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice principal: cron query
CREATE INDEX idx_sched_jobs_pending ON scheduled_agent_jobs (scheduled_at)
  WHERE status = 'pending';

-- Índice para cancelamento bulk por lead
CREATE INDEX idx_sched_jobs_lead_type_status ON scheduled_agent_jobs (lead_id, agent_type, status);

-- Índice para monitoramento por org
CREATE INDEX idx_sched_jobs_org_status ON scheduled_agent_jobs (org_id, status);
```

### 7.2 RPC: `claim_due_agent_jobs`

```sql
CREATE OR REPLACE FUNCTION public.claim_due_agent_jobs(p_limit int DEFAULT 20)
RETURNS TABLE (
    job_id uuid,
    org_id uuid,
    lead_id bigint,
    agent_type text,
    guard_stage text,
    payload jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH due AS (
        SELECT j.id
        FROM public.scheduled_agent_jobs j
        WHERE j.status = 'pending'
          AND j.scheduled_at <= now()
        ORDER BY j.scheduled_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.scheduled_agent_jobs j
        SET status = 'processing', updated_at = now()
        FROM due
        WHERE j.id = due.id
        RETURNING j.id, j.org_id, j.lead_id, j.agent_type, j.guard_stage, j.payload, j.created_at
    )
    SELECT u.id, u.org_id, u.lead_id, u.agent_type, u.guard_stage, u.payload, u.created_at
    FROM updated u;
END;
$$;
```

### 7.3 Novos Campos na Tabela `leads`

```sql
-- Follow Up state (cache para UI + controle independente)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_step integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_exhausted_seen boolean NOT NULL DEFAULT true;

-- Motivo de perda (confirmado: NÃO existe na tabela)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason text;

COMMENT ON COLUMN public.leads.follow_up_enabled IS 'Habilita/desabilita follow up para este lead, INDEPENDENTE de ai_enabled';
COMMENT ON COLUMN public.leads.follow_up_step IS 'Step atual do cyiclo de follow up (0=idle, 1-5=steps, 5=exaurido). Cache para UI.';
COMMENT ON COLUMN public.leads.follow_up_exhausted_seen IS 'true = modal de exaustão já foi visto/dismissed. false = precisa exibir modal.';
COMMENT ON COLUMN public.leads.lost_reason IS 'Motivo de perda quando lead é movido para Perdido';
```

### 7.4 Novo Índice em `broadcast_recipients`

```sql
-- Para lookup determinístico de "lead veio de broadcast?"
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_lead_id
  ON public.broadcast_recipients (lead_id);
```

### 7.5 Novas Rows em `ai_stage_config`

Inserir para CADA org existente (via script ou migration):

```sql
-- Agente de Chamada Realizada
INSERT INTO public.ai_stage_config (org_id, pipeline_stage, is_active, default_prompt, agent_goal)
VALUES (:org_id, 'chamada_realizada', false, :prompt_chamada_realizada, 'Enviar mensagem pós-ligação conduzindo ao próximo passo')
ON CONFLICT (org_id, pipeline_stage) DO NOTHING;

-- Agente de Follow Up
INSERT INTO public.ai_stage_config (org_id, pipeline_stage, is_active, default_prompt, agent_goal)
VALUES (:org_id, 'follow_up', false, :prompt_follow_up, 'Reengajar lead que parou de responder')
ON CONFLICT (org_id, pipeline_stage) DO NOTHING;

-- Agente de Disparos
INSERT INTO public.ai_stage_config (org_id, pipeline_stage, is_active, default_prompt, agent_goal)
VALUES (:org_id, 'agente_disparos', false, :prompt_disparos, 'Qualificar lead outbound oriundo de disparo')
ON CONFLICT (org_id, pipeline_stage) DO NOTHING;
```

**Nota:** `pipeline_stage` é TEXT sem constraint — aceita valores arbitrários (confirmado na migration `20260205_ai_system_schema.sql` e `20260218_m7_2_ai_tables_hardening.sql`). Constraint é `UNIQUE(org_id, pipeline_stage)`, que é satisfeita por `ON CONFLICT DO NOTHING`.

### 7.6 Resumo de Mudanças de Dados

| Mudança | Tipo | Risco de Regressão |
|---------|------|-------------------|
| `CREATE TABLE scheduled_agent_jobs` | Tabela nova | ZERO |
| `CREATE FUNCTION claim_due_agent_jobs` | RPC nova | ZERO |
| `ADD COLUMN leads.follow_up_enabled` | Campo novo, default `true` | ZERO |
| `ADD COLUMN leads.follow_up_step` | Campo novo, default `0` | ZERO |
| `ADD COLUMN leads.follow_up_exhausted_seen` | Campo novo, default `true` | ZERO |
| `ADD COLUMN leads.lost_reason` | Campo novo, nullable | ZERO |
| `CREATE INDEX broadcast_recipients(lead_id)` | Índice novo | ZERO (read performance) |
| `INSERT INTO ai_stage_config` (3 rows per org) | Dados novos, `is_active=false` | ZERO (opt-in) |

Todas as mudanças são aditivas (ADD COLUMN, CREATE TABLE, INSERT). Nenhum dado existente é alterado ou removido. Defaults são seguros.

---

## 8. ORQUESTRAÇÃO E JOBS

### 8.1 Edge Function: `process-agent-jobs`

**Novo arquivo:** `supabase/functions/process-agent-jobs/index.ts`

**Cron:** Supabase Cron, executada a cada minuto (ou 2 minutos — **HIPÓTESE A VALIDAR** sobre frequência mínima do Supabase Cron Cloud).

**Padrão:** Cópia fiel do `process-reminders`:
1. Criar Supabase client com service role key
2. `supabase.rpc('claim_due_agent_jobs', { p_limit: 20 })` — atomic claim
3. Loop por cada job claimado
4. Para cada job:
   a. Billing check: `checkLimit(supabase, orgId, 'max_automations_month', 1)`
   b. Guards específicos por `agent_type` (ver seções 4.5 e 5.11)
   c. Se guard falha → `UPDATE scheduled_agent_jobs SET status='cancelled', cancelled_reason=...`
      **IMPORTANTE:** guard de org desabilitada e de lead desabilitado CANCELAM o job (não pula) — ver REGRA ANTI-FILA-ÓRFÃ na seção 5.11
   d. Se guard passa → `supabase.functions.invoke('ai-pipeline-agent', { body: ... })`
   e. Se sucesso → `UPDATE scheduled_agent_jobs SET status='completed', executed_at=now()`
   f. Se erro → `UPDATE scheduled_agent_jobs SET status='failed', retry_count=retry_count+1`
5. Se `status='failed'` e `retry_count < 3` → reverter para `pending` (retry)
6. `recordUsage(supabase, { ... })` após sucesso

**Payload para ai-pipeline-agent por agent_type:**

| agent_type | Payload |
|-----------|---------|
| `post_call` | `{ leadId, instanceName: job.payload.instance_name, interactionId: null, triggerType: 'scheduled_post_call', extraContext: { comment_text: job.payload.comment_text } }` |
| `follow_up` | `{ leadId, instanceName, interactionId: null, triggerType: 'follow_up', extraContext: { fu_step: job.payload.fu_step, last_outbound_at: job.payload.last_outbound_at } }` |

**Instance name resolution para follow_up:**
- `leads.instance_name` pode ser null (raro, mas possível para leads legacy)
- Se null: buscar instância conectada da org via `whatsapp_instances` (mesma lógica de `process-reminders`)

### 8.2 Stuck Job Recovery

Jobs com `status = 'processing'` há mais de 5 minutos são considerados stuck:

```sql
-- Executar no início de cada run do cron
UPDATE scheduled_agent_jobs
SET status = 'pending', updated_at = now(), retry_count = retry_count + 1
WHERE status = 'processing'
  AND updated_at < now() - interval '5 minutes'
  AND retry_count < 3;

-- Jobs com retry_count >= 3 ficam em 'processing' permanentemente 
-- (equivalente a dead letter queue — monitorar via dashboard)
UPDATE scheduled_agent_jobs
SET status = 'failed', cancelled_reason = 'max_retries_exceeded'
WHERE status = 'processing'
  AND updated_at < now() - interval '5 minutes'
  AND retry_count >= 3;
```

### 8.3 Sequência Completa de Follow Up (Orquestração)

```
Bot/Vendedor envia mensagem outbound
    │
    ├─ CANCEL: UPDATE scheduled_agent_jobs SET status='cancelled'
    │          WHERE lead_id=X AND agent_type='follow_up' AND status='pending'
    │
    ├─ RESET: UPDATE leads SET follow_up_step=0 WHERE id=X
    │
    └─ SCHEDULE: INSERT scheduled_agent_jobs {
         agent_type: 'follow_up',
         lead_id: X, 
         scheduled_at: now() + 3h,
         status: 'pending',
         payload: { fu_step: 1, last_outbound_at: now(), original_stage: currentStage }
       }

... 3h depois, sem resposta do lead...

process-agent-jobs claims job
    │
    ├─ Guards (5.11) → todos ok
    │
    ├─ supabase.functions.invoke('ai-pipeline-agent', {
    │    body: { leadId, instanceName, triggerType: 'follow_up', 
    │            extraContext: { fu_step: 1 } }
    │  })
    │
    ├─ ai-pipeline-agent:
    │    ├─ Skip quiet-window
    │    ├─ Skip ai_enabled gate → check follow_up_enabled
    │    ├─ Load prompt from ai_stage_config WHERE pipeline_stage='follow_up'
    │    ├─ Inject FOLLOW UP context (step 1/5)
    │    ├─ OpenAI call → generate message
    │    └─ Send via Evolution API
    │
    ├─ UPDATE leads SET follow_up_step=1 WHERE id=X
    │
    ├─ SCHEDULE next: INSERT scheduled_agent_jobs {
    │    agent_type: 'follow_up',
    │    lead_id: X,
    │    scheduled_at: now() + 1d,
    │    payload: { fu_step: 2 }
    │  }
    │
    └─ UPDATE scheduled_agent_jobs SET status='completed' WHERE id=job.id

... 1 dia depois, sem resposta...

(repete para steps 2-5)

... step 5 enviado...

    ├─ UPDATE leads SET follow_up_step=5, follow_up_exhausted_seen=false WHERE id=X
    └─ NÃO agenda próximo (sequência exaurida)

... vendedor abre o lead no frontend...

    Frontend renderiza lead com follow_up_step=5 e follow_up_exhausted_seen=false
        └─ Exibe FollowUpExhaustedModal
            ├─ Vendedor escolhe ação
            └─ UPDATE leads SET follow_up_exhausted_seen=true
```

---

## 9. UI / CONFIGURAÇÃO

### 9.1 Onde os Novos Agentes Aparecem na Aba IA

**Decisão arquitetural:** Os 3 novos agentes NÃO são todos tratados da mesma forma na UI.

| Agente | Estratégia na UI | Motivo |
|--------|-----------------|--------|
| **Chamada Realizada** | Adicionar em `ACTIVE_PIPELINE_AGENTS[]` normalmente | `'chamada_realizada'` JÁ é `PipelineStage` válido. AIAgentsView.tsx itera o array e renderiza automaticamente. `PIPELINE_STAGES['chamada_realizada']` já tem icon/color. |
| **Follow Up** | Seção SEPARADA em AIAgentsView.tsx | `'follow_up'` NÃO é `PipelineStage` — adicioná-lo ao type quebraria todas as tipagens, PipelineView, queries, etc. Render como seção dedicada com toggle e editor de prompt. |
| **Disparos** | Seção SEPARADA em AIAgentsView.tsx | `'agente_disparos'` NÃO é `PipelineStage`. Mesmo motivo. Render na mesma seção de "Agentes Especiais". |

### 9.2 Agente de Chamada Realizada — Encaixe na UI

**Mudança em `aiPipelineAgents.ts`:**

```typescript
// Remover de INACTIVE_STAGES_REASONS:
// chamada_realizada: 'Operação manual do vendedor',  ← REMOVER esta linha

// Adicionar em ACTIVE_PIPELINE_AGENTS (posição: após nao_compareceu, index ~3):
{
  stage: 'chamada_realizada',
  label: 'Chamada Realizada',
  objective: 'Enviar mensagem pós-ligação conduzindo ao próximo passo',
  nextStages: 'Aguardando Proposta, Visita Agendada',
  defaultPrompt: AI_PIPELINE_STAGE_PROMPTS_PDF.chamada_realizada,
}
```

**Efeito automático:**
- AIAgentsView.tsx renderiza card com toggle + "Editar Prompt" ✅
- `activeCount/ACTIVE_PIPELINE_AGENTS.length` atualiza automaticamente ✅
- `PIPELINE_STAGES['chamada_realizada']` já existe com icon ✅ e color ✅
- `updateStageConfig('chamada_realizada', { is_active: true })` faz upsert em ai_stage_config ✅

### 9.3 Follow Up e Disparos — Seção Especial em AIAgentsView

**Nova seção após "Agentes de Pipeline":**

```tsx
{/* Agentes Especiais */}
<div className="space-y-3 mt-6">
  <div>
    <h2 className="text-base font-semibold text-slate-800">Agentes Especiais</h2>
    <p className="text-xs text-slate-500 mt-0.5">
      Agentes que operam de forma transversal, sem etapa fixa na pipeline.
    </p>
  </div>
  
  {/* Agente de Follow Up */}
  <SpecialAgentCard
    stage="follow_up"
    label="Follow Up Automático"
    icon="🔄"
    objective="Reengajar leads que pararam de responder (5 tentativas)"
    description="Opera independente da IA geral — funciona mesmo com IA pausada"
    config={stageConfigs.find(c => c.status_pipeline === 'follow_up')}
    onToggle={async (checked) => {
      await updateStageConfig('follow_up', { is_active: checked });
      if (!checked) {
        // ANTI-FILA-ÓRFÃ: Cancelar todos jobs follow_up pendentes da org
        await supabase.from('scheduled_agent_jobs')
          .update({ status: 'cancelled', cancelled_reason: 'org_agent_disabled' })
          .eq('org_id', orgId)
          .eq('agent_type', 'follow_up')
          .eq('status', 'pending');
        // Reset follow_up_step para todos leads da org
        await supabase.from('leads')
          .update({ follow_up_step: 0 })
          .eq('org_id', orgId)
          .gt('follow_up_step', 0);
      }
    }}
    onEditPrompt={() => handleEditSpecialPrompt('follow_up')}
  />
  
  {/* Agente de Disparos */}
  <SpecialAgentCard
    stage="agente_disparos"
    label="Agente de Disparos"
    icon="📢"
    objective="Qualificar leads outbound oriundos de campanhas de disparo"
    description="Ativado quando leads de broadcast respondem (em vez do Agente de Respondeu)"
    config={stageConfigs.find(c => c.status_pipeline === 'agente_disparos')}
    onToggle={(checked) => updateStageConfig('agente_disparos', { is_active: checked })}
    onEditPrompt={() => handleEditSpecialPrompt('agente_disparos')}
  />
</div>
```

**`SpecialAgentCard` NÃO usa `PIPELINE_STAGES[stage]`** — tem icon e label passados explicitamente, evitando lookup em tipo `PipelineStage`.

### 9.4 Configuração do Follow Up por Lead

Precisa de toggle individual por lead na UI. Locais possíveis:
- `ActionsPanel.tsx` — junto ao toggle de `ai_enabled`
- Ou diretamente no `ConversationList.tsx` como ação de contexto

**Recomendação:** Adicionar toggle "Follow Up" no `ActionsPanel.tsx`, junto ao toggle de IA existente, com label "Follow Up Automático" e comportamento independente.

### 9.5 `stageConfigs` Query — Já Retorna Rows com pipeline_stage Arbitrário?

**Verificação do código** (`useAISettings.ts`): a query de `stageConfigs` faz:
```typescript
const { data } = await supabase
  .from('ai_stage_config')
  .select('*')
  .eq('org_id', orgId);
```

**SIM** — retorna TODAS as rows da org, incluindo pipeline_stage = 'follow_up', 'agente_disparos', etc. O `stageConfigs.find(c => c.status_pipeline === 'follow_up')` funcionará.

**O campo retornado se chama `status_pipeline` ou `pipeline_stage`?**
Verificação: AIAgentsView.tsx L512 usa `c.status_pipeline`. Isso sugere que o alias no frontend é `status_pipeline`. Na migration real, a coluna chama `pipeline_stage`. O mapeamento provavelmente existe no Supabase query types ou no hook. **HIPÓTESE A VALIDAR:** confirmar se `c.status_pipeline === 'follow_up'` funciona ou se precisa usar `c.pipeline_stage`.

### 9.6 FollowUpIndicator — Componente de 5 Luzes

**Novo arquivo:** `src/components/solarzap/FollowUpIndicator.tsx`

**Props:**
```typescript
interface FollowUpIndicatorProps {
  step: number;         // 0-5, de leads.follow_up_step
  enabled: boolean;     // leads.follow_up_enabled
  compact?: boolean;    // true para ConversationList, false para PipelineView
}
```

**Renderização:**
- 5 círculos/dots inline
- Step <= N: dot preenchido (ex: verde)
- Step > N: dot vazio (ex: cinza)
- Se `enabled = false`: todos cinza com opacidade reduzida
- Se `step = 0`: nenhum dot preenchido, todos cinza
- Se `step = 5`: todos preenchidos + cor vermelha (exaurido)

**Integração:**
- `ConversationList.tsx` — junto ao badge de pipeline stage do item (compact=true)
- `PipelineView.tsx` — no card do lead (compact=false, abaixo do nome)
- `ContactsView.tsx` — coluna ou badge inline (compact=true)

### 9.7 Dados Necessários na Query de Leads

Os campos `follow_up_step`, `follow_up_enabled`, `follow_up_exhausted_seen` precisam ser carregados nas queries de leads. Pontos de alteração:

- `useLeads.ts` — query principal de leads → adicionar `.select('*, follow_up_step, follow_up_enabled, follow_up_exhausted_seen')`
- Mapeamento no `Contact` type → adicionar:
  ```typescript
  followUpStep?: number;
  followUpEnabled?: boolean;
  followUpExhaustedSeen?: boolean;
  ```

---

## 10. REGRAS DE SEGURANÇA / NÃO REGRESSÃO

### 10.1 Fluxos que NUNCA Devem Quebrar

| Fluxo | Proteção |
|-------|---------|
| Agentes existentes (novo_lead, respondeu, etc) | Nenhuma mudança no roteamento padrão. Override de Disparos só ativa para `currentStage === 'respondeu'` + broadcast confirmado. |
| Leads inbound NÃO são roteados para Disparos | Check baseado em `broadcast_recipients` — lead sem row nunca é roteado |
| Toggle ai_enabled funciona como antes | NÃO tocamos no lifecycle de ai_enabled. Follow up usa campo separado. |
| Seller takeover funciona como antes | NÃO tocamos no whatsapp-webhook/useChat.ts takeover logic |
| Pipeline UI funciona sem erros | PipelineStage type NÃO é alterado. Novos agentes usam seção separada na UI. |
| Movimentação de etapa | STAGE_TRANSITION_MAP NÃO é alterado |
| Quiet-window / yield guard / burst logic | NÃO tocado. Scheduled triggers pulam esta lógica com flag. |

### 10.2 Guards Obrigatórios — Resumo Consolidado

**Antes de enviar qualquer mensagem agendada:**

| # | Check | Post Call | Follow Up |
|---|-------|-----------|-----------|
| 1 | Agente habilitado por org | is_active em ai_stage_config para 'chamada_realizada' | is_active em ai_stage_config para 'follow_up' (cancel se false — ANTI-FILA-ÓRFÃ) |
| 2 | Controle por lead | `lead.ai_enabled = true` (cancel se false — DECISÃO v2.1) | `lead.follow_up_enabled = true` (cancel se false — ANTI-FILA-ÓRFÃ) |
| 3 | Guard de stage | `lead.status_pipeline === job.guard_stage` | Stage NÃO é terminal |
| 4 | Lead respondeu? | `lead_responded_since_scheduling → cancel` | `lead_responded_since_scheduling → cancel` |
| 5 | Outbound recente (<60s) | `cancel` | `cancel` |
| 6 | Instância WhatsApp ativa | obrigatório | obrigatório |
| 7 | Billing/quota | `checkLimit()` | `checkLimit()` |

### 10.3 Colisões entre Agentes

| Cenário | Resolução |
|---------|-----------|
| Follow up + post call no mesmo lead | Não conflitam: post call é para `chamada_realizada`, follow up opera em qualquer stage |
| Follow up + agente padrão (lead responde) | Lead responde → webhook cancela follow-ups → agente padrão responde |
| Disparos + respondeu | Mutuamente exclusivos: check de broadcast_recipients decide qual prompt |
| Follow up + disparos | Follow up pode disparar para leads de broadcast — comportamento desejado (lead não respondeu à qualificação outbound) |
| Dois cron ticks simultâneos | `FOR UPDATE SKIP LOCKED` no RPC |

### 10.4 Race Conditions

| Cenário | Mitigação |
|---------|-----------|
| Lead responde milissegundos antes do job executar | Guard verifica inbound recente. Se existe → cancel. |
| Mesmo job claimado por dois workers | `FOR UPDATE SKIP LOCKED` garante claim exclusivo |
| Job stuck (edge function crash) | Recovery automático: `processing` > 5min → `pending` com retry |
| Two follow-up jobs pending para mesmo lead | Cancel bulk antes de agendar novo. RPC `DISTINCT ON (lead_id)` como safety net. |
| Org desabilita follow-up com jobs pendentes | Toggle OFF → cancel batch imediato (UI) + guard no cron cancela remanescentes. Reativar toggle NÃO ressuscita jobs cancelados. |

---

## 11. PLANO FINAL DE IMPLEMENTAÇÃO

### BLOCO 1 — Modelo de Dados
**Ações:**
1. Criar migration com:
   - `CREATE TABLE scheduled_agent_jobs`
   - `CREATE FUNCTION claim_due_agent_jobs`
   - `ALTER TABLE leads ADD COLUMN follow_up_enabled`, `follow_up_step`, `follow_up_exhausted_seen`, `lost_reason`
   - `CREATE INDEX idx_broadcast_recipients_lead_id`
   - `INSERT INTO ai_stage_config` (3 rows per org, is_active=false)
2. Aplicar em staging

**Depende de:** Nada  
**Risk:** Zero (tudo aditivo)  
**Checklist:**
- [ ] Migration executa sem erro
- [ ] Tabela `scheduled_agent_jobs` existe e aceita INSERT
- [ ] RPC `claim_due_agent_jobs` retorna vazio sem erro
- [ ] Leads existentes têm `follow_up_step=0`, `follow_up_enabled=true`, `follow_up_exhausted_seen=true`
- [ ] `ai_stage_config` tem rows para 'chamada_realizada', 'follow_up', 'agente_disparos' por org

---

### BLOCO 2 — Edge Function: process-agent-jobs
**Ações:**
1. Criar `supabase/functions/process-agent-jobs/index.ts` (cópia do padrão process-reminders)
2. Implementar: claim → guards → invoke → update status
3. Implementar stuck job recovery
4. Configurar Supabase Cron

**Depende de:** Bloco 1  
**Checklist:**
- [ ] Deploy sem erro
- [ ] Cron dispara (verificar logs)
- [ ] Job pendente com `scheduled_at` no passado é processado
- [ ] Job com guard falho → status='cancelled' com reason
- [ ] Job stuck > 5min → revertido para pending (retry)

---

### BLOCO 3 — Agente de Chamada Realizada
**Ações:**
1. Adicionar em `ACTIVE_PIPELINE_AGENTS` + remover de `INACTIVE_STAGES_REASONS`
2. Adicionar prompt em `aiPipelinePdfPrompts.ts` + `DEFAULT_PROMPTS_BY_STAGE`
3. Em `SolarZapLayout.tsx` handleCallConfirm: INSERT em `scheduled_agent_jobs` após comentário
4. Em `ai-pipeline-agent/index.ts`: aceitar `triggerType: 'scheduled_post_call'` (skip quiet-window, injetar contexto)
5. Testes

**Depende de:** Blocos 1, 2  
**Checklist:**
- [ ] Agente aparece na aba IA com toggle
- [ ] Confirmar ligação → job agendado para +5min
- [ ] Job processado → mensagem enviada com referência ao feedback
- [ ] Lead respondeu antes dos 5min → job cancelado
- [ ] Stage mudou → job cancelado
- [ ] Sem duplicação de mensagens

---

### BLOCO 4 — Agente de Disparos
**Ações:**
1. Adicionar prompt em `aiPipelinePdfPrompts.ts`
2. Em `ai-pipeline-agent/index.ts` (~L2295): override de prompt para broadcast leads
3. Seção "Agentes Especiais" em `AIAgentsView.tsx`
4. Testes

**Depende de:** Bloco 1  
**Checklist:**
- [ ] Lead com broadcast_recipient → log "Routed to Agente de Disparos"
- [ ] Lead sem broadcast_recipient → prompt de Respondeu (padrão)
- [ ] Agente de Disparos desabilitado → fallback para Respondeu
- [ ] Toggle funciona na UI
- [ ] Prompt editável

---

### BLOCO 5 — Agente de Follow Up (Backend)
**Ações:**
1. Em `ai-pipeline-agent/index.ts`:
   - Aceitar `triggerType: 'follow_up'` (skip quiet-window, PULAR ai_enabled gate)
   - Após outbound: cancelar follow-ups anteriores + agendar step 1
2. Em `whatsapp-webhook/index.ts`:
   - Cancelar follow-ups pendentes ao receber inbound
   - Agendar follow-up ao detectar seller message
3. Follow-up logic em process-agent-jobs: guards, sequential scheduling, step update
4. Testes

**Depende de:** Blocos 1, 2  
**Checklist:**
- [ ] Outbound → follow-up step 1 agendado +3h
- [ ] Step 1 enviado → step 2 agendado +1d
- [ ] Sequência completa 3h→1d→2d→3d→7d
- [ ] Lead responde → todos follow-ups cancelados, step=0
- [ ] ai_enabled=false + follow_up_enabled=true → follow-up funciona
- [ ] follow_up_enabled=false → follow-up NÃO funciona
- [ ] Múltiplas outbounds → apenas 1 sequência (cancel+reschedule)

---

### BLOCO 6 — Agente de Follow Up (UI)
**Ações:**
1. Componente `FollowUpIndicator.tsx` (5 luzes)
2. Componente `FollowUpExhaustedModal.tsx` (modal + motivo obrigatório)
3. Integrar em ConversationList, PipelineView, ContactsView
4. Integrar modal em SolarZapLayout
5. Toggle de follow_up_enabled no ActionsPanel
6. Seção especial de Follow Up em AIAgentsView

**Depende de:** Bloco 5  
**Checklist:**
- [ ] 5 luzes renderizam corretamente (0-5 steps)
- [ ] Luzes cinza quando follow_up_enabled=false
- [ ] Modal aparece quando step=5 + exhausted_seen=false
- [ ] Modal NÃO reaparece após dismiss (exhausted_seen=true)
- [ ] "Mover para Perdido" exige motivo
- [ ] Toggle "Follow Up" funciona no ActionsPanel
- [ ] Toggle na aba IA funciona por org

---

### BLOCO 7 — Prompts Production-Ready
**Ações:**
1. Escrever prompts detalhados para os 3 agentes (estilo existente)
2. Adicionar a `aiPipelinePdfPrompts.ts`
3. Seed em staging/produção via migration
4. Validar na UI (edit/restore default)

**Depende de:** Blocos 3, 4, 5  
**Checklist:**
- [ ] Prompts aparecem na UI
- [ ] Edição e salvamento funcionam
- [ ] Restaurar padrão funciona
- [ ] Versionamento incrementa

---

### BLOCO 8 — Testes e Rollout
**Ações:**
1. Testes unitários para guards e regras
2. Testes de integração para fluxo completo
3. Smoke tests E2E
4. Rollout gradual (1 org teste → validar → todas)

**Depende de:** Todos os blocos  

---

## 12. PLANO FINAL DE TESTES

### 12.1 Testes Críticos de Follow Up com Independência de ai_enabled

| Teste | Setup | Ação | Resultado Esperado |
|-------|-------|------|-------------------|
| FU habilitado + IA geral pausada | `ai_enabled=false, follow_up_enabled=true` | Job follow_up vence | Mensagem ENVIADA |
| FU desabilitado + IA geral ativa | `ai_enabled=true, follow_up_enabled=false` | Job follow_up vence | Job CANCELADO (follow_up_enabled=false) |
| Vendedor manda msg manual → takeover | ai_enabled=false, follow_up_enabled=true | Job follow_up agendado pela msg do vendedor vence | Mensagem de follow up ENVIADA. IA conversacional NÃO responde (separado). |
| Toggle manual IA off (sem mensagem) | Toggle ai_enabled=false via UI | Job follow_up vence | Mensagem ENVIADA (follow_up_enabled não afetado) |
| Toggle follow_up_enabled off | Toggle follow_up_enabled=false via UI | Jobs follow_up pendentes | Jobs CANCELADOS. Nenhum novo agendado. |
| Org desabilita follow-up + reativa depois | 3 jobs pending, toggle OFF, espera, toggle ON | Jobs durante OFF | Jobs CANCELADOS no momento do OFF. Toggle ON NÃO ressuscita jobs. Novos jobs só surgem com novas outbounds. |
| Org desabilita + cron processa job remanescente | Toggle OFF, 1 job escapa cancel batch (race) | Cron claims o job | Guard 1 no cron → job CANCELADO com `org_agent_disabled`. Não envia. |

### 12.2 Testes de Unicidade de Sequência

| Teste | Setup | Ação | Resultado Esperado |
|-------|-------|------|-------------------|
| Outbound + outbound em sequência | Bot envia, follow-up step 1 agendado | Bot envia novamente antes do step 1 | Step 1 anterior CANCELADO. Novo step 1 agendado (+3h). |
| Vendedor + bot em sequência | Vendedor envia, follow-up agendado | Bot responde mensagem inbound antes do step 1 | Step 1 anterior CANCELADO. Novo step 1 agendado. |
| Parallel job prevention | 2 jobs follow_up pending para mesmo lead | Cron processa | Apenas 1 processado (DISTINCT ON lead_id ou cancel prévio). |

### 12.3 Testes de Reset e Modal

| Teste | Setup | Ação | Resultado Esperado |
|-------|-------|------|-------------------|
| Reset por resposta | follow_up_step=3, job step 4 pending | Lead responde | Jobs cancelados, step=0 |
| Modal aparece corretamente | step=5, exhausted_seen=false | Vendedor abre lead | Modal exibido |
| Modal NÃO reaparece | step=5, exhausted_seen=true | Vendedor abre lead | Modal NÃO exibido |
| Modal com ação "Perdido" | step=5, modal aberto | Vendedor seleciona "Perdido" + preenche motivo | lead → perdido, lost_reason salvo, comentário criado, step=0, follow_up_enabled=false |
| Modal com "Manter" | step=5, modal aberto | Vendedor clica "Manter" | exhausted_seen=true, lead fica na etapa atual |

### 12.4 Testes do Agente de Disparos

| Teste | Setup | Ação | Resultado Esperado |
|-------|-------|------|-------------------|
| Lead de broadcast responde | lead com row em broadcast_recipients(status=sent), stage=respondeu | Lead envia mensagem | Prompt de Disparos carregado (log: "Routed to Agente de Disparos") |
| Lead inbound responde | lead SEM row em broadcast_recipients, stage=respondeu | Lead envia mensagem | Prompt de Respondeu carregado (padrão) |
| Lead de broadcast, agente desabilitado | broadcast_recipients exists, ai_stage_config('agente_disparos').is_active=false | Lead envia mensagem | Fallback para prompt de Respondeu |
| Lead de broadcast em outra stage | broadcast_recipients exists, stage=proposta_negociacao | Lead envia mensagem | Prompt de proposta_negociacao (check só roda para stage=respondeu) |

### 12.5 Testes do Agente de Chamada Realizada

| Teste | Setup | Ação | Resultado Esperado |
|-------|-------|------|-------------------|
| Fluxo completo | Lead em chamada_agendada | Confirmar ligação + feedback "Cliente interessado em 5kW" | Job agendado +5min → msg enviada com referência ao feedback |
| Lead responde antes dos 5min | Job pendente +5min | Lead envia mensagem | Job CANCELADO (lead_responded_before_execution) |
| Stage muda antes dos 5min | Job pendente +5min, vendedor move lead | Cron processa | Job CANCELADO (stage_changed) |
| Feedback vazio | Ligação confirmada sem feedback | Tentar agendar job | Job NÃO agendado (guard no frontend: normalizedFeedback required) |
| Comentário visível no prompt | Job processado | ai-pipeline-agent runs | System prompt contém `CONTEXTO DA LIGAÇÃO` com texto do feedback |

### 12.6 Testes de Concorrência e Edge Cases

| Teste | Resultado Esperado |
|-------|-------------------|
| Dois cron ticks simultâneos | `FOR UPDATE SKIP LOCKED` garante processamento exclusivo |
| Edge function crash durante processing | Job stuck > 5min → revertido para pending (retry) |
| Job com retry_count=3 stuck | Marcado como `failed` com `max_retries_exceeded` |
| Lead deletado com jobs pending | `ON DELETE CASCADE` limpa jobs automaticamente |
| Follow up + post call para mesmo lead | Ambos operam — steps são independentes (agent_type diferente) |

---

## 13. HIPÓTESES A VALIDAR

| # | Hipótese | Como Validar | Impacto se Falsa |
|---|----------|-------------|-----------------|
| H1 | Supabase Cron Cloud suporta frequência de 1 minuto | Testar na dashboard do Supabase: criar cron schedule `*/1 * * * *` | Se mínimo é 5min: ajustar delays de post_call (5min→10min) e follow-up (3h OK). |
| H2 | `stageConfigs.find(c => c.status_pipeline === 'follow_up')` funciona no AIAgentsView | Verificar se a coluna retornada se chama `status_pipeline` ou `pipeline_stage` no hook `useAISettings.ts` | Se o alias é outro: ajustar o `.find()` para usar o nome correto. Risco zero: ajuste trivial. |
| ~~H3~~ | ~~Post-call deve respeitar `ai_enabled = false`~~ | **DECIDIDO na v2.1.** Post-call DEVE respeitar `ai_enabled = false`. Guard adicionado em 4.5 (check #2) e 10.2 (Post Call, check #2). | N/A — hipótese fechada. |
| H4 | `leads.instance_name` é sempre non-null para leads que recebem jobs agendados | Rodar query: `SELECT count(*) FROM leads WHERE instance_name IS NULL AND status_pipeline NOT IN ('perdido','contato_futuro')` | Se > 0: fallback para instância ativa da org via `whatsapp_instances` (mesma lógica de process-reminders). |
| H5 | Broadcast leads sempre têm row em `broadcast_recipients` com `status = 'sent'` | Verificar: `SELECT l.id, br.id FROM leads l LEFT JOIN broadcast_recipients br ON br.lead_id = l.id WHERE l.canal IN ('cold_list','broadcast') AND br.id IS NULL` | Se existirem leads de broadcast sem row: fallback adicional via `leads.canal`. |

**Hipóteses RESOLVIDAS (não restam):**

| Ex-hipótese | Resultado |
|-------------|----------|
| `leads.lost_reason` já existe? | ❌ NÃO existe. Migration necessária. |
| `ai_stage_config` tem CHECK/ENUM em pipeline_stage? | ❌ NÃO tem. É TEXT livre. Seguro. |
| Edge functions podem invocar outras? | ✅ SIM. Padrão `supabase.functions.invoke()` confirmado em whatsapp-webhook. |
| `PipelineStage` type aceita novos valores? | ❌ NÃO. É union estrita. Não estender para follow_up/agente_disparos — usar seção separada na UI. |

---

## 14. LISTA DE ARQUIVOS AFETADOS

### Arquivos a CRIAR

| Arquivo | Propósito | Risco |
|---------|-----------|-------|
| `supabase/migrations/YYYYMMDD_new_pipeline_agents.sql` | Tabela, RPC, colunas, índices, seeds | Zero (aditivo) |
| `supabase/functions/process-agent-jobs/index.ts` | Cron processor para jobs agendados | Zero (função nova) |
| `src/components/solarzap/FollowUpIndicator.tsx` | Componente visual 5 luzes | Zero (componente novo) |
| `src/components/solarzap/FollowUpExhaustedModal.tsx` | Modal pós-5 follow-ups | Zero (componente novo) |

### Arquivos a ESTENDER

| Arquivo | Mudança | Risco | Justificativa |
|---------|---------|-------|--------------|
| `src/constants/aiPipelineAgents.ts` | +1 entry em ACTIVE_PIPELINE_AGENTS, -1 em INACTIVE_STAGES_REASONS, +1 em DEFAULT_PROMPTS_BY_STAGE | Baixo | `chamada_realizada` já é PipelineStage válido |
| `src/constants/aiPipelinePdfPrompts.ts` | +3 prompts (chamada_realizada, follow_up, agente_disparos) | Zero | Novas keys no map |
| `supabase/functions/ai-pipeline-agent/index.ts` | Aceitar novos triggerTypes (skip quiet-window, injetar contexto); override de prompt para broadcast leads em stage respondeu; Agendar follow-up após outbound; PULAR ai_enabled gate para follow_up | Médio | Mudanças cirúrgicas em handler existente. Testáveis isoladamente. |
| `supabase/functions/whatsapp-webhook/index.ts` | Cancelar follow-ups pendentes ao receber inbound; Agendar follow-up ao detectar seller message | Médio | Mudanças pós-processamento, não alteram fluxo existente |
| `src/components/solarzap/SolarZapLayout.tsx` | +INSERT em scheduled_agent_jobs no handleCallConfirm (L644-660) | Baixo | Adição pós-comentário, não altera fluxo |
| `src/components/solarzap/AIAgentsView.tsx` | +Seção "Agentes Especiais" com cards de Follow Up e Disparos | Baixo | Seção adicional, não altera array existente |
| `src/components/solarzap/ConversationList.tsx` | +FollowUpIndicator inline | Baixo | Adição visual, não altera lógica |
| `src/components/solarzap/PipelineView.tsx` | +FollowUpIndicator no card | Baixo | Adição visual, não altera lógica |
| `src/components/solarzap/ContactsView.tsx` | +FollowUpIndicator badge | Baixo | Adição visual, não altera lógica |
| `src/components/solarzap/ActionsPanel.tsx` | +Toggle follow_up_enabled por lead | Baixo | Toggle adicional junto ao existente |
| `src/types/solarzap.ts` | +3 campos no Contact interface (followUpStep, followUpEnabled, followUpExhaustedSeen) | Baixo | Campos opcionais |
| `src/hooks/domain/useLeads.ts` | +Mapeamento dos novos campos no select/mapping | Baixo | Adição ao mapping existente |

### Arquivos que NÃO DEVEM SER ALTERADOS

| Arquivo | Motivo |
|---------|--------|
| `src/types/solarzap.ts` — `PipelineStage` type | NÃO adicionar 'follow_up' ou 'agente_disparos' — quebraria tipagens em toda a base |
| `src/hooks/domain/pipelineStageGuards.ts` | Guards de movimentação global — não tocar |
| `src/hooks/domain/usePipeline.ts` | Lógica de movimentação — não alterar |
| `src/hooks/useAutomationSettings.ts` | Settings de automação global — não alterar |
| `supabase/functions/process-reminders/index.ts` | Reutilizar PADRÃO, criar função nova separada |
| `STAGE_TRANSITION_MAP` em ai-pipeline-agent | Mapa de transições — não alterar |
| Quiet-window / yield guard / burst logic | Mecanismo crítico de estabilização |
| `useLeads.ts` `toggleLeadAiMutation` | NÃO deve afetar `follow_up_enabled` |
| `whatsapp-webhook` seller takeover | NÃO deve desabilitar follow-up |
| `CallConfirmModal.tsx` | Componente visual — sem mudanças |

---

*Fim do Blueprint Final — v2.0*
