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
type BillingIntent = 'upgrade' | 'reactivate';

const PLAN_DISPLAY: Record<string, {
  label: string; description: string; icon: typeof Zap;
  gradient: string; buttonGradient: string; tagline: string;
}> = {
  start: {
    label: 'Start',
    description: 'Para quem está começando a escalar vendas com WhatsApp',
    icon: Zap,
    gradient: 'from-slate-500 to-slate-700',
    buttonGradient: 'brand-gradient-button',
    tagline: 'Essencial',
  },
  pro: {
    label: 'Pro',
    description: 'Ideal para operações em crescimento acelerado',
    icon: Crown,
    gradient: 'from-primary to-secondary',
    buttonGradient: 'brand-gradient-button',
    tagline: 'Mais popular',
  },
  scale: {
    label: 'Scale',
    description: 'Para times grandes com volume de alta escala',
    icon: Sparkles,
    gradient: 'from-secondary to-primary',
    buttonGradient: 'brand-gradient-button',
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
  appointments_enabled: 'Agendamentos',
  advanced_reports_enabled: 'Relatórios avançados',
  advanced_tracking_enabled: 'Tracking avançado',
};

const CARD_HIGHLIGHTS: Record<string, string[]> = {
  start: ['Leads ativos', 'Instâncias WhatsApp', 'Créditos de disparo/mês', 'Propostas/mês', 'Assistente de IA'],
  pro: ['Leads ativos', 'Instâncias WhatsApp', 'Créditos de disparo/mês', 'Propostas/mês', 'Assistente de IA'],
  scale: ['Leads ativos', 'Instâncias WhatsApp', 'Créditos de disparo/mês', 'Propostas/mês', 'Tracking avançado', 'Assistente de IA'],
};

const SOURCE_LABELS: Record<string, string> = {
  tracking: 'Tracking avançado',
  integracoes: 'Integrações',
  calendario: 'Agendamentos',
  ia_agentes: 'IA Agentes',
  broadcasts: 'Disparos',
  broadcast_credits: 'Créditos de disparo',
  ai_credits: 'Créditos de IA',
  proposal_ai: 'Propostas com IA',
  whatsapp_instances: 'Instâncias de WhatsApp',
  propostas: 'Propostas',
  automacoes: 'Automações',
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
function normalizePlanQuery(value: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  return PLAN_ORDER.includes(normalized) ? normalized : null;
}

function getPlanActionLabel(targetPlan: string, currentPlan: string | null, intent: BillingIntent) {
  if (intent === 'reactivate' && targetPlan === currentPlan) return 'Reativar plano';
  if (targetPlan === currentPlan) return 'Plano atual';
  const currentRank = PLAN_RANK[currentPlan ?? 'free'] ?? 0;
  const targetRank = PLAN_RANK[targetPlan] ?? 0;
  if (!currentPlan || currentPlan === 'free') return 'Testar grátis por 7 dias';
  if (targetRank > currentRank) return 'Fazer upgrade';
  if (targetRank < currentRank) return 'Fazer downgrade';
  return 'Selecionar plano';
}

function isPlanSelectionDisabled(targetPlan: string, currentPlan: string | null, intent: BillingIntent) {
  if (intent === 'reactivate' && targetPlan === currentPlan) return false;
  return targetPlan === currentPlan;
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
  const rawPlan = String(billing?.plan_key || '').trim() || null;
  const billingStatus = String(billing?.subscription_status || '').toLowerCase();
  // Plano só é considerado "atual" se a subscription foi de fato confirmada (não pending_checkout)
  const currentPlan = billingStatus === 'pending_checkout' ? null : rawPlan;
  const checkoutState = String(searchParams.get('checkout') || '').trim();
  const intent = (searchParams.get('intent') === 'reactivate' ? 'reactivate' : 'upgrade') as BillingIntent;
  const targetPlan = normalizePlanQuery(searchParams.get('target'));
  const source = String(searchParams.get('source') || '').trim().toLowerCase();
  const sourceLabel = SOURCE_LABELS[source] || null;
  const isNoPlan = !currentPlan || currentPlan === 'free';
  const heroBadgeLabel = intent === 'reactivate' ? 'Reativação guiada' : 'Upgrade guiado';
  const heroTitle = intent === 'reactivate'
    ? 'Retome seu plano e desbloqueie o acesso completo'
    : 'Escolha o plano ideal para destravar a próxima etapa';
  const heroDescription = intent === 'reactivate'
    ? `Regularize a assinatura${sourceLabel ? ` para voltar a usar ${sourceLabel}` : ''} sem fricção.`
    : sourceLabel
      ? `Chegue ao recurso de ${sourceLabel} com o plano mais aderente ao seu uso atual.`
      : 'Compare os planos e siga para o upgrade mais aderente ao seu momento.';

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
      navigate(`/login?plan=${encodeURIComponent(planKey)}&mode=signup`);
      return;
    }
    try {
      setBusyPlan(planKey);
      const url = await createPlanCheckoutSession({
        planKey,
        orgId,
        successUrl: `${window.location.origin}/onboarding?checkout=success`,
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

  const journeyHighlights = [
    {
      title: 'Escolha um plano',
      description: 'Selecione Start, Pro ou Scale conforme o tamanho da sua operacao.',
    },
    {
      title: 'Teste por 7 dias',
      description: 'O trial libera o uso do plano escolhido antes da cobranca mensal.',
    },
    {
      title: 'Gerencie quando quiser',
      description: 'Upgrade, downgrade e cancelamento podem ser feitos depois no painel da conta.',
    },
  ];

  return (
    <div className="app-shell-bg min-h-screen text-foreground overflow-y-auto">
      {/* Decorative blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute top-1/3 -right-20 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-secondary/10 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Checkout feedback */}
        {checkoutState && (
          <div className={`mb-8 flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm backdrop-blur-sm ${
            checkoutState === 'success'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
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
        <div className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px] lg:items-stretch">
          <div className="auth-portal-form-surface">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {intent === 'reactivate' ? heroBadgeLabel : '7 dias grátis em qualquer plano'}
            </div>

            {isNoPlan && intent !== 'reactivate' ? (
              <>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                  Escolha o plano ideal para{' '}
                  <span className="brand-gradient-text">
                    escalar suas vendas
                  </span>
                </h1>
                <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
                  Comece a fechar mais negócios com automação via WhatsApp, IA embarcada e CRM solar completo.
                  Escolha o plano que faz sentido para sua operacao e teste sem cobranca durante os 7 primeiros dias.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                  {heroTitle}{' '}
                  <span className="brand-gradient-text">
                    SolarZap
                  </span>
                </h1>
                <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
                  {heroDescription}
                </p>
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {currentPlan && currentPlan !== 'free' ? (
                <div className="public-hero-surface inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm">
                  <span className="text-muted-foreground">Plano atual:</span>
                  <Badge className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/15">
                    {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleOpenPortal}
                    disabled={openingPortal}
                  >
                    <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                    {openingPortal ? 'Abrindo...' : 'Gerenciar assinatura'}
                  </Button>
                </div>
              ) : !user ? (
                <Button variant="outline" className="gap-2" onClick={() => navigate('/login')}>
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </Button>
              ) : null}

              {sourceLabel && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 text-primary" />
                  Origem: {sourceLabel}
                </div>
              )}
            </div>
          </div>

          <aside className="auth-portal-aside">
            <div className="space-y-4">
              <div className="brand-logo-disc h-14 w-14">
                <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Como funciona</p>
                <h2 className="text-2xl font-semibold text-foreground">Veja o que acontece depois de escolher o plano.</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  O checkout libera o trial do plano escolhido. Depois disso, a assinatura pode ser administrada pela propria conta.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              {journeyHighlights.map((item) => (
                <div key={item.title} className="auth-portal-info-card">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,hsl(var(--primary)/0.18),hsl(var(--secondary)/0.16))] text-primary shadow-[0_18px_36px_-24px_hsl(var(--primary)/0.4)]">
                    <Check className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/72 px-4 py-3 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.42)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Contexto atual</p>
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-semibold text-foreground">{currentPlan && currentPlan !== 'free' ? `Plano ${currentPlan}` : 'Sem plano ativo'}</p>
                <p className="text-muted-foreground">
                  {isNoPlan ? 'Escolha um plano para iniciar o trial ou conclua a contratacao pendente.' : 'Sua assinatura pode ser ajustada ou administrada quando necessario.'}
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* Trial highlight banner */}
        <div className="brand-gradient-soft mb-10 overflow-hidden rounded-3xl border border-primary/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-6 py-6 text-center sm:flex-row sm:text-left">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/15">
              <Gift className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">
                Teste qualquer plano grátis por 7 dias — <span className="text-primary">até o Scale!</span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Você escolhe o plano que quiser e usa <span className="font-medium text-foreground">todos os recursos sem restrição</span> durante o trial.
                Quanto maior o plano, mais você pode testar. Só cobramos após os 7 dias.
                {' '}<span className="font-medium text-foreground">Cancele a qualquer momento, sem multa e sem burocracia.</span>
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary sm:flex-shrink-0">
              <Clock className="h-4 w-4" />
              R$ 0,00 por 7 dias
            </div>
          </div>
        </div>

        {/* Trust reassurance — visible only for new signups */}
        {isNoPlan && (
          <div className="mb-10 flex flex-wrap justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Seus dados de cartão ficam com a Stripe — não armazenamos nada</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Nenhuma cobrança durante os 7 dias de trial</span>
            <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 text-primary" /> Cancele a qualquer momento em 2 cliques</span>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const key = String(plan.plan_key);
            const isCurrent = key === currentPlan;
            const isTarget = targetPlan === key;
            const isDisabled = isPlanSelectionDisabled(key, currentPlan, intent);
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
                  isTarget
                    ? 'border-primary/50 bg-gradient-to-b from-primary/18 to-transparent shadow-[0_0_70px_-18px_rgba(249,115,22,0.24)] ring-2 ring-primary/35'
                    : isPro
                    ? 'border-primary/35 bg-gradient-to-b from-primary/[0.08] to-transparent shadow-[0_0_60px_-12px_rgba(249,115,22,0.18)] hover:shadow-[0_0_80px_-12px_rgba(59,130,246,0.18)] lg:scale-[1.03]'
                    : 'border-border/70 bg-card/86 hover:border-primary/20 hover:bg-card'
                } backdrop-blur-sm`}
              >
                {/* Popular ribbon */}
                {isPro && (
                  <div className="absolute -right-12 top-6 rotate-45 bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--secondary)))] px-12 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
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
                        isPro ? 'bg-primary/15 text-primary' : key === 'scale' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-muted text-muted-foreground'
                      }`}>
                        {display?.tagline ?? 'Plano'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold">{String(plan.display_name)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{display?.description ?? 'Plano comercial'}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight">
                        {formatCurrency(Number(plan.price_cents || 0))}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">após o trial de 7 dias</p>
                    <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      isPro
                        ? 'border border-primary/20 bg-primary/10 text-primary'
                        : key === 'scale'
                          ? 'border border-violet-400/30 bg-violet-500/15 text-violet-300'
                          : 'border border-primary/20 bg-primary/10 text-primary'
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
                            isPro ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            <Check className="h-3 w-3" />
                          </div>
                          <span className="text-foreground/84">
                            {isFeature ? label : (
                              <>
                                <span className="font-semibold text-foreground">{formatLimit(value)}</span>{' '}
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
                      isDisabled
                        ? 'border border-border bg-background text-muted-foreground hover:bg-accent'
                        : `${display?.buttonGradient ?? ''} text-white shadow-lg hover:shadow-xl`
                    }`}
                    onClick={() => !isDisabled && handleUpgrade(key)}
                    disabled={isDisabled || busyPlan === key}
                  >
                    {busyPlan === key ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Redirecionando...
                      </span>
                    ) : isDisabled ? (
                      <span className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        {intent === 'reactivate' && isCurrent ? 'Plano atual para reativação' : 'Plano atual'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {getPlanActionLabel(key, currentPlan, intent)}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                  {!isDisabled && isNoPlan && (
                    <p className="mt-2 text-center text-[11px] text-muted-foreground">
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
            className="public-hero-surface mx-auto flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/20 hover:text-foreground"
          >
            {showComparison ? 'Ocultar comparativo' : 'Ver comparativo completo'}
            <ArrowRight className={`h-4 w-4 transition-transform ${showComparison ? 'rotate-90' : ''}`} />
          </button>

          {showComparison && (
            <div className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card/86 backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">Recurso</th>
                      {plans.map((plan) => {
                        const isPro = plan.plan_key === 'pro';
                        return (
                          <th key={`head-${plan.plan_key}`} className="px-6 py-4 text-center text-sm font-semibold">
                            <span className={isPro ? 'text-primary' : 'text-foreground/84'}>{plan.display_name}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, i) => (
                      <tr key={row.key} className={`border-b border-border/40 last:border-b-0 ${i % 2 === 0 ? 'bg-muted/18' : ''}`}>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{row.label}</td>
                        {plans.map((plan) => {
                          const value = row.kind === 'limit' ? plan.limits?.[row.key] : plan.features?.[row.key];
                          const isPro = plan.plan_key === 'pro';
                          return (
                            <td key={`${row.key}-${plan.plan_key}`} className={`px-6 py-3.5 text-center text-sm font-medium ${isPro ? 'text-primary' : 'text-foreground/84'}`}>
                              {row.kind === 'limit' ? formatLimit(value) : value ? <Check className="mx-auto h-4 w-4 text-primary" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
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
                item.highlight ? 'border-primary/30 bg-primary/[0.06]' : 'border-border/60 bg-card/82'
              }`}
            >
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${item.highlight ? 'bg-primary/20' : 'bg-muted'}`}>
                <item.icon className={`h-5 w-5 ${item.highlight ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
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
          <p className="text-sm text-muted-foreground">
            Usado por dezenas de integradores solares para fechar mais negócios
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Precisa de algo personalizado?{' '}
            <button
              onClick={handleOpenPortal}
              className="text-primary underline underline-offset-4 hover:text-primary/80"
              disabled={openingPortal}
            >
              Entre em contato
            </button>
          </p>
          <Button
            variant="ghost"
            className="mt-4 text-sm text-muted-foreground hover:text-foreground gap-1.5"
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
