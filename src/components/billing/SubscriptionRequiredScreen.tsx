import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CreditCard, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { createBillingPortalSession, useOrgBillingInfo } from '@/hooks/useOrgBilling';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function SubscriptionRequiredScreen() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [openingPortal, setOpeningPortal] = useState(false);
  const billingQuery = useOrgBillingInfo(Boolean(orgId));
  const billing = billingQuery.data;
  const status = billing?.subscription_status ?? 'none';
  const isPastDue = status === 'past_due' || status === 'unpaid';

  const handlePortal = async () => {
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
      <div className="mx-auto w-full max-w-lg text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100 shadow-sm">
          <ShieldAlert className="h-10 w-10 text-amber-600" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {isPastDue ? 'Pagamento pendente' : 'Assinatura necessária'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">
          {isPastDue
            ? 'Sua última cobrança não foi processada. Atualize sua forma de pagamento para restaurar o acesso completo.'
            : 'Seu acesso está temporariamente limitado. Escolha um plano ou regularize o pagamento para voltar ao fluxo normal.'}
        </p>

        {/* Info box */}
        <div className="mx-auto mt-6 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
          <p className="font-medium">O que acontece agora?</p>
          <ul className="mt-1.5 space-y-1 text-amber-700">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
              Seus dados estão seguros — nada foi perdido
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
              {isPastDue
                ? 'Atualize o pagamento para restaurar acesso imediato'
                : 'Escolha um plano para desbloquear todas as funcionalidades'}
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
          {isPastDue ? (
            <Button
              size="lg"
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
              onClick={handlePortal}
              disabled={openingPortal}
            >
              <CreditCard className="h-4 w-4" />
              {openingPortal ? 'Abrindo portal...' : 'Atualizar pagamento'}
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
              onClick={() => navigate('/billing')}
            >
              <Sparkles className="h-4 w-4" />
              Escolher um plano
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          <div className="flex gap-3">
            {!isPastDue && (
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-2"
                onClick={handlePortal}
                disabled={openingPortal}
              >
                <CreditCard className="h-4 w-4" />
                {openingPortal ? 'Abrindo...' : 'Portal de pagamento'}
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className={isPastDue ? 'w-full gap-2' : 'flex-1 gap-2'}
              onClick={() => navigate('/')}
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-slate-400">
          Precisa de ajuda? Entre em contato com nosso suporte.
        </p>
      </div>
    </div>
  );
}
