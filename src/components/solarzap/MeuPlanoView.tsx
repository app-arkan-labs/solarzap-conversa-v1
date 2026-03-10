import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Loader2, CreditCard, ExternalLink, ArrowRight, Crown, Zap, Sparkles,
  TrendingUp, AlertTriangle, Gift, Shield, ChevronRight, XCircle, CheckCircle2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import {
  createBillingPortalSession,
  createPlanCheckoutSession,
  useOrgBillingInfo,
} from '@/hooks/useOrgBilling';
import { runBillingAdminAction } from '@/lib/orgAdminClient';
import { supabase } from '@/lib/supabase';

/* ── plan metadata ──────────────────────────────────────────────── */

const PLAN_META: Record<string, {
  label: string; icon: typeof Zap; gradient: string;
}> = {
  free:  { label: 'Free',  icon: Shield,   gradient: 'from-slate-400 to-slate-600' },
  start: { label: 'Start', icon: Zap,      gradient: 'from-blue-500 to-indigo-600' },
  pro:   { label: 'Pro',   icon: Crown,    gradient: 'from-emerald-500 to-teal-600' },
  scale: { label: 'Scale', icon: Sparkles, gradient: 'from-violet-500 to-purple-700' },
};

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  active:           { label: 'Ativo',          color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  trialing:         { label: 'Trial',          color: 'text-amber-700 bg-amber-50 border-amber-200',     dot: 'bg-amber-500' },
  past_due:         { label: 'Pgto pendente',  color: 'text-red-700 bg-red-50 border-red-200',           dot: 'bg-red-500' },
  canceled:         { label: 'Cancelado',      color: 'text-slate-600 bg-slate-50 border-slate-200',     dot: 'bg-slate-400' },
  none:             { label: 'Sem plano',      color: 'text-slate-600 bg-slate-50 border-slate-200',     dot: 'bg-slate-400' },
  pending_checkout: { label: 'Pendente',       color: 'text-amber-700 bg-amber-50 border-amber-200',     dot: 'bg-amber-500' },
  unpaid:           { label: 'Não pago',       color: 'text-red-700 bg-red-50 border-red-200',           dot: 'bg-red-500' },
};

const LIMIT_DISPLAY: { key: string; label: string }[] = [
  { key: 'max_proposals_month',      label: 'Propostas' },
  { key: 'max_campaigns_month',      label: 'Campanhas' },
  { key: 'monthly_broadcast_credits', label: 'Créditos de disparo' },
  { key: 'max_leads',                label: 'Leads ativos' },
];

const USAGE_KEY_MAP: Record<string, string> = {
  max_proposals_month:       'proposals_generated',
  max_campaigns_month:       'campaigns_created',
  monthly_broadcast_credits: 'broadcast_credits_used',
};

type PlanRow = {
  plan_key: string;
  display_name: string;
  price_cents: number;
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
};

/* ── cancel flow ───────────────────────────────────────────────── */

type CancelStep = 'idle' | 'reason' | 'confirm' | 'processing';

const CANCEL_REASONS = [
  'Muito caro para meu uso atual',
  'Não estou usando o suficiente',
  'Vou usar outro produto',
  'Estou apenas testando',
  'Outro motivo',
];

/* ── helpers ─────────────────────────────────────────────────────── */

function fmt(value: unknown) {
  const n = Number(value ?? 0);
  if (n < 0) return '∞';
  return new Intl.NumberFormat('pt-BR').format(n);
}

