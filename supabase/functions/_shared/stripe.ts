import Stripe from 'npm:stripe';

let cachedStripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedStripe) return cachedStripe;

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
  if (!stripeSecretKey) {
    throw new Error('missing_stripe_secret_key');
  }

  cachedStripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
  });

  return cachedStripe;
}

export function getStripeWebhookSecret(): string {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
  if (!secret) {
    throw new Error('missing_stripe_webhook_secret');
  }
  return secret;
}

export function resolveAppUrl(): string {
  const url =
    Deno.env.get('APP_URL') ||
    Deno.env.get('PUBLIC_APP_URL') ||
    Deno.env.get('SITE_URL') ||
    'https://app.solarzap.com.br';

  return url.replace(/\/+$/, '');
}
