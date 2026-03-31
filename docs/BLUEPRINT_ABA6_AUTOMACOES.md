# Blueprint — Aba 6: Automações (CRM Interno)

## 1. Diagnóstico completo

### 1.1 Estado atual da interface

O arquivo `src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx` (~500 linhas) contém:

- **Configuração operacional** (coluna esquerda):
  - Select "Instância WhatsApp padrão" — funcional
  - Textarea "Números admin para alerta" — funcional
  - Input "Cooldown de alerta admin (minutos)" — funcional
  - Botão "Salvar configuração" — funcional

- **Teste manual** (coluna esquerda):
  - Select de regra, select de cliente, input de Deal ID, Textarea de JSON payload
  - **Extremamente técnico** — UUID de deal, JSON bruto, termos como "esteira ARKAN"
  - Funciona para testes unitários mas **inútil para uso comercial**

- **Regras ativas da esteira** (coluna direita):
  - Listagem técnica com `TokenBadge` de channel e trigger_event
  - Input numérico "Atraso (min)", Textarea "Template"
  - Botão "Salvar regra" por regra individual
  - **Confuso**: mistura regras de sistema com configuração avançada

- **Execuções recentes** (coluna direita):
  - Log técnico com `TokenBadge` de status
  - Mostra `last_error` em card rosa
  - **Útil mas ilegível** para não-desenvolvedores

### 1.2 Estado da interface do SolarZap (referência)

O arquivo `src/components/solarzap/AutomationsView.tsx` (~470 linhas):

- **Card "Ignorar Retrocessos"**: Switch elegante com badge Ativo/Inativo, gradiente azul
- **Card "Automações de Pipeline"**: Grid de `AutomationCard` com ícone, título, descrição, badge, Switch
  - 7 automações: Primeira Resposta, Modal Pós-Visita, Chamada Realizada, Aguardando Proposta, Proposta Pronta, Chamada Agendada, Visita Agendada
- **Card "Mensagens Pré-Configuradas"**: Collapsible com 5 mensagens editáveis (Google Meet, Proposta Pronta, Visita Agendada, Reunião Agendada, Pedir Indicação)
  - Cada uma com Switch + Textarea + placeholder padrão + variáveis `{nome}`, `{data}`, `{hora}`
- **Card "Dica"**: Explicação concisa
- **Floating save/cancel bar**: Aparece quando há alterações não salvas
- Settings persistidas via `AutomationContext` → Supabase `organization_settings`

### 1.3 BUG CRÍTICO: Automações NÃO enviam mensagens

**Diagnóstico da causa raiz:**

1. **Runs imediatos (`delay_minutes = 0`) SÃO processados** — `queueAutomationEvent()` usa `processDueNow !== false` (default true), então runs com `scheduled_at <= now()` são executados inline.

2. **Runs agendados (`delay_minutes > 0` ou `< 0` baseados em `appointment_start`) NUNCA são processados** — a função `claim_due_automation_runs` existe no banco, a action `process_automation_runs` existe na edge function, **MAS NÃO EXISTE CRON JOB** que invoque periodicamente essa action.

3. **Consequência**: Dos 16 automation rules seeded:
   - `delay_minutes = 0`: 6 regras (alertas admin imediatos + confirmação LP) → **Funcionam** SE a instância WhatsApp estiver conectada
   - `delay_minutes = 5`: 1 regra (reengage LP) → **NUNCA executa**
   - `delay_minutes = -15/-120/-1440`: 5 regras (lembretes de call) → **NUNCA executam**
   - `delay_minutes = 10/1440/4320`: 3 regras (no-show recovery) → **NUNCA executam**
   - `delay_minutes = -1440`: 1 regra (admin 24h) no, wait — esse é admin_call_reminder_2h com -120 = processado relativo a `appointment_start`

4. **Segunda causa potencial**: `resolveConnectedInternalCrmInstance()` busca instância com `status = 'connected'`. Se nenhuma instância CRM estiver conectada, **TODOS os dispatches falham** com `no_connected_whatsapp_instance`.

