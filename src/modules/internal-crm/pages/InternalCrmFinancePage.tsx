import { DollarSign, Receipt, Repeat2 } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInternalCrmFinance } from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { MetricCard, TokenBadge, formatCurrencyBr, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';

export default function InternalCrmFinancePage() {
  const financeQuery = useInternalCrmFinance();
  const summary = financeQuery.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro CRM"
        subtitle="Receita comercial da SolarZap separada do billing operacional do SaaS."
        icon={DollarSign}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Receita one-time" value={formatCurrencyBr(summary?.revenue_one_time_cents ?? 0)} subtitle="Vendas pagas de servicos e mentorias" />
        <MetricCard title="MRR vendido" value={formatCurrencyBr(summary?.mrr_sold_cents ?? 0)} subtitle="Promessa comercial fechada" accentClassName="text-sky-700" />
        <MetricCard title="MRR ativo" value={formatCurrencyBr(summary?.mrr_active_cents ?? 0)} subtitle="Recorrencia ativa em subscriptions internas" accentClassName="text-emerald-700" />
        <MetricCard title="Pagamentos pendentes" value={String(summary?.pending_payments_count ?? 0)} subtitle="Deals ou ordens aguardando confirmacao" accentClassName="text-amber-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Metodo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pago em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.orders || []).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number || order.id.slice(0, 8)}</TableCell>
                    <TableCell><TokenBadge token={order.status} /></TableCell>
                    <TableCell>{order.payment_method}</TableCell>
                    <TableCell>{formatCurrencyBr(order.total_cents)}</TableCell>
                    <TableCell>{formatDateOnly(order.paid_at)}</TableCell>
                  </TableRow>
                ))}
                {(summary?.orders || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhuma order interna registrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat2 className="h-4 w-4 text-primary" />
              Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Renovacao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.subscriptions || []).map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell className="font-medium">{subscription.product_code || '-'}</TableCell>
                    <TableCell><TokenBadge token={subscription.status} /></TableCell>
                    <TableCell>{formatCurrencyBr(subscription.mrr_cents)}</TableCell>
                    <TableCell>{subscription.billing_interval}</TableCell>
                    <TableCell>{formatDateOnly(subscription.current_period_end)}</TableCell>
                  </TableRow>
                ))}
                {(summary?.subscriptions || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhuma subscription interna registrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
