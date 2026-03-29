import { useMemo } from 'react';
import { useInternalCrmDashboard as useInternalCrmDashboardQuery } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export type InternalCrmDashboardFilters = {
  from_date?: string;
  to_date?: string;
};

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function useInternalCrmDashboardModule(filters: InternalCrmDashboardFilters) {
  const params = useMemo(() => {
    const now = new Date();
    const fallbackFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromDate = parseDate(filters.from_date, fallbackFrom);
    const toDateBase = parseDate(filters.to_date, now);
    const toDate = new Date(toDateBase.getTime());
    toDate.setUTCHours(23, 59, 59, 999);

    const periodDays = Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) || 30,
    );

    return {
      from_date: fromDate.toISOString(),
      to_date: toDate.toISOString(),
      period_days: periodDays,
    };
  }, [filters.from_date, filters.to_date]);

  const dashboardQuery = useInternalCrmDashboardQuery(params);

  return {
    dashboardQuery,
    params,
  };
}
