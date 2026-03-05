import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminOrgs } from '@/hooks/useAdminApi';

const PER_PAGE = 20;

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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Organizacoes</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por nome da organizacao"
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
            <SelectTrigger className="w-full md:w-[220px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="suspended">Suspensas</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lista ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">Membros</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Propostas</TableHead>
                <TableHead className="text-right">Instancias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow
                  key={org.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/admin/orgs/${org.id}`)}
                >
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.status}</TableCell>
                  <TableCell>{org.plan}</TableCell>
                  <TableCell className="text-right">{org.member_count}</TableCell>
                  <TableCell className="text-right">{org.lead_count}</TableCell>
                  <TableCell className="text-right">{org.proposal_count}</TableCell>
                  <TableCell className="text-right">{org.instance_count}</TableCell>
                </TableRow>
              ))}
              {!orgs.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {orgsQuery.isLoading ? 'Carregando...' : 'Nenhuma organizacao encontrada.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || orgsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Pagina {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= totalPages || orgsQuery.isFetching}
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
