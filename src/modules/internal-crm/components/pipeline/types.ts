export type DealItemDraft = {
  product_code: string;
  billing_type: 'one_time' | 'recurring';
  payment_method: 'stripe' | 'manual' | 'hybrid';
  unit_price_cents: number;
  quantity: number;
};

export type DealDraft = {
  id?: string;
  client_id: string;
  title: string;
  stage_code: string;
  probability: number;
  notes: string;
  items: DealItemDraft[];
  primary_offer_code: string;
  closed_product_code: string;
  mentorship_variant: string;
  next_offer_code: string;
  next_offer_at: string;
  software_status: string;
  landing_page_status: string;
  traffic_status: string;
  trial_status: string;
  mentorship_sessions_completed: string;
  last_declined_offer_code: string;
  trial_ends_at: string;
  scheduling_link: string;
  meeting_link: string;
};

export const EMPTY_DEAL_ITEM: DealItemDraft = {
  product_code: '',
  billing_type: 'one_time',
  payment_method: 'manual',
  unit_price_cents: 0,
  quantity: 1,
};

export const EMPTY_DEAL_DRAFT: DealDraft = {
  id: undefined,
  client_id: '',
  title: '',
  stage_code: 'novo_lead',
  probability: 5,
  notes: '',
  items: [EMPTY_DEAL_ITEM],
  primary_offer_code: '',
  closed_product_code: '',
  mentorship_variant: '',
  next_offer_code: '',
  next_offer_at: '',
  software_status: 'not_offered',
  landing_page_status: 'not_offered',
  traffic_status: 'not_offered',
  trial_status: 'not_offered',
  mentorship_sessions_completed: '0',
  last_declined_offer_code: '',
  trial_ends_at: '',
  scheduling_link: '',
  meeting_link: '',
};
