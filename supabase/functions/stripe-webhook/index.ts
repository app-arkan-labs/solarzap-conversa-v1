import Stripe from 'npm:stripe';
import { resolveRequestCors } from '../_shared/cors.ts';
import { appendBillingTimeline, getServiceClient } from '../_shared/billing.ts';
import { getStripeClient, getStripeWebhookSecret } from '../_shared/stripe.ts';

function json(corsHeaders: Record<string, string>, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toIso(ts?: number | null): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

function mapPublicSubscriptionStatus(status: string): string {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  if (status === 'unpaid') return 'unpaid';
  if (status === 'incomplete') return 'pending_checkout';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'active';
}

type PublicPlanRow = {
  plan_key: string;
  limits: Record<string, unknown> | null;
  stripe_price_id: string | null;
};

type PublicAddonRow = {
  addon_key: string;
  addon_type: string;
  limit_key: string;
  stripe_price_id: string | null;
};

function extractStripePriceId(item: Stripe.SubscriptionItem): string | null {
  if (typeof item.price === 'string') return item.price;
  return item.price?.id ?? null;
}

async function syncPublicCatalogFromSubscription(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
  subscription: Stripe.Subscription,
): Promise<{ plan: PublicPlanRow | null }> {
  const items = subscription.items.data || [];
  const priceIds = Array.from(
    new Set(
      items
        .map((item) => extractStripePriceId(item))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (priceIds.length < 1) {
    return { plan: null };
  }

  const [{ data: plans }, { data: addons }] = await Promise.all([
    serviceClient
      .from('_admin_subscription_plans')
      .select('plan_key, limits, stripe_price_id')
      .eq('is_active', true)
      .in('stripe_price_id', priceIds),
    serviceClient
      .from('_admin_addon_catalog')
      .select('addon_key, addon_type, limit_key, stripe_price_id')
      .eq('is_active', true)
      .in('stripe_price_id', priceIds),
  ]);

  const planByPrice = new Map<string, PublicPlanRow>();
  for (const plan of plans ?? []) {
    const priceId = String(plan.stripe_price_id || '').trim();
    if (!priceId) continue;
    planByPrice.set(priceId, {
      plan_key: String(plan.plan_key || ''),
      limits: (typeof plan.limits === 'object' && plan.limits && !Array.isArray(plan.limits) ? plan.limits : {}) as Record<string, unknown>,
      stripe_price_id: priceId,
    });
  }

  const addonByPrice = new Map<string, PublicAddonRow>();
  for (const addon of addons ?? []) {
    const priceId = String(addon.stripe_price_id || '').trim();
    if (!priceId) continue;
    addonByPrice.set(priceId, {
      addon_key: String(addon.addon_key || ''),
      addon_type: String(addon.addon_type || ''),
      limit_key: String(addon.limit_key || ''),
      stripe_price_id: priceId,
    });
  }

  let matchedPlan: PublicPlanRow | null = null;
  const recurringAddons: Array<{
    addon_key: string;
    quantity: number;
    stripe_subscription_item_id: string;
  }> = [];

  for (const item of items) {
    const priceId = extractStripePriceId(item);
    if (!priceId) continue;

    const plan = planByPrice.get(priceId);
    if (plan && !matchedPlan) {
      matchedPlan = plan;
      continue;
    }

    const addon = addonByPrice.get(priceId);
    if (addon?.addon_type === 'recurring' && item.id) {
      recurringAddons.push({
        addon_key: addon.addon_key,
        quantity: Math.max(1, Number(item.quantity || 1)),
        stripe_subscription_item_id: String(item.id),
      });
    }
  }

  if (matchedPlan) {
    await serviceClient
      .from('organizations')
      .update({
        plan: matchedPlan.plan_key,
        plan_limits: matchedPlan.limits ?? {},
        stripe_price_id: matchedPlan.stripe_price_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);
  }

  const { data: existingAddonSubscriptions } = await serviceClient
    .from('addon_subscriptions')
    .select('id, stripe_subscription_item_id')
    .eq('org_id', orgId)
    .eq('status', 'active');

  const activeItemIds = new Set(recurringAddons.map((item) => item.stripe_subscription_item_id));
  const staleIds = (existingAddonSubscriptions ?? [])
    .filter((row) => {
      const itemId = String(row.stripe_subscription_item_id || '').trim();
      return itemId && !activeItemIds.has(itemId);
    })
    .map((row) => String(row.id));

  if (staleIds.length > 0) {
    await serviceClient
      .from('addon_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .in('id', staleIds);
  }

  if (recurringAddons.length > 0) {
    await serviceClient
      .from('addon_subscriptions')
      .upsert(
        recurringAddons.map((addon) => ({
          org_id: orgId,
          addon_key: addon.addon_key,
          quantity: addon.quantity,
          stripe_subscription_item_id: addon.stripe_subscription_item_id,
          status: 'active',
          canceled_at: null,
        })),
        { onConflict: 'stripe_subscription_item_id' },
      );
  }

  return { plan: matchedPlan };
}

function creditTypeFromAddonLimit(limitKey: string): string | null {
  if (limitKey === 'broadcast_credits') return 'broadcast_credits';
  if (limitKey === 'ai_requests') return 'ai_requests';
  if (limitKey === 'automations') return 'automations';
  return null;
}

async function resolveOrgIdFromEvent(
  serviceClient: ReturnType<typeof getServiceClient>,
  event: Stripe.Event,
): Promise<string | null> {
  const dataObj = event.data.object as Record<string, unknown>;

  const metadata = (dataObj.metadata || {}) as Record<string, string>;
  if (metadata.org_id) return metadata.org_id;

  const customerId = typeof dataObj.customer === 'string'
    ? dataObj.customer
    : (dataObj.customer as Stripe.Customer | null)?.id;

  if (!customerId) return null;

  const { data } = await serviceClient
    .from('stripe_customers')
    .select('org_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data?.org_id ?? null;
}

function extractInternalCrmMetadata(dataObj: Record<string, unknown>): {
  dealId: string | null;
  clientId: string | null;
} {
  const metadata = (dataObj.metadata || {}) as Record<string, string>;
  return {
    dealId: typeof metadata.internal_crm_deal_id === 'string' ? metadata.internal_crm_deal_id : null,
    clientId: typeof metadata.internal_crm_client_id === 'string' ? metadata.internal_crm_client_id : null,
  };
}

function mapStripeSubscriptionStatus(status: string): string {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'pending';
}

async function resolveInternalCrmContext(
  serviceClient: ReturnType<typeof getServiceClient>,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<{ dealId: string | null; clientId: string | null }> {
  const dataObj = event.data.object as Record<string, unknown>;
  const direct = extractInternalCrmMetadata(dataObj);
  if (direct.dealId || direct.clientId) {
    return direct;
  }

  const subscriptionId = typeof dataObj.subscription === 'string'
    ? dataObj.subscription
    : (dataObj.subscription as Stripe.Subscription | null)?.id;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const metadata = subscription.metadata || {};
    return {
      dealId: typeof metadata.internal_crm_deal_id === 'string' ? metadata.internal_crm_deal_id : null,
      clientId: typeof metadata.internal_crm_client_id === 'string' ? metadata.internal_crm_client_id : null,
    };
  }

  return { dealId: null, clientId: null };
}

async function handleInternalCrmStripeEvent(
  serviceClient: ReturnType<typeof getServiceClient>,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<boolean> {
  const schema = serviceClient.schema('internal_crm');
  const context = await resolveInternalCrmContext(serviceClient, stripe, event);
  if (!context.dealId && !context.clientId) {
    return false;
  }

  const paymentEventsQuery = schema
    .from('payment_events')
    .select('id')
    .eq('provider', 'stripe')
    .eq('provider_event_id', event.id)
    .maybeSingle();

  const { data: existingPaymentEvent } = await paymentEventsQuery;
  if (existingPaymentEvent?.id) {
    return true;
  }

  const [{ data: deal }, { data: client }] = await Promise.all([
    context.dealId ? schema.from('deals').select('*').eq('id', context.dealId).maybeSingle() : Promise.resolve({ data: null }),
    context.clientId ? schema.from('clients').select('*').eq('id', context.clientId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const resolvedDeal = deal?.id ? deal : null;
  const resolvedClient = client?.id
    ? client
    : (resolvedDeal?.client_id ? (await schema.from('clients').select('*').eq('id', resolvedDeal.client_id).maybeSingle()).data : null);

  if (!resolvedClient?.id) {
    return false;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const amountTotal = Number(session.amount_total || 0);
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
    const customerId = typeof session.customer === 'string' ? session.customer : null;
    const orderNumber = session.id;

    const { data: order } = await schema.from('orders').upsert({
      client_id: resolvedClient.id,
      deal_id: resolvedDeal?.id || null,
      order_number: orderNumber,
      status: 'paid',
      total_cents: amountTotal,
      payment_method: 'stripe',
      paid_at: new Date().toISOString(),
      metadata: {
        stripe_checkout_session_id: session.id,
        stripe_customer_id: customerId,
      },
    }, { onConflict: 'order_number' }).select('*').single();

    if (resolvedDeal?.id) {
      await schema.from('deals').update({
        status: 'won',
        payment_method: 'stripe',
        payment_status: 'paid',
        checkout_url: null,
        stripe_checkout_session_id: session.id,
        stripe_subscription_id: subscriptionId,
        paid_at: new Date().toISOString(),
        won_at: resolvedDeal.won_at || new Date().toISOString(),
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', resolvedDeal.id);
    }

    await schema.from('clients').update({
      lifecycle_status: 'customer_onboarding',
      updated_at: new Date().toISOString(),
    }).eq('id', resolvedClient.id);

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const { data: recurringItem } = resolvedDeal?.id
        ? await schema.from('deal_items').select('product_code').eq('deal_id', resolvedDeal.id).eq('billing_type', 'recurring').limit(1).maybeSingle()
        : { data: null };

      await schema.from('subscriptions').upsert({
        client_id: resolvedClient.id,
        deal_id: resolvedDeal?.id || null,
        product_code: recurringItem?.product_code || null,
        status: mapStripeSubscriptionStatus(subscription.status),
        mrr_cents: resolvedDeal?.mrr_cents || 0,
        billing_interval: 'month',
        promise_started_at: new Date().toISOString(),
        current_period_end: toIso(subscription.current_period_end),
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        metadata: {
          stripe_status: subscription.status,
        },
      }, { onConflict: 'stripe_subscription_id' });
    }

    await schema.from('payment_events').insert({
      order_id: order?.id || null,
      deal_id: resolvedDeal?.id || null,
      provider: 'stripe',
      provider_event_id: event.id,
      event_type: event.type,
      amount_cents: amountTotal,
      status: 'recorded',
      payload: event,
    });

    return true;
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    await schema.from('subscriptions').update({
      status: mapStripeSubscriptionStatus(subscription.status),
      current_period_end: toIso(subscription.current_period_end),
      updated_at: new Date().toISOString(),
      metadata: {
        stripe_status: subscription.status,
      },
    }).eq('stripe_subscription_id', subscription.id);

    await schema.from('payment_events').insert({
      subscription_id: null,
      deal_id: resolvedDeal?.id || null,
      provider: 'stripe',
      provider_event_id: event.id,
      event_type: event.type,
      amount_cents: 0,
      status: 'recorded',
      payload: event,
    });

    return true;
  }

  if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
    const status = event.type === 'invoice.payment_succeeded' ? 'recorded' : 'failed';
    const amountPaid = Number(invoice.amount_paid || invoice.amount_due || 0);

    await schema.from('payment_events').insert({
      subscription_id: null,
      deal_id: resolvedDeal?.id || null,
      provider: 'stripe',
      provider_event_id: event.id,
      event_type: event.type,
      amount_cents: amountPaid,
      status,
      payload: event,
    });

    if (subscriptionId) {
      await schema.from('subscriptions').update({
        status: event.type === 'invoice.payment_succeeded' ? 'active' : 'past_due',
        updated_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', subscriptionId);
    }

    if (resolvedDeal?.id) {
      await schema.from('deals').update({
        payment_status: event.type === 'invoice.payment_succeeded' ? 'paid' : 'failed',
        updated_at: new Date().toISOString(),
      }).eq('id', resolvedDeal.id);
    }

    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) return json(corsHeaders, 500, { ok: false, error: 'missing_allowed_origin' });
    if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
    return new Response('ok', { headers: corsHeaders });
  }
  if (cors.missingAllowedOriginConfig) return json(corsHeaders, 500, { ok: false, error: 'missing_allowed_origin' });
  if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });

  try {
    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    const sig = req.headers.get('stripe-signature') || '';
    const payload = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(payload, sig, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid_signature';
      return json(corsHeaders, 400, { ok: false, error: msg });
    }

    const serviceClient = getServiceClient();
    const handledInternalCrm = await handleInternalCrmStripeEvent(serviceClient, stripe, event);
    if (handledInternalCrm) {
      return json(corsHeaders, 200, { ok: true, scope: 'internal_crm' });
    }

    const orgId = await resolveOrgIdFromEvent(serviceClient, event);

    if (!orgId) {
      return json(corsHeaders, 200, { ok: true, ignored: true, reason: 'org_not_resolved' });
    }

    const { data: existingStripeEvent } = await serviceClient
      .from('billing_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existingStripeEvent?.id) {
      return json(corsHeaders, 200, { ok: true, duplicate: true });
    }

    const { error: idempotencyInsertError } = await serviceClient
      .from('billing_events')
      .insert({
        org_id: orgId,
        event_type: 'stripe_webhook_received',
        stripe_event_id: event.id,
        payload: {
          stripe_event_type: event.type,
          livemode: event.livemode,
        },
      });

    if (idempotencyInsertError) {
      if (idempotencyInsertError.code === '23505') {
        return json(corsHeaders, 200, { ok: true, duplicate: true });
      }
      throw new Error(`idempotency_insert_failed:${idempotencyInsertError.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const mode = session.mode;
      const metadata = session.metadata || {};

      if (mode === 'subscription') {
        const planKey = String(metadata.plan_key || 'free');
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        const customerId = typeof session.customer === 'string' ? session.customer : null;
        const requestedTrialDays = Math.max(0, Number(metadata.trial_days || 0));

        let periodEnd: string | null = null;
        let trialEnd: string | null = null;
        let nextStatus = requestedTrialDays > 0 ? 'trialing' : 'active';
        let resolvedPlanKey = planKey;
        let resolvedStripePriceId: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = toIso(sub.current_period_end);
          trialEnd = toIso(sub.trial_end);
          nextStatus = mapPublicSubscriptionStatus(sub.status);

          const syncedCatalog = await syncPublicCatalogFromSubscription(serviceClient, orgId, sub);
          if (syncedCatalog.plan?.plan_key) {
            resolvedPlanKey = syncedCatalog.plan.plan_key;
            resolvedStripePriceId = syncedCatalog.plan.stripe_price_id;
          }
        }

        const { data: planRow } = await serviceClient
          .from('_admin_subscription_plans')
          .select('plan_key, limits, features')
          .eq('plan_key', resolvedPlanKey)
          .maybeSingle();

        const trialStartedAt = nextStatus === 'trialing' ? new Date().toISOString() : null;
        const fallbackTrialEnd = requestedTrialDays > 0
          ? new Date(Date.now() + requestedTrialDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

        await serviceClient
          .from('organizations')
          .update({
            plan: resolvedPlanKey,
            plan_limits: (planRow?.limits ?? {}) as Record<string, unknown>,
            subscription_status: nextStatus,
            onboarding_state: 'active',
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            stripe_price_id: resolvedStripePriceId,
            current_period_end: periodEnd,
            grace_ends_at: null,
            trial_started_at: trialStartedAt,
            trial_ends_at: nextStatus === 'trialing' ? (trialEnd ?? fallbackTrialEnd) : null,
            trial_days: requestedTrialDays,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orgId);

        if (customerId) {
          await serviceClient.from('stripe_customers').upsert({
            org_id: orgId,
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          });
        }

        await appendBillingTimeline(serviceClient, orgId, 'checkout_completed', {
          plan_key: resolvedPlanKey,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          stripe_price_id: resolvedStripePriceId,
          trial_days: requestedTrialDays,
        }, 'stripe_webhook');

        if (nextStatus === 'trialing') {
          await appendBillingTimeline(serviceClient, orgId, 'trial_started', {
            plan_key: resolvedPlanKey,
            trial_ends_at: trialEnd ?? fallbackTrialEnd,
          }, 'stripe_webhook');
        }
      }

      if (mode === 'payment') {
        const addonKey = String(metadata.addon_key || '');
        const quantity = Math.max(1, Number(metadata.quantity || 1));
        const grantValue = Math.max(0, Number(metadata.grant_value || 0));
        const credits = quantity * grantValue;

        if (addonKey && credits > 0) {
          const { data: addonRow } = await serviceClient
            .from('_admin_addon_catalog')
            .select('limit_key')
            .eq('addon_key', addonKey)
            .maybeSingle();

          const creditType = creditTypeFromAddonLimit(String(addonRow?.limit_key || ''));
          if (creditType) {
            const { data: existingBalance } = await serviceClient
              .from('credit_balances')
              .select('balance')
              .eq('org_id', orgId)
              .eq('credit_type', creditType)
              .maybeSingle();

            const currentBalance = Number(existingBalance?.balance || 0);
            await serviceClient
              .from('credit_balances')
              .upsert({
                org_id: orgId,
                credit_type: creditType,
                balance: currentBalance + credits,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'org_id,credit_type' });
          }

          await appendBillingTimeline(serviceClient, orgId, 'pack_purchase_completed', {
            addon_key: addonKey,
            credit_type: creditType,
            quantity,
            credits,
            stripe_checkout_session_id: session.id,
          }, 'stripe_webhook');
        }
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionStatus = subscription.status;
      const periodEnd = toIso(subscription.current_period_end);
      const trialStart = toIso(subscription.trial_start);
      const trialEnd = toIso(subscription.trial_end);

      const nextStatus = mapPublicSubscriptionStatus(subscriptionStatus);
      const syncedCatalog = await syncPublicCatalogFromSubscription(serviceClient, orgId, subscription);

      await serviceClient
        .from('organizations')
        .update({
          ...(syncedCatalog.plan?.plan_key ? {
            plan: syncedCatalog.plan.plan_key,
            plan_limits: syncedCatalog.plan.limits ?? {},
            stripe_price_id: syncedCatalog.plan.stripe_price_id,
          } : {}),
          subscription_status: nextStatus,
          current_period_end: periodEnd,
          trial_started_at: nextStatus === 'trialing' ? trialStart : null,
          trial_ends_at: nextStatus === 'trialing' ? trialEnd : null,
          grace_ends_at:
            nextStatus === 'past_due' || nextStatus === 'unpaid'
              ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      await appendBillingTimeline(serviceClient, orgId, 'subscription_updated', {
        stripe_subscription_id: subscription.id,
        stripe_status: subscriptionStatus,
        mapped_status: nextStatus,
        plan_key: syncedCatalog.plan?.plan_key ?? null,
        stripe_price_id: syncedCatalog.plan?.stripe_price_id ?? null,
      }, 'stripe_webhook');
    }

    if (event.type === 'invoice.payment_failed') {
      await serviceClient
        .from('organizations')
        .update({
          subscription_status: 'past_due',
          grace_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      await serviceClient.from('billing_alerts').insert({
        org_id: orgId,
        severity: 'high',
        code: 'invoice_payment_failed',
        title: 'Falha no pagamento da assinatura',
        detail: 'Stripe reportou falha em tentativa de cobrança.',
        payload: { stripe_event_id: event.id },
      });

      await appendBillingTimeline(serviceClient, orgId, 'invoice_payment_failed', {
        stripe_event_id: event.id,
      }, 'stripe_webhook');
    }

    if (event.type === 'invoice.payment_succeeded') {
      // ── Reactivation guard: if org was suspended, reactivate on payment ──
      const { data: currentOrg } = await serviceClient
        .from('organizations')
        .select('status')
        .eq('id', orgId)
        .single();

      const wasSuspended = currentOrg?.status === 'suspended';

      await serviceClient
        .from('organizations')
        .update({
          subscription_status: 'active',
          grace_ends_at: null,
          updated_at: new Date().toISOString(),
          ...(wasSuspended ? {
            status: 'active',
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
          } : {}),
        })
        .eq('id', orgId);

      await serviceClient
        .from('billing_alerts')
        .update({ resolved_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .is('resolved_at', null);

      if (wasSuspended) {
        // Restore campaigns that were auto-paused by suspension
        await serviceClient
          .from('broadcast_campaigns')
          .update({ status: 'paused' })
          .eq('org_id', orgId)
          .eq('status', 'paused_suspended');

        console.log(`[stripe-webhook] Org ${orgId} reactivated after payment`);

        await serviceClient
          .from('_admin_suspension_log')
          .insert({
            org_id: orgId,
            blocked_action: 'org_reactivated_by_payment',
            details: { stripe_event_id: event.id },
          })
          .catch(() => {});
      }
      // ── End reactivation guard ──

      await appendBillingTimeline(serviceClient, orgId, 'invoice_payment_succeeded', {
        stripe_event_id: event.id,
      }, 'stripe_webhook');
    }

    return json(corsHeaders, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error';
    return json(corsHeaders, 500, { ok: false, error: message });
  }
});
