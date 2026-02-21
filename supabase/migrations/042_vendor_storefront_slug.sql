-- Add clean, stable vendor storefront slugs

ALTER TABLE public.consignors
  ADD COLUMN IF NOT EXISTS storefront_slug TEXT;

-- Backfill slugs for existing consignors using storefront name (or name)
WITH base AS (
  SELECT
    id,
    NULLIF(
      regexp_replace(
        lower(coalesce(storefront_display_name, name, 'vendor')),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      ''
    ) AS raw_slug
  FROM public.consignors
),
normalized AS (
  SELECT
    id,
    trim(both '-' FROM coalesce(raw_slug, 'vendor')) AS base_slug
  FROM base
),
ranked AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY id) AS dup_rank
  FROM normalized
)
UPDATE public.consignors c
SET storefront_slug = CASE
  WHEN r.dup_rank = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.dup_rank::text
END
FROM ranked r
WHERE c.id = r.id
  AND c.storefront_slug IS NULL;

-- Keep empty strings out
UPDATE public.consignors
SET storefront_slug = NULL
WHERE storefront_slug IS NOT NULL
  AND btrim(storefront_slug) = '';

-- Enforce uniqueness for non-null slugs
CREATE UNIQUE INDEX IF NOT EXISTS idx_consignors_storefront_slug_unique
  ON public.consignors (storefront_slug)
  WHERE storefront_slug IS NOT NULL;
