import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { adminQueryKeys, isAdminApiError, useAdminMutation, useAdminSubscriptionPlans } from '@/hooks/useAdminApi';

type OrgActionsProps = {
  orgId: string;
  status: string;
  plan: string;
  planLimits: Record<string, unknown> | null;
  onUpdated?: () => void | Promise<void>;
};

export default function OrgActions({ orgId, status, plan, planLimits, onUpdated }: OrgActionsProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [suspendReason, setSuspendReason] = useState('');
  const [reactivateReason, setReactivateReason] = useState('');
  const [planValue, setPlanValue] = useState(plan || 'free');
  const [planReason, setPlanReason] = useState('');
  const [limitsText, setLimitsText] = useState(
    JSON.stringify(planLimits ?? {}, null, 2),
  );
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const plansQuery = useAdminSubscriptionPlans();
  const availablePlans = plansQuery.data?.plans ?? [];

  const suspendMutation = useAdminMutation<{ ok: true; org: unknown }>({
    invalidate: [adminQueryKeys.orgDetails(orgId), ['admin', 'orgs']],
    onSuccess: async () => {
      setSuspendReason('');
      await onUpdated?.();
      toast({ title: 'Organização suspensa com sucesso' });
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
      toast({ title: 'Organização reativada com sucesso' });
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
      toast({ title: 'Plano atualizado com sucesso' });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao atualizar plano',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useAdminMutation<{ ok: true; deleted_org_id: string }>({
    invalidate: [['admin', 'orgs'], adminQueryKeys.systemMetrics()],
    onSuccess: async () => {
      toast({ title: 'Organização excluída permanentemente' });
      navigate('/admin/orgs');
    },
    onError: (error) => {
      toast({
        title: 'Falha ao excluir',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const handleSuspend = () => {
    if (!suspendReason.trim()) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo da suspensão.', variant: 'destructive' });
      return;
    }
    suspendMutation.mutate({ action: 'suspend_org', org_id: orgId, reason: suspendReason.trim() });
  };

  const handleReactivate = () => {
    if (!reactivateReason.trim()) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo da reativação.', variant: 'destructive' });
      return;
    }
    reactivateMutation.mutate({ action: 'reactivate_org', org_id: orgId, reason: reactivateReason.trim() });
  };

  const handlePlanUpdate = () => {
    if (!planReason.trim()) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo da alteração.', variant: 'destructive' });
      return;
    }
    let parsedLimits: Record<string, unknown>;
    try {
      const candidate = JSON.parse(limitsText || '{}');
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error();
      parsedLimits = candidate as Record<string, unknown>;
    } catch {
      toast({ title: 'JSON inválido', description: 'Informe um JSON válido para os limites.', variant: 'destructive' });
      return;
    }
    planMutation.mutate({ action: 'update_org_plan', org_id: orgId, plan: planValue.trim(), limits: parsedLimits, reason: planReason.trim() });
  };

  const handleDelete = () => {
    if (!deleteReason.trim()) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo da exclusão.', variant: 'destructive' });
      return;
    }
    if (deleteConfirmation !== 'EXCLUIR') {
      toast({ title: 'Confirmação inválida', description: 'Digite EXCLUIR para confirmar.', variant: 'destructive' });
      return;
    }
    deleteMutation.mutate({
      action: 'delete_org',
      org_id: orgId,
      reason: deleteReason.trim(),
      confirmation: 'EXCLUIR',
    });
  };

  // When plan changes via select, load the limits from the plan template
  const handlePlanSelect = (val: string) => {
    setPlanValue(val);
    const selectedPlan = availablePlans.find((p) => p.plan_key === val);
    if (selectedPlan) {
      setLimitsText(JSON.stringify(selectedPlan.limits ?? {}, null, 2));
    }
  };

  return (
    <div className="space-y-4">
      {/* Suspend / Reactivate */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Suspensão / Reativação</CardTitle>
          <CardDescription>Todas as ações geram auditoria com motivo obrigatório.</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'suspended' ? (
            <div className="flex gap-2">
              <Input
                value={reactivateReason}
                onChange={(e) => setReactivateReason(e.target.value)}
                placeholder="Motivo para reativação"
                className="flex-1"
              />
              <Button onClick={handleReactivate} disabled={reactivateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {reactivateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reativar'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Motivo para suspensão"
                className="flex-1"
              />
              <Button variant="destructive" onClick={handleSuspend} disabled={suspendMutation.isPending}>
                {suspendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suspender'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Management */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Gerenciar Plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Plano</Label>
            <Select value={planValue} onValueChange={handlePlanSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {availablePlans.map((p) => (
                  <SelectItem key={p.plan_key} value={p.plan_key}>
                    {p.display_name} — {p.price_cents === 0 ? 'Grátis' : `R$ ${(p.price_cents / 100).toFixed(2)}/mês`}
                  </SelectItem>
                ))}
                {!availablePlans.length && (
                  <>
                    <SelectItem value="free">Grátis</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Limites do plano (JSON)</Label>
            <Textarea value={limitsText} onChange={(e) => setLimitsText(e.target.value)} rows={5} className="font-mono text-xs" />
          </div>
          <div className="flex gap-2">
            <Input
              value={planReason}
              onChange={(e) => setPlanReason(e.target.value)}
              placeholder="Motivo para alteração de plano"
              className="flex-1"
            />
            <Button onClick={handlePlanUpdate} disabled={planMutation.isPending}>
              {planMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar Plano'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Organization */}
      <Card className="border-0 shadow-sm border-red-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Zona de Perigo
          </CardTitle>
          <CardDescription>Ações irreversíveis. Apenas super_admin pode executar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="Motivo para exclusão permanente"
          />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={!deleteReason.trim()}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Organização Permanentemente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-700">Excluir organização?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    Esta ação é <strong>irreversível</strong>. Todos os dados serão excluídos permanentemente:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>Membros e permissões</li>
                    <li>Leads e pipeline</li>
                    <li>Propostas geradas</li>
                    <li>Instâncias WhatsApp</li>
                    <li>Feature flags overrides</li>
                  </ul>
                  <div className="space-y-1.5 pt-2">
                    <Label>Digite <strong className="text-red-700">EXCLUIR</strong> para confirmar:</Label>
                    <Input
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="EXCLUIR"
                      className="border-red-200 focus:ring-red-500"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setDeleteConfirmation('');
                  }}
                >
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleteConfirmation !== 'EXCLUIR' || deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Excluir Permanentemente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
