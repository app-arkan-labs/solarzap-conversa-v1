import type { OrgBillingInfo } from '@/hooks/useOrgBilling';
import type { ActiveTab } from '@/types/solarzap';
import type { BillingPackType } from '@/lib/billingPacks';
import type { SupabaseFunctionErrorDetails } from '@/lib/supabaseFunctionErrors';

export type BillingTargetPlan = 'start' | 'pro' | 'scale';
export type BillingPageIntent = 'upgrade' | 'reactivate';
export type BillingBlockerKind =
  | 'subscription_blocked'
  | 'read_only'
  | 'feature_locked'
  | 'plan_limit'
  | 'pack_required';
export type BillingBlockerPrimaryAction =
  | 'billing_page'
  | 'billing_portal'
  | 'pack_disparo'
  | 'pack_ai';
export type BillingBlockerSource =
  | ActiveTab
  | 'broadcasts'
  | 'appointments'
  | 'proposal_ai'
  | 'whatsapp_instances'
  | 'broadcast_credits'
  | 'ai_credits';

export type BillingGuardedLimitKey =
  | 'max_campaigns_month'
  | 'monthly_broadcast_credits'
  | 'max_whatsapp_instances'
  | 'max_proposals_month'
  | 'included_ai_requests_month';

export type BillingBlockerPayload = {
  kind: BillingBlockerKind;
  source: BillingBlockerSource;
  title: string;
  description: string;
  primaryLabel: string;
  primaryAction: BillingBlockerPrimaryAction;
  targetPlan?: BillingTargetPlan | null;
  billingIntent?: BillingPageIntent | null;
};

const UNLIMITED_PLAN_KEY = 'unlimited';
const READ_ONLY_BLOCKED_TABS = new Set<ActiveTab>(['disparos', 'propostas', 'automacoes']);
const PLAN_ORDER: BillingTargetPlan[] = ['start', 'pro', 'scale'];

const TAB_BLOCKER_COPY: Partial<Record<ActiveTab, { title: string; description: string }>> = {
  disparos: {
    title: 'Regularize sua assinatura para continuar com disparos',
    description: 'Seu acesso a disparos esta bloqueado ate a regularizacao da assinatura.',
  },
  propostas: {
    title: 'Regularize sua assinatura para continuar com propostas',
    description: 'Seu acesso a propostas esta bloqueado ate a regularizacao da assinatura.',
  },
  automacoes: {
    title: 'Regularize sua assinatura para continuar com automacoes',
    description: 'Seu acesso a automacoes esta bloqueado ate a regularizacao da assinatura.',
  },
  tracking: {
    title: 'Tracking avancado disponivel no plano Scale',
    description: 'Faca upgrade para acompanhar conversoes e eventos com mais profundidade.',
  },
  calendario: {
    title: 'Agendamentos disponiveis a partir do plano Start',
    description: 'Faca upgrade para criar e editar agendamentos no calendario.',
  },
  ia_agentes: {
    title: 'IA Agentes disponivel a partir do plano Start',
    description: 'Faca upgrade para liberar os agentes e automacoes de IA.',
  },
};

export class BillingInterruptionError extends Error {
  readonly handled = true;

  constructor(message = 'Acao interrompida por billing') {
    super(message);
    this.name = 'BillingInterruptionError';
  }
}

export const isBillingInterruptionError = (error: unknown): error is BillingInterruptionError =>
  error instanceof BillingInterruptionError ||
  (typeof error === 'object' &&
    error !== null &&
    'handled' in error &&
    (error as { handled?: unknown }).handled === true);

export const isUnlimitedBillingBypass = (billing: OrgBillingInfo | null | undefined): boolean =>
  String(billing?.plan_key || '').trim().toLowerCase() === UNLIMITED_PLAN_KEY;

export const normalizeBillingPlanKey = (value: unknown): BillingTargetPlan | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'start' || normalized === 'pro' || normalized === 'scale') {
    return normalized;
  }
  return null;
};

export const getNextBillingPlanKey = (currentPlan: BillingTargetPlan | null): BillingTargetPlan => {
  if (!currentPlan) return 'start';
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);
  if (currentIndex < 0 || currentIndex >= PLAN_ORDER.length - 1) {
    return currentPlan;
  }
  return PLAN_ORDER[currentIndex + 1];
};

