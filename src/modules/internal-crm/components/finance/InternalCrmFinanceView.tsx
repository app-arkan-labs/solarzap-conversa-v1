import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RevenueKpiGrid } from '@/modules/internal-crm/components/finance/cards/RevenueKpiGrid';
import { MrrTrendChart } from '@/modules/internal-crm/components/finance/charts/MrrTrendChart';
import { RevenueBreakdownChart } from '@/modules/internal-crm/components/finance/charts/RevenueBreakdownChart';
import { CustomerSnapshotTable } from '@/modules/internal-crm/components/finance/tables/CustomerSnapshotTable';
import { OrdersTable } from '@/modules/internal-crm/components/finance/tables/OrdersTable';
import { PendingPaymentsTable } from '@/modules/internal-crm/components/finance/tables/PendingPaymentsTable';
import { SubscriptionsTable } from '@/modules/internal-crm/components/finance/tables/SubscriptionsTable';
import { useInternalCrmFinanceModule } from '@/modules/internal-crm/hooks/useInternalCrmFinance';
import { useToast } from '@/hooks/use-toast';
import { InternalCrmCompactBar } from '@/modules/internal-crm/components/InternalCrmPageLayout';

export function InternalCrmFinanceView() {
  const { toast } = useToast();
  const finance = useInternalCrmFinanceModule();

  async function handleRefreshSnapshot() {
    try {
      await finance.refreshSnapshotMutation.mutateAsync({ action: 'refresh_customer_snapshot' });
      toast({ title: 'Snapshot atualizado', description: 'Sincronizacao de clientes provisionados concluida.' });
    } catch {
      toast({ title: 'Falha ao atualizar snapshot', description: 'Tente novamente em instantes.', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <InternalCrmCompactBar className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button onClick={() => void handleRefreshSnapshot()} disabled={finance.refreshSnapshotMutation.isPending} className="w-full gap-2 sm:w-auto">
          <RotateCw className="h-4 w-4" />
          Atualizar snapshot
        </Button>
      </InternalCrmCompactBar>

      <RevenueKpiGrid summary={finance.summary} pendingPaymentsRows={finance.pendingPayments.length} />

      <div className="grid gap-6 xl:grid-cols-2">
        <MrrTrendChart data={finance.monthlyMrr} />
        <RevenueBreakdownChart data={finance.revenueBreakdown} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <OrdersTable orders={finance.summary?.orders || []} />
        <SubscriptionsTable subscriptions={finance.summary?.subscriptions || []} />
      </div>

      <PendingPaymentsTable rows={finance.pendingPayments} />

      <CustomerSnapshotTable snapshots={finance.customerSnapshotQuery.data?.snapshots || []} />
    </div>
  );
}
