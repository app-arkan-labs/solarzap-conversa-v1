import { CHANNEL_INFO, PIPELINE_STAGES, type PipelineStage } from '@/types/solarzap';
import { normalizeLeadStage } from '@/lib/leadStageNormalization';

export type FunnelStageGroup = 'topo' | 'meio' | 'fundo' | 'saida';

export interface DashboardFunnelStageRow {
  stage: PipelineStage;
  label: string;
  group: FunnelStageGroup;
  count: number;
  pct: number;
  stale_count: number;
  entered_in_period: number;
  sla_days: number | null;
  is_terminal: boolean;
}

export interface DashboardFunnelGroupRow {
  key: FunnelStageGroup;
  label: string;
  count: number;
  pct: number;
  stale_count: number;
}

export interface DashboardFunnelPayload {
  total: number;
  active: number;
  stale_total: number;
  moved_in_period: number;
  lost_in_period: number;
  won_in_period: number;
  top_bottleneck_stage: PipelineStage | null;
  by_stage: DashboardFunnelStageRow[];
  by_group: DashboardFunnelGroupRow[];
}

export interface DashboardSourcePerformanceRow {
  source: string;
  label: string;
  leads: number;
  won: number;
  conversion_pct: number;
  revenue: number;
  share_leads_pct: number;
  share_revenue_pct: number;
}

export interface DashboardLossReasonSummary {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface DashboardLossSummary {
  total: number;
  previous_total: number;
  change_pct: number | null;
  active_reasons: number;
  top_reason: DashboardLossReasonSummary | null;
}

type FunnelLeadRow = {
  status_pipeline?: unknown;
  stage_changed_at?: string | null;
};

type FunnelHistoryRow = {
  to_stage?: unknown;
};

type SourceLeadRow = {
  canal?: string | null;
};

type SourceSaleRow = {
  source?: string | null;
  revenue?: number | null;
};

type LossRow = {
  reason_key?: string | null;
  reason_label?: string | null;
};

const STAGE_GROUPS: Record<PipelineStage, FunnelStageGroup> = {
  novo_lead: 'topo',
  respondeu: 'topo',
  chamada_agendada: 'meio',
  chamada_realizada: 'meio',
  nao_compareceu: 'meio',
  aguardando_proposta: 'meio',
  proposta_pronta: 'meio',
  visita_agendada: 'meio',
  visita_realizada: 'meio',
  proposta_negociacao: 'fundo',
  financiamento: 'fundo',
  aprovou_projeto: 'fundo',
  contrato_assinado: 'fundo',
  projeto_pago: 'fundo',
  aguardando_instalacao: 'fundo',
  projeto_instalado: 'saida',
  coletar_avaliacao: 'saida',
  contato_futuro: 'saida',
  perdido: 'saida',
};

const GROUP_LABELS: Record<FunnelStageGroup, string> = {
  topo: 'Topo',
  meio: 'Meio',
  fundo: 'Fundo',
  saida: 'Saidas',
};

const STAGE_SLA_DAYS: Record<PipelineStage, number | null> = {
  novo_lead: 1,
  respondeu: 2,
  chamada_agendada: 2,
  chamada_realizada: 2,
  nao_compareceu: 1,
  aguardando_proposta: 3,
  proposta_pronta: 3,
  visita_agendada: 2,
  visita_realizada: 2,
  proposta_negociacao: 5,
  financiamento: 7,
  aprovou_projeto: 7,
  contrato_assinado: 5,
  projeto_pago: 7,
  aguardando_instalacao: 15,
  projeto_instalado: null,
  coletar_avaliacao: null,
  contato_futuro: null,
  perdido: null,
};

const WON_STAGES = new Set<PipelineStage>([
  'contrato_assinado',
  'projeto_pago',
  'aguardando_instalacao',
  'projeto_instalado',
  'coletar_avaliacao',
]);

const FUNNEL_STAGE_ORDER = Object.keys(PIPELINE_STAGES) as PipelineStage[];

const normalizeSource = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  return raw || 'unknown';
};

export const formatSourceLabel = (source: string): string => {
  const trimmed = normalizeSource(source);
  const canonical = trimmed as keyof typeof CHANNEL_INFO;
  if (canonical in CHANNEL_INFO) {
    return CHANNEL_INFO[canonical].label;
  }

  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';
};

