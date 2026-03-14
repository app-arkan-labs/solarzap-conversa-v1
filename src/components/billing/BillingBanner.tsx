import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { OrgBillingInfo } from '@/hooks/useOrgBilling';
import { useNavigate } from 'react-router-dom';

export default function BillingBanner({ billing }: { billing: OrgBillingInfo | null | undefined }) {
  const navigate = useNavigate();
  if (!billing) return null;

  if (billing.subscription_status === 'past_due' || billing.subscription_status === 'unpaid') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-2.5 text-sm text-red-700 shadow-[0_16px_40px_-30px_rgba(239,68,68,0.55)] backdrop-blur-sm">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            <span className="font-medium">Pagamento pendente.</span>{' '}
            Atualize sua assinatura para restaurar acesso total.
          </span>
        </span>
        <button
          onClick={() => navigate('/billing')}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-200"
        >
          Resolver <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (billing.subscription_status === 'trialing' && billing.trial_ends_at) {
    const daysLeft = Math.max(0, Math.ceil((new Date(billing.trial_ends_at).getTime() - Date.now()) / 86_400_000));
    const isUrgent = daysLeft <= 2;
    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-sm shadow-[0_16px_40px_-30px_rgba(245,158,11,0.45)] backdrop-blur-sm ${
        isUrgent
          ? 'border-orange-200 bg-orange-50 text-orange-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}>
        <span className="inline-flex items-center gap-2">
          <Clock className="h-4 w-4 flex-shrink-0" />
          <span>
            {daysLeft === 0
              ? <><span className="font-medium">Trial expira hoje!</span> Escolha um plano para continuar usando.</>
              : <><span className="font-medium">Trial ativo — {daysLeft} dia{daysLeft > 1 ? 's' : ''} restante{daysLeft > 1 ? 's' : ''}.</span> Até {new Date(billing.trial_ends_at).toLocaleDateString('pt-BR')}.</>}
          </span>
        </span>
        <button
          onClick={() => navigate('/billing')}
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            isUrgent
              ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
          }`}
        >
          Escolher plano <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return null;
}
