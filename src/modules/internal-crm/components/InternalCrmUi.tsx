import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function formatCurrencyBr(valueCents: number | null | undefined): string {
  const normalized = Number(valueCents || 0) / 100;
  return normalized.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

export function MetricCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  accentClassName?: string;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-semibold tracking-tight text-foreground', props.accentClassName)}>
          {props.value}
        </div>
        {props.subtitle ? <p className="mt-2 text-xs text-muted-foreground">{props.subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

function badgeVariantByToken(token: string): string {
  switch (token) {
    case 'lead':
    case 'lead_entrante':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'contato_iniciado':
    case 'qualificado':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'demo_agendada':
    case 'proposta_enviada':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'negociacao':
    case 'aguardando_pagamento':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'ganho':
    case 'won':
    case 'active_customer':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'customer_onboarding':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'churn_risk':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'churned':
    case 'perdido':
    case 'lost':
      return 'bg-zinc-200 text-zinc-800 border-zinc-300';
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'failed':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function TokenBadge({ token, label }: { token: string | null | undefined; label?: string | null }) {
  const resolvedToken = String(token || '').trim().toLowerCase();
  return (
    <Badge variant="outline" className={cn('font-normal', badgeVariantByToken(resolvedToken))}>
      {label || resolvedToken || '-'}
    </Badge>
  );
}
