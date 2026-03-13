# Master Execution Plan — SolarZap Production Readiness

Data: 2026-03-13
Status: execução sequencial, one-shot, até deploy final

## Referências obrigatórias (ler antes de cada fase)

| Documento | Propósito |
| --- | --- |
| `docs/PRODUCTION_READINESS_AUDIT_AND_FINAL_BLUEPRINT_2026-03-12.md` | Auditoria de produção: lacunas, veredito, blueprint |
| `docs/CHAT_PLAN_IMPLEMENTATION_REPORT_2026-03-13.md` | O que o Codex fez e não fechou |
| `docs/FINAL_REALITY_AUDIT_2026-03-13.md` | Âncora real do estado do código |
| `docs/PLANO_AJUSTES_CIRURGICOS_IA_AGENDAMENTO_QUALIFICACAO_2026-03-12.md` | Plano de guardrails de IA (Fase 3) |
| `PLAN.FINAL.md` | Plano final de fases (P0-P5) — ordem macro |
| `.env.deploy` | Credenciais de ambiente (gitignored) |

## Credenciais e ambiente

```
Project Ref: ucwmcmdwbvrwotuzlmxh
Supabase URL: https://ucwmcmdwbvrwotuzlmxh.supabase.co
Credenciais: .env.deploy (gitignored — NÃO commitar)
```

---

## FASE 1 — P0 SECURITY (bloqueia produção)

Objetivo: fechar as lacunas críticas de autenticação nas edge functions privilegiadas.

### 1.1 Wiring de auth em `process-agent-jobs`

Arquivo: `supabase/functions/process-agent-jobs/index.ts`

**O que fazer:**
1. Adicionar import da shared auth:
   ```ts
   import { validateServiceInvocationAuth } from '../_shared/invocationAuth.ts'
   ```
2. No handler `Deno.serve(async (req: Request) => {` (~L1066), logo após o bloco de CORS/OPTIONS e antes de `createClient`, inserir:
   ```ts
   const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
   const internalApiKey = (Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim()
   const auth = validateServiceInvocationAuth(req, {
     serviceRoleKey,
     internalApiKey,
   })
   if (!auth.ok) {
     console.warn('[process-agent-jobs][auth_rejected]', {
       code: auth.code,
       reason: auth.reason,
     })
     return buildResponse(auth.status, {
       error: auth.status === 401 ? 'Unauthorized' : 'Forbidden',
       code: auth.code,
     }, corsHeaders)
   }
   ```
3. Remover a criação redundante de `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` na criação do client — reusar a const `serviceRoleKey` já declarada.

**Referência de padrão existente:**
- `supabase/functions/notification-worker/index.ts` ~L766-L787 (usa inline copy, mas a lógica é igual)
- `supabase/functions/_shared/invocationAuth.ts` (módulo compartilhado)

**Gate:**
- `curl` sem auth → `401`
- `curl` com `Authorization: Bearer <service_role_key>` → processa normalmente
- cron legítimo (`x-internal-api-key` ou service_role) → continua verde

---

### 1.2 Wiring de auth em `ai-pipeline-agent`

Arquivo: `supabase/functions/ai-pipeline-agent/index.ts`

**O que fazer:**
1. Adicionar import no topo (~L1-L3):
   ```ts
   import { validateServiceInvocationAuth } from '../_shared/invocationAuth.ts'
   ```
2. No handler `Deno.serve(async (req) => {` (~L2552), logo após o check de OPTIONS e de POST, inserir validação de auth:
   ```ts
   const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
   const internalApiKey = (Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim()
   const invocationAuth = validateServiceInvocationAuth(req, {
     serviceRoleKey,
     internalApiKey,
   })
   if (!invocationAuth.ok) {
     console.warn('[ai-pipeline-agent][auth_rejected]', {
       code: invocationAuth.code,
       reason: invocationAuth.reason,
     })
     return new Response(JSON.stringify({
       error: invocationAuth.status === 401 ? 'Unauthorized' : 'Forbidden',
       code: invocationAuth.code,
     }), {
       status: invocationAuth.status,
       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
     })
   }
   ```
3. **IMPORTANTE**: esta função é chamada pelo `process-agent-jobs` e pelo `whatsapp-webhook`. Confirmar que ambos callers passam o header correto:
   - `whatsapp-webhook` já tem `buildInternalInvokeHeaders()` (~L28-32) que envia `x-internal-api-key`
   - `process-agent-jobs` chama via `fetch` internamente — verificar se passa auth header; se não, adicionar
