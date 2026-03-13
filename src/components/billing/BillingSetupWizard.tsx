import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createPlanCheckoutSession } from '@/hooks/useOrgBilling';
import { useAuth } from '@/contexts/AuthContext';

const PLAN_OPTIONS = ['start', 'pro', 'scale'] as const;

export default function BillingSetupWizard() {
  const { toast } = useToast();
  const { orgId } = useAuth();
  const [params] = useSearchParams();
  const [planKey, setPlanKey] = useState<string>(params.get('plan') || 'start');
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState(false);

  const normalizedPlan = useMemo(() => {
    const candidate = planKey.trim().toLowerCase();
    return PLAN_OPTIONS.includes(candidate as (typeof PLAN_OPTIONS)[number]) ? candidate : 'start';
  }, [planKey]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!orgId && !orgName.trim()) {
      toast({
        title: 'Nome da organização obrigatório',
        description: 'Informe o nome da organização para iniciar o checkout.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setBusy(true);
      const checkoutUrl = await createPlanCheckoutSession({
        planKey: normalizedPlan,
        orgId,
        orgName: orgId ? undefined : orgName.trim(),
        successUrl: `${window.location.origin}/onboarding?checkout=success`,
        cancelUrl: `${window.location.origin}/billing?checkout=cancel`,
      });

      window.location.href = checkoutUrl;
    } catch (error) {
      toast({
        title: 'Falha ao iniciar checkout',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Finalizar assinatura</CardTitle>
            <CardDescription>
              Configure sua organização e conclua o checkout para ativar o trial de 7 dias com cartão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {!orgId && (
                <div className="space-y-2">
                  <Label htmlFor="org-name">Nome da organização</Label>
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ex: SolarZap Comercial"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="plan-key">Plano</Label>
                <select
                  id="plan-key"
                  value={normalizedPlan}
                  onChange={(e) => setPlanKey(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="start">Start - R$199/mês</option>
                  <option value="pro">Pro - R$299/mês</option>
                  <option value="scale">Scale - R$369/mês</option>
                </select>
              </div>

              <CardFooter className="px-0 pb-0">
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirecionando...
                    </span>
                  ) : (
                    'Continuar para checkout'
                  )}
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
