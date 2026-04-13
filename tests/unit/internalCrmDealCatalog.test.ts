import { describe, expect, it } from 'vitest';
import {
  INTERNAL_CRM_CUSTOM_PRODUCT_CODES,
  buildSimpleDealItem,
  centsToReaisInput,
  getDealPrimaryBillingType,
  getDealPrimaryValueCents,
  getDealSummaryLabel,
  getVisibleInternalCrmProducts,
  isInternalCrmHiddenProduct,
  reaisInputToCents,
} from '@/modules/internal-crm/components/pipeline/dealCatalog';
import type { InternalCrmDealSummary, InternalCrmProduct } from '@/modules/internal-crm/types';

const products: InternalCrmProduct[] = [
  {
    product_code: 'solarzap_pro',
    name: 'SolarZap Pro',
    billing_type: 'recurring',
    payment_method: 'stripe',
    is_active: true,
    sort_order: 10,
    metadata: {},
    price_cents: 29900,
    currency: 'BRL',
    stripe_price_id: null,
  },
  {
    product_code: INTERNAL_CRM_CUSTOM_PRODUCT_CODES.oneTime,
    name: 'Deal personalizado pontual',
    billing_type: 'one_time',
    payment_method: 'manual',
    is_active: true,
    sort_order: 900,
    metadata: { hidden_from_ui: true },
    price_cents: 0,
    currency: 'BRL',
    stripe_price_id: null,
  },
];

describe('internal CRM deal catalog helpers', () => {
  it('filters hidden technical products from user-facing selects', () => {
    expect(isInternalCrmHiddenProduct(products[1])).toBe(true);
    expect(getVisibleInternalCrmProducts(products).map((product) => product.product_code)).toEqual(['solarzap_pro']);
  });

  it('builds a hidden technical item for quick pricing', () => {
    const item = buildSimpleDealItem({ valueCents: 149700, billingType: 'one_time' });
    expect(item.product_code).toBe(INTERNAL_CRM_CUSTOM_PRODUCT_CODES.oneTime);
    expect(item.total_price_cents).toBe(149700);
  });

  it('prefers explicit commercial references over hidden technical items in the UI summary', () => {
    const deal = {
      closed_product_code: 'solarzap_pro',
      primary_offer_code: null,
      items: [
        {
          id: '1',
          deal_id: 'deal-1',
          product_code: INTERNAL_CRM_CUSTOM_PRODUCT_CODES.oneTime,
          billing_type: 'one_time',
          payment_method: 'manual',
          stripe_price_id: null,
          unit_price_cents: 149700,
          quantity: 1,
          total_price_cents: 149700,
          metadata: {},
        },
      ],
    } as Pick<InternalCrmDealSummary, 'closed_product_code' | 'primary_offer_code' | 'items'>;

    expect(getDealSummaryLabel(deal, products)).toBe('SolarZap Pro');
  });

  it('keeps amount conversion consistent for quick editing', () => {
    expect(reaisInputToCents('1497.00')).toBe(149700);
    expect(centsToReaisInput(149700)).toBe('1497.00');
  });

  it('resolves the primary value and billing type from deal totals', () => {
    expect(
      getDealPrimaryValueCents({
        one_time_total_cents: 0,
        mrr_cents: 29900,
      } as Pick<InternalCrmDealSummary, 'one_time_total_cents' | 'mrr_cents'>),
    ).toBe(29900);
    expect(
      getDealPrimaryBillingType({
        one_time_total_cents: 0,
        mrr_cents: 29900,
      } as Pick<InternalCrmDealSummary, 'one_time_total_cents' | 'mrr_cents'>),
    ).toBe('recurring');
  });
});