4. Verificar e se necessário ajustar `process-agent-jobs` para passar `Authorization: Bearer <service_role_key>` ou `x-internal-api-key` ao invocar `ai-pipeline-agent`

**Gate:**
- `curl` externo sem auth → `401`
- chamada de `whatsapp-webhook` com `x-internal-api-key` → processa
- chamada de `process-agent-jobs` com service_role → processa

---

### 1.3 Sanitizar resposta de erro em `kb-ingest`

Arquivo: `supabase/functions/kb-ingest/index.ts` ~L443-L446

**O que fazer:**
Trocar:
```ts
return jsonResponse({ error: error?.message || "unexpected_error" }, corsHeaders, 500);
```
Por:
```ts
return jsonResponse({ error: "ingestion_failed" }, corsHeaders, 500);
```

O `console.error` acima já loga o erro completo server-side.

---

### 1.4 Testes negativos de auth

**O que fazer:**
1. Criar `tests/unit/invocationAuth.test.ts`:
   - importar `validateServiceInvocationAuth` (ajustar path para Node/Vitest)
   - testar: sem headers → `401 missing_auth`
   - testar: bearer token inválido → `403 forbidden`
   - testar: service_role correto → `ok: true`
   - testar: x-internal-api-key correto → `ok: true`
   - testar: x-internal-api-key sem env configurado → `403 internal_key_not_configured`

2. Estender `scripts/smoke_test_final.ps1` (pós-deploy) com testes negativos:
   ```powershell
   # T-AUTH-01: process-agent-jobs sem auth
   $resp = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/process-agent-jobs" `
     -Method POST -Body '{}' -ContentType 'application/json' -SkipHttpErrorCheck
   Assert ($resp.StatusCode -eq 401) "process-agent-jobs rejects unauthenticated"

   # T-AUTH-02: ai-pipeline-agent sem auth
   $resp = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/ai-pipeline-agent" `
     -Method POST -Body '{}' -ContentType 'application/json' -SkipHttpErrorCheck
   Assert ($resp.StatusCode -eq 401) "ai-pipeline-agent rejects unauthenticated"
   ```

**Gate:**
- testes unitários passam
- smoke remoto confirma 401 em ambos endpoints sem auth

---

### 1.5 Validação de Fase 1

```bash
npm run typecheck
npm run build
npm test -- --run
```

Todos verdes antes de prosseguir.

---

## FASE 2 — P0 FUNCTIONAL (paralela com Fase 1)

Objetivo: fechar guided tour e KB ingest para contrato honesto com o usuário.

### 2.1 Corrigir guided tour — persistência de skip/complete no autoplay

Arquivo: `src/hooks/useGuidedTour.ts`

**Diagnóstico atual:**
O hook mostra `showWelcome` automaticamente quando o usuário entra em uma aba do tour não completada. Quando o usuário clica "Skip" ou o "X", `closeTour(true)` é chamado, que faz `onboarding.markTourTabCompleted(activeTab)`. Isso já persiste no banco.

**Verificação necessária:**
1. Confirmar que `markTourTabCompleted` no `useOnboardingProgress` realmente grava via `upsert` no Supabase
2. Confirmar que o `tour_completed_tabs` array acumula entre tabs (não sobrescreve)
3. Verificar edge case: se `onboarding.data` é `null` (primeiro acesso), `markTourTabCompleted` deve criar o registro

**Se houver bug**: corrigir para que `closeTour(true)` sempre persista, incluindo no caminho de welcome dialog dismiss.

**Se não houver bug real**: documentar que o tour está correto e remover o item do backlog.

---

### 2.2 Fechar contrato de passos do tour

Arquivo: `src/components/onboarding/tourSteps.ts`

**O que fazer:**
1. Verificar se `fallbackSelector` e `waitForMs` existem no tipo/contrato dos passos
2. Se existem mas não são usados pelo renderer (`GuidedTour.tsx`): **remover do contrato** para não manter API morta
3. Se são usados: verificar que o renderer honra esses campos

---

### 2.3 Fechar KB ingest — adicionar retry manual explícito

Arquivos:
- `src/components/solarzap/KnowledgeBaseView.tsx`

**Decisão**: Opção B — remover promessa de "background" e adicionar botão de retry manual + polling.

**O que fazer:**
1. Trocar texto `"A ingestão será concluída em background."` (~L179) por:
   ```ts
   "Arquivo enviado e processamento iniciado."
   ```
2. Trocar texto `"Documento enfileirado para processamento."` (~L293) por:
   ```ts
   "Documento em processamento."
   ```
3. Para itens com `ingestion_status === 'error'`, adicionar botão "Tentar novamente" que re-invoca `kb-ingest` com `force: true`
4. Adicionar polling simples (query invalidation a cada 10s) enquanto houver itens em `processing` ou `pending`

**Gate:**
- UI não promete mais comportamento de background
- Itens em `error` podem ser re-processados manualmente
- Itens em `processing` atualizam visualmente quando completam

---

### 2.4 Validação de Fase 2

```bash
npm run typecheck
npm run build
npm test -- --run
```

---

## FASE 3 — P1 IA BEHAVIORAL ENFORCEMENT

Objetivo: implementar os guardrails determinísticos do `PLANO_AJUSTES_CIRURGICOS`.

**Referência obrigatória:** `docs/PLANO_AJUSTES_CIRURGICOS_IA_AGENDAMENTO_QUALIFICACAO_2026-03-12.md`

### 3.1 Expandir busca de company_profile no pipeline de IA

Arquivo: `supabase/functions/ai-pipeline-agent/index.ts`

**Contexto:**
- Migração `20260312114000_add_company_profile_structured_fields.sql` já adicionou os campos (`headquarters_city`, `headquarters_state`, `service_area_summary`, `business_hours_text`, `public_phone`, `public_whatsapp`, etc.)
- O tipo `CompanyProfileFacts` já existe (~L1155)
- A busca atual (~L3365+) só usa `company_name`

**O que fazer:**
1. Expandir a query de `company_profile` para buscar todos os campos estruturados novos
2. Montar bloco de contexto factual antes do prompt do LLM:
   ```
   DADOS FACTUAIS DA EMPRESA (use APENAS estes dados se perguntado):
   - Localização: {headquarters_city}/{headquarters_state}
   - Endereço: {headquarters_address}
   - Área de atendimento: {service_area_summary}
   - Horário: {business_hours_text}
   - Telefone: {public_phone}
   - WhatsApp: {public_whatsapp}
   ```
3. Se campo não preenchido: não incluir no contexto (silenciar, não inventar)
4. Adicionar instrução ao prompt: "Se perguntado sobre informação da empresa que não está nos DADOS FACTUAIS, diga que vai verificar e retornar com a informação. NUNCA invente."

---

### 3.2 Resolvedor determinístico do caminho comercial

Arquivo: `supabase/functions/ai-pipeline-agent/index.ts`

**O que fazer:**
Criar função `resolveSchedulingPath`:
```ts
type SchedulingPath = 'call' | 'visit' | 'manual_return' | 'lead_choice'

