import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check, ArrowRight, Shield, Zap, Crown, Sparkles, X,
  CreditCard, Gift, Clock, ArrowLeft, Star,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  createBillingPortalSession,
  createPlanCheckoutSession,
  useOrgBillingInfo,
} from '@/hooks/useOrgBilling';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/* ── constants ──────────────────────────────────────────────────── */

const PLAN_ORDER = ['start', 'pro', 'scale'];
const PLAN_RANK: Record<string, number> = { free: 0, start: 1, pro: 2, scale: 3 };

const PLAN_DISPLAY: Record<string, {
  label: string; description: string; icon: typeof Zap;
  gradient: string; buttonGradient: string; tagline: string;
}> = {
  start: {
    label: 'Start',
    description: 'Para quem está começando a escalar vendas com WhatsApp',
    icon: Zap,
    gradient: 'from-slate-500 to-slate-700',
    buttonGradient: 'bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900',
    tagline: 'Essencial',
  },
  pro: {
    label: 'Pro',
    description: 'Ideal para operações em crescimento acelerado',
    icon: Crown,
    gradient: 'from-emerald-500 to-teal-600',
    buttonGradient: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700',
    tagline: 'Mais popular',
  },
  scale: {
    label: 'Scale',
    description: 'Para times grandes com volume de alta escala',
    icon: Sparkles,
    gradient: 'from-violet-500 to-purple-700',
    buttonGradient: 'bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800',
    tagline: 'Máximo poder',
  },
};

const LIMIT_LABELS: Record<string, string> = {
  max_leads: 'Leads ativos',
  max_whatsapp_instances: 'Instâncias WhatsApp',
  monthly_broadcast_credits: 'Créditos de disparo/mês',
  max_proposals_month: 'Propostas/mês',
  max_members: 'Membros no time',
  max_campaigns_month: 'Campanhas/mês',
  max_broadcasts_month: 'Campanhas/mês',
  max_automations_month: 'Automações/mês',
  included_ai_requests_month: 'Requisições de IA/mês',
};

const FEATURE_LABELS: Record<string, string> = {
  ai_enabled: 'Assistente de IA',
  google_integration_enabled: 'Integração Google',
  appointments_enabled: 'Agendamentos',
  advanced_reports_enabled: 'Relatórios avançados',
  advanced_tracking_enabled: 'Tracking avançado',
};

const CARD_HIGHLIGHTS: Record<string, string[]> = {
  start: ['Leads ativos', 'Instâncias WhatsApp', 'Créditos de disparo/mês', 'Propostas/mês', 'Assistente de IA'],
  pro: ['Leads ativos', 'Instâncias WhatsApp', 'Créditos de disparo/mês', 'Propostas/mês', 'Integração Google', 'Assistente de IA'],
  scale: ['Leads ativos', 'Instâncias WhatsApp', 'Créditos de disparo/mês', 'Propostas/mês', 'Tracking avançado', 'Assistente de IA'],
};

type PlanRow = {
  plan_key: string;
  display_name: string;
  price_cents: number;
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
};

/* ── helpers ─────────────────────────────────────────────────────── */

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
}

function formatLimit(value: unknown) {
  const n = Number(value ?? 0);
  if (n < 0) return 'Ilimitado';
  return new Intl.NumberFormat('pt-BR').format(n);
}

function getPlanActionLabel(targetPlan: string, currentPlan: string | null) {
  if (targetPlan === currentPlan) return 'Plano atual';
  const currentRank = PLAN_RANK[currentPlan ?? 'free'] ?? 0;
  const targetRank = PLAN_RANK[targetPlan] ?? 0;
  if (!currentPlan || currentPlan === 'free') return 'Testar grátis por 7 dias';
  if (targetRank > currentRank) return 'Fazer upgrade';
  if (targetRank < currentRank) return 'Fazer downgrade';
  return 'Selecionar plano';
}

/* ── component ──────────────────────────────────────────────────── */

