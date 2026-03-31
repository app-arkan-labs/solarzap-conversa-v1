# Blueprint — Aba 1: CRM Dashboard (Painel Administrativo Interno)

> **Objetivo**: Reestruturar os KPIs, remover "Deals parados por etapa" e inserir um gráfico de linha para acompanhamento da pipeline, mantendo a identidade visual do SolarZap e sem causar regressões no app principal.

---

## 1. Análise do Estado Atual

### 1.1 Componentes envolvidos (frontend)

| Arquivo | Função atual |
|---|---|
| `src/modules/internal-crm/pages/InternalCrmDashboardPage.tsx` | Página-raiz; gerencia `fromDate` / `toDate` |
| `src/modules/internal-crm/components/dashboard/InternalCrmDashboardView.tsx` | Layout geral: `PageHeader` → filtro de datas → `KpiGrid` → `StalledDealsTable` + `NextActionsPanel` → `OnboardingQueue` |
| `src/modules/internal-crm/components/dashboard/cards/KpiGrid.tsx` | 3 linhas de `MetricCard` (11 cards) |
| `src/modules/internal-crm/components/dashboard/cards/StalledDealsTable.tsx` | Tabela "Deals parados por etapa" (será **removida**) |
| `src/modules/internal-crm/components/dashboard/cards/NextActionsPanel.tsx` | Manter (próximas ações) |
| `src/modules/internal-crm/components/dashboard/cards/OnboardingQueue.tsx` | Manter (onboarding pendente) |
| `src/modules/internal-crm/components/InternalCrmUi.tsx` | `MetricCard`, `TokenBadge`, `formatCurrencyBr` |

### 1.2 Backend (edge function)

| Arquivo | Função |
|---|---|
| `supabase/functions/internal-crm-api/index.ts` (linha ~593) | `listDashboardKpis()` — executa 13 queries paralelas e monta o objeto `kpis` |

### 1.3 Tipos

| Arquivo | Tipo |
|---|---|
| `src/modules/internal-crm/types/index.ts` (linha 238) | `InternalCrmDashboardKpis` — contrato atual com 15 campos |

### 1.4 Hook React Query

| Arquivo | Hook |
|---|---|
| `src/modules/internal-crm/hooks/useInternalCrmApi.ts` (~linha 445) | `useInternalCrmDashboard(params)` → query key `['internal-crm', 'dashboard', params]` |
| `src/modules/internal-crm/hooks/useInternalCrmDashboard.ts` | `useInternalCrmDashboardModule(filters)` — converte datas, chama o hook acima |

### 1.5 Pipeline stages atuais (após migrações em cadeia)

Ordem final vigente no banco:
```
novo_lead (10)        → Novo Lead
respondeu (20)        → Respondeu
agendou_reuniao (25)  → Agendou Reuniao
chamada_agendada (30) → Reuniao Agendada
chamada_realizada (40)→ Reuniao Realizada
nao_compareceu (50)   → Nao Compareceu
negociacao (60)       → Negociacao
fechou (70)           → Fechou Contrato
nao_fechou (80)       → Nao Fechou
```

### 1.6 Tabelas de dados relevantes

- `internal_crm.clients` — leads/clientes com `lifecycle_status` e `current_stage_code`
- `internal_crm.deals` — deals com `stage_code`, `status` (open/won/lost)
- `internal_crm.subscriptions` — assinaturas com `status`, `mrr_cents`, `product_code`
- `internal_crm.customer_app_snapshot` — `plan_key`, `subscription_status`, `trial_ends_at`
- `internal_crm.appointments` — reuniões agendadas/realizadas
- `internal_crm.products` — produtos incluindo `solarzap_start`, `solarzap_pro`, `solarzap_scale`

---

## 2. KPIs Desejados (Nova Estrutura)

### Linha 1 — Contadores absolutos (5 cards)

| # | Título | Descrição | Fonte de dados |
|---|---|---|---|
| 1 | **Leads no Período** | Total de registros `internal_crm.clients` criados no período | `clients.created_at BETWEEN fromDate AND toDate` |
| 2 | **Formulários Preenchidos** | Leads que preencheram formulário na Landing Page | `internal_crm.landing_form_sessions` com `completed_at IS NOT NULL` no período |
| 3 | **Reuniões Agendadas** | Appointments do tipo reunião com status `scheduled`/`confirmed` criados no período | `appointments WHERE appointment_type IN ('meeting','demo') AND created_at BETWEEN ...` |
| 4 | **Reuniões Realizadas** | Appointments do tipo reunião com status `done` no período | `appointments WHERE appointment_type IN ('meeting','demo') AND status = 'done' AND updated_at BETWEEN ...` |
| 5 | **Contratos Fechados** | Deals movidos para `status = 'won'` no período | `deals WHERE status = 'won' AND won_at BETWEEN fromDate AND toDate` |