5. **Terceira causa potencial**: `getEvolutionEnv()` puxa `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`. Se esses secrets não estiverem configurados na edge function, **TODOS os dispatches falham** com `missing_evolution_env`.

### 1.4 Arquivos envolvidos

| Arquivo | Papel | Linhas |
|---------|-------|--------|
| `src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx` | View principal — REESCREVER | ~500 |
| `src/modules/internal-crm/hooks/useInternalCrmAutomations.ts` | Hook agregador — MANTER + expandir | ~55 |
| `src/modules/internal-crm/hooks/useInternalCrmApi.ts` | Queries e mutations — MANTER + expandir | ~600 |
| `src/modules/internal-crm/types/index.ts` | Types — MANTER (já completos) | - |
| `src/modules/internal-crm/pages/InternalCrmAutomationsPage.tsx` | Page wrapper — MANTER | 5 |
| `supabase/functions/internal-crm-api/index.ts` | Backend — ADICIONAR cron trigger | - |
| **Migration SQL** | **CRIAR** — pg_cron job | - |

---

## 2. Plano de ação — 10 etapas

### Etapa 1 — Migration: Criar cron job para `process_automation_runs`

Criar migration que registra um pg_cron job que invoca a edge function `internal-crm-api` com `action: 'process_automation_runs'` a cada 1 minuto.

**Arquivo**: `supabase/migrations/2026XXXX_internal_crm_automation_cron.sql`

```sql
-- Cron job to process pending automation runs every 1 minute
-- Uses pg_net to invoke the edge function via HTTP POST

SELECT cron.schedule(
  'internal-crm-process-automation-runs',
  '* * * * *',  -- every 1 minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/internal-crm-api',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action": "process_automation_runs"}'::jsonb
  );
  $$
);
```

**Alternativa se `app.settings` não estiver configurado**: Usar URL e key hardcoded da edge function OU usar `net.http_post` com os valores do projeto diretamente. Na implementação, vamos usar a URL e service_role_key do projeto:

```sql
SELECT cron.schedule(
  'internal-crm-process-automation-runs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/internal-crm-api',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8"}'::jsonb,
    body := '{"action": "process_automation_runs"}'::jsonb
  );
  $$
);
```

**NOTA**: Na implementação, NÃO hardcodar secrets no SQL. Usar o service_role_key via `current_setting` ou via Supabase Vault.

### Etapa 2 — Backend: Garantir que `process_automation_runs` rode com serviceClient

No edge function, a action `process_automation_runs` já está no ACL e no router (linha 6709). Verificar que usa `serviceClient` (sim, usa — linha 6710: `processAutomationRuns(serviceClient)`).

**Status**: ✅ Já funciona. Só precisa do cron trigger da Etapa 1.

### Etapa 3 — Types: Adicionar type `InternalCrmAutomationToggle`

Não é necessário alterar types — os existentes `InternalCrmAutomationRule`, `InternalCrmAutomationRun`, `InternalCrmAutomationSettings` já cobrem tudo.

### Etapa 4 — Reescrever `InternalCrmAutomationsView.tsx`

Copiar o layout e padrão visual do `src/components/solarzap/AutomationsView.tsx`, adaptando para o contexto do CRM interno.

**Layout novo** (single-column, max-w-4xl, como SolarZap):

#### Seção 1 — Status de Conexão WhatsApp (novo card no topo)
Card com indicador se a instância WhatsApp está conectada ou não. Se não estiver, mostrar alerta vermelho "Nenhuma instância WhatsApp conectada — as automações não conseguirão enviar mensagens."

#### Seção 2 — Configuração Geral
Card com gradiente azul (como SolarZap):
- **Instância WhatsApp padrão**: Select das instâncias — **manter** (essencial)
- **Números admin para alerta**: Textarea — **manter** mas com label "Números para notificações (separar por vírgula)"
- **Cooldown de notificações**: Input numérico — **manter** mas com label "Intervalo mínimo entre alertas (minutos)"

