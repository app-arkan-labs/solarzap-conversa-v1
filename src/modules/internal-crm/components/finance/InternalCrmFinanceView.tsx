import { DollarSign } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
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
      <PageHeader
        title="Financeiro CRM"
        subtitle="Receita comercial da SolarZap separada do billing operacional do SaaS."
        icon={DollarSign}
        actionContent={
          <Button onClick={() => void handleRefreshSnapshot()} disabled={finance.refreshSnapshotMutation.isPending}>
            Atualizar snapshot
          </Button>
        }
      />

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
