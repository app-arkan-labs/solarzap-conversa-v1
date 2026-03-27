import { useLossAnalytics } from "@/hooks/useLossAnalytics";
import { LossAnalyticsPanel } from "@/components/dashboard/LossAnalyticsPanel";

interface DashboardLossesPageProps {
  startDate: Date;
  endDate: Date;
  ownerUserId?: string | null;
  onViewPipeline?: () => void;
}

export function DashboardLossesPage({
  startDate,
  endDate,
  ownerUserId = null,
  onViewPipeline,
}: DashboardLossesPageProps) {
  const { data, isLoading, error } = useLossAnalytics({
    startDate,
    endDate,
    ownerUserId,
    enabled: true,
  });

  return <LossAnalyticsPanel data={data} isLoading={isLoading} error={error} onViewPipeline={onViewPipeline} />;
}
