import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { adminQueryKeys, isAdminApiError, useAdminMutation } from '@/hooks/useAdminApi';

type OrgActionsProps = {
  orgId: string;
  status: string;
  plan: string;
  planLimits: Record<string, unknown> | null;
  onUpdated?: () => void | Promise<void>;
};

export default function OrgActions({ orgId, status, plan, planLimits, onUpdated }: OrgActionsProps) {
  const { toast } = useToast();
  const [suspendReason, setSuspendReason] = useState('');
  const [reactivateReason, setReactivateReason] = useState('');
  const [planValue, setPlanValue] = useState(plan || 'free');
  const [planReason, setPlanReason] = useState('');
  const [limitsText, setLimitsText] = useState(
    JSON.stringify(planLimits ?? {}, null, 2),
  );

  const suspendMutation = useAdminMutation<{ ok: true; org: unknown }>({
    invalidate: [adminQueryKeys.orgDetails(orgId), ['admin', 'orgs']],
    onSuccess: async () => {
      setSuspendReason('');
      await onUpdated?.();
      toast({ title: 'Organizacao suspensa' });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao suspender',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const reactivateMutation = useAdminMutation<{ ok: true; org: unknown }>({
    invalidate: [adminQueryKeys.orgDetails(orgId), ['admin', 'orgs']],
    onSuccess: async () => {
      setReactivateReason('');
      await onUpdated?.();
      toast({ title: 'Organizacao reativada' });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao reativar',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const planMutation = useAdminMutation<{ ok: true; org: unknown }>({
    invalidate: [adminQueryKeys.orgDetails(orgId), ['admin', 'orgs']],
    onSuccess: async () => {
      setPlanReason('');
      await onUpdated?.();
      toast({ title: 'Plano atualizado' });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao atualizar plano',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const handleSuspend = () => {
    if (!suspendReason.trim()) {
      toast({
        title: 'Reason obrigatorio',
        description: 'Informe o motivo da suspensao.',
        variant: 'destructive',
      });
      return;
    }

    suspendMutation.mutate({
      action: 'suspend_org',
      org_id: orgId,
      reason: suspendReason.trim(),
    });
  };

  const handleReactivate = () => {
    if (!reactivateReason.trim()) {
      toast({
        title: 'Reason obrigatorio',
        description: 'Informe o motivo da reativacao.',
        variant: 'destructive',
      });
      return;
    }

    reactivateMutation.mutate({
      action: 'reactivate_org',
      org_id: orgId,
      reason: reactivateReason.trim(),
    });
  };

  const handlePlanUpdate = () => {
    if (!planReason.trim()) {
      toast({
        title: 'Reason obrigatorio',
        description: 'Informe o motivo da alteracao de plano.',
        variant: 'destructive',
      });
      return;
    }

    if (!planValue.trim()) {
      toast({
        title: 'Plano invalido',
        description: 'Informe um plano valido.',
        variant: 'destructive',
      });
      return;
    }

    let parsedLimits: Record<string, unknown>;
    try {
      const candidate = JSON.parse(limitsText || '{}');
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('invalid_limits');
      }
      parsedLimits = candidate as Record<string, unknown>;
    } catch {
      toast({
        title: 'Plan limits invalido',
        description: 'Informe um JSON valido para limits.',
        variant: 'destructive',
      });
      return;
    }

    planMutation.mutate({
      action: 'update_org_plan',
      org_id: orgId,
      plan: planValue.trim(),
      limits: parsedLimits,
      reason: planReason.trim(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acoes da Organizacao</CardTitle>
        <CardDescription>
          Todas as acoes de escrita exigem reason e geram auditoria com before/after.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Suspensao / Reativacao</Label>
          {status === 'suspended' ? (
            <div className="flex gap-2">
              <Input
                value={reactivateReason}
                onChange={(event) => setReactivateReason(event.target.value)}
                placeholder="Reason para reativacao"
              />
              <Button onClick={handleReactivate} disabled={reactivateMutation.isPending}>
                {reactivateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reativar'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={suspendReason}
                onChange={(event) => setSuspendReason(event.target.value)}
                placeholder="Reason para suspensao"
              />
              <Button
                variant="destructive"
                onClick={handleSuspend}
                disabled={suspendMutation.isPending}
              >
                {suspendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suspender'}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-plan-input">Plano</Label>
          <Input
            id="org-plan-input"
            value={planValue}
            onChange={(event) => setPlanValue(event.target.value)}
            placeholder="free | pro | enterprise"
          />
          <Label htmlFor="org-plan-limits">Plan limits (JSON)</Label>
          <Textarea
            id="org-plan-limits"
            value={limitsText}
            onChange={(event) => setLimitsText(event.target.value)}
            rows={5}
          />
          <Input
            value={planReason}
            onChange={(event) => setPlanReason(event.target.value)}
            placeholder="Reason para alteracao de plano"
          />
          <Button onClick={handlePlanUpdate} disabled={planMutation.isPending}>
            {planMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar Plano'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
