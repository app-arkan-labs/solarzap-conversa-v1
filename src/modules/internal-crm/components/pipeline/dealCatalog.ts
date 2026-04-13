import type {
  InternalCrmDealItem,
  InternalCrmDealSummary,
  InternalCrmProduct,
} from '@/modules/internal-crm/types';

export const INTERNAL_CRM_CUSTOM_PRODUCT_CODES = {
  oneTime: 'custom_deal_one_time',
  recurring: 'custom_deal_recurring',
} as const;

type QuickBillingType = 'one_time' | 'recurring';
type QuickPaymentMethod = 'stripe' | 'manual' | 'hybrid';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function humanizeInternalCrmToken(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function isInternalCrmTechnicalProductCode(value: string | null | undefined): boolean {
  return (
    value === INTERNAL_CRM_CUSTOM_PRODUCT_CODES.oneTime ||
    value === INTERNAL_CRM_CUSTOM_PRODUCT_CODES.recurring
  );
}

export function isInternalCrmHiddenProduct(product: InternalCrmProduct | null | undefined): boolean {
  if (!product) return false;
  const metadata = asRecord(product.metadata);
  return Boolean(metadata.hidden_from_ui) || isInternalCrmTechnicalProductCode(product.product_code);
}

export function getVisibleInternalCrmProducts(products: InternalCrmProduct[]): InternalCrmProduct[] {
  return products.filter((product) => product.is_active && !isInternalCrmHiddenProduct(product));
}

function getProductLabelMap(products: InternalCrmProduct[]) {
  return new Map(products.map((product) => [product.product_code, product.name]));
}

export function getDealPrimaryValueCents(deal: Pick<InternalCrmDealSummary, 'one_time_total_cents' | 'mrr_cents'>): number {
  if (Number(deal.one_time_total_cents || 0) > 0) return Number(deal.one_time_total_cents || 0);
  return Number(deal.mrr_cents || 0);
}

export function getDealPrimaryBillingType(
  deal: Pick<InternalCrmDealSummary, 'one_time_total_cents' | 'mrr_cents'>,
): QuickBillingType {
  if (Number(deal.mrr_cents || 0) > 0 && Number(deal.one_time_total_cents || 0) === 0) {
    return 'recurring';
  }
  return 'one_time';
}

export function centsToReaisInput(valueCents: number | null | undefined): string {
  const cents = Math.max(0, Number(valueCents || 0));
  if (!cents) return '';
  return (cents / 100).toFixed(2);
}

export function reaisInputToCents(value: string): number {
  const compact = value.replace(/\s+/g, '');
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

export function buildSimpleDealItem(input: {
  valueCents: number;
  billingType: QuickBillingType;
  paymentMethod?: QuickPaymentMethod;
  quantity?: number;
}): InternalCrmDealItem {
  const quantity = Math.max(1, Number(input.quantity || 1));
  const valueCents = Math.max(0, Number(input.valueCents || 0));
  return {
    id: `quick-${input.billingType}`,
    deal_id: '',
    product_code:
      input.billingType === 'recurring'
        ? INTERNAL_CRM_CUSTOM_PRODUCT_CODES.recurring
        : INTERNAL_CRM_CUSTOM_PRODUCT_CODES.oneTime,
    billing_type: input.billingType,
    payment_method: input.paymentMethod || 'manual',
    stripe_price_id: null,
    unit_price_cents: valueCents,
    quantity,
    total_price_cents: valueCents * quantity,
    metadata: {
      hidden_from_ui: true,
      pricing_mode: 'quick',
    },
  };
}

function getVisibleItemCodes(
  items: Array<Pick<InternalCrmDealItem, 'product_code'>> | undefined,
  products: InternalCrmProduct[],
): string[] {
  const productsByCode = new Map(products.map((product) => [product.product_code, product]));
  return (items || [])
    .map((item) => String(item.product_code || '').trim())
    .filter(Boolean)
    .filter((productCode) => {
      const product = productsByCode.get(productCode);
      return !isInternalCrmTechnicalProductCode(productCode) && !isInternalCrmHiddenProduct(product);
    });
}

export function getDealReferenceCode(
  deal: Pick<InternalCrmDealSummary, 'closed_product_code' | 'primary_offer_code' | 'items'>,
  products: InternalCrmProduct[],
): string | null {
  const visibleItemCodes = getVisibleItemCodes(deal.items, products);
  if (visibleItemCodes.length > 0) return visibleItemCodes[0];

  const closedProductCode = String(deal.closed_product_code || '').trim();
  if (closedProductCode) return closedProductCode;

  const primaryOfferCode = String(deal.primary_offer_code || '').trim();
  if (primaryOfferCode) return primaryOfferCode;

  return null;
}

export function getDealSummaryLabel(
  deal: Pick<InternalCrmDealSummary, 'closed_product_code' | 'primary_offer_code' | 'items'>,
  products: InternalCrmProduct[],
): string {
  const visibleItemCodes = getVisibleItemCodes(deal.items, products);
  const productLabels = getProductLabelMap(products);
  const codes = visibleItemCodes.length > 0
    ? visibleItemCodes
    : [String(deal.closed_product_code || '').trim(), String(deal.primary_offer_code || '').trim()].filter(Boolean);

  if (codes.length === 0) return 'Valor livre';

  return Array.from(new Set(codes))
    .map((code) => productLabels.get(code) || humanizeInternalCrmToken(code) || code)
    .join(' + ');
}