export const buildDashboardFunnel = (
  leads: FunnelLeadRow[],
  historyRows: FunnelHistoryRow[],
  now: Date = new Date(),
): DashboardFunnelPayload => {
  const countMap = new Map<PipelineStage, number>();
  const staleMap = new Map<PipelineStage, number>();
  const enteredMap = new Map<PipelineStage, number>();

  for (const row of leads) {
    const stage = normalizeLeadStage(row.status_pipeline);
    countMap.set(stage, (countMap.get(stage) || 0) + 1);

    const stageSla = STAGE_SLA_DAYS[stage];
    if (!stageSla || !row.stage_changed_at) continue;

    const changedAtMs = new Date(row.stage_changed_at).getTime();
    const isValidDate = Number.isFinite(changedAtMs);
    if (!isValidDate) continue;

    const daysInStage = Math.floor((now.getTime() - changedAtMs) / (1000 * 60 * 60 * 24));
    if (daysInStage > stageSla) {
      staleMap.set(stage, (staleMap.get(stage) || 0) + 1);
    }
  }

  for (const row of historyRows) {
    const stage = normalizeLeadStage(row.to_stage);
    enteredMap.set(stage, (enteredMap.get(stage) || 0) + 1);
  }

  const total = leads.length;
  const byStage = FUNNEL_STAGE_ORDER.map((stage) => {
    const count = countMap.get(stage) || 0;
    const staleCount = staleMap.get(stage) || 0;
    const enteredInPeriod = enteredMap.get(stage) || 0;
    const group = STAGE_GROUPS[stage];
    const slaDays = STAGE_SLA_DAYS[stage];

    return {
      stage,
      label: PIPELINE_STAGES[stage].title,
      group,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      stale_count: staleCount,
      entered_in_period: enteredInPeriod,
      sla_days: slaDays,
      is_terminal: group === 'saida',
    } satisfies DashboardFunnelStageRow;
  }).filter((row) => row.count > 0 || row.entered_in_period > 0);

  const byGroup = (Object.keys(GROUP_LABELS) as FunnelStageGroup[]).map((groupKey) => {
    const rows = byStage.filter((row) => row.group === groupKey);
    const count = rows.reduce((sum, row) => sum + row.count, 0);
    const staleCount = rows.reduce((sum, row) => sum + row.stale_count, 0);

    return {
      key: groupKey,
      label: GROUP_LABELS[groupKey],
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      stale_count: staleCount,
    } satisfies DashboardFunnelGroupRow;
  });

  const staleTotal = byStage.reduce((sum, row) => sum + row.stale_count, 0);
  const active = byStage
    .filter((row) => row.group !== 'saida')
    .reduce((sum, row) => sum + row.count, 0);
  const topBottleneck = byStage
    .filter((row) => row.stale_count > 0)
    .sort((left, right) => right.stale_count - left.stale_count || right.count - left.count)[0];

  return {
    total,
    active,
    stale_total: staleTotal,
    moved_in_period: historyRows.length,
    lost_in_period: historyRows.filter((row) => normalizeLeadStage(row.to_stage) === 'perdido').length,
    won_in_period: historyRows.filter((row) => WON_STAGES.has(normalizeLeadStage(row.to_stage))).length,
    top_bottleneck_stage: topBottleneck?.stage || null,
    by_stage: byStage,
    by_group: byGroup,
  };
};

export const buildSourcePerformance = (
  leads: SourceLeadRow[],
  sales: SourceSaleRow[],
): DashboardSourcePerformanceRow[] => {
  const leadMap = new Map<string, number>();
  const saleMap = new Map<string, { won: number; revenue: number }>();

  for (const row of leads) {
    const source = normalizeSource(row.canal);
    leadMap.set(source, (leadMap.get(source) || 0) + 1);
  }

  for (const row of sales) {
    const source = normalizeSource(row.source);
    const current = saleMap.get(source) || { won: 0, revenue: 0 };
    current.won += 1;
    current.revenue += Number(row.revenue || 0);
    saleMap.set(source, current);
  }

  const allSources = Array.from(new Set([...leadMap.keys(), ...saleMap.keys()]));
  const totalLeads = Array.from(leadMap.values()).reduce((sum, value) => sum + value, 0);
  const totalRevenue = Array.from(saleMap.values()).reduce((sum, value) => sum + value.revenue, 0);

  return allSources
    .map((source) => {
      const leadsCount = leadMap.get(source) || 0;
      const saleStats = saleMap.get(source) || { won: 0, revenue: 0 };

      return {
        source,
        label: formatSourceLabel(source),
        leads: leadsCount,
        won: saleStats.won,
        conversion_pct: leadsCount > 0 ? (saleStats.won / leadsCount) * 100 : 0,
        revenue: saleStats.revenue,
        share_leads_pct: totalLeads > 0 ? (leadsCount / totalLeads) * 100 : 0,
        share_revenue_pct: totalRevenue > 0 ? (saleStats.revenue / totalRevenue) * 100 : 0,
      } satisfies DashboardSourcePerformanceRow;
    })
    .sort((left, right) => right.revenue - left.revenue || right.won - left.won || right.leads - left.leads);
};

export const buildLossSummary = (
  currentRows: LossRow[],
  previousRows: LossRow[],
): DashboardLossSummary => {
  const reasonCounts = new Map<string, DashboardLossReasonSummary>();

  for (const row of currentRows) {
    const key = String(row.reason_key || 'outro').trim() || 'outro';
    const label = String(row.reason_label || 'Outro').trim() || 'Outro';
    const current = reasonCounts.get(key);
    if (current) {
      current.count += 1;
      continue;
    }

    reasonCounts.set(key, {
      key,
      label,
      count: 1,
      share: 0,
    });
  }

  const total = currentRows.length;
  const previousTotal = previousRows.length;
  const sortedReasons = Array.from(reasonCounts.values())
    .map((reason) => ({
      ...reason,
      share: total > 0 ? Math.round((reason.count / total) * 100) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  let changePct: number | null = 0;
  if (previousTotal === 0) {
    changePct = total > 0 ? 100 : 0;
  } else {
    changePct = Math.round(((total - previousTotal) / previousTotal) * 100);
  }

  return {
    total,
    previous_total: previousTotal,
    change_pct: changePct,
    active_reasons: sortedReasons.length,
    top_reason: sortedReasons[0] || null,
  };
};
