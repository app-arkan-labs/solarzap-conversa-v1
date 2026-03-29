import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TokenBadge, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmCustomerSnapshot } from '@/modules/internal-crm/types';

type CustomerSnapshotTableProps = {
  snapshots: InternalCrmCustomerSnapshot[];
};

export function CustomerSnapshotTable(props: CustomerSnapshotTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Snapshot de clientes provisionados</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Instancias</TableHead>
              <TableHead>Atualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.snapshots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Snapshot ainda nao sincronizado.
                </TableCell>
              </TableRow>
            ) : (
              props.snapshots.map((snapshot) => (
                <TableRow key={snapshot.id}>
                  <TableCell className="font-medium">{snapshot.company_name || snapshot.client_id.slice(0, 8)}</TableCell>
                  <TableCell>{snapshot.plan_key || '-'}</TableCell>
                  <TableCell>
                    <TokenBadge token={snapshot.subscription_status} />
                  </TableCell>
                  <TableCell>{snapshot.lead_count}</TableCell>
                  <TableCell>{snapshot.whatsapp_instance_count}</TableCell>
                  <TableCell>{formatDateOnly(snapshot.last_synced_at || snapshot.updated_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
