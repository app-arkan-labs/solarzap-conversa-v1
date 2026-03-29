import Stripe from 'npm:stripe';
import { resolveRequestCors } from '../_shared/cors.ts';
import {
  appendBillingTimeline,
  getAuthenticatedUser,
  getServiceClient,
} from '../_shared/billing.ts';
import { getStripeClient, resolveAppUrl } from '../_shared/stripe.ts';

type CheckoutPayload = {
  org_id?: string;
  org_name?: string;
  plan_key?: string;
  trial_days?: number;
  success_url?: string;
  cancel_url?: string;
};

function normalizeTrialDays(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 7;

  const rounded = Math.round(parsed);
  if (rounded === 0 || rounded === 7 || rounded === 30) {
    return rounded;
  }

  return 7;
}

function buildBillingReturnUrl(appUrl: string, checkoutState: string, targetPlan?: string | null) {
  const url = new URL('/billing', appUrl);
  url.searchParams.set('checkout', checkoutState);
  if (targetPlan) {
    url.searchParams.set('target', targetPlan);
  }
  return url.toString();
}

function json(corsHeaders: Record<string, string>, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return json(corsHeaders, 500, { ok: false, error: 'missing_allowed_origin' });
    }
    if (!cors.originAllowed) {
      return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return json(corsHeaders, 500, { ok: false, error: 'missing_allowed_origin' });
  }

  if (!cors.originAllowed) {
    return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as CheckoutPayload;
    const user = await getAuthenticatedUser(req);
    const serviceClient = getServiceClient();
    const stripe = getStripeClient();

    const planKey = String(payload.plan_key || '').trim();
    if (!planKey) {
      return json(corsHeaders, 400, { ok: false, error: 'missing_plan_key' });
    }
    const trialDays = normalizeTrialDays(payload.trial_days);

    const { data: plan, error: planError } = await serviceClient
      .from('_admin_subscription_plans')
      .select('plan_key, display_name, price_cents, billing_cycle, stripe_price_id, is_active')
      .eq('plan_key', planKey)
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !plan) {
      return json(corsHeaders, 404, { ok: false, error: 'plan_not_found' });
    }

    if (Number(plan.price_cents || 0) <= 0) {
      return json(corsHeaders, 400, { ok: false, error: 'plan_not_billable' });
    }

    const stripePriceId = String(plan.stripe_price_id || '').trim();

    let orgId = typeof payload.org_id === 'string' ? payload.org_id.trim() : '';
    let userRole = 'owner';

    // ── Suspension guard: block new checkouts for suspended orgs ──
    if (orgId) {
      const { data: orgGuard } = await serviceClient
        .from('organizations')
        .select('status')
        .eq('id', orgId)
        .single();
      if (orgGuard?.status === 'suspended') {
        return json(corsHeaders, 403, { ok: false, error: 'org_suspended', message: 'Conta suspensa — checkout bloqueado' });
      }
    }
    // ── End suspension guard ──

    if (orgId) {
      const { data: membership } = await serviceClient
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!membership?.org_id) {
        return json(corsHeaders, 403, { ok: false, error: 'membership_not_found' });
      }

      userRole = String(membership.role || 'owner');
    } else {
      const providedName = String(payload.org_name || '').trim();
      const fallbackName = user.email ? `Organizacao ${user.email}` : `Organizacao ${user.id.slice(0, 8)}`;
      const orgName = providedName || fallbackName;

      const { data: createdOrg, error: createOrgError } = await serviceClient
        .from('organizations')
        .insert({
          name: orgName,
          owner_id: user.id,
          // NÃO seta plan aqui — plan só é confirmado pelo webhook após checkout concluído
          subscription_status: 'pending_checkout',
          onboarding_state: 'pending_checkout',
        })
        .select('id')
        .single();

      if (createOrgError || !createdOrg?.id) {
        return json(corsHeaders, 500, { ok: false, error: createOrgError?.message || 'org_create_failed' });
      }

      orgId = String(createdOrg.id);

      const { error: membershipError } = await serviceClient
        .from('organization_members')
        .upsert(
          {
            org_id: orgId,
            user_id: user.id,
            role: 'owner',
            can_view_team_leads: true,
          },
          { onConflict: 'org_id,user_id' },
        );

      if (membershipError) {
        return json(corsHeaders, 500, { ok: false, error: `membership_create_failed:${membershipError.message}` });
      }
    }

    const { data: org } = await serviceClient
      .from('organizations')
      .select('id, name, plan, subscription_status, stripe_subscription_id, stripe_checkout_session_id, stripe_price_id')
      .eq('id', orgId)
      .single();

    const { data: stripeCustomerRow } = await serviceClient
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .maybeSingle();

    let stripeCustomerId = stripeCustomerRow?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const createdCustomer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { org_id: orgId },
        name: org?.name || undefined,
      });
      stripeCustomerId = createdCustomer.id;

      await serviceClient.from('stripe_customers').upsert({
        org_id: orgId,
        stripe_customer_id: stripeCustomerId,
        email: user.email ?? null,
        updated_at: new Date().toISOString(),
      });
    }

    const appUrl = resolveAppUrl();
    const successUrl = payload.success_url || `${appUrl}/welcome?checkout=success`;
    const cancelUrl = payload.cancel_url || `${appUrl}/billing?checkout=cancel`;
    const currentStatus = String(org?.subscription_status || '').trim().toLowerCase();
    const currentPlanKey = String(org?.plan || '').trim().toLowerCase();
    const currentStripePriceId = String(org?.stripe_price_id || '').trim();

    if (org?.stripe_subscription_id && stripePriceId && (currentStatus === 'active' || currentStatus === 'trialing')) {
      const noOpUrl = buildBillingReturnUrl(appUrl, 'plan_updated', String(plan.plan_key));
      if (currentPlanKey === String(plan.plan_key) && currentStripePriceId === stripePriceId) {
        return json(corsHeaders, 200, {
          ok: true,
          org_id: orgId,
          trial_days: 0,
          checkout_url: noOpUrl,
          checkout_session_id: null,
        });
      }

      try {
        const subscription = await stripe.subscriptions.retrieve(String(org.stripe_subscription_id));
        const subscriptionItem = subscription.items.data.find((item) => {
          const itemPriceId = typeof item.price === 'string' ? item.price : item.price?.id;
          return itemPriceId === currentStripePriceId;
        }) || subscription.items.data[0];

        if (subscriptionItem?.id) {
          const updatedSubscription = await stripe.subscriptions.update(String(org.stripe_subscription_id), {
            items: [
              {
                id: subscriptionItem.id,
                price: stripePriceId,
                quantity: subscriptionItem.quantity ?? 1,
              },
            ],
            proration_behavior: 'always_invoice',
            payment_behavior: 'pending_if_incomplete',
            metadata: {
              ...(subscription.metadata || {}),
              org_id: orgId,
              plan_key: String(plan.plan_key),
            },
            expand: ['latest_invoice'],
          });

          await appendBillingTimeline(
            serviceClient,
            orgId,
            'subscription_plan_change_requested',
            {
              from_plan_key: currentPlanKey || null,
              to_plan_key: plan.plan_key,
              stripe_subscription_id: updatedSubscription.id,
            },
            'user',
          );

          const latestInvoice = updatedSubscription.latest_invoice && typeof updatedSubscription.latest_invoice !== 'string'
            ? updatedSubscription.latest_invoice as Stripe.Invoice
            : null;
          const hostedInvoiceUrl = String(latestInvoice?.hosted_invoice_url || '').trim();

          return json(corsHeaders, 200, {
            ok: true,
            org_id: orgId,
            trial_days: 0,
            checkout_url: hostedInvoiceUrl || noOpUrl,
            checkout_session_id: null,
          });
        }
      } catch (subscriptionUpdateError) {
        console.warn('subscription_plan_change_fallback_to_checkout', {
          org_id: orgId,
          error: subscriptionUpdateError instanceof Error ? subscriptionUpdateError.message : String(subscriptionUpdateError),
        });
      }
    }

    if (org?.stripe_subscription_id && (currentStatus === 'past_due' || currentStatus === 'unpaid')) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: buildBillingReturnUrl(appUrl, 'payment_recovery', String(plan.plan_key)),
      });

      return json(corsHeaders, 200, {
        ok: true,
        org_id: orgId,
        trial_days: 0,
        checkout_url: portalSession.url,
        checkout_session_id: null,
      });
    }

    const lineItems = stripePriceId
      ? [{ price: stripePriceId, quantity: 1 }]
      : [{
        price_data: {
          currency: 'brl',
          unit_amount: Number(plan.price_cents || 0),
          recurring: { interval: 'month' },
          product_data: {
            name: String(plan.display_name || plan.plan_key),
            metadata: { plan_key: String(plan.plan_key) },
          },
        },
        quantity: 1,
      }];

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: lineItems,
      metadata: {
        org_id: orgId,
        plan_key: String(plan.plan_key),
        user_id: user.id,
        role: userRole,
        trial_days: String(trialDays),
      },
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: {
          org_id: orgId,
          plan_key: String(plan.plan_key),
          trial_days: String(trialDays),
        },
      },
    });

    await serviceClient
      .from('organizations')
      .update({
        // NÃO seta plan aqui — plan só deve ser atualizado pelo webhook após checkout concluído
        subscription_status: 'pending_checkout',
        stripe_checkout_session_id: session.id,
        onboarding_state: 'pending_checkout',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    await appendBillingTimeline(
      serviceClient,
      orgId,
      'checkout_session_created',
      {
        plan_key: plan.plan_key,
        stripe_checkout_session_id: session.id,
        trial_days: trialDays,
      },
      'user',
    );

    return json(corsHeaders, 200, {
      ok: true,
      org_id: orgId,
      trial_days: trialDays,
      checkout_url: session.url,
      checkout_session_id: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error';
    return json(corsHeaders, 500, { ok: false, error: message });
  }
});
