import { Badge } from '@/components/ui/badge';
import { OrgBillingInfo } from '@/hooks/useOrgBilling';

export default function PlanBadge({ billing }: { billing: OrgBillingInfo | null | undefined }) {
  if (!billing) {
    return <Badge variant="secondary">Plano: --</Badge>;
  }

  const plan = (billing.plan_key || 'free').toUpperCase();
  const trialText = billing.subscription_status === 'trialing' && billing.trial_ends_at
    ? ` (trial até ${new Date(billing.trial_ends_at).toLocaleDateString('pt-BR')})`
    : '';

  return <Badge variant="secondary">Plano {plan}{trialText}</Badge>;
}
