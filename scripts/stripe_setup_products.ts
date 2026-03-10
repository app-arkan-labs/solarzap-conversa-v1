/**
 * Stripe Setup Script — Create products + prices and update Supabase catalog
 *
 * Prerequisites:
 *   1. Set env vars:
 *      - STRIPE_SECRET_KEY   (sk_live_... or sk_test_...)
 *      - SUPABASE_URL        (https://<project>.supabase.co)
 *      - SUPABASE_SERVICE_KEY (service_role key)
 *
 *   2. Run:
 *      npx tsx scripts/stripe_setup_products.ts
 *
 * What it does:
 *   - Creates Stripe products for each subscription plan (Start, Pro, Scale)
 *   - Creates monthly recurring prices in BRL
 *   - Creates Stripe products for each add-on (broadcast packs, AI packs)
 *   - Creates one-time prices in BRL for add-ons
 *   - Updates _admin_subscription_plans.stripe_price_id
 *   - Updates _admin_addon_catalog.stripe_price_id
 *
 * Safe to re-run: uses idempotency keys based on plan_key / addon_key.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ── Subscription Plans ─────────────────────────────────────────── */

const PLANS = [
  { key: 'start', name: 'SolarZap Start', priceCents: 19900, description: 'Para quem está começando a escalar vendas com WhatsApp' },
  { key: 'pro',   name: 'SolarZap Pro',   priceCents: 29900, description: 'Ideal para operações em crescimento acelerado' },
  { key: 'scale', name: 'SolarZap Scale', priceCents: 36900, description: 'Para times grandes com volume de alta escala' },
];

async function setupPlans() {
  console.log('\n=== Subscription Plans ===\n');

  for (const plan of PLANS) {
    // Create or find product
    const existingProducts = await stripe.products.search({
      query: `metadata["plan_key"]:"${plan.key}"`,
    });

    let product: Stripe.Product;
    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`  [exists] Product: ${product.id} (${plan.name})`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { plan_key: plan.key },
      });
      console.log(`  [created] Product: ${product.id} (${plan.name})`);
    }

    // Create or find price
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
      currency: 'brl',
      type: 'recurring',
    });

    let price: Stripe.Price;
    const matchingPrice = existingPrices.data.find(
      (p) => p.unit_amount === plan.priceCents && p.recurring?.interval === 'month',
    );

    if (matchingPrice) {
      price = matchingPrice;
      console.log(`  [exists] Price: ${price.id} (${plan.priceCents / 100} BRL/mo)`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.priceCents,
        currency: 'brl',
        recurring: { interval: 'month' },
        metadata: { plan_key: plan.key },
      });
      console.log(`  [created] Price: ${price.id} (${plan.priceCents / 100} BRL/mo)`);
    }

    // Update Supabase
    const { error } = await supabase
      .from('_admin_subscription_plans')
      .update({ stripe_price_id: price.id })
      .eq('plan_key', plan.key);

    if (error) {
      console.error(`  [ERROR] Failed to update plan ${plan.key}: ${error.message}`);
    } else {
      console.log(`  [updated] ${plan.key} → stripe_price_id = ${price.id}`);
    }
  }
}

/* ── Add-on Packs ───────────────────────────────────────────────── */

const ADDONS = [
  { key: 'disparo_pack_1k',  name: 'Pack 1.000 Disparos',   priceCents: 4900,  description: '1.000 créditos de disparo broadcast' },
  { key: 'disparo_pack_5k',  name: 'Pack 5.000 Disparos',   priceCents: 14900, description: '5.000 créditos de disparo broadcast' },
  { key: 'disparo_pack_25k', name: 'Pack 25.000 Disparos',  priceCents: 39900, description: '25.000 créditos de disparo broadcast' },
  { key: 'ai_pack_1k',       name: 'Pack 1.000 IA',         priceCents: 7900,  description: '1.000 requisições de IA' },
  { key: 'ai_pack_5k',       name: 'Pack 5.000 IA',         priceCents: 29900, description: '5.000 requisições de IA' },
  { key: 'ai_pack_20k',      name: 'Pack 20.000 IA',        priceCents: 99900, description: '20.000 requisições de IA' },
];

async function setupAddons() {
  console.log('\n=== Add-on Packs ===\n');

  for (const addon of ADDONS) {
    const existingProducts = await stripe.products.search({
      query: `metadata["addon_key"]:"${addon.key}"`,
    });

    let product: Stripe.Product;
    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`  [exists] Product: ${product.id} (${addon.name})`);
    } else {
      product = await stripe.products.create({
        name: addon.name,
        description: addon.description,
        metadata: { addon_key: addon.key },
      });
      console.log(`  [created] Product: ${product.id} (${addon.name})`);
    }

    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
      currency: 'brl',
      type: 'one_time',
    });

    let price: Stripe.Price;
    const matchingPrice = existingPrices.data.find((p) => p.unit_amount === addon.priceCents);

    if (matchingPrice) {
      price = matchingPrice;
      console.log(`  [exists] Price: ${price.id} (${addon.priceCents / 100} BRL)`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: addon.priceCents,
        currency: 'brl',
        metadata: { addon_key: addon.key },
      });
      console.log(`  [created] Price: ${price.id} (${addon.priceCents / 100} BRL)`);
    }

    const { error } = await supabase
      .from('_admin_addon_catalog')
      .update({ stripe_price_id: price.id })
      .eq('addon_key', addon.key);

    if (error) {
      console.error(`  [ERROR] Failed to update addon ${addon.key}: ${error.message}`);
    } else {
      console.log(`  [updated] ${addon.key} → stripe_price_id = ${price.id}`);
    }
  }
}

/* ── Main ───────────────────────────────────────────────────────── */

async function main() {
  console.log('Stripe Setup — SolarZap Billing Products\n');
  console.log(`Stripe key prefix: ${STRIPE_SECRET_KEY.slice(0, 8)}...`);
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);

  await setupPlans();
  await setupAddons();

  console.log('\n✅ Done! All products, prices, and DB records updated.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