#### Seção 3 — Automações de Lead (análogo a "Automações de Pipeline" do SolarZap)
Card com gradiente primary, usando o mesmo `AutomationCard` do SolarZap.

Mapear cada `automation_rule` de canal `whatsapp_lead` para um card com:
- **Ícone** por trigger_event (MessageSquare para lp_form, Calendar para appointment, Phone para call, Clock para reminders)
- **Título**: `rule.name` (já em português nos seeds)
- **Descrição**: `rule.description` (já em português)
- **Switch**: `rule.is_active` — ao toglar, chamar `upsert_automation_rule` com `is_active` invertido
- **Delay editável**: Mostrar como "Atraso: 5 min" ou "2h antes" ou "24h antes" em formato humano

Regras whatsapp_lead a mostrar (7):
1. Lead LP sem agendamento · 5 min
2. Confirmação imediata de agendamento
3. Lembrete de call · 24h
4. Lembrete de call · 2h
5. Lembrete de call · 15 min
6. Não compareceu · 10 min
7. Não compareceu · D+1
8. Não compareceu · D+3

#### Seção 4 — Alertas Operacionais (para canal whatsapp_admin)
Card com gradiente amber/orange (como "Mensagens Pré-Configuradas" do SolarZap):
- Cada regra `whatsapp_admin` vira um card com Switch + preview do template (collapsible)
- Ao expandir, mostra Textarea editável do template

Regras whatsapp_admin a mostrar (6):
1. Alerta admin · novo lead LP
2. Alerta admin · chamada agendada
3. Alerta admin · call em 2h
4. Alerta admin · call em 15 min
5. Alerta admin · não compareceu
6. Alerta admin · fechou
7. Alerta admin · não fechou

#### Seção 5 — Mensagens (templates editáveis, collapsible)
Cada regra com canal `whatsapp_lead` que tem `template` mostra uma Textarea editável com:
- Variáveis disponíveis: `{{nome}}`, `{{data_hora}}`, `{{hora}}`, `{{link_agendamento}}`, `{{link_reuniao}}`, `{{crm_url}}`
- Placeholder com o template padrão
- Switch para ativar/desativar

#### Seção 6 — Execuções Recentes (simplificado)
Card com lista dos últimos 20 runs, SEM TokenBadge, usando badges coloridos simples:
- 🟢 Enviada (completed)
- 🟡 Pendente (pending)
- 🔴 Falhou (failed)
- ⚪ Cancelada (canceled)
- 🔵 Ignorada (skipped)

Cada item mostra: nome da automação, nome do cliente, horário agendado/processado, erro (se houver).

#### Seção 7 — Card de Dica (como SolarZap)
"As automações são disparadas automaticamente quando um lead preenche o formulário, quando uma reunião é agendada/cancelada, ou quando um deal é fechado. Mensagens agendadas são processadas a cada minuto."

#### Floating Save Bar
Aparece quando há alterações não salvas (templates editados ou toggles mudados). Botões "Cancelar" e "Salvar".

**Removido completamente**:
- Painel de teste manual (JSON payload, UUID de deal)
- TokenBadge em todo lugar
- Termos "esteira ARKAN", "trigger_event", "cancel_on_event_types"
- Grid 2 colunas confuso

### Etapa 5 — Ajustar hook `useInternalCrmAutomations.ts`

Adicionar:
- `toggleRuleMutation` para toggle rápido de is_active
- `bulkSaveRulesMutation` para salvar múltiplas regras de uma vez (ou reutilizar `upsertAutomationRuleMutation` em sequência)

### Etapa 6 — Remover TokenBadge dos runs

O componente `formatDateTime` já é usado e está OK. Só remover `TokenBadge` e usar `Badge` do shadcn com cores simples.

### Etapa 7 — Verificar envs da Evolution API