const buildBillingPageBlocker = (input: {
  kind: BillingBlockerKind;
  source: BillingBlockerSource;
  title: string;
  description: string;
  targetPlan?: BillingTargetPlan | null;
  billingIntent?: BillingPageIntent | null;
  primaryLabel?: string;
}): BillingBlockerPayload => ({
  kind: input.kind,
  source: input.source,
  title: input.title,
  description: input.description,
  primaryLabel: input.primaryLabel || 'Ver planos',
  primaryAction: 'billing_page',
  targetPlan: input.targetPlan ?? null,
  billingIntent: input.billingIntent ?? 'upgrade',
});

export const buildFeatureLockedBlocker = (input: {
  source: BillingBlockerSource;
  title: string;
  description: string;
  targetPlan: BillingTargetPlan;
  primaryLabel?: string;
}): BillingBlockerPayload =>
  buildBillingPageBlocker({
    kind: 'feature_locked',
    source: input.source,
    title: input.title,
    description: input.description,
    targetPlan: input.targetPlan,
    billingIntent: 'upgrade',
    primaryLabel: input.primaryLabel || 'Fazer upgrade',
  });

export const buildPlanLimitBlocker = (input: {
  source: BillingBlockerSource;
  title: string;
  description: string;
  targetPlan?: BillingTargetPlan | null;
  primaryLabel?: string;
}): BillingBlockerPayload =>
  buildBillingPageBlocker({
    kind: 'plan_limit',
    source: input.source,
    title: input.title,
    description: input.description,
    targetPlan: input.targetPlan ?? null,
    billingIntent: 'upgrade',
    primaryLabel: input.primaryLabel || 'Ver upgrade',
  });

export const buildPackRequiredBlocker = (input: {
  source: BillingBlockerSource;
  title: string;
  description: string;
  packType: BillingPackType;
  targetPlan?: BillingTargetPlan | null;
}): BillingBlockerPayload => ({
  kind: 'pack_required',
  source: input.source,
  title: input.title,
  description: input.description,
  primaryLabel: input.packType === 'ai' ? 'Comprar creditos de IA' : 'Comprar creditos',
  primaryAction: input.packType === 'ai' ? 'pack_ai' : 'pack_disparo',
  targetPlan: input.targetPlan ?? null,
  billingIntent: 'upgrade',
});

export const buildSubscriptionIssueBlocker = (input: {
  billing: OrgBillingInfo | null | undefined;
  source: BillingBlockerSource;
  title?: string;
  description?: string;
  kindOverride?: 'subscription_blocked' | 'read_only';
}): BillingBlockerPayload => {
  const status = String(input.billing?.subscription_status || '').trim().toLowerCase();
  const normalizedPlan = normalizeBillingPlanKey(input.billing?.plan_key);
  const currentPlan = normalizedPlan || 'start';
  const statusRequiresPortal = status === 'past_due' || status === 'unpaid';
  const defaultKind =
    input.kindOverride || (input.billing?.access_state === 'read_only' ? 'read_only' : 'subscription_blocked');

  if (statusRequiresPortal) {
    return {
      kind: defaultKind,
      source: input.source,
      title: input.title || 'Atualize o pagamento para continuar',
      description:
        input.description ||
        'Seu acesso esta limitado por uma cobranca pendente. Atualize a forma de pagamento para liberar a funcionalidade.',
      primaryLabel: 'Atualizar pagamento',
      primaryAction: 'billing_portal',
      targetPlan: currentPlan,
      billingIntent: null,
    };
  }

  const billingIntent: BillingPageIntent = normalizedPlan ? 'reactivate' : 'upgrade';
  return {
    kind: defaultKind,
    source: input.source,
    title: input.title || 'Reative sua assinatura para continuar',
    description:
      input.description ||
      'Seu plano precisa ser reativado para liberar esta funcionalidade novamente.',
    primaryLabel: billingIntent === 'reactivate' ? 'Reativar assinatura' : 'Ver planos',
    primaryAction: 'billing_page',
    targetPlan: currentPlan,
    billingIntent,
  };
};

