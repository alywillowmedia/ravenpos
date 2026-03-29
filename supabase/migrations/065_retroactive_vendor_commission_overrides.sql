-- Retroactively enforce commission splits for specific vendor shortcodes.
-- RAV: store 100% / vendor 0%  => commission_split = 0.00
-- ALY: store 0% / vendor 100% => commission_split = 1.00
--
-- This updates:
-- 1) consignors.commission_split (used for new sales)
-- 2) consignor_rate_schedules.commission_split (prevents scheduled overrides)
-- 3) sale_items.commission_split (retroactive sales history + pending payout math)

BEGIN;

WITH target_consignors AS (
  SELECT
    id,
    UPPER(TRIM(consignor_number)) AS shortcode,
    CASE
      WHEN UPPER(TRIM(consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY')
)
UPDATE consignors c
SET
  commission_split = t.target_split,
  updated_at = NOW()
FROM target_consignors t
WHERE c.id = t.id
  AND c.commission_split IS DISTINCT FROM t.target_split;

WITH target_consignors AS (
  SELECT
    id,
    UPPER(TRIM(consignor_number)) AS shortcode,
    CASE
      WHEN UPPER(TRIM(consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY')
)
UPDATE consignor_rate_schedules rs
SET
  commission_split = t.target_split,
  updated_at = NOW()
FROM target_consignors t
WHERE rs.consignor_id = t.id
  AND rs.commission_split IS DISTINCT FROM t.target_split;

WITH target_consignors AS (
  SELECT
    id,
    UPPER(TRIM(consignor_number)) AS shortcode,
    CASE
      WHEN UPPER(TRIM(consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY')
)
UPDATE sale_items si
SET commission_split = t.target_split
FROM target_consignors t
WHERE si.consignor_id = t.id
  AND si.commission_split IS DISTINCT FROM t.target_split;

COMMIT;

-- Optional verification query:
-- SELECT c.consignor_number, c.commission_split, COUNT(si.id) AS sale_item_count
-- FROM consignors c
-- LEFT JOIN sale_items si ON si.consignor_id = c.id
-- WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
-- GROUP BY c.consignor_number, c.commission_split
-- ORDER BY c.consignor_number;
