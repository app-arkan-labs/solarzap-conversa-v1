import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  description = 'Gerencie flags globais e overrides por organizacao.',
}: FeatureFlagsPanelProps) {
  const { toast } = useToast();
  const flagsQuery = useAdminFeatureFlags(orgId);
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
      toast({ title: 'Feature flag criada' });
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

  const handleCreate = () => {
    if (!flagKey.trim()) {
      toast({
        title: 'flag_key obrigatorio',
        description: 'Use snake_case (ex: ai_v2).',
        variant: 'destructive',
      });
      return;
    }
    if (!createReason.trim()) {
      toast({
        title: 'Reason obrigatorio',
        description: 'Informe o motivo da criacao da flag.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Reason obrigatorio',
        description: 'Informe o motivo da alteracao do override.',
        variant: 'destructive',
      });
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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Criar nova flag</p>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="flag-key">flag_key</Label>
              <Input
                id="flag-key"
                value={flagKey}
                onChange={(event) => setFlagKey(event.target.value)}
                placeholder="snake_case"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="flag-description">Descricao</Label>
              <Input
                id="flag-description"
                value={flagDescription}
                onChange={(event) => setFlagDescription(event.target.value)}
                placeholder="Descricao opcional"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={defaultEnabled}
              onCheckedChange={setDefaultEnabled}
              id="flag-default-enabled"
            />
            <Label htmlFor="flag-default-enabled">Default habilitado</Label>
          </div>
          <Input
            value={createReason}
            onChange={(event) => setCreateReason(event.target.value)}
            placeholder="Reason obrigatorio para create_feature_flag"
          />
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Flag'}
          </Button>
        </div>

        {canOverride ? (
          <div className="space-y-2">
            <Label htmlFor="override-reason">Reason para overrides</Label>
            <Input
              id="override-reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Reason obrigatorio para set_org_feature"
            />
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>flag_key</TableHead>
              <TableHead>descricao</TableHead>
              <TableHead className="text-center">default</TableHead>
              <TableHead className="text-center">efetivo</TableHead>
              {canOverride ? <TableHead className="text-center">override org</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.map((flag) => {
              const effective = flag.effective_enabled === true;
              return (
                <TableRow key={flag.flag_key}>
                  <TableCell className="font-mono text-xs">{flag.flag_key}</TableCell>
                  <TableCell>{flag.description || '-'}</TableCell>
                  <TableCell className="text-center">{flag.default_enabled ? 'on' : 'off'}</TableCell>
                  <TableCell className="text-center">{effective ? 'on' : 'off'}</TableCell>
                  {canOverride ? (
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={effective}
                          onCheckedChange={(next) => handleToggleOverride(next, flag.flag_key)}
                          disabled={overrideMutation.isPending}
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {!flags.length && (
              <TableRow>
                <TableCell colSpan={canOverride ? 5 : 4} className="text-center text-muted-foreground">
                  {flagsQuery.isLoading ? 'Carregando flags...' : 'Nenhuma flag cadastrada.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
