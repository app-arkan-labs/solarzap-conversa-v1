BEGIN;

-- P0 hotfix: canonicalize and sync lead phone fields.
-- Canonical strategy:
-- 1) Prefer normalized leads.telefone
-- 2) Fallback to normalized leads.phone_e164
-- 3) Normalize BR local 10/11-digit numbers by prepending country code 55
-- 4) Keep only 10..15-digit values as canonical

DO $$
DECLARE
  v_before integer := 0;
BEGIN
  WITH normalized AS (
    SELECT
      l.id,
      l.telefone,
      l.phone_e164,
      CASE
        WHEN length(regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 11
          THEN '55' || regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')
        WHEN length(regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')) BETWEEN 12 AND 15
          THEN regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')
        ELSE NULL
      END AS telefone_norm,
      CASE
        WHEN length(regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')) BETWEEN 10 AND 11
          THEN '55' || regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')
        WHEN length(regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')) BETWEEN 12 AND 15
          THEN regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')
        ELSE NULL
      END AS phone_e164_norm
    FROM public.leads l
  )
  SELECT COUNT(*)
  INTO v_before
  FROM normalized n
  WHERE COALESCE(n.telefone_norm, n.phone_e164_norm) IS NOT NULL
    AND (
      COALESCE(n.telefone, '') <> COALESCE(n.telefone_norm, n.phone_e164_norm)
      OR COALESCE(n.phone_e164, '') <> COALESCE(n.telefone_norm, n.phone_e164_norm)
    );

  RAISE NOTICE '[p0_phone_sync] rows_to_update_before=%', v_before;
END $$;

WITH normalized AS (
  SELECT
    l.id,
    l.telefone,
    l.phone_e164,
    CASE
      WHEN length(regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 11
        THEN '55' || regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')
      WHEN length(regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')) BETWEEN 12 AND 15
        THEN regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')
      ELSE NULL
    END AS telefone_norm,
    CASE
      WHEN length(regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')) BETWEEN 10 AND 11
        THEN '55' || regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')
      WHEN length(regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')) BETWEEN 12 AND 15
        THEN regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')
      ELSE NULL
    END AS phone_e164_norm
  FROM public.leads l
),
targets AS (
  SELECT
    n.id,
    COALESCE(n.telefone_norm, n.phone_e164_norm) AS canonical_phone
  FROM normalized n
  WHERE COALESCE(n.telefone_norm, n.phone_e164_norm) IS NOT NULL
)
UPDATE public.leads l
SET
  telefone = t.canonical_phone,
  phone_e164 = t.canonical_phone,
  updated_at = NOW()
FROM targets t
WHERE l.id = t.id
  AND (
    COALESCE(l.telefone, '') <> t.canonical_phone
    OR COALESCE(l.phone_e164, '') <> t.canonical_phone
  );

DO $$
DECLARE
  v_after integer := 0;
BEGIN
  WITH normalized AS (
    SELECT
      l.id,
      l.telefone,
      l.phone_e164,
      CASE
        WHEN length(regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 11
          THEN '55' || regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')
        WHEN length(regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')) BETWEEN 12 AND 15
          THEN regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g')
        ELSE NULL
      END AS telefone_norm,
      CASE
        WHEN length(regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')) BETWEEN 10 AND 11
          THEN '55' || regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')
        WHEN length(regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')) BETWEEN 12 AND 15
          THEN regexp_replace(COALESCE(l.phone_e164, ''), '\D', '', 'g')
        ELSE NULL
      END AS phone_e164_norm
    FROM public.leads l
  )
  SELECT COUNT(*)
  INTO v_after
  FROM normalized n
  WHERE COALESCE(n.telefone_norm, n.phone_e164_norm) IS NOT NULL
    AND (
      COALESCE(n.telefone, '') <> COALESCE(n.telefone_norm, n.phone_e164_norm)
      OR COALESCE(n.phone_e164, '') <> COALESCE(n.telefone_norm, n.phone_e164_norm)
    );

  RAISE NOTICE '[p0_phone_sync] rows_to_update_after=%', v_after;
END $$;

COMMIT;
