ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS assigned_to_user_ids text[];

ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid;
