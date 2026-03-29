import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TokenBadge, formatCurrencyBr, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmFinanceSummary } from '@/modules/internal-crm/types';

type OrdersTableProps = {
  orders: InternalCrmFinanceSummary['orders'];
};

export function OrdersTable(props: OrdersTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders</CardTitle>
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
            {props.orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma order interna registrada.
                </TableCell>
              </TableRow>
            ) : (
              props.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.order_number || order.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <TokenBadge token={order.status} />
                  </TableCell>
                  <TableCell>{order.payment_method || '-'}</TableCell>
                  <TableCell>{formatCurrencyBr(order.total_cents)}</TableCell>
                  <TableCell>{formatDateOnly(order.paid_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