### Linha 2 — Taxas percentuais (4 cards)

| # | Título | Fórmula | Nota |
|---|---|---|---|
| 1 | **Taxa de Preenchimento de Formulário** | `(formularios_preenchidos / leads_no_periodo) × 100` | % de leads que preencheram formulário |
| 2 | **Taxa de Agendamento** | `(reunioes_agendadas / leads_no_periodo) × 100` | % de leads que agendaram reunião |
| 3 | **Taxa de Comparecimento** | `(reunioes_realizadas / leads_no_periodo) × 100` | % de leads que compareceram |
| 4 | **Taxa de Fechamento** | `(contratos_fechados / leads_no_periodo) × 100` | % de leads que fecharam contrato |

### Linha 3 — Indicadores de base de clientes (3 cards)

| # | Título | Fonte de dados | Detalhes |
|---|---|---|---|
| 1 | **Contas em Teste** | `customer_app_snapshot WHERE subscription_status = 'trialing'` **OU** `subscriptions WHERE status = 'trialing'` no período | Número inteiro |
| 2 | **Assinantes no Período** | `subscriptions WHERE status IN ('active','trialing')` agrupado por `product_code` | Card com 3 sub-valores: **Start** \| **Pro** \| **Scale** |
| 3 | **Churn no Período** | `clients WHERE lifecycle_status = 'churned' AND updated_at BETWEEN ...` | Número inteiro |

---

## 3. Gráfico de Linha (substitui "Deals parados por etapa")

### 3.1 Requisito
Gráfico de linha para acompanhamento da **movimentação da Pipeline completa**, com seleção de quais etapas aparecem (checkboxes/multi-select).

### 3.2 Dados
- Agrupar `internal_crm.stage_history` por dia/semana + `stage_code`
- Cada etapa é uma série no gráfico
- Eixo X: datas do período selecionado
- Eixo Y: contagem de deals naquela etapa no dia
- Se `stage_history` não tiver dados suficientes, alternativa: snapshot diário a partir de `deals` agrupando por `stage_code` e `created_at`/`updated_at`

### 3.3 Implementação
- Usar **Recharts** (já usado em `src/modules/internal-crm/components/finance/charts/` — verificado: `MrrTrendChart.tsx` e `RevenueBreakdownChart.tsx`)
- Componente: `PipelineMovementChart.tsx`
- Multi-select de etapas: usar o componente nativo de badges/checkboxes do SolarZap

---

## 4. Plano de Ação Detalhado

### Etapa 4.1 — Atualizar tipo `InternalCrmDashboardKpis`

**Arquivo**: `src/modules/internal-crm/types/index.ts` (linha 238)

**Ação**: Substituir o tipo por:

```typescript
export type InternalCrmDashboardKpis = {
  // Linha 1 — contadores absolutos
  leads_in_period: number;
  forms_completed: number;
  meetings_scheduled: number;
  meetings_done: number;
  contracts_closed: number;

  // Linha 2 — taxas percentuais
  form_fill_rate: number;
  scheduling_rate: number;
  attendance_rate: number;
  closing_rate: number;

  // Linha 3 — base de clientes
  trial_accounts: number;
  active_subscribers_start: number;
  active_subscribers_pro: number;
  active_subscribers_scale: number;
  churned_in_period: number;

  // Gráfico de movimentação da pipeline
  pipeline_movement: Array<{
    date: string;         // ISO date (YYYY-MM-DD)
    stage_code: string;
    count: number;
  }>;

  // Mantidos para outros painéis
  next_actions: InternalCrmTask[];
  onboarding_queue: InternalCrmClientSummary[];
};
```

**Campos removidos**: `qualified_leads`, `demos_scheduled`, `proposals_sent`, `win_rate`, `revenue_one_time_closed_cents`, `mrr_sold_cents`, `mrr_active_cents`, `onboarding_pending`, `churn_risk_count`, `stalled_deals`, `pending_payments`.

---