export const buildLimitBlockerForKey = (
  limitKey: BillingGuardedLimitKey,
  billing: OrgBillingInfo | null | undefined,
  source?: BillingBlockerSource,
): BillingBlockerPayload => {
  const currentPlan = normalizeBillingPlanKey(billing?.plan_key);
  const nextPlan = getNextBillingPlanKey(currentPlan);

  switch (limitKey) {
    case 'monthly_broadcast_credits':
      return buildPackRequiredBlocker({
        source: source || 'broadcast_credits',
        title: 'Seus creditos de disparo acabaram',
        description: 'Compre um pack para continuar enviando campanhas agora.',
        packType: 'disparo',
      });
    case 'included_ai_requests_month':
      return buildPackRequiredBlocker({
        source: source || 'ai_credits',
        title: 'Seus creditos de IA acabaram',
        description: 'Compre um pack de IA para continuar usando este recurso.',
        packType: 'ai',
        targetPlan: 'pro',
      });
    case 'max_whatsapp_instances':
      return buildPlanLimitBlocker({
        source: source || 'whatsapp_instances',
        title: 'Seu limite de instancias foi atingido',
        description: 'Faca upgrade para conectar mais numeros de WhatsApp.',
        targetPlan: nextPlan,
      });
    case 'max_proposals_month':
      return buildPlanLimitBlocker({
        source: source || 'proposal_ai',
        title: 'Seu limite mensal de propostas foi atingido',
        description: 'Faca upgrade para continuar gerando propostas com este fluxo.',
        targetPlan: nextPlan,
      });
    case 'max_campaigns_month':
    default:
      return buildPlanLimitBlocker({
        source: source || 'broadcasts',
        title: 'Seu limite mensal de campanhas foi atingido',
        description: 'Faca upgrade para criar novas campanhas de disparo.',
        targetPlan: nextPlan,
      });
  }
};

export const buildTabBlocker = (
  tab: ActiveTab,
  billing: OrgBillingInfo | null | undefined,
): BillingBlockerPayload | null => {
  if (isUnlimitedBillingBypass(billing)) {
    return null;
  }

  const accessState = billing?.access_state || 'full';
  const features = billing?.features || {};
  const copy = TAB_BLOCKER_COPY[tab];

  if (accessState === 'blocked' || (accessState === 'read_only' && READ_ONLY_BLOCKED_TABS.has(tab))) {
    return buildSubscriptionIssueBlocker({
      billing,
      source: tab,
      title: copy?.title,
      description: copy?.description,
      kindOverride: accessState === 'read_only' ? 'read_only' : 'subscription_blocked',
    });
  }

  if (tab === 'tracking' && features.advanced_tracking_enabled !== true) {
    return buildFeatureLockedBlocker({
      source: tab,
      title: copy?.title || 'Tracking avancado disponivel no plano Scale',
      description: copy?.description || 'Faca upgrade para liberar o tracking avancado.',
      targetPlan: 'scale',
    });
  }

  if (tab === 'calendario' && features.appointments_enabled !== true) {
    return buildFeatureLockedBlocker({
      source: tab,
      title: copy?.title || 'Agendamentos disponiveis a partir do plano Start',
      description: copy?.description || 'Faca upgrade para liberar o calendario de agendamentos.',
      targetPlan: 'start',
    });
  }

  if (tab === 'ia_agentes' && features.ai_enabled !== true) {
    return buildFeatureLockedBlocker({
      source: tab,
      title: copy?.title || 'IA Agentes disponivel a partir do plano Start',
      description: copy?.description || 'Faca upgrade para liberar os agentes de IA.',
      targetPlan: 'start',
    });
  }

  return null;
};

export const buildBillingSearchParams = (
  blocker: BillingBlockerPayload,
  billing: OrgBillingInfo | null | undefined,
): URLSearchParams => {
  const params = new URLSearchParams();
  const targetPlan = blocker.targetPlan || normalizeBillingPlanKey(billing?.plan_key) || 'start';
  const billingIntent = blocker.billingIntent || 'upgrade';

  params.set('intent', billingIntent);
  params.set('target', targetPlan);
  params.set('source', blocker.source);

  return params;
};

export const isProposalComposerBillingError = (details: SupabaseFunctionErrorDetails): boolean =>
  details.status === 402 &&
  (details.code === 'billing_limit_reached' ||
    String(details.payload?.error || '').trim().toLowerCase() === 'billing_limit_reached');
