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
  primary_offer_code: string;
  closed_product_code: string;
  mentorship_variant: string;
  software_status: string;
  landing_page_status: string;
  traffic_status: string;
  trial_status: string;
  next_offer_code: string;
  next_offer_at: string;
  mentorship_sessions_completed: string;
  last_declined_offer_code: string;
  trial_ends_at: string;
  scheduling_link: string;
  meeting_link: string;
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
  id: undefined,
  client_id: '',
  title: '',
  stage_code: 'novo_lead',
  probability: 5,
  primary_offer_code: '',
  closed_product_code: '',
  mentorship_variant: '',
  software_status: 'not_offered',
  landing_page_status: 'not_offered',
  traffic_status: 'not_offered',
  trial_status: 'not_offered',
  next_offer_code: '',
  next_offer_at: '',
  mentorship_sessions_completed: '',
  last_declined_offer_code: '',
  trial_ends_at: '',
  scheduling_link: '',
  meeting_link: '',
  notes: '',
  items: [EMPTY_DEAL_ITEM],
};
