import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminOrgs } from '@/hooks/useAdminApi';

const PER_PAGE = 20;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspensa', className: 'bg-red-100 text-red-700 border-red-200' },
  churned: { label: 'Churned', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const PLAN_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: 'Grátis', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  start: { label: 'Start', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  starter: { label: 'Start', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  pro: { label: 'Pro', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  scale: { label: 'Scale', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  business: { label: 'Scale', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function OrgAvatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s_@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 font-semibold text-xs shrink-0">
      {initials || <Building2 className="h-4 w-4" />}
    </div>
  );
}

export default function OrgsList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');

  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: search || undefined,
      status: status === 'all' ? undefined : status,
    }),
    [page, search, status],
  );

  const orgsQuery = useAdminOrgs(queryParams);
  const orgs = orgsQuery.data?.orgs ?? [];
  const total = orgsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setPage(1);
      setSearch(searchInput.trim());
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Organizações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{total} organizações cadastradas</p>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-5 flex flex-col gap-3 md:flex-row">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar por nome da organização..."
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              Buscar
            </Button>
          </div>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="suspended">Suspensas</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Orgs Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="pl-5">Organização</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">Membros</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Propostas</TableHead>
                <TableHead className="text-right pr-5">WhatsApp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => {
                const statusBadge = STATUS_BADGE[org.status] || STATUS_BADGE.active;
                const planBadge = PLAN_BADGE[org.plan] || PLAN_BADGE.free;
                return (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => navigate(`/admin/orgs/${org.id}`)}
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <OrgAvatar name={org.name} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{org.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{org.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs border ${statusBadge.className}`}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs border ${planBadge.className}`}>
                        {planBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{org.member_count}</TableCell>
                    <TableCell className="text-right font-medium">{org.lead_count}</TableCell>
                    <TableCell className="text-right font-medium">{org.proposal_count}</TableCell>
                    <TableCell className="text-right pr-5 font-medium">{org.instance_count}</TableCell>
                  </TableRow>
                );
              })}
              {!orgs.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {orgsQuery.isLoading ? 'Carregando organizações...' : 'Nenhuma organização encontrada.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="px-5 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || orgsQuery.isFetching}
                onClick={() => setPage((c) => Math.max(1, c - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || orgsQuery.isFetching}
                onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