Na execução, verificar (via Supabase Management API ou dashboard) se `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estão configurados como secrets da edge function. Se não estiverem, as automações NÃO enviarão mensagens mesmo com o cron rodando.

### Etapa 8 — Adicionar diagnóstico visual no card de status

Novo endpoint `check_automation_health` na edge function que retorna:
```json
{
  "whatsapp_connected": true/false,
  "evolution_api_reachable": true/false,
  "pending_runs_count": 42,
  "failed_runs_last_24h": 3,
  "last_processed_at": "2026-03-31T..."
}
```

Isso permite mostrar no topo da página um card diagnóstico claro.

### Etapa 9 — Build check

```bash
npx tsc --noEmit 2>&1 | Select-String "error TS" | Measure-Object
```

### Etapa 10 — Deploy

1. Deploy migration SQL (cron job via pg_net)
2. Deploy edge function `internal-crm-api`

---

## 3. Pseudo-código por arquivo

### 3.1 `InternalCrmAutomationsView.tsx` (rewrite completo)

```tsx
import { useState, useMemo } from 'react';
import { Zap, Wifi, WifiOff, MessageSquare, Calendar, Clock, Phone, UserX,
         CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Save, X,
         RotateCcw, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { useInternalCrmAutomationsModule } from '../hooks/useInternalCrmAutomations';
import { formatDateTime } from '../components/InternalCrmUi';
import type { InternalCrmAutomationRule } from '../types';

// Icon mapping by trigger_event
const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  lp_form_submitted: <MessageSquare className="w-5 h-5 text-sky-500" />,
  appointment_scheduled: <Calendar className="w-5 h-5 text-purple-500" />,
  appointment_no_show: <UserX className="w-5 h-5 text-red-500" />,
  appointment_done: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  deal_closed: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  deal_not_closed: <AlertTriangle className="w-5 h-5 text-orange-500" />,
};

// Human-readable delay
function formatDelay(minutes: number): string {
  if (minutes === 0) return 'Imediato';
  const abs = Math.abs(minutes);
  const prefix = minutes < 0 ? '' : 'Após ';
  const suffix = minutes < 0 ? ' antes' : '';
  if (abs < 60) return `${prefix}${abs} min${suffix}`;
  if (abs < 1440) return `${prefix}${abs / 60}h${suffix}`;
  return `${prefix}${abs / 1440} dia(s)${suffix}`;
}

// Status badge for runs
function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: 'Enviada', className: 'bg-green-100 text-green-700' },
    pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700' },
    processing: { label: 'Processando', className: 'bg-blue-100 text-blue-700' },
    failed: { label: 'Falhou', className: 'bg-red-100 text-red-700' },
    canceled: { label: 'Cancelada', className: 'bg-gray-100 text-gray-500' },
    skipped: { label: 'Ignorada', className: 'bg-slate-100 text-slate-600' },
  };
  const m = map[status] || { label: status, className: 'bg-gray-100 text-gray-500' };
  return <Badge className={cn('border-0 text-xs', m.className)}>{m.label}</Badge>;
}

// AutomationCard component (copied from SolarZap pattern)
function AutomationCard({ rule, draft, onToggle, onTemplateChange }: {
  rule: InternalCrmAutomationRule;
  draft: { isActive: boolean; template: string };
  onToggle: (active: boolean) => void;
  onTemplateChange: (template: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const icon = TRIGGER_ICONS[rule.trigger_event] || <Zap className="w-5 h-5 text-primary" />;
  
  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      draft.isActive ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border/50"
    )}>
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center",
          draft.isActive ? "bg-primary/10" : "bg-muted"
        )}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-foreground flex items-center gap-1.5">
            <span className="truncate">{rule.name}</span>
            <Badge className={cn("border-0 text-xs",
              draft.isActive ? "bg-primary/10 text-primary" : ""
            )} variant={draft.isActive ? "default" : "secondary"}>
              {draft.isActive ? 'Ativa' : 'Inativa'}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{formatDelay(rule.delay_minutes)}</Badge>
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rule.description}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        <Switch checked={draft.isActive} onCheckedChange={onToggle} />
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          <Label className="text-xs text-muted-foreground">Mensagem (variáveis: {'{{nome}}'}, {'{{data_hora}}'}, {'{{hora}}'}, {'{{link_agendamento}}'}, {'{{link_reuniao}}'})</Label>
          <Textarea
            value={draft.template}
            onChange={(e) => onTemplateChange(e.target.value)}
            rows={3}
            className="resize-none"
            disabled={!draft.isActive}
          />
        </div>
      )}
    </div>
  );
}

