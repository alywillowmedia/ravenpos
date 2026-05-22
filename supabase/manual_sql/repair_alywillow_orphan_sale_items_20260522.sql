-- Repair orphan sales that were recorded without sale_items.
--
-- Plain meaning:
-- - sales = receipt/payment header
-- - sale_items = vendor/item lines used by payouts
-- These rows recreate one payout-bearing sale_item per orphan sale and assign it
-- to the Alywillow consignor (consignor_number = 'ALY').
--
-- Run in Supabase SQL editor.
-- This version intentionally avoids temp tables because the SQL editor can run
-- selected statements in a way that loses temp-table state.

-- 1) Preview rows before repair.
WITH repair_orphan_sales (sale_id, expected_subtotal) AS (
  VALUES
    ('8ed634af-bf9a-49e0-aa54-f56ea1be1fd9'::UUID, 43.25::NUMERIC),
    ('33441cff-a058-456f-b5e2-7edeec1a178c'::UUID, 136.50::NUMERIC),
    ('862c1ee8-d279-4fb1-b1ee-4cfcbb1d6989'::UUID, 93.50::NUMERIC),
    ('731aa42e-610d-484d-9a5a-f0ebdd4bf549'::UUID, 110.75::NUMERIC),
    ('d30da041-acb7-47ad-b963-3316100fd9ac'::UUID, 25.00::NUMERIC),
    ('0d41d6e4-70f0-46a5-990a-2a9050a16a0b'::UUID, 12.50::NUMERIC),
    ('13ced772-8d96-403f-b7f8-d3014990d9ab'::UUID, 374.25::NUMERIC),
    ('fa86dcc8-5dbc-4a68-be2a-3c3d251fab83'::UUID, 50.00::NUMERIC),
    ('8e9b1417-bc6e-4ed6-afab-048210193d35'::UUID, 73.00::NUMERIC),
    ('cadcdb24-ad9e-4e69-9964-072c8bf61ff8'::UUID, 134.98::NUMERIC),
    ('673a4db9-e218-4e8a-8df4-3e2253db52a1'::UUID, 379.38::NUMERIC),
    ('78d5a951-ac99-403f-8261-d2de31e9c6f9'::UUID, 6.95::NUMERIC),
    ('bd4d7d64-7055-417e-91a7-1b53c6318dac'::UUID, 76.50::NUMERIC),
    ('000eec9f-3e2a-4569-9442-07af10f31d2c'::UUID, 23.99::NUMERIC),
    ('82d68ff2-a6fb-4c62-b941-6ed4419a9d6b'::UUID, 167.00::NUMERIC),
    ('72111d34-8798-47a9-9270-cc8a7532908a'::UUID, 46.00::NUMERIC),
    ('83a4b67b-1ab7-4547-94ce-9bcfe10beb33'::UUID, 35.50::NUMERIC),
    ('e76d5328-e4e6-4359-b78d-a078a8bf62a6'::UUID, 105.49::NUMERIC),
    ('89bd74ea-6788-4ecc-9d3e-004c7f80f844'::UUID, 169.97::NUMERIC),
    ('448a5079-37bb-4569-80ee-ebdefa035e40'::UUID, 24.50::NUMERIC),
    ('1ed37131-6d6f-4726-8bd7-e03111979068'::UUID, 26.00::NUMERIC),
    ('d4c6c41a-9441-4c16-a407-8c5df3c7e841'::UUID, 44.50::NUMERIC),
    ('5eb94b3c-7ccf-4cf4-8a31-5cb4372b7829'::UUID, 82.00::NUMERIC),
    ('b3d9428c-c354-4599-a799-8630c99dcabc'::UUID, 28.50::NUMERIC),
    ('44217403-8552-4f95-aa13-78f280096c49'::UUID, 22.00::NUMERIC),
    ('5c339433-d846-46cb-9a26-5dc769fe0b45'::UUID, 64.99::NUMERIC),
    ('fad66130-08b5-4df3-b879-d85ab5d04558'::UUID, 2.00::NUMERIC),
    ('bd609efb-2592-4fb9-91b5-75141a54948b'::UUID, 24.99::NUMERIC)
)
SELECT
  r.sale_id,
  s.completed_at,
  s.payment_method,
  s.subtotal AS actual_subtotal,
  r.expected_subtotal,
  s.total,
  COUNT(si.id) AS existing_sale_item_count
