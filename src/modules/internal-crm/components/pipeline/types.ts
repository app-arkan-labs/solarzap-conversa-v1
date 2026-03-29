export type DealItemDraft = {
  product_code: string;
  billing_type: 'one_time' | 'recurring';
  payment_method: 'stripe' | 'manual' | 'hybrid';
  unit_price_cents: number;
  quantity: number;
};

export type DealDraft = {
  client_id: string;
  title: string;
  stage_code: string;
  probability: number;
  notes: string;
  items: DealItemDraft[];
};

export const EMPTY_DEAL_ITEM: DealItemDraft = {
  product_code: '',
  billing_type: 'one_time',
  payment_method: 'manual',
  unit_price_cents: 0,
  quantity: 1,
};

export const EMPTY_DEAL_DRAFT: DealDraft = {
  client_id: '',
  title: '',
  stage_code: 'lead_entrante',
  probability: 10,
  notes: '',
  items: [EMPTY_DEAL_ITEM],
};