function resolveSchedulingPath(settings: {
  auto_schedule_call_enabled: boolean
  auto_schedule_visit_enabled: boolean
}, leadPreference?: 'call' | 'visit' | null): SchedulingPath {
  const { auto_schedule_call_enabled: call, auto_schedule_visit_enabled: visit } = settings
  if (call && visit) return leadPreference || 'lead_choice'
  if (call && !visit) return 'call'
  if (!call && visit) return 'visit'
  return 'manual_return' // nenhum ativo
}
```

**Integrar:**
- Chamar `resolveSchedulingPath` ANTES de qualquer `target_stage` de agendamento
- Se retorno `manual_return`: remover target de agenda e instruir LLM a dizer "vou verificar o melhor horário e retornar"
- Considerar `effectiveAgentType` (respondeu + agente_disparos)

---

### 3.3 Gate determinístico de qualificação BANT

Arquivo: `supabase/functions/ai-pipeline-agent/index.ts`

**O que fazer:**
Criar função `checkQualificationGate`:
```ts
type QualificationCheck = {
  passed: boolean
  missingFields: string[]
  nextQuestion?: string
}

function checkQualificationGate(
  stageData: Record<string, any>,
  targetType: 'call' | 'visit'
): QualificationCheck {
  const required = ['segment', 'city', 'consumption_or_bill', 'timing', 'need_reason', 'budget_fit', 'decision_makers']
  if (targetType === 'visit') {
    required.push('address', 'reference_point', 'decision_makers_present')
  }
  const missing = required.filter(f => !stageData?.[f])
  return {
    passed: missing.length === 0,
    missingFields: missing,
    nextQuestion: missing[0] // perguntar o primeiro campo faltante
  }
}
```

**Integrar:**
- Antes de permitir `target_stage` = `chamada_agendada` ou `visita_agendada`: chamar `checkQualificationGate`
- Se `!passed`: remover target_stage, logar `qualification_gate_blocked: {missingFields}`, gerar pergunta do campo faltante
- Logar `stage_gate_block_reason` para observabilidade

**Referência:** Seções 4.5 e 7.2 do PLANO_AJUSTES_CIRURGICOS

---

### 3.4 Regra dura: após 18h não convidar para ligação

Arquivo: `supabase/functions/ai-pipeline-agent/index.ts`

**O que fazer:**
1. Buscar `ai_settings.timezone` da org (já existe no banco)
2. Calcular hora local:
   ```ts
   function isAfterCallCutoff(timezone: string, cutoff = '18:00'): boolean {
     const now = new Date()
     const localTime = new Intl.DateTimeFormat('pt-BR', {
       timeZone: timezone,
       hour: '2-digit', minute: '2-digit', hour12: false
     }).format(now)
     return localTime >= cutoff
   }
   ```
3. Se `isAfterCallCutoff`: bloquear CTA de ligação e `target_stage = chamada_agendada`
4. Logar `after_hours_call_blocked`
5. Se visita habilitada: permitir visita; caso contrário: instrução de retorno posterior

---

### 3.5 Fallback contra `no_outbound_action`

Arquivos:
- `supabase/functions/ai-pipeline-agent/index.ts` (~L4908)
- `supabase/functions/_shared/aiPipelineOutcome.ts` (~L28)

**O que fazer:**
1. **NÃO** mudar a classificação global de `no_outbound_action` como `terminal_skip`
2. **Antes** de chegar em `no_outbound_action` no fluxo inbound: adicionar fallback determinístico:
   - Se o lead está ativo e respondeu, e o LLM não produziu mensagem de saída:
   - Executar continuidade baseada no checklist faltante (`checkQualificationGate`)
   - Gerar pergunta do próximo campo faltante
   - Só permitir `no_outbound_action` em casos genuínos (debounce, burst, anti-race)
3. Logar `no_outbound_fallback_used` quando o fallback gerar mensagem

---

### 3.6 Filtro de min_days no gerador de slots

Arquivo: `supabase/functions/ai-pipeline-agent/index.ts`

**O que fazer:**
1. Localizar `generateAvailableSlotsForType` (~L3231)
2. Adicionar parâmetro `minLeadDays: number`
3. Filtrar slots para excluir datas com menos de `minLeadDays` dias a partir de hoje
4. Usar `auto_schedule_call_min_days` / `auto_schedule_visit_min_days` da org

---

### 3.7 Testes dos guardrails de IA

**O que fazer:**
Criar `tests/unit/aiSchedulingGuardrails.test.ts`:
- `resolveSchedulingPath`: todos 4 cenários (ambos, só call, só visit, nenhum)
- `checkQualificationGate`: BANT completo → passa; incompleto → bloqueia com campo correto
- `isAfterCallCutoff`: antes e depois de 18h em timezone BR
- min_days: slots de hoje excluídos quando min_days=1

---

### 3.8 Validação de Fase 3

```bash
npm run typecheck
npm run build
npm test -- --run
```

---

## FASE 4 — P2 QUALIDADE E TOOLING

### 4.1 Testes de regressão do lote novo

Criar/ampliar testes:

1. **Reações** — `tests/unit/reactions.test.ts` (já existe, ampliar se necessário):
   - envio de reação substitui anterior
   - reação inbound persiste
   - edge case de reação duplicada

2. **Calendário denso** — `tests/unit/calendarDayEvents.test.ts` (já existe, ampliar):
   - dia com 5+ eventos → exibe max 4 + "+N mais"
   - dia com 0 eventos → vazio

3. **Guided Tour** — `tests/unit/guidedTourTargets.test.ts` (já existe, ampliar):
   - verificar que tour steps referenciam tabs válidas
   - verificar que `closeTour(true)` marca tab como completada
   - multi-org: tabs completadas da org A não aparecem na org B

4. **KB ingest** — `tests/unit/kbIngest.test.ts` (novo):
   - upload + processamento → status `ready`
   - falha → status `error`
   - retry manual → re-processa

---

### 4.2 Corrigir encoding do smoke test

Arquivo: `scripts/smoke_test_final.ps1`

**O que fazer:**
1. Re-salvar o arquivo em UTF-8 com BOM
2. Corrigir todos os textos com mojibake:
   - `Ãºltimas` → `últimas`
   - `execuÃ§Ãµes` → `execuções`
   - `crÃ­tico` → `crítico`
   - buscar e corrigir todas as ocorrências
3. Importante: NÃO mudar lógica, apenas encoding e textos

---

### 4.3 Ampliar encoding guard

Arquivo: `tests/unit/text_encoding_guard.test.ts`

**O que fazer:**
Adicionar ao `SCAN_TARGETS`:
```ts
'scripts/smoke_test_final.ps1',
'docs/STAGING_OPERATIONS_RUNBOOK.md',
'src/components/billing/BillingBlockerDialog.tsx',
'src/components/onboarding/GuidedTour.tsx',
```

---

### 4.4 Validação de Fase 4

```bash
npm run typecheck
npm run build
npm test -- --run
npm run lint
```

---

## FASE 5 — P2 PERFORMANCE

### 5.1 Análise de chunks atuais

**O que fazer:**
1. Rodar `npm run build` e capturar output com tamanhos de chunks
2. Identificar os maiores chunks (>500KB) e seus conteúdos
3. Registrar baseline

---

### 5.2 Reduzir chunks grandes

Arquivo: `vite.config.ts`

**Estratégia:**
1. O `manualChunks` atual já separa `recharts`, `d3`, `date-fns`, `html2canvas`, `jspdf`
2. Identificar o que ainda está no chunk `Index-*.js` (~1.8MB) — provavelmente imports pesados não-lazy
3. Opções:
   - Mais lazy-loading granular de subviews pesadas
   - Adicionar mais entradas em `manualChunks` (ex.: `vendor-supabase`, `vendor-openai`, `vendor-tanstack`)
   - Verificar se alguma dependência grande está sendo importada de forma estática quando poderia ser dinâmica

**Gate:**
- Nenhum chunk > 500KB sem justificativa explícita
- Melhora documentada vs baseline

---

### 5.3 Smoke mobile pós-corte

```bash
npx playwright test tests/e2e/mobile-critical-tabs-smoke.spec.ts
```

---

### 5.4 Validação de Fase 5

```bash
npm run typecheck
npm run build     # verificar output de chunks
npm test -- --run
```

---

## FASE 6 — DEPLOY E VALIDAÇÃO FINAL

### 6.1 Gates locais completos

```bash
npm run typecheck
npm run build
npm test -- --run
npm run lint
```

Todos verdes → prosseguir.

---

### 6.2 Deploy de Edge Functions

**Credenciais:** `.env.deploy`

**Funções a deployar (ordem):**
```bash
# 1. Shared code atualizado — deployar funções que importam invocationAuth.ts
supabase functions deploy process-agent-jobs --project-ref ucwmcmdwbvrwotuzlmxh
supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh
supabase functions deploy kb-ingest --project-ref ucwmcmdwbvrwotuzlmxh