export function InternalCrmAutomationsView() {
  // ... full implementation using useInternalCrmAutomationsModule()
  // Settings section (instance, admin numbers, cooldown)
  // Lead automations section (channel = whatsapp_lead)
  // Admin alerts section (channel = whatsapp_admin)
  // Recent runs section
  // Floating save bar
}
```

### 3.2 Migration SQL (cron job)

```sql
-- Ensure pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Register cron job (requires pg_cron already enabled)
SELECT cron.schedule(
  'internal-crm-process-automation-runs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/internal-crm-api',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{"action":"process_automation_runs"}'::jsonb
  );
  $$
);
```

### 3.3 Backend: `check_automation_health` (nova action)

```typescript
// ACL: add 'check_automation_health' to admin/owner
// Router: new case
// Function:
async function checkAutomationHealth(serviceClient) {
  const schema = crmSchema(serviceClient);
  
  // Check connected instance
  const { data: instance } = await schema.from('whatsapp_instances')
    .select('id,status').eq('status','connected').limit(1).maybeSingle();
  
  // Count pending runs
  const { count: pendingCount } = await schema.from('automation_runs')
    .select('*', { count: 'exact', head: true }).eq('status','pending');
    
  // Count failed in last 24h
  const { count: failedCount } = await schema.from('automation_runs')
    .select('*', { count: 'exact', head: true })
    .eq('status','failed')
    .gte('processed_at', new Date(Date.now() - 86400000).toISOString());
    
  // Last processed
  const { data: lastRun } = await schema.from('automation_runs')
    .select('processed_at').not('processed_at','is',null)
    .order('processed_at', { ascending: false }).limit(1).maybeSingle();
  
  // Check Evolution API reachable
  let evolutionReachable = false;
  try {
    const { baseUrl, apiKey } = getEvolutionEnv();
    const resp = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey }
    });
    evolutionReachable = resp.ok;
  } catch {}to
  
  return {
    whatsapp_connected: !!instance?.id,
    evolution_api_reachable: evolutionReachable,
    pending_runs_count: pendingCount || 0,
    failed_runs_last_24h: failedCount || 0,
    last_processed_at: lastRun?.processed_at || null,
  };
}
```

---

## 4. Checklist anti-regressão

- [ ] Nenhum arquivo fora de `src/modules/internal-crm/` e `supabase/functions/internal-crm-api/` é modificado
- [ ] `src/components/solarzap/AutomationsView.tsx` NÃO é tocado
- [ ] `src/contexts/AutomationContext.tsx` NÃO é tocado
- [ ] `src/hooks/useAutomationSettings.ts` NÃO é tocado
- [ ] Schema `internal_crm` isolado — cron só invoca edge function CRM
- [ ] pg_cron job idempotente (re-run não duplica)
- [ ] `tsc --noEmit` zero errors
- [ ] Build `vite build` sem warnings novos

---

## 5. Resumo de impacto

| Ação | Arquivo | Tipo |
|------|---------|------|
| Reescrever completamente | `src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx` | Modificar |
| Adicionar cron job | Migration SQL nova | Criar |
| Adicionar `check_automation_health` | `supabase/functions/internal-crm-api/index.ts` | Modificar |
| Adicionar action ao ACL | `supabase/functions/internal-crm-api/index.ts` | Modificar |
| Adicionar action ao tipo | `src/modules/internal-crm/types/index.ts` | Modificar |
| Expandir hook | `src/modules/internal-crm/hooks/useInternalCrmAutomations.ts` | Modificar |
| Adicionar health query | `src/modules/internal-crm/hooks/useInternalCrmApi.ts` | Modificar |

**Total**: 5 arquivos modificados + 1 migration criada. **Zero impacto no SolarZap público.**