### Etapa 4.2 — Atualizar `listDashboardKpis` na edge function

**Arquivo**: `supabase/functions/internal-crm-api/index.ts` (linha ~593–680)

**Ação**: Reescrever a função para as novas queries. Pseudo-código:

```typescript
async function listDashboardKpis(serviceClient, payload) {
  // ... parse fromDate/toDate (código existente está ok)

  const schema = crmSchema(serviceClient);

  const [
    leadsCount,
    formsCompleted,
    meetingsScheduled,
    meetingsDone,
    contractsClosed,
    trialAccounts,
    subscribersStart,
    subscribersPro,
    subscribersScale,
    churnedInPeriod,
    pipelineMovementRaw,
    nextActions,
    onboardingQueue,
  ] = await Promise.all([
    // 1. Leads no período
    schema.from('clients')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso),

    // 2. Formulários preenchidos
    schema.from('landing_form_sessions')
      .select('id', { count: 'exact', head: true })
      .not('completed_at', 'is', null)
      .gte('completed_at', sinceIso)
      .lte('completed_at', untilIso),

    // 3. Reuniões agendadas
    schema.from('appointments')
      .select('id', { count: 'exact', head: true })
      .in('appointment_type', ['meeting', 'demo'])
      .in('status', ['scheduled', 'confirmed'])
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso),

    // 4. Reuniões realizadas
    schema.from('appointments')
      .select('id', { count: 'exact', head: true })
      .in('appointment_type', ['meeting', 'demo'])
      .eq('status', 'done')
      .gte('updated_at', sinceIso)
      .lte('updated_at', untilIso),

    // 5. Contratos fechados
    schema.from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .gte('won_at', sinceIso)
      .lte('won_at', untilIso),

    // 6. Contas em teste
    schema.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'trialing'),

    // 7-9. Assinantes ativos por plano
    schema.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('product_code', 'solarzap_start')
      .in('status', ['active', 'trialing']),

    schema.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('product_code', 'solarzap_pro')
      .in('status', ['active', 'trialing']),

    schema.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('product_code', 'solarzap_scale')
      .in('status', ['active', 'trialing']),

    // 10. Churn no período
    schema.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('lifecycle_status', 'churned')
      .gte('updated_at', sinceIso)
      .lte('updated_at', untilIso),

    // 11. Pipeline movement (stage_history ou deals snapshot)
    schema.from('stage_history')
      .select('new_stage_code, created_at')
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso)
      .order('created_at', { ascending: true }),

    // 12. Próximas ações
    schema.from('tasks')
      .select('id, client_id, deal_id, owner_user_id, title, notes, due_at, status, task_kind, completed_at')
      .eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(10),

    // 13. Onboarding queue
    // (reutilizar listClients com lifecycle_status = 'customer_onboarding')
  ]);

  const leadsTotal = Number(leadsCount.count || 0);
  const formsTotal = Number(formsCompleted.count || 0);
  const meetingsSchedTotal = Number(meetingsScheduled.count || 0);
  const meetingsDoneTotal = Number(meetingsDone.count || 0);
  const contractsTotal = Number(contractsClosed.count || 0);

  const safeRate = (num: number, den: number) =>
    den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0;

  // Processar pipeline_movement: agrupar por dia + stage_code
  const movementRows = pipelineMovementRaw.data || [];
  const movementMap = new Map<string, number>();
  for (const row of movementRows) {
    const dateKey = new Date(row.created_at).toISOString().slice(0, 10);
    const key = `${dateKey}|${row.new_stage_code}`;
    movementMap.set(key, (movementMap.get(key) || 0) + 1);
  }
  const pipeline_movement = Array.from(movementMap.entries()).map(([key, count]) => {
    const [date, stage_code] = key.split('|');
    return { date, stage_code, count };
  });

  const onboardingQueueData = (await listClients(serviceClient, { lifecycle_status: 'customer_onboarding' })).slice(0, 8);

  return {
    leads_in_period: leadsTotal,
    forms_completed: formsTotal,
    meetings_scheduled: meetingsSchedTotal,
    meetings_done: meetingsDoneTotal,
    contracts_closed: contractsTotal,
    form_fill_rate: safeRate(formsTotal, leadsTotal),
    scheduling_rate: safeRate(meetingsSchedTotal, leadsTotal),
    attendance_rate: safeRate(meetingsDoneTotal, leadsTotal),
    closing_rate: safeRate(contractsTotal, leadsTotal),
    trial_accounts: Number(trialAccounts.count || 0),
    active_subscribers_start: Number(subscribersStart.count || 0),
    active_subscribers_pro: Number(subscribersPro.count || 0),
    active_subscribers_scale: Number(subscribersScale.count || 0),
    churned_in_period: Number(churnedInPeriod.count || 0),
    pipeline_movement,
    next_actions: nextActions.data || [],
    onboarding_queue: onboardingQueueData,
  };
}
```