function pct(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function barColor(p: number) {
  if (p >= 90) return 'bg-red-500';
  if (p >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  return d > 0 ? d : 0;
}

/* ── component ──────────────────────────────────────────────────── */

export function MeuPlanoView() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [billingBusy, setBillingBusy] = useState(false);
  const [migratingLegacy, setMigratingLegacy] = useState(false);
  const [cancelStep, setCancelStep] = useState<CancelStep>('idle');
  const [cancelReason, setCancelReason] = useState('');
  const [nextPlanCatalog, setNextPlanCatalog] = useState<PlanRow[]>([]);
  const billingQuery = useOrgBillingInfo(Boolean(user));
  const billing = billingQuery.data;

  const planKey = (billing?.plan_key || 'free').toLowerCase();
  const meta = PLAN_META[planKey] || PLAN_META.free;
  const PlanIcon = meta.icon;
  const status = billing?.subscription_status || 'none';
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.none;
  const isAdminOrOwner = role === 'owner' || role === 'admin';
  const hasActiveSubscription = status === 'active' || status === 'trialing' || status === 'past_due';
  const isTrial = status === 'trialing';
  const trialDays = daysUntil(billing?.trial_ends_at);
  const graceDays = daysUntil(billing?.grace_ends_at);
  const periodEnd = billing?.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString('pt-BR')
    : null;

  // Next-tier suggestion
  const nextPlan = useMemo(() => {
    const order = ['free', 'start', 'pro', 'scale'];
    const idx = order.indexOf(planKey);
    if (idx < 0 || idx >= order.length - 1) return null;
    const nk = order[idx + 1];
    const catalogEntry = nextPlanCatalog.find((p) => p.plan_key === nk);
    return { key: nk, ...(PLAN_META[nk] || PLAN_META.free), catalogEntry };
  }, [planKey, nextPlanCatalog]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase
        .from('_admin_subscription_plans')
        .select('plan_key, display_name, price_cents, limits, features')
        .eq('is_active', true)
        .neq('plan_key', 'free')
        .order('sort_order', { ascending: true });
      if (!mounted) return;
      setNextPlanCatalog(
        (data || []).map((r) => ({
          plan_key: String(r.plan_key),
          display_name: String(r.display_name || r.plan_key),
          price_cents: Number(r.price_cents || 0),
          limits: (typeof r.limits === 'object' && r.limits && !Array.isArray(r.limits) ? r.limits : {}) as Record<string, unknown>,
          features: (typeof r.features === 'object' && r.features && !Array.isArray(r.features) ? r.features : {}) as Record<string, unknown>,
        })),
      );
    })();
    return () => { mounted = false; };
  }, []);

  /* ── actions ── */

  const handleUpgradePlan = useCallback(async (targetKey?: string) => {
    try {
      setBillingBusy(true);
      const target = targetKey || (planKey === 'free' ? 'start' : 'pro');
      const checkoutUrl = await createPlanCheckoutSession({
        planKey: target,
        successUrl: `${window.location.origin}/welcome?checkout=success`,
        cancelUrl: `${window.location.origin}/billing?checkout=cancel`,
      });
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      toast({ title: 'Falha ao abrir checkout', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBillingBusy(false);
    }
  }, [planKey, toast]);

  const handleOpenBillingPortal = useCallback(async () => {
    try {
      setBillingBusy(true);
      const portalUrl = await createBillingPortalSession();
      window.location.href = portalUrl;
    } catch (err: unknown) {
      toast({ title: 'Portal indisponível', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBillingBusy(false);
    }
  }, [toast]);

  const handleLegacyMigration = useCallback(async () => {
    try {
      setMigratingLegacy(true);
      await runBillingAdminAction('migrate_legacy_to_trial', { trialDays: 7 });
      await billingQuery.refetch();
      toast({ title: 'Migração aplicada', description: 'Organização migrada para trial de 7 dias.' });
    } catch (err: unknown) {
      toast({ title: 'Falha na migração', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setMigratingLegacy(false);
    }
  }, [billingQuery, toast]);

  const handleCancelConfirm = useCallback(async () => {
    setCancelStep('processing');
    try {
      const portalUrl = await createBillingPortalSession();
      window.location.href = portalUrl;
    } catch {
      toast({ title: 'Não foi possível cancelar', description: 'Tente novamente ou entre em contato com o suporte.', variant: 'destructive' });
      setCancelStep('confirm');
    }
  }, [toast]);

  /* ── render data ── */

  const usageRows = LIMIT_DISPLAY.map((item) => {
    const usageKey = USAGE_KEY_MAP[item.key];
    const limit = Number(
      (billing?.effective_limits as Record<string, unknown> | undefined)?.[item.key] ??
      (billing?.plan_limits as Record<string, unknown> | undefined)?.[item.key] ?? 0,
    );
    const used = usageKey ? Number((billing?.usage as Record<string, unknown> | undefined)?.[usageKey] ?? 0) : 0;
    return { ...item, limit, used, pct: pct(used, limit) };
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/30">
      <PageHeader
        title="Meu Plano"
        subtitle="Gerencie assinatura, limites e cobrança da sua organização."
        icon={CreditCard}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">

          {/* ─── 1. Plan hero card ─── */}
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${meta.gradient}`} />

            <div className="px-6 pt-8 pb-6 sm:px-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-lg`}>
                    <PlanIcon className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        Plano {meta.label}
                      </h2>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isTrial && trialDays !== null
                        ? `Trial ativo — ${trialDays} dia${trialDays !== 1 ? 's' : ''} restante${trialDays !== 1 ? 's' : ''}`
                        : status === 'past_due'
                          ? 'Pagamento pendente — atualize seus dados de cobrança'
                          : periodEnd
                            ? `Próxima renovação em ${periodEnd}`
                            : 'Gerencie seus limites e recursos abaixo'}
                    </p>
                    {graceDays !== null && graceDays > 0 && status !== 'active' && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Período de carência: {graceDays} dia{graceDays !== 1 ? 's' : ''} restante{graceDays !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>

                {isAdminOrOwner && (
                  <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                    {hasActiveSubscription && (
                      <Button variant="outline" size="sm" onClick={handleOpenBillingPortal} disabled={billingBusy} className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Portal Stripe
                      </Button>
                    )}
                    <Button size="sm" onClick={() => navigate('/pricing')} className="gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Ver planos
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── 2. Usage meters ─── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {usageRows.map((row) => (
              <div key={row.key} className="group rounded-xl border border-border/50 bg-background p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{row.used}/{row.limit <= 0 ? '∞' : fmt(row.limit)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${barColor(row.pct)}`}
                    style={{ width: `${row.limit <= 0 ? 0 : row.pct}%` }}
                  />
                </div>
                {row.pct >= 90 && row.limit > 0 && (
                  <p className="mt-2 text-[10px] font-medium text-red-500">Quase no limite</p>
                )}
              </div>
            ))}
          </div>

          {/* ─── 3. Upgrade suggestion ─── */}
          {nextPlan && isAdminOrOwner && planKey !== 'scale' && (
            <button
              type="button"
              onClick={() => handleUpgradePlan(nextPlan.key)}
              disabled={billingBusy}
              className="group relative w-full overflow-hidden rounded-2xl border border-border/50 bg-background p-5 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/30"
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${nextPlan.gradient} shadow`}>
                  <nextPlan.icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Fazer upgrade para {nextPlan.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {nextPlan.catalogEntry
                      ? `A partir de R$ ${(nextPlan.catalogEntry.price_cents / 100).toFixed(2).replace('.', ',')}/mês — mais leads, mais disparos, mais poder`
                      : 'Destrave limites maiores e recursos exclusivos'}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          )}

          {/* ─── 4. Legacy migration ─── */}
          {isAdminOrOwner && (status === 'none' || status === 'canceled') && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <Gift className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">Ative seu trial gratuito</p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Experimente todos os recursos por 7 dias sem custo. Sem cartão de crédito.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleLegacyMigration}
                      disabled={migratingLegacy}
                      className="border-amber-300 text-amber-800 hover:bg-amber-100"
                    >
                      {migratingLegacy ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Ativando...</>
                      ) : (
                        'Ativar trial de 7 dias'
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate('/pricing')} className="text-amber-700 hover:text-amber-900">
                      Ver planos pagos
                      <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── 5. Cancel plan flow ─── */}
          {isAdminOrOwner && hasActiveSubscription && (
            <div className="rounded-2xl border border-border/50 bg-background shadow-sm">
              <div className="px-6 py-5 sm:px-8">
                {cancelStep === 'idle' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Cancelar assinatura</p>
                      <p className="text-xs text-muted-foreground">Você pode cancelar a qualquer momento sem multa.</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCancelStep('reason')}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      Cancelar plano
                    </Button>
                  </div>
                )}

                {cancelStep === 'reason' && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Antes de cancelar…</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Nos ajude a melhorar. Qual o principal motivo?
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CANCEL_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => { setCancelReason(reason); setCancelStep('confirm'); }}
                          className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 ${
                            cancelReason === reason ? 'border-primary bg-primary/5 font-medium' : 'border-border/60'
                          }`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setCancelStep('idle'); setCancelReason(''); }}>
                        Voltar
                      </Button>
                    </div>
                  </div>
                )}

                {cancelStep === 'confirm' && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Tem certeza?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ao cancelar, seu plano ficará ativo até o final do período atual
                          {periodEnd ? ` (${periodEnd})` : ''}. Depois disso, o acesso será limitado ao plano gratuito.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs text-red-700">
                        <strong>Motivo informado:</strong> {cancelReason}
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setCancelStep('idle'); setCancelReason(''); }}>
                        Manter meu plano
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleCancelConfirm}
                        className="gap-1.5"
                      >
                        Confirmar cancelamento
                      </Button>
                    </div>
                  </div>
                )}

                {cancelStep === 'processing' && (
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Redirecionando para o portal de cancelamento…</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── 6. Past-due alert ─── */}
          {status === 'past_due' && (
            <div className="flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Pagamento pendente</p>
                <p className="mt-0.5 text-xs text-red-700">
                  Atualize seus dados de pagamento para evitar a suspensão do plano.
                </p>
                {isAdminOrOwner && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenBillingPortal}
                    disabled={billingBusy}
                    className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Atualizar pagamento
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ─── 7. Features list ─── */}
          {billing?.features && Object.keys(billing.features).length > 0 && (
            <div className="rounded-2xl border border-border/50 bg-background p-6 shadow-sm sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Recursos inclusos no seu plano</p>
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {Object.entries(billing.features as Record<string, unknown>)
                  .filter(([, v]) => v === true)
                  .map(([key]) => {
                    const labels: Record<string, string> = {
                      ai_enabled: 'Assistente de IA',
                      google_integration_enabled: 'Integração Google',
                      appointments_enabled: 'Agendamentos',
                      advanced_reports_enabled: 'Relatórios avançados',
                      advanced_tracking_enabled: 'Tracking avançado',
                    };
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm text-foreground py-1">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        {labels[key] || key}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
