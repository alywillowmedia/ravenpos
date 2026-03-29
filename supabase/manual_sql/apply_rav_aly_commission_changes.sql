-- Apply commission overrides for vendor shortcodes RAV and ALY.
--
-- Run this only after reviewing:
-- supabase/manual_sql/preview_rav_aly_commission_changes.sql
--
-- Target rules:
-- RAV => vendor 0%, store 100%  (commission_split = 0.00)
-- ALY => vendor 100%, store 0%  (commission_split = 1.00)
--
-- This updates:
-- 1) consignors.commission_split
-- 2) consignor_rate_schedules.commission_split
-- 3) sale_items.commission_split

BEGIN;

DO $$
DECLARE
  v_target_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_target_count
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY');

  IF v_target_count = 0 THEN
    RAISE EXCEPTION 'No consignors found for shortcode RAV/ALY. Aborting.';
  END IF;
END $$;

WITH target_consignors AS (
  SELECT
    id,
    CASE
      WHEN UPPER(TRIM(consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY')
),
updated AS (
  UPDATE consignors c
  SET
    commission_split = t.target_split,
    updated_at = NOW()
  FROM target_consignors t
  WHERE c.id = t.id
    AND c.commission_split IS DISTINCT FROM t.target_split
  RETURNING c.id
)
SELECT COUNT(*) AS consignors_updated FROM updated;

WITH target_consignors AS (
  SELECT
    id,
    CASE
      WHEN UPPER(TRIM(consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY')
),
updated AS (
  UPDATE consignor_rate_schedules rs
  SET
    commission_split = t.target_split,
    updated_at = NOW()
  FROM target_consignors t
  WHERE rs.consignor_id = t.id
    AND rs.commission_split IS DISTINCT FROM t.target_split
  RETURNING rs.id
)
SELECT COUNT(*) AS rate_schedules_updated FROM updated;

WITH target_consignors AS (
  SELECT
    id,
    CASE
      WHEN UPPER(TRIM(consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors
  WHERE UPPER(TRIM(consignor_number)) IN ('RAV', 'ALY')
),
updated AS (
  UPDATE sale_items si
  SET commission_split = t.target_split
  FROM target_consignors t
  WHERE si.consignor_id = t.id
    AND si.commission_split IS DISTINCT FROM t.target_split
  RETURNING si.id
)
SELECT COUNT(*) AS sale_items_updated FROM updated;

COMMIT;

