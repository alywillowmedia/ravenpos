-- Preview only: shows exactly what would change for commission overrides.
-- No data is modified by this script.
--
-- Target rules:
-- RAV => vendor 0%, store 100%  (commission_split = 0.00)
-- ALY => vendor 100%, store 0%  (commission_split = 1.00)

-- 1) Target consignors and base split change
WITH target_consignors AS (
  SELECT
    c.id,
    c.consignor_number,
    c.name,
    c.commission_split AS current_split,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
)
SELECT
  consignor_number,
  name,
  current_split,
  target_split,
  (target_split - current_split) AS split_delta
FROM target_consignors
ORDER BY consignor_number;

-- 2) Scheduled rates that would be updated
WITH target_consignors AS (
  SELECT
    c.id,
    c.consignor_number,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
)
SELECT
  tc.consignor_number,
  rs.id AS rate_schedule_id,
  rs.effective_date,
  rs.commission_split AS current_split,
  tc.target_split,
  (tc.target_split - rs.commission_split) AS split_delta
FROM consignor_rate_schedules rs
JOIN target_consignors tc ON tc.id = rs.consignor_id
WHERE rs.commission_split IS DISTINCT FROM tc.target_split
ORDER BY tc.consignor_number, rs.effective_date;

-- 3) Detailed sale-item-level changes (includes refund-adjusted effective quantity)
WITH target_consignors AS (
  SELECT
    c.id AS consignor_id,
    c.consignor_number,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
),
refund_item_qty AS (
  SELECT
    (ri.elem->>'sale_item_id')::UUID AS sale_item_id,
    SUM(COALESCE((ri.elem->>'quantity')::INT, 0)) AS refunded_qty
  FROM refunds r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items::jsonb, '[]'::jsonb)) AS ri(elem)
  WHERE (ri.elem->>'sale_item_id') IS NOT NULL
  GROUP BY (ri.elem->>'sale_item_id')::UUID
),
item_impacts AS (
  SELECT
    tc.consignor_number,
    si.id AS sale_item_id,
    si.sale_id,
    s.completed_at,
    si.sku,
    si.name,
    si.price,
    si.quantity,
    COALESCE(riq.refunded_qty, 0) AS refunded_qty,
    GREATEST(si.quantity - COALESCE(riq.refunded_qty, 0), 0) AS effective_qty,
    si.commission_split AS current_split,
    tc.target_split AS new_split
  FROM sale_items si
  JOIN target_consignors tc ON tc.consignor_id = si.consignor_id
  LEFT JOIN sales s ON s.id = si.sale_id
  LEFT JOIN refund_item_qty riq ON riq.sale_item_id = si.id
  WHERE si.commission_split IS DISTINCT FROM tc.target_split
)
SELECT
  consignor_number,
  sale_id,
  sale_item_id,
  completed_at,
  sku,
  name,
  price,
  quantity,
  refunded_qty,
  effective_qty,
  current_split,
  new_split,
  ROUND((price * effective_qty)::numeric, 2) AS effective_line_total,
  ROUND((price * effective_qty * current_split)::numeric, 2) AS current_vendor_cut,
  ROUND((price * effective_qty * new_split)::numeric, 2) AS new_vendor_cut,
  ROUND((price * effective_qty * (new_split - current_split))::numeric, 2) AS vendor_cut_delta,
  ROUND((price * effective_qty * (1 - current_split))::numeric, 2) AS current_store_cut,
  ROUND((price * effective_qty * (1 - new_split))::numeric, 2) AS new_store_cut,
  ROUND((price * effective_qty * ((1 - new_split) - (1 - current_split)))::numeric, 2) AS store_cut_delta
FROM item_impacts
ORDER BY consignor_number, completed_at, sale_id, sale_item_id;

-- 4) Sale-item impact summary by consignor
WITH target_consignors AS (
  SELECT
    c.id AS consignor_id,
    c.consignor_number,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
),
refund_item_qty AS (
  SELECT
    (ri.elem->>'sale_item_id')::UUID AS sale_item_id,
    SUM(COALESCE((ri.elem->>'quantity')::INT, 0)) AS refunded_qty
  FROM refunds r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items::jsonb, '[]'::jsonb)) AS ri(elem)
  WHERE (ri.elem->>'sale_item_id') IS NOT NULL
  GROUP BY (ri.elem->>'sale_item_id')::UUID
),
item_impacts AS (
  SELECT
    tc.consignor_number,
    si.id AS sale_item_id,
    GREATEST(si.quantity - COALESCE(riq.refunded_qty, 0), 0) AS effective_qty,
    si.price,
    si.commission_split AS current_split,
    tc.target_split AS new_split
  FROM sale_items si
  JOIN target_consignors tc ON tc.consignor_id = si.consignor_id
  LEFT JOIN refund_item_qty riq ON riq.sale_item_id = si.id
  WHERE si.commission_split IS DISTINCT FROM tc.target_split
)
SELECT
  consignor_number,
  COUNT(*) AS changed_sale_item_rows,
  ROUND(SUM((price * effective_qty)::numeric), 2) AS effective_line_total,
  ROUND(SUM((price * effective_qty * current_split)::numeric), 2) AS current_vendor_cut_total,
  ROUND(SUM((price * effective_qty * new_split)::numeric), 2) AS new_vendor_cut_total,
  ROUND(SUM((price * effective_qty * (new_split - current_split))::numeric), 2) AS vendor_cut_delta_total,
  ROUND(SUM((price * effective_qty * (1 - current_split))::numeric), 2) AS current_store_cut_total,
  ROUND(SUM((price * effective_qty * (1 - new_split))::numeric), 2) AS new_store_cut_total,
  ROUND(SUM((price * effective_qty * ((1 - new_split) - (1 - current_split)))::numeric), 2) AS store_cut_delta_total