# 2. Outras funções alteradas neste lote (se houver mudanças)
supabase functions deploy whatsapp-webhook --project-ref ucwmcmdwbvrwotuzlmxh
supabase functions deploy broadcast-worker --project-ref ucwmcmdwbvrwotuzlmxh
supabase functions deploy notification-worker --project-ref ucwmcmdwbvrwotuzlmxh
```

**Pré-requisito:** `supabase login` com access token do `.env.deploy`

**Validação pós-deploy:**
```bash
# Teste negativo de auth
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/process-agent-jobs \
  -H "Content-Type: application/json" -d '{}'
# Esperado: 401

curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/ai-pipeline-agent \
  -H "Content-Type: application/json" -d '{}'
# Esperado: 401

# Teste positivo com service role
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/process-agent-jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}'
# Esperado: 200 (ou resultado normal de processamento)
```

---

### 6.3 Aplicar migrações pendentes (se houver)

```bash
supabase db push --project-ref ucwmcmdwbvrwotuzlmxh
```

Verificar que as migrações dos campos de IA/empresa já foram aplicadas:
- `20260312113000_add_ai_settings_auto_schedule_controls.sql`
- `20260312114000_add_company_profile_structured_fields.sql`

---

### 6.4 Smoke test completo

```powershell
# Carregar variáveis
$env:SUPABASE_URL = "https://ucwmcmdwbvrwotuzlmxh.supabase.co"
$env:SERVICE_KEY = "<service_role_key do .env.deploy>"
$env:ANON_KEY = "<anon_key do .env.deploy>"