FROM repair_orphan_sales r
LEFT JOIN public.sales s ON s.id = r.sale_id
LEFT JOIN public.sale_items si ON si.sale_id = r.sale_id
GROUP BY r.sale_id, s.completed_at, s.payment_method, s.subtotal, r.expected_subtotal, s.total
ORDER BY s.completed_at DESC NULLS LAST;

-- 2) Apply repair.
-- If you see a typo in the preview, fix this VALUES list before running.
WITH repair_orphan_sales (sale_id, expected_subtotal) AS (
  VALUES
    ('8ed634af-bf9a-49e0-aa54-f56ea1be1fd9'::UUID, 43.25::NUMERIC),
    ('33441cff-a058-456f-b5e2-7edeec1a178c'::UUID, 136.50::NUMERIC),
    ('862c1ee8-d279-4fb1-b1ee-4cfcbb1d6989'::UUID, 93.50::NUMERIC),
    ('731aa42e-610d-484d-9a5a-f0ebdd4bf549'::UUID, 110.75::NUMERIC),
    ('d30da041-acb7-47ad-b963-3316100fd9ac'::UUID, 25.00::NUMERIC),
    ('0d41d6e4-70f0-46a5-990a-2a9050a16a0b'::UUID, 12.50::NUMERIC),
    ('13ced772-8d96-403f-b7f8-d3014990d9ab'::UUID, 374.25::NUMERIC),
    ('fa86dcc8-5dbc-4a68-be2a-3c3d251fab83'::UUID, 50.00::NUMERIC),
    ('8e9b1417-bc6e-4ed6-afab-048210193d35'::UUID, 73.00::NUMERIC),
    ('cadcdb24-ad9e-4e69-9964-072c8bf61ff8'::UUID, 134.98::NUMERIC),
    ('673a4db9-e218-4e8a-8df4-3e2253db52a1'::UUID, 379.38::NUMERIC),
    ('78d5a951-ac99-403f-8261-d2de31e9c6f9'::UUID, 6.95::NUMERIC),
    ('bd4d7d64-7055-417e-91a7-1b53c6318dac'::UUID, 76.50::NUMERIC),
    ('000eec9f-3e2a-4569-9442-07af10f31d2c'::UUID, 23.99::NUMERIC),
    ('82d68ff2-a6fb-4c62-b941-6ed4419a9d6b'::UUID, 167.00::NUMERIC),
    ('72111d34-8798-47a9-9270-cc8a7532908a'::UUID, 46.00::NUMERIC),
    ('83a4b67b-1ab7-4547-94ce-9bcfe10beb33'::UUID, 35.50::NUMERIC),
    ('e76d5328-e4e6-4359-b78d-a078a8bf62a6'::UUID, 105.49::NUMERIC),
    ('89bd74ea-6788-4ecc-9d3e-004c7f80f844'::UUID, 169.97::NUMERIC),
    ('448a5079-37bb-4569-80ee-ebdefa035e40'::UUID, 24.50::NUMERIC),
    ('1ed37131-6d6f-4726-8bd7-e03111979068'::UUID, 26.00::NUMERIC),
    ('d4c6c41a-9441-4c16-a407-8c5df3c7e841'::UUID, 44.50::NUMERIC),
    ('5eb94b3c-7ccf-4cf4-8a31-5cb4372b7829'::UUID, 82.00::NUMERIC),
    ('b3d9428c-c354-4599-a799-8630c99dcabc'::UUID, 28.50::NUMERIC),
    ('44217403-8552-4f95-aa13-78f280096c49'::UUID, 22.00::NUMERIC),
    ('5c339433-d846-46cb-9a26-5dc769fe0b45'::UUID, 64.99::NUMERIC),
    ('fad66130-08b5-4df3-b879-d85ab5d04558'::UUID, 2.00::NUMERIC),
    ('bd609efb-2592-4fb9-91b5-75141a54948b'::UUID, 24.99::NUMERIC)
),
aly AS (
  SELECT *
  FROM public.consignors
  WHERE consignor_number = 'ALY'
)
INSERT INTO public.sale_items (
  sale_id,
  item_id,
  consignor_id,
  sku,
  name,
  price,
  quantity,
  commission_split,
  consignor_pays_card_fee,
  discount_amount,
  discount_reason
)
SELECT
  s.id AS sale_id,
  NULL AS item_id,
  aly.id AS consignor_id,
  'RECOVERED-' || LEFT(s.id::TEXT, 8) AS sku,
  'Recovered Alywillow sale line' AS name,
  s.subtotal AS price,
  1 AS quantity,
  aly.commission_split,
  COALESCE(aly.consignor_pays_card_fee, FALSE) AS consignor_pays_card_fee,
  0 AS discount_amount,
  'Recovered from orphan sale header on 2026-05-22' AS discount_reason