**Riscos**: Nenhum impacto no SolarZap público (schema `internal_crm` é isolado).

> **ATENÇÃO**: Verificar se `landing_form_sessions` tem coluna `completed_at`. Caso não tenha, usar como proxy: `landing_form_sessions WHERE status = 'completed'` ou contar `form_submissions` se houver.

---

### Etapa 4.3 — Reescrever `KpiGrid.tsx`

**Arquivo**: `src/modules/internal-crm/components/dashboard/cards/KpiGrid.tsx`

**Ação**: Substituir o conteúdo inteiro do componente:

```tsx
import { MetricCard, formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDashboardKpis } from '@/modules/internal-crm/types';

type KpiGridProps = {
  kpis: InternalCrmDashboardKpis | undefined;
};

export function KpiGrid(props: KpiGridProps) {
  const kpis = props.kpis;

  return (
    <>
      {/* Linha 1 — Contadores absolutos */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Leads no Período"
          value={String(kpis?.leads_in_period ?? 0)}
          subtitle="Novos leads captados"
        />
        <MetricCard
          title="Formulários Preenchidos"
          value={String(kpis?.forms_completed ?? 0)}
          subtitle="Landing page convertidos"
          accentClassName="text-violet-700"
        />
        <MetricCard
          title="Reuniões Agendadas"
          value={String(kpis?.meetings_scheduled ?? 0)}
          subtitle="Compromissos marcados"
          accentClassName="text-indigo-700"
        />
        <MetricCard
          title="Reuniões Realizadas"
          value={String(kpis?.meetings_done ?? 0)}
          subtitle="Presença confirmada"
          accentClassName="text-cyan-700"
        />
        <MetricCard
          title="Contratos Fechados"
          value={String(kpis?.contracts_closed ?? 0)}
          subtitle="Decisão positiva"
          accentClassName="text-emerald-700"
        />
      </div>

      {/* Linha 2 — Taxas percentuais */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Taxa de Preenchimento"
          value={`${kpis?.form_fill_rate ?? 0}%`}
          subtitle="Leads que preencheram formulário"
        />
        <MetricCard
          title="Taxa de Agendamento"
          value={`${kpis?.scheduling_rate ?? 0}%`}
          subtitle="Leads que agendaram reunião"
          accentClassName="text-indigo-700"
        />
        <MetricCard
          title="Taxa de Comparecimento"
          value={`${kpis?.attendance_rate ?? 0}%`}
          subtitle="Leads que compareceram"
          accentClassName="text-cyan-700"
        />
        <MetricCard
          title="Taxa de Fechamento"
          value={`${kpis?.closing_rate ?? 0}%`}
          subtitle="Leads que fecharam contrato"
          accentClassName="text-emerald-700"
        />
      </div>

      {/* Linha 3 — Base de clientes */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Contas em Teste"
          value={String(kpis?.trial_accounts ?? 0)}
          subtitle="Período de avaliação"
          accentClassName="text-amber-700"
        />
        {/* Card especial com 3 sub-valores */}
        <SubscribersCard
          start={kpis?.active_subscribers_start ?? 0}
          pro={kpis?.active_subscribers_pro ?? 0}
          scale={kpis?.active_subscribers_scale ?? 0}
        />
        <MetricCard
          title="Churn no Período"
          value={String(kpis?.churned_in_period ?? 0)}
          subtitle="Clientes que cancelaram"
          accentClassName="text-rose-700"
        />
      </div>
    </>
  );
}

/** Card "Assinantes no Período" com subdivisão por plano */
function SubscribersCard(props: { start: number; pro: number; scale: number }) {
  const total = props.start + props.pro + props.scale;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Assinantes Ativos</p>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {total}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          Start: <strong>{props.start}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          Pro: <strong>{props.pro}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Scale: <strong>{props.scale}</strong>
        </span>
      </div>
    </div>
  );
}
```

---

### Etapa 4.4 — Criar `PipelineMovementChart.tsx`

