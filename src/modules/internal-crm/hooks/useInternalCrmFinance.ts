import { useMemo } from 'react';
import {
  internalCrmQueryKeys,
  useInternalCrmCustomerSnapshot,
  useInternalCrmFinance,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmFinanceSummary } from '@/modules/internal-crm/types';

export type FinancePendingPaymentRow = {
  id: string;
  source: 'order' | 'subscription';
  label: string;
  status: string;
  amount_cents: number;
  reference_date: string | null;
};

export type FinanceMonthlyMrrRow = {
  month: string;
  mrr_cents: number;
};

function normalizeMonth(isoLike: string | null | undefined): string {
  if (!isoLike) return 'Sem data';
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function buildPendingPayments(summary: InternalCrmFinanceSummary | undefined): FinancePendingPaymentRow[] {
  if (!summary) return [];

  const orderRows = summary.orders
    .filter((order) => String(order.status || '').toLowerCase() !== 'paid')
    .map((order) => ({
      id: order.id,
      source: 'order' as const,
      label: order.order_number || order.id.slice(0, 8),
      status: String(order.status || 'pending'),
      amount_cents: Number(order.total_cents || 0),
      reference_date: order.paid_at || order.created_at || null,
    }));

  const subscriptionRows = summary.subscriptions
    .filter((subscription) => ['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'canceled'].includes(String(subscription.status || '').toLowerCase()))
    .map((subscription) => ({
      id: subscription.id,
      source: 'subscription' as const,
      label: subscription.product_code || subscription.id.slice(0, 8),
      status: String(subscription.status || 'pending'),
      amount_cents: Number(subscription.mrr_cents || 0),
      reference_date: subscription.current_period_end || null,
    }));

  return [...orderRows, ...subscriptionRows]
    .sort((a, b) => String(b.reference_date || '').localeCompare(String(a.reference_date || '')))
    .slice(0, 30);
}

function buildMonthlyMrr(summary: InternalCrmFinanceSummary | undefined): FinanceMonthlyMrrRow[] {
  if (!summary) return [];

  const aggregation = new Map<string, number>();
  for (const subscription of summary.subscriptions) {
    const month = normalizeMonth(subscription.current_period_end || subscription.created_at || null);
    aggregation.set(month, (aggregation.get(month) || 0) + Number(subscription.mrr_cents || 0));
  }

  return Array.from(aggregation.entries()).map(([month, mrr_cents]) => ({ month, mrr_cents }));
}

export function useInternalCrmFinanceModule() {
  const financeQuery = useInternalCrmFinance();
  const customerSnapshotQuery = useInternalCrmCustomerSnapshot();
  const summary = financeQuery.data?.summary;

  const refreshSnapshotMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.customerSnapshot(), internalCrmQueryKeys.finance()],
  });

  const pendingPayments = useMemo(() => buildPendingPayments(summary), [summary]);
  const monthlyMrr = useMemo(() => buildMonthlyMrr(summary), [summary]);
  const revenueBreakdown = useMemo(
    () => [
      { name: 'One-time', value_cents: Number(summary?.revenue_one_time_cents || 0) },
      { name: 'MRR ativo', value_cents: Number(summary?.mrr_active_cents || 0) },
    ],
    [summary?.mrr_active_cents, summary?.revenue_one_time_cents],
  );

  return {
    financeQuery,
    customerSnapshotQuery,
    refreshSnapshotMutation,
    summary,
    pendingPayments,
    monthlyMrr,
    revenueBreakdown,
  };
}