# Executar smoke
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke_test_final.ps1
```

---

### 6.5 Build e deploy do frontend

```bash
npm run build
# Deploy para o ambiente de produção (método depende da infra: Docker, Caddy, etc.)
```

---

### 6.6 Verificação operacional pós-deploy

```sql
-- Health check operacional
SELECT * FROM ops_health_scan();

-- Verificar cron de process-agent-jobs
SELECT * FROM cron.job WHERE jobname LIKE '%agent%';

-- Verificar backlog de jobs
SELECT status, count(*) FROM scheduled_agent_jobs GROUP BY status;

-- Verificar KB pipeline
SELECT ingestion_status, count(*) FROM kb_items GROUP BY ingestion_status;

-- Verificar alertas
SELECT * FROM ops_runtime_alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 20;
```

---

### 6.7 Validação final

**Checklist obrigatório:**

- [ ] `npm run typecheck` → OK
- [ ] `npm run build` → OK
- [ ] `npm test -- --run` → OK
- [ ] `npm run lint` → OK
- [ ] E2E billing/gating → OK
- [ ] Smoke mobile → OK
- [ ] Smoke negativo de auth (process-agent-jobs, ai-pipeline-agent) → 401
- [ ] Smoke positivo com service_role → 200
- [ ] Health queries operacionais → sem alertas críticos
- [ ] KB ingest → sem items stuck em pending
- [ ] Build chunks documentados e dentro do orçamento

---

## CRITÉRIOS DE ACEITE FINAIS

1. **Nenhuma função privilegiada** invocável sem auth/secret
2. **Guided tour** estabilizado e testado
3. **KB ingest** sem promessa falsa de background; retry manual disponível
4. **IA behavioral** — guardrails determinísticos de BANT, horário, caminho comercial
5. **Performance** com evidência de melhora e chunks documentados
6. **Encoding** limpo em todos os artefatos operacionais
7. **Smoke** parametrizado e executável por ambiente
8. **Gates locais** 100% verdes (typecheck, build, test, lint)

---

## FORA DE ESCOPO DESTA EXECUÇÃO

- Redesenho comercial fora do Stripe
- Reescrever áreas maduras sem bug comprovado
- Reabrir fases já validadas em staging sem evidência técnica
- Mudar classificação global de `no_outbound_action` (só reduzir geração)
- Piloto live com cliente externo (fica para pós-deploy com monitoramento)
- Configuração de Stripe live (separar como etapa controlada pós-validação)

---

## ORDEM DE EXECUÇÃO RESUMIDA

```
┌─────────────────────────────────────────┐
│ FASE 1: P0 Security                    │ ← auth em edge functions
│   1.1 Auth process-agent-jobs           │
│   1.2 Auth ai-pipeline-agent            │
│   1.3 Sanitizar kb-ingest error         │
│   1.4 Testes negativos de auth          │
│   1.5 Validação local                   │
├─────────────────────────────────────────┤
│ FASE 2: P0 Functional                  │ ← tour + KB
│   2.1 Verificar/fix guided tour         │
│   2.2 Limpar contrato tour steps        │
│   2.3 KB ingest retry manual            │
│   2.4 Validação local                   │
├─────────────────────────────────────────┤
│ FASE 3: P1 IA Guardrails               │ ← enforcement runtime
│   3.1 Blindagem factual empresa         │
│   3.2 Resolvedor caminho comercial      │
│   3.3 Gate qualificação BANT            │
│   3.4 Regra 18h call block              │
│   3.5 Fallback no_outbound              │
│   3.6 min_days slots                    │
│   3.7 Testes guardrails                 │
│   3.8 Validação local                   │
├─────────────────────────────────────────┤
│ FASE 4: P2 Qualidade                   │ ← testes + encoding
│   4.1 Testes regressão lote novo        │
│   4.2 Fix encoding smoke                │
│   4.3 Ampliar encoding guard            │
│   4.4 Validação local                   │
├─────────────────────────────────────────┤
│ FASE 5: P2 Performance                 │ ← chunks
│   5.1 Análise baseline                  │
│   5.2 Reduzir chunks                    │
│   5.3 Smoke mobile                      │
│   5.4 Validação local                   │
├─────────────────────────────────────────┤
│ FASE 6: Deploy + Validação Final        │
│   6.1 Gates completos                   │
│   6.2 Deploy edge functions             │
│   6.3 Migrações                         │
│   6.4 Smoke remoto                      │
│   6.5 Build/deploy frontend             │
│   6.6 Verificação operacional           │
│   6.7 Checklist final                   │
└─────────────────────────────────────────┘
```
