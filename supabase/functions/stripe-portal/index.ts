import { resolveRequestCors } from '../_shared/cors.ts';
import { getAuthenticatedUser, getServiceClient, resolveOrgMembership } from '../_shared/billing.ts';
import { getStripeClient, resolveAppUrl } from '../_shared/stripe.ts';

type Payload = {
  org_id?: string;
  return_url?: string;
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
    if (cors.missingAllowedOriginConfig) return json(corsHeaders, 500, { ok: false, error: 'missing_allowed_origin' });
    if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });
    return new Response('ok', { headers: corsHeaders });
  }
  if (cors.missingAllowedOriginConfig) return json(corsHeaders, 500, { ok: false, error: 'missing_allowed_origin' });
  if (!cors.originAllowed) return json(corsHeaders, 403, { ok: false, error: 'origin_not_allowed' });

  try {
    const payload = (await req.json().catch(() => ({}))) as Payload;
    const user = await getAuthenticatedUser(req);
    const serviceClient = getServiceClient();
    const stripe = getStripeClient();

    const membership = await resolveOrgMembership(serviceClient, user.id, payload.org_id ?? null);
    const { data: stripeCustomer } = await serviceClient
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('org_id', membership.orgId)
      .maybeSingle();

    if (!stripeCustomer?.stripe_customer_id) {
      return json(corsHeaders, 404, { ok: false, error: 'stripe_customer_not_found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomer.stripe_customer_id,
      return_url: payload.return_url || `${resolveAppUrl()}/pricing`,
    });

    return json(corsHeaders, 200, {
      ok: true,
      portal_url: session.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error';
    return json(corsHeaders, 500, { ok: false, error: message });
  }
});
