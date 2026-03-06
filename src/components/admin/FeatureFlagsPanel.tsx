import { useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { isAdminApiError, useAdminFeatureFlags, useAdminMutation } from '@/hooks/useAdminApi';

type FeatureFlagsPanelProps = {
  orgId?: string;
  title?: string;
  description?: string;
};

export default function FeatureFlagsPanel({
  orgId,
  title = 'Feature Flags',
  description = 'Gerencie flags globais e overrides por organização.',
}: FeatureFlagsPanelProps) {
  const { toast } = useToast();
  const flagsQuery = useAdminFeatureFlags(orgId);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [flagKey, setFlagKey] = useState('');
  const [flagDescription, setFlagDescription] = useState('');
  const [defaultEnabled, setDefaultEnabled] = useState(false);
  const [createReason, setCreateReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const createMutation = useAdminMutation<{ ok: true }>({
    invalidate: [['admin', 'feature-flags']],
    onSuccess: () => {
      setFlagKey('');
      setFlagDescription('');
      setDefaultEnabled(false);
      setCreateReason('');
      setDialogOpen(false);
      toast({ title: 'Feature flag criada com sucesso' });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao criar feature flag',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const overrideMutation = useAdminMutation<{ ok: true }>({
    invalidate: [['admin', 'feature-flags']],
    onSuccess: () => {
      toast({ title: 'Override atualizado' });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao atualizar override',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const flags = flagsQuery.data?.flags ?? [];
  const canOverride = useMemo(() => !!orgId, [orgId]);

  const filteredFlags = useMemo(() => {
    if (!search.trim()) return flags;
    const q = search.toLowerCase();
    return flags.filter(
      (f) => f.flag_key.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q),
    );
  }, [flags, search]);

  const handleCreate = () => {
    if (!flagKey.trim()) {
      toast({ title: 'flag_key obrigatório', description: 'Use snake_case.', variant: 'destructive' });
      return;
    }
    if (!createReason.trim()) {
      toast({ title: 'Motivo obrigatório', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      action: 'create_feature_flag',
      flag_key: flagKey.trim(),
      description: flagDescription.trim() || null,
      default_enabled: defaultEnabled,
      reason: createReason.trim(),
    });
  };

  const handleToggleOverride = (nextEnabled: boolean, currentFlagKey: string) => {
    if (!orgId) return;
    if (!overrideReason.trim()) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo do override.', variant: 'destructive' });
      return;
    }
    overrideMutation.mutate({
      action: 'set_org_feature',
      org_id: orgId,
      flag_key: currentFlagKey,
      enabled: nextEnabled,
      reason: overrideReason.trim(),
    });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Nova Flag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Feature Flag</DialogTitle>
                <DialogDescription>Crie uma nova flag global com motivo obrigatório.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>flag_key (snake_case)</Label>
                  <Input value={flagKey} onChange={(e) => setFlagKey(e.target.value)} placeholder="ex: ai_v2" />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Input value={flagDescription} onChange={(e) => setFlagDescription(e.target.value)} placeholder="Descrição opcional" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={defaultEnabled} onCheckedChange={setDefaultEnabled} />
                  <Label>Habilitada por padrão</Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo</Label>
                  <Input value={createReason} onChange={(e) => setCreateReason(e.target.value)} placeholder="Motivo obrigatório" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Criar Flag
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search + Override Reason */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar flag..." />
          </div>
          {canOverride && (
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Motivo para overrides"
              className="w-[250px]"
            />
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
              <TableHead className="pl-5">Flag Key</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-center">Default</TableHead>
              <TableHead className="text-center">Efetivo</TableHead>
              {canOverride && <TableHead className="text-center pr-5">Override</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFlags.map((flag) => {
              const effective = flag.effective_enabled === true;
              return (
                <TableRow key={flag.flag_key}>
                  <TableCell className="pl-5 font-mono text-xs">{flag.flag_key}</TableCell>
                  <TableCell className="text-sm">{flag.description || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={flag.default_enabled ? 'default' : 'outline'} className={`text-xs ${flag.default_enabled ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}>
                      {flag.default_enabled ? 'ON' : 'OFF'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={effective ? 'default' : 'outline'} className={`text-xs ${effective ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}>
                      {effective ? 'ON' : 'OFF'}
                    </Badge>
                  </TableCell>
                  {canOverride && (
                    <TableCell className="text-center pr-5">
                      <Switch
                        checked={effective}
                        onCheckedChange={(next) => handleToggleOverride(next, flag.flag_key)}
                        disabled={overrideMutation.isPending}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!filteredFlags.length && (
              <TableRow>
                <TableCell colSpan={canOverride ? 5 : 4} className="text-center text-muted-foreground py-6">
                  {flagsQuery.isLoading ? 'Carregando flags...' : 'Nenhuma flag encontrada.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
