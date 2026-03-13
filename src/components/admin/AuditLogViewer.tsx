import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Download } from 'lucide-react';
import { useAdminAuditLog } from '@/hooks/useAdminApi';

const PER_PAGE = 30;

const ACTION_COLORS: Record<string, string> = {
  suspend_org: 'bg-red-100 text-red-700',
  reactivate_org: 'bg-emerald-100 text-emerald-700',
  delete_org: 'bg-red-200 text-red-800',
  update_org_plan: 'bg-blue-100 text-blue-700',
  create_feature_flag: 'bg-purple-100 text-purple-700',
  set_org_feature: 'bg-purple-100 text-purple-700',
};

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AuditLogViewer() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('all');
  const [actorUserId, setActorUserId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      action: action !== 'all' ? action : undefined,
      actor_user_id: actorUserId.trim() || undefined,
      org_id: orgId.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [action, actorUserId, orgId, dateFrom, dateTo],
  );

  const auditQuery = useAdminAuditLog({ page, per_page: PER_PAGE, filters });
  const entries = auditQuery.data?.entries ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const handleExportCsv = () => {
    if (!entries.length) return;
    const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Target', 'Org', 'Reason'];
    const rows = entries.map((e) => [
      e.ts, e.actor_user_id, e.actor_system_role, e.action,
      `${e.target_type}:${e.target_id || ''}`, e.org_id || '', e.reason || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} entradas registradas</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!entries.length}>
          <Download className="h-4 w-4 mr-1.5" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Ações</SelectItem>
              <SelectItem value="whoami">whoami</SelectItem>
              <SelectItem value="list_orgs">list_orgs</SelectItem>
              <SelectItem value="get_org_details">get_org_details</SelectItem>
              <SelectItem value="suspend_org">suspend_org</SelectItem>
              <SelectItem value="reactivate_org">reactivate_org</SelectItem>
              <SelectItem value="delete_org">delete_org</SelectItem>
              <SelectItem value="update_org_plan">update_org_plan</SelectItem>
              <SelectItem value="create_feature_flag">create_feature_flag</SelectItem>
              <SelectItem value="set_org_feature">set_org_feature</SelectItem>
            </SelectContent>
          </Select>
          <Input value={actorUserId} onChange={(e) => { setActorUserId(e.target.value); setPage(1); }} placeholder="Actor user_id" />
          <Input value={orgId} onChange={(e) => { setOrgId(e.target.value); setPage(1); }} placeholder="Org ID" />
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="De" />
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="Até" />
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="pl-5 w-8"></TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="pr-5">Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isOpen = expandedId === entry.id;
                const actionColor = ACTION_COLORS[entry.action] || 'bg-slate-100 text-slate-700';
                const hasDiff = entry.before !== null || entry.after !== null;
                return (
                  <Collapsible key={entry.id} open={isOpen} onOpenChange={() => setExpandedId(isOpen ? null : entry.id)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className="cursor-pointer hover:bg-slate-50 transition-colors">
                          <TableCell className="pl-5 w-8">
                            {hasDiff && <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                          </TableCell>
                          <TableCell className="text-sm">{formatDateTime(entry.ts)}</TableCell>
                          <TableCell className="text-xs font-mono">{entry.actor_user_id.slice(0, 8)}...</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{entry.actor_system_role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-xs ${actionColor}`}>{entry.action}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <span className="font-medium">{entry.target_type}</span>
                              {entry.target_id && <span className="text-muted-foreground ml-1">({entry.target_id.slice(0, 8)}...)</span>}
                            </div>
                          </TableCell>
                          <TableCell className="pr-5 text-sm max-w-[200px] truncate">{entry.reason || '—'}</TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      {hasDiff && (
                        <CollapsibleContent asChild>
                          <TableRow className="bg-slate-50">
                            <TableCell colSpan={7} className="px-5 py-3">
                              <div className="grid md:grid-cols-2 gap-3">
                                {entry.before !== null && (
                                  <div>
                                    <p className="text-xs font-semibold text-red-600 mb-1">Before</p>
                                    <pre className="text-xs bg-red-50 p-2 rounded-md overflow-auto max-h-48 font-mono">
                                      {JSON.stringify(entry.before, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {entry.after !== null && (
                                  <div>
                                    <p className="text-xs font-semibold text-emerald-600 mb-1">After</p>
                                    <pre className="text-xs bg-emerald-50 p-2 rounded-md overflow-auto max-h-48 font-mono">
                                      {JSON.stringify(entry.after, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      )}
                    </>
                  </Collapsible>
                );
              })}
              {!entries.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {auditQuery.isLoading ? 'Carregando audit log...' : 'Nenhuma entrada encontrada.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="px-5 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || auditQuery.isFetching} onClick={() => setPage((c) => Math.max(1, c - 1))}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || auditQuery.isFetching} onClick={() => setPage((c) => Math.min(totalPages, c + 1))}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
