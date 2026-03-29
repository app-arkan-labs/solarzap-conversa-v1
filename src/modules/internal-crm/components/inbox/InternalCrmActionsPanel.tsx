import { Building2, ClipboardList, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenBadge, formatCurrencyBr, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmClientDetail } from '@/modules/internal-crm/types';

type InternalCrmActionsPanelProps = {
  detail: InternalCrmClientDetail | null;
  onProvision: (dealId?: string) => void;
};

export function InternalCrmActionsPanel(props: InternalCrmActionsPanelProps) {
  const detail = props.detail;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Resumo do cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Empresa:</span> {detail?.client.company_name || '-'}</p>
          <p><span className="text-muted-foreground">Contato:</span> {detail?.client.primary_contact_name || '-'}</p>
          <p><span className="text-muted-foreground">Telefone:</span> {detail?.client.primary_phone || '-'}</p>
          <p><span className="text-muted-foreground">Lifecycle:</span> {detail ? <TokenBadge token={detail.client.lifecycle_status} /> : '-'}</p>
          <p><span className="text-muted-foreground">Próxima ação:</span> {detail?.client.next_action || '-'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Deals abertos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(detail?.deals || []).filter((deal) => deal.status === 'open').slice(0, 3).map((deal) => (
            <div key={deal.id} className="rounded-xl border border-border/70 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{deal.title}</p>
                <TokenBadge token={deal.stage_code} label={deal.stage_code} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                One-time {formatCurrencyBr(deal.one_time_total_cents)} · MRR {formatCurrencyBr(deal.mrr_cents)}
              </p>
            </div>
          ))}
          {(detail?.deals || []).filter((deal) => deal.status === 'open').length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum deal aberto para este cliente.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Próximas ações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(detail?.tasks || []).filter((task) => task.status === 'open').slice(0, 4).map((task) => (
            <div key={task.id} className="rounded-xl border border-border/70 p-3 text-sm">
              <p className="font-medium">{task.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(task.due_at)}</p>
            </div>
          ))}
          {(detail?.tasks || []).filter((task) => task.status === 'open').length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem tarefas abertas.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Provisionamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TokenBadge token={detail?.app_link?.provisioning_status || 'pending'} />
          <Button onClick={() => props.onProvision(detail?.deals[0]?.id)} disabled={!detail?.client.id}>
            <Rocket className="mr-1.5 h-4 w-4" />
            Provisionar conta SolarZap
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
