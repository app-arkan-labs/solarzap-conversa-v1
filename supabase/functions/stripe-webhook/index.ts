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

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
    return new Response('ok', { headers: corsHeaders });
  }
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
    const orgId = await resolveOrgIdFromEvent(serviceClient, event);

    if (!orgId) {
      return json(corsHeaders, 200, { ok: true, ignored: true, reason: 'org_not_resolved' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const mode = session.mode;
      const metadata = session.metadata || {};

      if (mode === 'subscription') {
        const planKey = String(metadata.plan_key || 'free');
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        const customerId = typeof session.customer === 'string' ? session.customer : null;

        let periodEnd: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = toIso(sub.current_period_end);
        }

        await serviceClient
          .from('organizations')
          .update({
            plan: planKey,
            subscription_status: 'active',
            onboarding_state: 'active',
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            current_period_end: periodEnd,
            grace_ends_at: null,
            trial_ends_at: null,
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
          plan_key: planKey,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
        }, 'stripe_webhook');
      }

      if (mode === 'payment') {
        const addonKey = String(metadata.addon_key || '');
        const quantity = Math.max(1, Number(metadata.quantity || 1));
        const grantValue = Math.max(0, Number(metadata.grant_value || 0));
        const credits = quantity * grantValue;

        if (addonKey && credits > 0) {
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 12);

          await serviceClient.from('credit_balances').insert({
            org_id: orgId,
            addon_key: addonKey,
            source: 'purchase',
            purchased_credits: credits,
            remaining_credits: credits,
            expires_at: expiresAt.toISOString(),
            metadata: {
              stripe_checkout_session_id: session.id,
              quantity,
            },
          });

          await appendBillingTimeline(serviceClient, orgId, 'pack_purchase_completed', {
            addon_key: addonKey,
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

      let nextStatus = 'active';
      if (subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid') nextStatus = 'past_due';
      if (subscriptionStatus === 'canceled' || subscriptionStatus === 'incomplete_expired') nextStatus = 'canceled';

      await serviceClient
        .from('organizations')
        .update({
          subscription_status: nextStatus,
          current_period_end: periodEnd,
          grace_ends_at:
            nextStatus === 'past_due'
              ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      await appendBillingTimeline(serviceClient, orgId, 'subscription_updated', {
        stripe_subscription_id: subscription.id,
        stripe_status: subscriptionStatus,
        mapped_status: nextStatus,
      }, 'stripe_webhook');
    }

    if (event.type === 'invoice.payment_failed') {
      await serviceClient
        .from('organizations')
        .update({
          subscription_status: 'past_due',
          grace_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
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
      await serviceClient
        .from('organizations')
        .update({
          subscription_status: 'active',
          grace_ends_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

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
