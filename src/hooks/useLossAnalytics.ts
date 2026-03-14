import { differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LossReasonAggregate {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface LossRecentEntry {
  id: string;
  leadName: string;
  reasonLabel: string;
  detail: string | null;
  createdAt: string;
  author: string | null;
}

export interface LossInsight {
  title: string;
  description: string;
}

export interface LossAnalyticsPayload {
  totalLosses: number;
  previousPeriodLosses: number;
  changePercentage: number | null;
  topReason: LossReasonAggregate | null;
  chartData: LossReasonAggregate[];
  recentLosses: LossRecentEntry[];
  actionItems: LossInsight[];
}

interface UseLossAnalyticsParams {
  startDate: Date;
  endDate: Date;
  ownerUserId?: string | null;
  enabled?: boolean;
}

interface LossRow {
  id: string;
  createdAt: string;
  reasonKey: string;
  reasonLabel: string;
  detail: string | null;
  author: string | null;
  leadName: string;
}

const buildActionSuggestion = (reason: LossReasonAggregate): LossInsight => {
  switch (reason.key) {
    case 'preco_alto':
    case 'financeiro':
      return {
        title: 'Reforce ancoragem financeira',
        description: `${reason.count} perdas vieram de objeções financeiras. Teste comparativos com conta de luz, opções de parcelamento e economia em 12 meses logo no primeiro contato comercial.`,
      };
    case 'concorrente':
      return {
        title: 'Eleve a prova de confiança',
        description: `${reason.count} leads foram para concorrentes. Antecipe diferenciais de instalacao, SLA, garantia e casos reais para reduzir comparação por preço puro.`,
      };
    case 'sem_resposta':
      return {
        title: 'Reduza fricção no follow-up',
        description: `${reason.count} perdas vieram por falta de resposta. Revise cadência, CTA único e personalize o primeiro follow-up com ganho concreto de economia ou prazo.`,
      };
    case 'retorno_investimento':
      return {
        title: 'Ajuste narrativa de payback',
        description: `${reason.count} leads não compraram a tese de retorno. Mostre payback conservador, proteção contra reajuste tarifário e cenários com e sem financiamento.`,
      };
    default:
      return {
        title: `Ataque o motivo ${reason.label.toLowerCase()}`,
        description: `${reason.count} perdas no período concentraram-se em ${reason.label.toLowerCase()}. Crie uma resposta padrão e um ativo comercial curto para neutralizar essa objeção antes da proposta.`,
      };
  }
};

const mapLossRows = (rows: any[]): LossRow[] => {
  return (rows || []).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    reasonKey: String(row.motivos_perda?.key || 'outro'),
    reasonLabel: String(row.motivos_perda?.label || 'Outro'),
    detail: typeof row.motivo_detalhe === 'string' && row.motivo_detalhe.trim().length > 0 ? row.motivo_detalhe.trim() : null,
    author: typeof row.registrado_por === 'string' && row.registrado_por.trim().length > 0 ? row.registrado_por.trim() : null,
    leadName: String(row.leads?.nome || `Lead #${row.lead_id}`),
  }));
};

const fetchLossRows = async (orgId: string, startDate: Date, endDate: Date, ownerUserId?: string | null) => {
  let query = supabase
    .from('perdas_leads')
    .select(`
      id,
      lead_id,
      motivo_detalhe,
      registrado_por,
      created_at,
      motivos_perda!inner(key, label),
      leads!inner(nome, assigned_to_user_id)
    `)
    .eq('org_id', orgId)
    .gte('created_at', startOfDay(startDate).toISOString())
    .lte('created_at', endOfDay(endDate).toISOString())
    .order('created_at', { ascending: false });

  if (ownerUserId) {
    query = query.eq('leads.assigned_to_user_id', ownerUserId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return mapLossRows(data || []);
};

const buildPayload = (rows: LossRow[], previousRows: LossRow[]): LossAnalyticsPayload => {
  const counts = new Map<string, LossReasonAggregate>();

  rows.forEach((row) => {
    const current = counts.get(row.reasonKey);
    if (current) {
      current.count += 1;
      current.share = 0;
      return;
    }

    counts.set(row.reasonKey, {
      key: row.reasonKey,
      label: row.reasonLabel,
      count: 1,
      share: 0,
    });
  });

  const totalLosses = rows.length;
  const chartData = [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((item) => ({
      ...item,
      share: totalLosses > 0 ? Math.round((item.count / totalLosses) * 100) : 0,
    }));

  const previousPeriodLosses = previousRows.length;
  const changePercentage = previousPeriodLosses === 0
    ? (totalLosses > 0 ? 100 : 0)
    : Math.round(((totalLosses - previousPeriodLosses) / previousPeriodLosses) * 100);

  return {
    totalLosses,
    previousPeriodLosses,
    changePercentage,
    topReason: chartData[0] || null,
    chartData,
    recentLosses: rows.slice(0, 10).map((row) => ({
      id: row.id,
      leadName: row.leadName,
      reasonLabel: row.reasonLabel,
      detail: row.detail,
      createdAt: row.createdAt,
      author: row.author,
    })),
    actionItems: chartData.slice(0, 3).map(buildActionSuggestion),
  };
};

export function useLossAnalytics({ startDate, endDate, ownerUserId = null, enabled = true }: UseLossAnalyticsParams) {
  const { orgId } = useAuth();

  return useQuery({
    queryKey: ['loss-analytics', orgId, ownerUserId || 'all', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    enabled: enabled && Boolean(orgId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const normalizedStart = startOfDay(startDate);
      const normalizedEnd = endOfDay(endDate);
      const rangeLength = Math.max(1, differenceInCalendarDays(normalizedEnd, normalizedStart) + 1);
      const previousStart = subDays(normalizedStart, rangeLength);
      const previousEnd = subDays(normalizedEnd, rangeLength);

      const [rows, previousRows] = await Promise.all([
        fetchLossRows(orgId as string, normalizedStart, normalizedEnd, ownerUserId),
        fetchLossRows(orgId as string, previousStart, previousEnd, ownerUserId),
      ]);

      return buildPayload(rows, previousRows);
    },
  });
}


