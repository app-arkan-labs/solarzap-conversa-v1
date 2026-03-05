import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminAuditLog } from '@/hooks/useAdminApi';

const PER_PAGE = 30;

export default function AuditLogViewer() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = useMemo(
    () => ({
      action: action.trim() || undefined,
      actor_user_id: actorUserId.trim() || undefined,
      org_id: orgId.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [action, actorUserId, orgId, dateFrom, dateTo],
  );

  const auditQuery = useAdminAuditLog({
    page,
    per_page: PER_PAGE,
    filters,
  });

  const entries = auditQuery.data?.entries ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Log</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          <Input
            value={action}
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
            placeholder="action"
          />
          <Input
            value={actorUserId}
            onChange={(event) => {
              setPage(1);
              setActorUserId(event.target.value);
            }}
            placeholder="actor_user_id (uuid)"
          />
          <Input
            value={orgId}
            onChange={(event) => {
              setPage(1);
              setOrgId(event.target.value);
            }}
            placeholder="org_id (uuid)"
          />
          <Input
            value={dateFrom}
            onChange={(event) => {
              setPage(1);
              setDateFrom(event.target.value);
            }}
            placeholder="date_from (ISO)"
          />
          <Input
            value={dateTo}
            onChange={(event) => {
              setPage(1);
              setDateTo(event.target.value);
            }}
            placeholder="date_to (ISO)"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entradas ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">{entry.ts}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.actor_user_id}</TableCell>
                  <TableCell>{entry.actor_system_role}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <div>{entry.target_type}</div>
                      <div className="text-muted-foreground">{entry.target_id || '-'}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.org_id || '-'}</TableCell>
                  <TableCell>{entry.reason || '-'}</TableCell>
                </TableRow>
              ))}
              {!entries.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {auditQuery.isLoading ? 'Carregando audit log...' : 'Nenhuma entrada encontrada.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || auditQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Pagina {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= totalPages || auditQuery.isFetching}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Proxima
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
