import { resolveRequestCors } from '../_shared/cors.ts';
import {
  appendBillingTimeline,
  getAuthenticatedUser,
  getServiceClient,
  resolveOrgMembership,
} from '../_shared/billing.ts';
import { getStripeClient, resolveAppUrl } from '../_shared/stripe.ts';

type Payload = {
  org_id?: string;
  addon_key?: string;
  quantity?: number;
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
    if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
    return new Response('ok', { headers: corsHeaders });
  }
  if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });

  try {
    const payload = (await req.json().catch(() => ({}))) as Payload;
    const user = await getAuthenticatedUser(req);
    const serviceClient = getServiceClient();
    const stripe = getStripeClient();
    const membership = await resolveOrgMembership(serviceClient, user.id, payload.org_id ?? null);

    const addonKey = String(payload.addon_key || '').trim();
    if (!addonKey) return json(corsHeaders, 400, { ok: false, error: 'missing_addon_key' });
    const quantity = Math.max(1, Math.min(100, Number(payload.quantity || 1)));

    const { data: addon } = await serviceClient
      .from('_admin_addon_catalog')
      .select('addon_key, display_name, unit_price_cents, grant_value, is_active')
      .eq('addon_key', addonKey)
      .eq('is_active', true)
      .maybeSingle();

    if (!addon) return json(corsHeaders, 404, { ok: false, error: 'addon_not_found' });

    const { data: customerRow } = await serviceClient
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('org_id', membership.orgId)
      .maybeSingle();

    let stripeCustomerId = customerRow?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const createdCustomer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { org_id: membership.orgId },
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
    const successUrl = payload.success_url || `${appUrl}/pricing?pack=success`;
    const cancelUrl = payload.cancel_url || `${appUrl}/pricing?pack=cancel`;

    const grantValue = Number(addon.grant_value || 0);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Number(addon.unit_price_cents || 0),
            product_data: {
              name: String(addon.display_name || addon.addon_key),
              metadata: {
                addon_key: String(addon.addon_key),
              },
            },
          },
          quantity,
        },
      ],
      metadata: {
        org_id: membership.orgId,
        addon_key: String(addon.addon_key),
        user_id: user.id,
        grant_value: String(grantValue),
        quantity: String(quantity),
      },
    });

    await appendBillingTimeline(serviceClient, membership.orgId, 'pack_checkout_session_created', {
      addon_key: addon.addon_key,
      quantity,
      stripe_checkout_session_id: session.id,
    }, 'user');

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
