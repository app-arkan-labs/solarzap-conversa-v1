import { AlertTriangle, Clock } from 'lucide-react';
import { OrgBillingInfo } from '@/hooks/useOrgBilling';

export default function BillingBanner({ billing }: { billing: OrgBillingInfo | null | undefined }) {
  if (!billing) return null;

  if (billing.subscription_status === 'past_due') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Pagamento pendente. Atualize sua assinatura para restaurar acesso total.
        </span>
      </div>
    );
  }

  if (billing.subscription_status === 'trialing' && billing.trial_ends_at) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        <span className="inline-flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Trial ativo até {new Date(billing.trial_ends_at).toLocaleDateString('pt-BR')}.
        </span>
      </div>
    );
  }

  return null;
}