FROM item_impacts
GROUP BY consignor_number
ORDER BY consignor_number;

-- 5) Full inventory item list for target consignors (for manual spot-checking)
-- Note: items table does not store commission_split; new sales pull split from consignors.
WITH target_consignors AS (
  SELECT
    c.id AS consignor_id,
    c.consignor_number,
    c.commission_split AS current_split,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
)
SELECT
  tc.consignor_number,
  i.id AS item_id,
  i.sku,
  i.name,
  i.category,
  i.quantity,
  i.price,
  tc.current_split AS current_default_split,
  tc.target_split AS target_default_split
FROM items i
JOIN target_consignors tc ON tc.consignor_id = i.consignor_id
ORDER BY tc.consignor_number, i.name, i.sku, i.id;

-- 6) Approximate upcoming payout impact DETAIL (sales after each consignor's last payout date)
-- Note: this intentionally focuses on commission-split impact only.
-- It does NOT include card-fee deductions, booth rent, marketing, or ledger deductions.
WITH target_consignors AS (
  SELECT
    c.id AS consignor_id,
    c.consignor_number,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
),
last_payout AS (
  SELECT consignor_id, MAX(paid_at) AS last_paid_at
  FROM payouts
  GROUP BY consignor_id
),
refund_item_qty AS (
  SELECT
    (ri.elem->>'sale_item_id')::UUID AS sale_item_id,
    SUM(COALESCE((ri.elem->>'quantity')::INT, 0)) AS refunded_qty
  FROM refunds r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items::jsonb, '[]'::jsonb)) AS ri(elem)
  WHERE (ri.elem->>'sale_item_id') IS NOT NULL
  GROUP BY (ri.elem->>'sale_item_id')::UUID
),
upcoming AS (
  SELECT
    tc.consignor_number,
    si.sale_id,
    si.id AS sale_item_id,
    s.completed_at,
    si.sku,
    si.name,
    si.price,
    si.quantity,
    GREATEST(si.quantity - COALESCE(riq.refunded_qty, 0), 0) AS effective_qty,
    si.commission_split AS current_split,
    tc.target_split AS new_split
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN target_consignors tc ON tc.consignor_id = si.consignor_id
  LEFT JOIN last_payout lp ON lp.consignor_id = si.consignor_id
  LEFT JOIN refund_item_qty riq ON riq.sale_item_id = si.id
  WHERE s.completed_at > COALESCE(lp.last_paid_at, '1970-01-01'::timestamptz)
)
SELECT
  consignor_number,
  sale_id,
  sale_item_id,
  completed_at,
  sku,
  name,
  price,
  quantity,
  effective_qty,
  current_split,
  new_split,
  ROUND((price * effective_qty)::numeric, 2) AS effective_line_total,
  ROUND((price * effective_qty * current_split)::numeric, 2) AS current_upcoming_vendor_cut,
  ROUND((price * effective_qty * new_split)::numeric, 2) AS new_upcoming_vendor_cut,
  ROUND((price * effective_qty * (new_split - current_split))::numeric, 2) AS upcoming_vendor_cut_delta
FROM upcoming
ORDER BY consignor_number, completed_at, sale_id, sale_item_id;

-- 7) Approximate upcoming payout impact summary (totals)
WITH target_consignors AS (
  SELECT
    c.id AS consignor_id,
    c.consignor_number,
    CASE
      WHEN UPPER(TRIM(c.consignor_number)) = 'RAV' THEN 0.00
      WHEN UPPER(TRIM(c.consignor_number)) = 'ALY' THEN 1.00
    END::DECIMAL(3,2) AS target_split
  FROM consignors c
  WHERE UPPER(TRIM(c.consignor_number)) IN ('RAV', 'ALY')
),
last_payout AS (
  SELECT consignor_id, MAX(paid_at) AS last_paid_at
  FROM payouts
  GROUP BY consignor_id
),
refund_item_qty AS (
  SELECT
    (ri.elem->>'sale_item_id')::UUID AS sale_item_id,
    SUM(COALESCE((ri.elem->>'quantity')::INT, 0)) AS refunded_qty
  FROM refunds r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items::jsonb, '[]'::jsonb)) AS ri(elem)
  WHERE (ri.elem->>'sale_item_id') IS NOT NULL
  GROUP BY (ri.elem->>'sale_item_id')::UUID
),
upcoming AS (
  SELECT
    tc.consignor_number,
    si.id AS sale_item_id,
    si.price,
    GREATEST(si.quantity - COALESCE(riq.refunded_qty, 0), 0) AS effective_qty,
    si.commission_split AS current_split,
    tc.target_split AS new_split
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN target_consignors tc ON tc.consignor_id = si.consignor_id
  LEFT JOIN last_payout lp ON lp.consignor_id = si.consignor_id
  LEFT JOIN refund_item_qty riq ON riq.sale_item_id = si.id
  WHERE s.completed_at > COALESCE(lp.last_paid_at, '1970-01-01'::timestamptz)
)
SELECT
  consignor_number,
  COUNT(*) AS upcoming_sale_item_rows,
  ROUND(SUM((price * effective_qty * current_split)::numeric), 2) AS current_upcoming_vendor_cut,
  ROUND(SUM((price * effective_qty * new_split)::numeric), 2) AS new_upcoming_vendor_cut,
  ROUND(SUM((price * effective_qty * (new_split - current_split))::numeric), 2) AS upcoming_vendor_cut_delta
FROM upcoming
GROUP BY consignor_number
ORDER BY consignor_number;
