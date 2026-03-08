import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  createBillingPortalSession,
  createPackCheckoutSession,
  createPlanCheckoutSession,
  useOrgBillingInfo,
} from '@/hooks/useOrgBilling';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const PLAN_ORDER = ['free', 'start', 'pro', 'scale'];

const PLAN_DISPLAY: Record<string, { label: string; description: string }> = {
  free: { label: 'Free', description: 'Plano de entrada para começar' },
  start: { label: 'Start', description: 'Para operação inicial de vendas' },
  pro: { label: 'Pro', description: 'Para operação em crescimento' },
  scale: { label: 'Scale', description: 'Para time de alta escala' },
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((Number(cents || 0)) / 100);
}

export default function Pricing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { orgId } = useAuth();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyPack, setBusyPack] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [planCatalog, setPlanCatalog] = useState<Array<{ plan_key: string; display_name: string; price_cents: number }>>([]);

  const billingQuery = useOrgBillingInfo(true);
  const billing = billingQuery.data;

  const plans = useMemo(() => {
    if (planCatalog.length > 0) return planCatalog;
    return PLAN_ORDER.map((key) => ({
      plan_key: key,
      display_name: PLAN_DISPLAY[key]?.label || key,
      price_cents: 0,
    }));
  }, [planCatalog]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const { data } = await supabase
        .from('_admin_subscription_plans')
        .select('plan_key, display_name, price_cents')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!isMounted) return;
      const rows = (data || []).map((row) => ({
        plan_key: String(row.plan_key),
        display_name: String(row.display_name || row.plan_key),
        price_cents: Number(row.price_cents || 0),
      }));
      setPlanCatalog(rows);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpgrade = async (planKey: string) => {
    try {
      setBusyPlan(planKey);
      const url = await createPlanCheckoutSession(planKey, orgId);
      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Falha ao abrir checkout',
        description: error instanceof Error ? error.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setBusyPlan(null);
    }
  };

  const handleBuyMessagePack = async () => {
    try {
      setBusyPack(true);
      const url = await createPackCheckoutSession('extra_messages', 1, orgId);
      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Falha ao abrir compra de pacote',
        description: error instanceof Error ? error.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setBusyPack(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      setOpeningPortal(true);
      const url = await createBillingPortalSession(orgId);
      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Portal indisponível',
        description: error instanceof Error ? error.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Planos e Cobrança</h1>
            <p className="text-sm text-muted-foreground">Gerencie seu plano, assinatura e pacotes extras.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>Voltar</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Seu status atual</CardTitle>
            <CardDescription>Controle de acesso baseado no billing da organização ativa.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">Plano: {billing?.plan_key || 'free'}</Badge>
            <Badge variant="secondary">Status: {billing?.subscription_status || 'desconhecido'}</Badge>
            <Badge variant="secondary">Acesso: {billing?.access_state || 'full'}</Badge>
            <Button variant="outline" onClick={handleOpenPortal} disabled={openingPortal}>
              {openingPortal ? 'Abrindo...' : 'Abrir Portal Stripe'}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <Card key={String(plan.plan_key)} className="h-full">
              <CardHeader>
                <CardTitle>{String(plan.display_name)}</CardTitle>
                <CardDescription>
                  {PLAN_DISPLAY[String(plan.plan_key)]?.description || 'Plano comercial'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold">{formatCurrency(Number(plan.price_cents || 0))}</p>
                <Button
                  className="w-full"
                  onClick={() => handleUpgrade(String(plan.plan_key))}
                  disabled={busyPlan === String(plan.plan_key)}
                >
                  {busyPlan === String(plan.plan_key) ? 'Redirecionando...' : 'Selecionar plano'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pacotes extras</CardTitle>
            <CardDescription>Compra avulsa de créditos para ultrapassagem temporária.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Pacote de Mensagens</p>
              <p className="text-sm text-muted-foreground">Adiciona créditos de mensagens no ciclo atual.</p>
            </div>
            <Button onClick={handleBuyMessagePack} disabled={busyPack}>
              {busyPack ? 'Abrindo checkout...' : 'Comprar pacote'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