**Arquivo novo**: `src/modules/internal-crm/components/dashboard/cards/PipelineMovementChart.tsx`

**Detalhes**:
- Usar **Recharts** (`LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `ResponsiveContainer`)
- Receber `data: Array<{ date: string; stage_code: string; count: number }>` + `stages: InternalCrmStage[]`
- Converter os dados para formato Recharts: um objeto por data com chave por `stage_code`
- Multi-select de etapas: checkboxes acima do gráfico (usando `Badge` existente com `onClick`)
- Cada stage tem uma cor derivada de `color_token` (mapeamento existente no `TokenBadge`)
- Todas as etapas selecionadas por padrão

```tsx
// Pseudo-estrutura
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import type { InternalCrmStage } from '@/modules/internal-crm/types';

const STAGE_COLORS: Record<string, string> = {
  sky: '#0ea5e9',
  amber: '#f59e0b',
  indigo: '#6366f1',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  orange: '#f97316',
  emerald: '#10b981',
  zinc: '#71717a',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  yellow: '#eab308',
};

type PipelineMovementChartProps = {
  data: Array<{ date: string; stage_code: string; count: number }>;
  stages: InternalCrmStage[];
};

export function PipelineMovementChart({ data, stages }: PipelineMovementChartProps) {
  const [selectedStages, setSelectedStages] = useState<Set<string>>(
    () => new Set(stages.map(s => s.stage_code))
  );

  const toggleStage = (stageCode: string) => {
    setSelectedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageCode)) next.delete(stageCode);
      else next.add(stageCode);
      return next;
    });
  };

  // Pivotear dados para formato { date, novo_lead: 3, respondeu: 1, ... }
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    for (const row of data) {
      if (!dateMap.has(row.date)) dateMap.set(row.date, {});
      const entry = dateMap.get(row.date)!;
      entry[row.stage_code] = (entry[row.stage_code] || 0) + row.count;
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Movimentação da Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Seletor multi-etapa */}
        <div className="mb-4 flex flex-wrap gap-2">
          {stages.map(stage => (
            <button
              key={stage.stage_code}
              type="button"
              onClick={() => toggleStage(stage.stage_code)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedStages.has(stage.stage_code)
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border text-muted-foreground',
              )}
            >
              {stage.name}
            </button>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {stages
              .filter(s => selectedStages.has(s.stage_code))
              .map(stage => (
                <Line
                  key={stage.stage_code}
                  type="monotone"
                  dataKey={stage.stage_code}
                  name={stage.name}
                  stroke={STAGE_COLORS[stage.color_token || 'zinc'] || '#71717a'}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

> **Nota**: `cn` é importado de `@/lib/utils` (já existe no projeto). Recharts já é dependência usada no módulo finance do CRM interno.

---

### Etapa 4.5 — Atualizar `InternalCrmDashboardView.tsx`

**Arquivo**: `src/modules/internal-crm/components/dashboard/InternalCrmDashboardView.tsx`

**Ações**:
1. Remover import de `StalledDealsTable`
2. Adicionar import de `PipelineMovementChart`
3. Adicionar fetch de `stages` (usar `useInternalCrmPipelineStages`)
4. No JSX, substituir `<StalledDealsTable>` pelo `<PipelineMovementChart>`
5. Manter `<NextActionsPanel>` e `<OnboardingQueue>`

Nova estrutura de imports e layout:

```tsx
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KpiGrid } from '@/modules/internal-crm/components/dashboard/cards/KpiGrid';
import { NextActionsPanel } from '@/modules/internal-crm/components/dashboard/cards/NextActionsPanel';
import { OnboardingQueue } from '@/modules/internal-crm/components/dashboard/cards/OnboardingQueue';
import { PipelineMovementChart } from '@/modules/internal-crm/components/dashboard/cards/PipelineMovementChart';
import { useInternalCrmDashboardModule } from '@/modules/internal-crm/hooks/useInternalCrmDashboard';
import { useInternalCrmPipelineStages } from '@/modules/internal-crm/hooks/useInternalCrmApi';

// ... (props type stays the same)

export function InternalCrmDashboardView(props) {
  const dashboard = useInternalCrmDashboardModule({ ... });
  const stagesQuery = useInternalCrmPipelineStages();
  const kpis = dashboard.dashboardQuery.data?.kpis;
  const stages = stagesQuery.data?.stages || [];

  return (
    <div className="space-y-6">
      <PageHeader ... />

      {/* Filtro de datas (inalterado) */}
      <div className="grid gap-3 ..."> ... </div>

      {/* KPIs novas (3 linhas) */}
      <KpiGrid kpis={kpis} />

      {/* Gráfico de movimentação da pipeline (substitui StalledDealsTable) */}
      <PipelineMovementChart
        data={kpis?.pipeline_movement || []}
        stages={stages}
      />

      {/* Próximas ações + Onboarding */}
      <div className="grid gap-6 xl:grid-cols-2">
        <NextActionsPanel tasks={kpis?.next_actions || []} />
        <OnboardingQueue clients={kpis?.onboarding_queue || []} />
      </div>
    </div>
  );
}
```

---

### Etapa 4.6 — Verificar dependência Recharts

**Verificação**: Recharts já é usado em `src/modules/internal-crm/components/finance/charts/`. Confirmar que está no `package.json`:

```
grep "recharts" package.json
```

Se não estiver: `npm install recharts` (improvável, já está em uso).

---

### Etapa 4.7 — Verificar `landing_form_sessions` schema

**Verificação**: Confirmar que `internal_crm.landing_form_sessions` existe e tem `completed_at`:

A migração `20260329193000_internal_crm_lp_popup_public_intake.sql` cria `landing_form_sessions`. Verificar colunas:

```
grep -A 30 "landing_form_sessions" supabase/migrations/20260329193000_internal_crm_lp_popup_public_intake.sql
```

Se `completed_at` não existir, usar `step_reached >= step_count` ou `submitted_at IS NOT NULL` como alternativa.

---

### Etapa 4.8 — Deletar `StalledDealsTable.tsx` (opcional)

**Arquivo**: `src/modules/internal-crm/components/dashboard/cards/StalledDealsTable.tsx`

**Ação**: Remover o arquivo. Verificar que nenhum outro componente o importa:

```
grep -r "StalledDealsTable" src/
```

Se referenciado apenas em `InternalCrmDashboardView.tsx`, seguro deletar.

---

## 5. Checklist de Segurança contra Regressões

| Verificação | Detalhe |
|---|---|
| Schema isolado | Todas as queries usam `internal_crm.*` via `crmSchema()` — zero impacto em `public.*` |
| Nenhum componente SolarZap alterado | Mudanças limitadas a `src/modules/internal-crm/` e `supabase/functions/internal-crm-api/` |
| Tipo backward-compatible na API | O hook `useInternalCrmDashboard` sempre recebe `{ ok: true, kpis: ... }` — os novos campos substituem os antigos no mesmo contrato |
| Sem mudança de rotas | Dashboard page continua com mesmo path e mesma estrutura |
| Sem migrações destrutivas | Nenhuma `ALTER TABLE ... DROP COLUMN` — apenas queries de leitura em tabelas existentes |
| Build check | Rodar `npx tsc --noEmit` após mudanças para garantir tipagem |
| Smoke test | Acessar dashboard com e sem dados, verificar que cards renderizam com 0 |

---

## 6. Ordem de Execução Recomendada

1. **Etapa 4.7** — Verificar schema `landing_form_sessions` (read-only, seguro)
2. **Etapa 4.6** — Verificar Recharts no package.json
3. **Etapa 4.1** — Atualizar tipo TypeScript
4. **Etapa 4.2** — Atualizar edge function
5. **Etapa 4.3** — Reescrever KpiGrid.tsx
6. **Etapa 4.4** — Criar PipelineMovementChart.tsx
7. **Etapa 4.5** — Atualizar InternalCrmDashboardView.tsx
8. **Etapa 4.8** — Remover StalledDealsTable.tsx
9. **Build check** — `npx tsc --noEmit`
10. **Visual check** — Abrir dashboard e validar

---

## 7. Estimativa de Impacto

| Métrica | Valor |
|---|---|
| Arquivos criados | 1 (`PipelineMovementChart.tsx`) |
| Arquivos modificados | 4 (`types/index.ts`, `KpiGrid.tsx`, `InternalCrmDashboardView.tsx`, `internal-crm-api/index.ts`) |
| Arquivos removidos | 1 (`StalledDealsTable.tsx`) |
| Migrações SQL necessárias | 0 (leitura de tabelas existentes) |
| Impacto no SolarZap público | **Zero** — todo código está no módulo `internal-crm` isolado |
