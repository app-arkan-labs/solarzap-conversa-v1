import { resolveRequestCors } from '../_shared/cors.ts';
import {
  appendBillingTimeline,
  getAuthenticatedUser,
  getServiceClient,
  resolveOrgMembership,
} from '../_shared/billing.ts';
import { getStripeClient, resolveAppUrl } from '../_shared/stripe.ts';

type CheckoutPayload = {
  org_id?: string;
  plan_key?: string;
  success_url?: string;
  cancel_url?: string;
};

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
    if (!cors.originAllowed) {
      return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (!cors.originAllowed) {
    return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as CheckoutPayload;
    const user = await getAuthenticatedUser(req);
    const serviceClient = getServiceClient();
    const stripe = getStripeClient();

    const membership = await resolveOrgMembership(serviceClient, user.id, payload.org_id ?? null);
    const planKey = String(payload.plan_key || '').trim();
    if (!planKey) {
      return json(corsHeaders, 400, { ok: false, error: 'missing_plan_key' });
    }

    const { data: plan, error: planError } = await serviceClient
      .from('_admin_subscription_plans')
      .select('plan_key, display_name, price_cents, billing_cycle, is_active')
      .eq('plan_key', planKey)
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !plan) {
      return json(corsHeaders, 404, { ok: false, error: 'plan_not_found' });
    }

    if (Number(plan.price_cents || 0) <= 0) {
      return json(corsHeaders, 400, { ok: false, error: 'plan_not_billable' });
    }

    const { data: org } = await serviceClient
      .from('organizations')
      .select('id, name, stripe_subscription_id, stripe_checkout_session_id')
      .eq('id', membership.orgId)
      .single();

    const { data: stripeCustomerRow } = await serviceClient
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('org_id', membership.orgId)
      .maybeSingle();

    let stripeCustomerId = stripeCustomerRow?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const createdCustomer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { org_id: membership.orgId },
        name: org?.name || undefined,
      });
      stripeCustomerId = createdCustomer.id;

      await serviceClient.from('stripe_customers').upsert({
        org_id: membership.orgId,
        stripe_customer_id: stripeCustomerId,
        email: user.email ?? null,
        updated_at: new Date().toISOString(),
      });
    }

    const appUrl = resolveAppUrl();
    const successUrl = payload.success_url || `${appUrl}/pricing?checkout=success`;
    const cancelUrl = payload.cancel_url || `${appUrl}/pricing?checkout=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: 'brl',
            recurring: { interval: plan.billing_cycle === 'yearly' ? 'year' : 'month' },
            product_data: {
              name: String(plan.display_name || plan.plan_key),
              metadata: {
                org_id: membership.orgId,
                plan_key: String(plan.plan_key),
              },
            },
            unit_amount: Number(plan.price_cents || 0),
          },
          quantity: 1,
        },
      ],
      metadata: {
        org_id: membership.orgId,
        plan_key: String(plan.plan_key),
        user_id: user.id,
      },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          org_id: membership.orgId,
          plan_key: String(plan.plan_key),
        },
      },
    });

    await serviceClient
      .from('organizations')
      .update({
        stripe_checkout_session_id: session.id,
        onboarding_state: 'pending_checkout',
      })
      .eq('id', membership.orgId);

    await appendBillingTimeline(
      serviceClient,
      membership.orgId,
      'checkout_session_created',
      {
        plan_key: plan.plan_key,
        stripe_checkout_session_id: session.id,
      },
      'user',
    );

    return json(corsHeaders, 200, {
      ok: true,
      checkout_url: session.url,
      checkout_session_id: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error';
    return json(corsHeaders, 500, { ok: false, error: message });
  }
});
