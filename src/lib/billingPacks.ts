export type BillingPackType = 'disparo' | 'ai';

export const BILLING_PACK_KEYS: Record<BillingPackType, string[]> = {
  disparo: ['disparo_pack_1k', 'disparo_pack_5k', 'disparo_pack_25k'],
  ai: ['ai_pack_1k', 'ai_pack_5k', 'ai_pack_20k'],
};
