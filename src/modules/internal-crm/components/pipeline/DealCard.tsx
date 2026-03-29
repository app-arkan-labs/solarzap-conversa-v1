import { FilePenLine, MessageSquareText, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TokenBadge, formatCurrencyBr, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDealSummary } from '@/modules/internal-crm/types';

type DealCardProps = {
  deal: InternalCrmDealSummary;
  onEditDeal: (deal: InternalCrmDealSummary) => void;
  onMarkWon: (deal: InternalCrmDealSummary) => void;
  onMarkLost: (deal: InternalCrmDealSummary) => void;
  onOpenCheckout: (deal: InternalCrmDealSummary) => void;
  onOpenComments: (deal: InternalCrmDealSummary) => void;
};

function computeSlaStatus(deal: InternalCrmDealSummary): { token: 'on_track' | 'at_risk' | 'overdue'; label: string } {
  const expectedCloseAt = deal.expected_close_at ? new Date(deal.expected_close_at).getTime() : NaN;
  if (Number.isNaN(expectedCloseAt)) return { token: 'at_risk', label: 'SLA sem data' };

  const daysToClose = Math.floor((expectedCloseAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysToClose < 0) return { token: 'overdue', label: 'SLA estourado' };
  if (daysToClose <= 3) return { token: 'at_risk', label: 'SLA em risco' };
  return { token: 'on_track', label: 'SLA no prazo' };
}

function humanizeTokenLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function buildCommercialBadges(deal: InternalCrmDealSummary) {
  const badges: Array<{ token: string; label: string }> = [];

  if (deal.primary_offer_code) {
    badges.push({ token: 'offered', label: `Oferta ${humanizeTokenLabel(deal.primary_offer_code)}` });
  }
  if (deal.closed_product_code) {
    badges.push({ token: 'won', label: `Fechou ${humanizeTokenLabel(deal.closed_product_code)}` });
  }

  if (deal.software_status !== 'not_offered') {
    badges.push({ token: deal.software_status, label: `Software ${humanizeTokenLabel(deal.software_status)}` });
  }
  if (deal.landing_page_status !== 'not_offered') {
    badges.push({ token: deal.landing_page_status, label: `LP ${humanizeTokenLabel(deal.landing_page_status)}` });
  }
  if (deal.traffic_status !== 'not_offered') {
    badges.push({ token: deal.traffic_status, label: `Trafego ${humanizeTokenLabel(deal.traffic_status)}` });
  }
  if (deal.trial_status !== 'not_offered') {
    badges.push({ token: deal.trial_status, label: `Trial ${humanizeTokenLabel(deal.trial_status)}` });
  }

  return badges;
}

export function DealCard(props: DealCardProps) {
  const { deal } = props;
  const sla = computeSlaStatus(deal);
  const commercialBadges = buildCommercialBadges(deal);

  return (
    <div className="rounded-2xl border border-border/80 bg-background/95 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{deal.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{deal.client_company_name || 'Cliente sem nome'}</p>
        </div>
        <TokenBadge token={deal.status} />
      </div>

      <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>One-time</span>
          <span className="font-medium text-foreground">{formatCurrencyBr(deal.one_time_total_cents)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>MRR</span>
          <span className="font-medium text-foreground">{formatCurrencyBr(deal.mrr_cents)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Fechamento</span>
          <span>{formatDateOnly(deal.expected_close_at)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>SLA</span>
          <TokenBadge token={sla.token} label={sla.label} />
        </div>
      </div>

      {deal.items?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {deal.items.slice(0, 3).map((item) => (
            <TokenBadge key={item.id} token={item.billing_type} label={item.product_code} />
          ))}
        </div>
      ) : null}

      {commercialBadges.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {commercialBadges.map((badge) => (
            <TokenBadge key={`${deal.id}-${badge.label}`} token={badge.token} label={badge.label} />
          ))}
        </div>
      ) : null}

      {deal.next_offer_code ? (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Proxima oferta:</span> {humanizeTokenLabel(deal.next_offer_code)}
          {deal.next_offer_at ? ` - ${formatDateOnly(deal.next_offer_at)}` : ''}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => props.onEditDeal(deal)}>
          <FilePenLine className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
        <Button size="sm" variant="outline" onClick={() => props.onMarkWon(deal)}>
          Fechou
        </Button>
        <Button size="sm" variant="outline" onClick={() => props.onMarkLost(deal)}>
          Nao fechou
        </Button>
        {deal.payment_method === 'stripe' ? (
          <Button size="sm" variant="outline" onClick={() => props.onOpenCheckout(deal)}>
            <Wallet className="mr-1.5 h-3.5 w-3.5" />
            Checkout
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => props.onOpenComments(deal)}>
          <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
          Notas
        </Button>
      </div>
    </div>
  );
}