export default function Pricing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, orgId } = useAuth();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [planCatalog, setPlanCatalog] = useState<PlanRow[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  const billingQuery = useOrgBillingInfo(true);
  const billing = billingQuery.data;
  const currentPlan = String(billing?.plan_key || '').trim() || null;
  const checkoutState = String(searchParams.get('checkout') || '').trim();
  const isNoPlan = !currentPlan || currentPlan === 'free';

  const plans = useMemo(() => {
    if (planCatalog.length > 0) return planCatalog;
    return PLAN_ORDER.map((key) => ({
      plan_key: key,
      display_name: PLAN_DISPLAY[key]?.label || key,
      price_cents: 0,
      limits: {},
      features: {},
    }));
  }, [planCatalog]);

  const comparisonRows = useMemo(() => {
    const limitRows = Object.entries(LIMIT_LABELS).map(([key, label]) => ({ key, label, kind: 'limit' as const }));
    const featureRows = Object.entries(FEATURE_LABELS).map(([key, label]) => ({ key, label, kind: 'feature' as const }));
    return [...limitRows, ...featureRows];
  }, []);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const { data: planData } = await supabase
        .from('_admin_subscription_plans')
        .select('plan_key, display_name, price_cents, limits, features')
        .eq('is_active', true)
        .neq('plan_key', 'free')
        .in('plan_key', PLAN_ORDER)
        .order('sort_order', { ascending: true });

      if (!isMounted) return;
      setPlanCatalog(
        (planData || []).map((row) => ({
          plan_key: String(row.plan_key),
          display_name: String(row.display_name || row.plan_key),
          price_cents: Number(row.price_cents || 0),
          limits: typeof row.limits === 'object' && row.limits && !Array.isArray(row.limits) ? row.limits as Record<string, unknown> : {},
          features: typeof row.features === 'object' && row.features && !Array.isArray(row.features) ? row.features as Record<string, unknown> : {},
        })),
      );
    })();
    return () => { isMounted = false; };
  }, []);

  const handleUpgrade = async (planKey: string) => {
    if (!user) {
      navigate(`/login?plan=${encodeURIComponent(planKey)}`);
      return;
    }
    try {
      setBusyPlan(planKey);
      const url = await createPlanCheckoutSession({
        planKey,
        orgId,
        successUrl: `${window.location.origin}/welcome?checkout=success`,
        cancelUrl: `${window.location.origin}/billing?checkout=cancel`,
      });
      window.location.href = url;
    } catch (error) {
      toast({ title: 'Falha ao abrir checkout', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    } finally {
      setBusyPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    try {
      setOpeningPortal(true);
      const url = await createBillingPortalSession(orgId);
      window.location.href = url;
    } catch (error) {
      toast({ title: 'Portal indisponível', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white overflow-y-auto">
      {/* Decorative blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-20 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-teal-500/8 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Checkout feedback */}
        {checkoutState && (
          <div className={`mb-8 flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm backdrop-blur-sm ${
            checkoutState === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}>
            {checkoutState === 'success' ? <Check className="h-5 w-5 flex-shrink-0" /> : <X className="h-5 w-5 flex-shrink-0" />}
            <span>
              {checkoutState === 'success'
                ? 'Assinatura iniciada com sucesso! A confirmação final virá pelo webhook da Stripe.'
                : 'Checkout cancelado. Nenhuma cobrança foi aplicada.'}
            </span>
          </div>
        )}

        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            7 dias grátis em qualquer plano
          </div>

          {isNoPlan ? (
            <>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Escolha o plano ideal para{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  escalar suas vendas
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
                Comece a fechar mais negócios hoje com automação via WhatsApp, IA embarcada e CRM solar completo.
                Teste qualquer plano grátis por 7 dias.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Escale suas vendas com{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  SolarZap
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
                Automação inteligente via WhatsApp, IA embarcada e CRM solar completo.
                Escolha o plano ideal e comece a fechar mais negócios hoje.
              </p>
            </>
          )}

          {/* Current plan pill */}
          {currentPlan && currentPlan !== 'free' && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-800/60 px-5 py-2 text-sm backdrop-blur-sm">
              <span className="text-slate-400">Plano atual:</span>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
                {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-400 hover:text-white"
                onClick={handleOpenPortal}
                disabled={openingPortal}
              >
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                {openingPortal ? 'Abrindo...' : 'Gerenciar assinatura'}
              </Button>
            </div>
          )}
        </div>

        {/* Trial highlight banner */}
        <div className="mb-10 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.07] via-teal-500/[0.05] to-emerald-500/[0.07] backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-6 py-6 text-center sm:flex-row sm:text-left">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
              <Gift className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">
                Teste qualquer plano grátis por 7 dias — <span className="text-emerald-400">até o Scale!</span>
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Você escolhe o plano que quiser e usa <span className="font-medium text-slate-300">todos os recursos sem restrição</span> durante o trial.
                Quanto maior o plano, mais você pode testar. Só cobramos após os 7 dias.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 sm:flex-shrink-0">
              <Clock className="h-4 w-4" />
              R$ 0,00 por 7 dias
            </div>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const key = String(plan.plan_key);
            const isCurrent = key === currentPlan;
            const isPro = key === 'pro';
            const display = PLAN_DISPLAY[key];
            const Icon = display?.icon ?? Zap;
            const highlights = CARD_HIGHLIGHTS[key] || [];

            const allLabels = { ...LIMIT_LABELS, ...FEATURE_LABELS };
            const allValues = { ...plan.limits, ...plan.features };

            return (
              <div
                key={key}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border transition-all duration-300 ${
                  isPro
                    ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.08] to-transparent shadow-[0_0_60px_-12px_rgba(16,185,129,0.25)] hover:shadow-[0_0_80px_-12px_rgba(16,185,129,0.35)] lg:scale-[1.03]'
                    : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600/80 hover:bg-slate-800/60'
                } backdrop-blur-sm`}
              >
                {/* Popular ribbon */}
                {isPro && (
                  <div className="absolute -right-12 top-6 rotate-45 bg-gradient-to-r from-emerald-500 to-teal-500 px-12 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                    Mais popular
                  </div>
                )}

                <div className="flex flex-1 flex-col p-8">
                  {/* Header */}
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${display?.gradient ?? 'from-slate-500 to-slate-700'} shadow-lg`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isPro ? 'bg-emerald-500/20 text-emerald-400' : key === 'scale' ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {display?.tagline ?? 'Plano'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold">{String(plan.display_name)}</h3>
                    <p className="mt-1 text-sm text-slate-400">{display?.description ?? 'Plano comercial'}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight">
                        {formatCurrency(Number(plan.price_cents || 0))}
                      </span>
                      <span className="text-sm text-slate-500">/mês</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">após o trial de 7 dias</p>
                    <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      isPro
                        ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : key === 'scale'
                          ? 'border border-violet-400/30 bg-violet-500/15 text-violet-300'
                          : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    }`}>
                      <Gift className="h-3 w-3" />
                      7 dias grátis
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="mb-8 flex-1 space-y-3">
                    {highlights.map((label) => {
                      const entry = Object.entries(allLabels).find(([, v]) => v === label);
                      if (!entry) return null;
                      const [limitKey] = entry;
                      const isFeature = limitKey in (plan.features || {});
                      const value = allValues[limitKey];
                      return (
                        <li key={limitKey} className="flex items-start gap-3 text-sm">
                          <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                            isPro ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'
                          }`}>
                            <Check className="h-3 w-3" />
                          </div>
                          <span className="text-slate-300">
                            {isFeature ? label : (
                              <>
                                <span className="font-semibold text-white">{formatLimit(value)}</span>{' '}
                                {label.toLowerCase().replace(/^[^ ]+ /, '')}
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* CTA */}
                  <Button
                    className={`w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isCurrent
                        ? 'border border-slate-600 bg-transparent text-slate-400 hover:bg-slate-700/50'
                        : `${display?.buttonGradient ?? ''} text-white shadow-lg hover:shadow-xl`
                    }`}
                    onClick={() => !isCurrent && handleUpgrade(key)}
                    disabled={isCurrent || busyPlan === key}
                  >
                    {busyPlan === key ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Redirecionando...
                      </span>
                    ) : isCurrent ? (
                      <span className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        Plano atual
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {getPlanActionLabel(key, currentPlan)}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                  {!isCurrent && isNoPlan && (
                    <p className="mt-2 text-center text-[11px] text-slate-500">
                      Sem compromisso · Cancele a qualquer momento
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Expandable Comparison */}
        <div className="mt-16">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="mx-auto flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-6 py-3 text-sm font-medium text-slate-300 backdrop-blur-sm transition-colors hover:border-slate-600 hover:text-white"
          >
            {showComparison ? 'Ocultar comparativo' : 'Ver comparativo completo'}
            <ArrowRight className={`h-4 w-4 transition-transform ${showComparison ? 'rotate-90' : ''}`} />
          </button>

          {showComparison && (
            <div className="mt-8 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800/40 backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-700/60">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Recurso</th>
                      {plans.map((plan) => {
                        const isPro = plan.plan_key === 'pro';
                        return (
                          <th key={`head-${plan.plan_key}`} className="px-6 py-4 text-center text-sm font-semibold">
                            <span className={isPro ? 'text-emerald-400' : 'text-slate-300'}>{plan.display_name}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, i) => (
                      <tr key={row.key} className={`border-b border-slate-700/30 last:border-b-0 ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                        <td className="px-6 py-3.5 text-sm text-slate-400">{row.label}</td>
                        {plans.map((plan) => {
                          const value = row.kind === 'limit' ? plan.limits?.[row.key] : plan.features?.[row.key];
                          const isPro = plan.plan_key === 'pro';
                          return (
                            <td key={`${row.key}-${plan.plan_key}`} className={`px-6 py-3.5 text-center text-sm font-medium ${isPro ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {row.kind === 'limit' ? formatLimit(value) : value ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : <X className="mx-auto h-4 w-4 text-slate-600" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Trust / Guarantee */}
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            { icon: Gift, title: 'Teste o plano que quiser', desc: 'Escolha qualquer plano — até o Scale — e use todos os recursos por 7 dias sem pagar nada.', highlight: true },
            { icon: Shield, title: 'Cancele quando quiser', desc: 'Zero multa, zero burocracia. Se não gostar, cancele antes do trial acabar e não paga nada.', highlight: false },
            { icon: CreditCard, title: 'Pagamento seguro', desc: 'Processado pela Stripe, líder mundial em pagamentos. Seus dados sempre protegidos.', highlight: false },
          ].map((item) => (
            <div
              key={item.title}
              className={`flex items-start gap-4 rounded-2xl border p-5 backdrop-blur-sm ${
                item.highlight ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-slate-700/40 bg-slate-800/30'
              }`}
            >
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${item.highlight ? 'bg-emerald-500/20' : 'bg-slate-700/50'}`}>
                <item.icon className={`h-5 w-5 ${item.highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Social proof (new) */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-1 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <p className="text-sm text-slate-400">
            Usado por dezenas de integradores solares para fechar mais negócios
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500">
            Precisa de algo personalizado?{' '}
            <button
              onClick={handleOpenPortal}
              className="text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
              disabled={openingPortal}
            >
              Entre em contato
            </button>
          </p>
          <Button
            variant="ghost"
            className="mt-4 text-sm text-slate-500 hover:text-slate-300 gap-1.5"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao aplicativo
          </Button>
        </div>
      </div>
    </div>
  );
}
