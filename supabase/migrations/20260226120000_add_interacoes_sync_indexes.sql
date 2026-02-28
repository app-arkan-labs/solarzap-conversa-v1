CREATE INDEX IF NOT EXISTS idx_interacoes_org_id_id_desc
ON public.interacoes (org_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_interacoes_org_id_created_at_desc
ON public.interacoes (org_id, created_at DESC);
