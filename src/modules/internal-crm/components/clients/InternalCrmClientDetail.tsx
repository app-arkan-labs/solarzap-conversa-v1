import { CreditCard, ExternalLink, Rocket, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenBadge, formatCurrencyBr, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import { InternalCrmClientTimeline } from '@/modules/internal-crm/components/clients/InternalCrmClientTimeline';
import type { InternalCrmClientDetail as InternalCrmClientDetailType } from '@/modules/internal-crm/types';

type InternalCrmClientDetailProps = {
  detail: InternalCrmClientDetailType;
  onGenerateCheckout: (dealId: string) => void;
  onCreateNextAction: (dealId: string) => void;
  onProvision: (dealId?: string) => void;
};

export function InternalCrmClientDetail(props: InternalCrmClientDetailProps) {
  const detail = props.detail;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Contato</p>
            <p className="font-medium">{detail.client.primary_contact_name || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Telefone</p>
            <p className="font-medium">{detail.client.primary_phone || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">E-mail</p>
            <p className="font-medium">{detail.client.primary_email || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Origem</p>
            <p className="font-medium">{detail.client.source_channel || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Etapa</p>
            <TokenBadge token={detail.client.current_stage_code} label={detail.client.current_stage_code} />
          </div>
          <div>
            <p className="text-muted-foreground">Lifecycle</p>
            <TokenBadge token={detail.client.lifecycle_status} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Deals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum deal associado ao cliente.</p>
          ) : (
            detail.deals.map((deal) => (
              <div key={deal.id} className="rounded-2xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{deal.title}</p>
                    <p className="text-sm text-muted-foreground">
                      One-time {formatCurrencyBr(deal.one_time_total_cents)} · MRR {formatCurrencyBr(deal.mrr_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <TokenBadge token={deal.status} />
                    <TokenBadge token={deal.payment_status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {deal.payment_method === 'stripe' ? (
                    <Button size="sm" variant="outline" onClick={() => props.onGenerateCheckout(deal.id)}>
                      <CreditCard className="mr-1.5 h-4 w-4" />
                      Gerar checkout
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => props.onCreateNextAction(deal.id)}>
                    Registrar próxima ação
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conta no SolarZap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <TokenBadge token={detail.app_link?.provisioning_status || 'pending'} />
            {detail.app_link?.provisioned_at ? (
              <span className="text-xs text-muted-foreground">Provisionado em {formatDateTime(detail.app_link.provisioned_at)}</span>
            ) : null}
          </div>

          {detail.linked_public_org_summary?.org ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-900">
                <ShieldCheck className="h-4 w-4" />
                Org vinculada: {detail.linked_public_org_summary.org.name}
              </div>
              <div className="mt-2 space-y-1 text-emerald-900/80">
                <p>Plano: {detail.linked_public_org_summary.org.plan || '-'}</p>
                <p>Status: {detail.linked_public_org_summary.org.subscription_status || '-'}</p>
                <p>Membros: {detail.linked_public_org_summary.stats?.member_count || 0}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cliente ainda não provisionado no app público.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => props.onProvision(detail.deals[0]?.id)}>
              <Rocket className="mr-1.5 h-4 w-4" />
              Provisionar conta SolarZap
            </Button>
            {detail.app_link?.linked_public_org_id ? (
              <Button
                variant="outline"
                onClick={() => window.open(`/admin/orgs/${detail.app_link?.linked_public_org_id}`, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Abrir org no admin
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <InternalCrmClientTimeline detail={detail} />
    </div>
  );
}
