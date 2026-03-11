CREATE TABLE IF NOT EXISTS public.motivos_perda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motivos_perda_org_key_unique UNIQUE (org_id, key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_motivos_perda_org_label_ci
  ON public.motivos_perda (org_id, lower(label));

CREATE INDEX IF NOT EXISTS idx_motivos_perda_org_position
  ON public.motivos_perda (org_id, position, created_at);

CREATE TABLE IF NOT EXISTS public.perdas_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  motivo_id uuid NOT NULL REFERENCES public.motivos_perda(id) ON DELETE RESTRICT,
  motivo_detalhe text,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perdas_leads_org_created_at
  ON public.perdas_leads (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_perdas_leads_org_lead_created_at
  ON public.perdas_leads (org_id, lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_motivos_perda_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_motivos_perda_updated_at ON public.motivos_perda;
CREATE TRIGGER tr_motivos_perda_updated_at
  BEFORE UPDATE ON public.motivos_perda
  FOR EACH ROW
  EXECUTE FUNCTION public.set_motivos_perda_updated_at();

ALTER TABLE public.motivos_perda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdas_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS motivos_perda_service_all ON public.motivos_perda;
CREATE POLICY motivos_perda_service_all ON public.motivos_perda
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS motivos_perda_auth_select ON public.motivos_perda;
CREATE POLICY motivos_perda_auth_select ON public.motivos_perda
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS motivos_perda_auth_insert ON public.motivos_perda;
CREATE POLICY motivos_perda_auth_insert ON public.motivos_perda
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS motivos_perda_auth_update ON public.motivos_perda;
CREATE POLICY motivos_perda_auth_update ON public.motivos_perda
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS perdas_leads_service_all ON public.perdas_leads;
CREATE POLICY perdas_leads_service_all ON public.perdas_leads
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS perdas_leads_auth_select ON public.perdas_leads;
CREATE POLICY perdas_leads_auth_select ON public.perdas_leads
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS perdas_leads_auth_insert ON public.perdas_leads;
CREATE POLICY perdas_leads_auth_insert ON public.perdas_leads
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS perdas_leads_auth_update ON public.perdas_leads;
CREATE POLICY perdas_leads_auth_update ON public.perdas_leads
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

INSERT INTO public.motivos_perda (org_id, key, label, is_default, position)
SELECT
  o.id,
  seed.key,
  seed.label,
  true,
  seed.position
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('sem_resposta', 'Nao respondeu', 1),
    ('sem_interesse', 'Sem interesse', 2),
    ('concorrente', 'Fechou com concorrente', 3),
    ('timing', 'Nao e o momento', 4),
    ('financeiro', 'Sem condicao financeira', 5),
    ('preco_alto', 'Preco acima do esperado', 6),
    ('retorno_investimento', 'Retorno do investimento nao convenceu', 7),
    ('mudou_plano', 'Projeto adiado ou mudou de prioridade', 8),
    ('outro', 'Outro', 9)
) AS seed(key, label, position)
ON CONFLICT (org_id, key) DO UPDATE
SET
  label = EXCLUDED.label,
  is_default = true,
  position = EXCLUDED.position;

COMMENT ON TABLE public.motivos_perda IS 'Catalogo configuravel de motivos de perda por organizacao';
COMMENT ON TABLE public.perdas_leads IS 'Registro estruturado de perdas de leads para analytics e historico comercial';