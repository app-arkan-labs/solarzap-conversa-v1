import { Rocket } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenBadge } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmClientSummary } from '@/modules/internal-crm/types';

type OnboardingQueueProps = {
  clients: InternalCrmClientSummary[];
};

export function OnboardingQueue(props: OnboardingQueueProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" />
          Onboarding pendente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cliente aguardando onboarding.</p>
        ) : (
          props.clients.map((client) => (
            <div key={client.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{client.company_name}</p>
                <TokenBadge token={client.lifecycle_status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{client.primary_contact_name || '-'} · {client.primary_phone || '-'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Próxima ação: {client.next_action || '-'}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