FROM repair_orphan_sales r
JOIN public.sales s ON s.id = r.sale_id
CROSS JOIN aly
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sale_items si
  WHERE si.sale_id = s.id
)
AND (SELECT COUNT(*) FROM aly) = 1
RETURNING
  sale_id,
  consignor_id,
  sku,
  name,
  price,
  quantity,
  commission_split;

-- 3) Verify repair.
WITH repair_orphan_sales (sale_id, expected_subtotal) AS (
  VALUES
    ('8ed634af-bf9a-49e0-aa54-f56ea1be1fd9'::UUID, 43.25::NUMERIC),
    ('33441cff-a058-456f-b5e2-7edeec1a178c'::UUID, 136.50::NUMERIC),
    ('862c1ee8-d279-4fb1-b1ee-4cfcbb1d6989'::UUID, 93.50::NUMERIC),
    ('731aa42e-610d-484d-9a5a-f0ebdd4bf549'::UUID, 110.75::NUMERIC),
    ('d30da041-acb7-47ad-b963-3316100fd9ac'::UUID, 25.00::NUMERIC),
    ('0d41d6e4-70f0-46a5-990a-2a9050a16a0b'::UUID, 12.50::NUMERIC),
    ('13ced772-8d96-403f-b7f8-d3014990d9ab'::UUID, 374.25::NUMERIC),
    ('fa86dcc8-5dbc-4a68-be2a-3c3d251fab83'::UUID, 50.00::NUMERIC),
    ('8e9b1417-bc6e-4ed6-afab-048210193d35'::UUID, 73.00::NUMERIC),
    ('cadcdb24-ad9e-4e69-9964-072c8bf61ff8'::UUID, 134.98::NUMERIC),
    ('673a4db9-e218-4e8a-8df4-3e2253db52a1'::UUID, 379.38::NUMERIC),
    ('78d5a951-ac99-403f-8261-d2de31e9c6f9'::UUID, 6.95::NUMERIC),
    ('bd4d7d64-7055-417e-91a7-1b53c6318dac'::UUID, 76.50::NUMERIC),
    ('000eec9f-3e2a-4569-9442-07af10f31d2c'::UUID, 23.99::NUMERIC),
    ('82d68ff2-a6fb-4c62-b941-6ed4419a9d6b'::UUID, 167.00::NUMERIC),
    ('72111d34-8798-47a9-9270-cc8a7532908a'::UUID, 46.00::NUMERIC),
    ('83a4b67b-1ab7-4547-94ce-9bcfe10beb33'::UUID, 35.50::NUMERIC),
    ('e76d5328-e4e6-4359-b78d-a078a8bf62a6'::UUID, 105.49::NUMERIC),
    ('89bd74ea-6788-4ecc-9d3e-004c7f80f844'::UUID, 169.97::NUMERIC),
    ('448a5079-37bb-4569-80ee-ebdefa035e40'::UUID, 24.50::NUMERIC),
    ('1ed37131-6d6f-4726-8bd7-e03111979068'::UUID, 26.00::NUMERIC),
    ('d4c6c41a-9441-4c16-a407-8c5df3c7e841'::UUID, 44.50::NUMERIC),
    ('5eb94b3c-7ccf-4cf4-8a31-5cb4372b7829'::UUID, 82.00::NUMERIC),
    ('b3d9428c-c354-4599-a799-8630c99dcabc'::UUID, 28.50::NUMERIC),
    ('44217403-8552-4f95-aa13-78f280096c49'::UUID, 22.00::NUMERIC),
    ('5c339433-d846-46cb-9a26-5dc769fe0b45'::UUID, 64.99::NUMERIC),
    ('fad66130-08b5-4df3-b879-d85ab5d04558'::UUID, 2.00::NUMERIC),
    ('bd609efb-2592-4fb9-91b5-75141a54948b'::UUID, 24.99::NUMERIC)
)
SELECT
  c.consignor_number,
  c.name AS consignor_name,
  COUNT(si.id) AS repaired_sale_items,
  ROUND(SUM(si.price * si.quantity)::NUMERIC, 2) AS repaired_subtotal,
  ROUND(SUM((si.price * si.quantity) * si.commission_split)::NUMERIC, 2) AS estimated_payout_before_deductions
FROM repair_orphan_sales r
JOIN public.sale_items si ON si.sale_id = r.sale_id
JOIN public.consignors c ON c.id = si.consignor_id
GROUP BY c.consignor_number, c.name;
