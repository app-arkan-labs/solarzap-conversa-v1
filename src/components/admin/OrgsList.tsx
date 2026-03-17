import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, Trash2, Loader2, ArrowUpDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { adminQueryKeys, isAdminApiError, useAdminMutation, useAdminOrgs } from '@/hooks/useAdminApi';
import CreateOrgDialog from '@/components/admin/CreateOrgDialog';

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
  unlimited: { label: 'Unlimited', className: 'bg-gradient-to-r from-amber-50 to-purple-50 text-purple-700 border-purple-200' },
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
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [plan, setPlan] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<string>('desc');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('');

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, 300);
  }, []);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: search || undefined,
      status: status === 'all' ? undefined : status,
      plan: plan === 'all' ? undefined : plan,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [page, search, status, plan, sortBy, sortDir],
  );

  const orgsQuery = useAdminOrgs(queryParams);
  const orgs = orgsQuery.data?.orgs ?? [];
  const total = orgsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Bulk selection helpers
  const allOnPageSelected = orgs.length > 0 && orgs.every((o) => selectedIds.has(o.id));
  const someOnPageSelected = orgs.some((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        orgs.forEach((o) => next.delete(o.id));
      } else {
        orgs.forEach((o) => next.add(o.id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear selection on page/filter change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, status, plan, sortBy, sortDir]);

  // Bulk delete mutation
  const bulkDeleteMutation = useAdminMutation<{ ok: true; deleted: string[]; failed: { id: string; error: string }[] }>({
    invalidate: [['admin', 'orgs'], adminQueryKeys.systemMetrics()],
    onSuccess: (data) => {
      const deletedCount = data.deleted.length;
      const failedCount = data.failed.length;
      if (failedCount === 0) {
        toast({ title: `${deletedCount} organização(ões) excluída(s) com sucesso` });
      } else {
        toast({
          title: `${deletedCount} excluída(s), ${failedCount} falha(s)`,
          description: data.failed.map((f) => `${f.id.slice(0, 8)}: ${f.error}`).join(', '),
          variant: 'destructive',
        });
      }
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
      setBulkDeleteReason('');
      setBulkDeleteConfirmation('');
    },
    onError: (error) => {
      toast({
        title: 'Falha ao excluir em massa',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const handleBulkDelete = () => {
    if (!bulkDeleteReason.trim()) {
      toast({ title: 'Motivo obrigatório', variant: 'destructive' });
      return;
    }
    if (bulkDeleteConfirmation !== 'EXCLUIR') {
      toast({ title: 'Digite EXCLUIR para confirmar', variant: 'destructive' });
      return;
    }
    bulkDeleteMutation.mutate({
      action: 'bulk_delete_orgs',
      org_ids: Array.from(selectedIds),
      reason: bulkDeleteReason.trim(),
      confirmation: 'EXCLUIR',
    });
  };

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const SortButton = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
      onClick={() => toggleSort(column)}
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortBy === column ? 'text-slate-900' : 'text-slate-400'}`} />
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} organizações cadastradas</p>
        </div>
        <CreateOrgDialog />
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-5 flex flex-col gap-3 md:flex-row md:flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar por nome ou email..."
              />
            </div>
          </div>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full md:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="suspended">Suspensas</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={plan}
            onValueChange={(value) => {
              setPlan(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full md:w-[160px]">
              <SelectValue placeholder="Plano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Planos</SelectItem>
              <SelectItem value="free">Grátis</SelectItem>
              <SelectItem value="starter">Start</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="scale">Scale</SelectItem>
              <SelectItem value="unlimited">Unlimited</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="border-0 shadow-sm bg-red-50">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-red-800">
              {selectedIds.size} organização(ões) selecionada(s)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                Limpar seleção
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir Selecionadas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orgs Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="pl-5 w-10">
                  <Checkbox
                    checked={allOnPageSelected && orgs.length > 0}
                    {...(someOnPageSelected && !allOnPageSelected ? { 'data-indeterminate': 'true' } : {})}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>
                  <SortButton column="name">Organização</SortButton>
                </TableHead>
                <TableHead>Email Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">
                  <SortButton column="member_count">Membros</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton column="lead_count">Leads</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton column="proposal_count">Propostas</SortButton>
                </TableHead>
                <TableHead className="text-right pr-5">
                  <SortButton column="instance_count">WhatsApp</SortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => {
                const statusBadge = STATUS_BADGE[org.status] || STATUS_BADGE.active;
                const planBadge = PLAN_BADGE[org.plan] || PLAN_BADGE.free;
                const isSelected = selectedIds.has(org.id);
                return (
                  <TableRow
                    key={org.id}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'}`}
                  >
                    <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(org.id)}
                        aria-label={`Selecionar ${org.name}`}
                      />
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/orgs/${org.id}`)}>
                      <div className="flex items-center gap-3">
                        <OrgAvatar name={org.name} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{org.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{org.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/orgs/${org.id}`)}>
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]" title={org.owner_email ?? ''}>
                        {org.owner_email || '—'}
                      </p>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/orgs/${org.id}`)}>
                      <Badge variant="outline" className={`text-xs border ${statusBadge.className}`}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/admin/orgs/${org.id}`)}>
                      <Badge variant="outline" className={`text-xs border ${planBadge.className}`}>
                        {planBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium" onClick={() => navigate(`/admin/orgs/${org.id}`)}>{org.member_count}</TableCell>
                    <TableCell className="text-right font-medium" onClick={() => navigate(`/admin/orgs/${org.id}`)}>{org.lead_count}</TableCell>
                    <TableCell className="text-right font-medium" onClick={() => navigate(`/admin/orgs/${org.id}`)}>{org.proposal_count}</TableCell>
                    <TableCell className="text-right pr-5 font-medium" onClick={() => navigate(`/admin/orgs/${org.id}`)}>{org.instance_count}</TableCell>
                  </TableRow>
                );
              })}
              {!orgs.length && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Excluir {selectedIds.size} organização(ões)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <strong>irreversível</strong>. Todos os dados das organizações selecionadas serão
              excluídos permanentemente (leads, propostas, membros, instâncias WhatsApp).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Motivo da exclusão</label>
              <Textarea
                value={bulkDeleteReason}
                onChange={(e) => setBulkDeleteReason(e.target.value)}
                placeholder="Ex: Organizações de teste, limpeza..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Digite <span className="text-red-600 font-bold">EXCLUIR</span> para confirmar
              </label>
              <Input
                value={bulkDeleteConfirmation}
                onChange={(e) => setBulkDeleteConfirmation(e.target.value)}
                placeholder="EXCLUIR"
                className="mt-1"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setBulkDeleteReason('');
                setBulkDeleteConfirmation('');
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={bulkDeleteConfirmation !== 'EXCLUIR' || !bulkDeleteReason.trim() || bulkDeleteMutation.isPending}
              onClick={handleBulkDelete}
            >
              {bulkDeleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Excluindo...</>
              ) : (
                <>Excluir {selectedIds.size} organização(ões)</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
