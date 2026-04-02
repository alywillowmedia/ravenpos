-- Remove known test consignors, inventory, sales history, and Shopify test connection.
-- This migration intentionally mirrors the reviewed preview targeting logic.

BEGIN;

DROP TABLE IF EXISTS _target_consignors;
DROP TABLE IF EXISTS _target_items;
DROP TABLE IF EXISTS _target_sales;
DROP TABLE IF EXISTS _target_users;

-- Target consignors/vendors (explicit + requested)
CREATE TEMP TABLE _target_consignors ON COMMIT DROP AS
SELECT id, consignor_number, name
FROM public.consignors
WHERE UPPER(TRIM(consignor_number)) IN ('SHOP-RAVENPOS', 'JNHGRN', 'DNU', 'C001')
   OR LOWER(name) IN ('ravenliatest', 'jacob [test vendor]');

-- Target items: from target vendors + snowboard + test (excluding greatest)
CREATE TEMP TABLE _target_items ON COMMIT DROP AS
SELECT i.id
FROM public.items i
WHERE i.consignor_id IN (SELECT id FROM _target_consignors)
   OR LOWER(COALESCE(i.name, '')) LIKE '%snowboard%'
   OR (
     (LOWER(COALESCE(i.name, '')) LIKE '%test%' OR LOWER(COALESCE(i.sku, '')) LIKE '%test%')
     AND LOWER(COALESCE(i.name, '')) NOT LIKE '%greatest%'
     AND LOWER(COALESCE(i.sku, '')) NOT LIKE '%greatest%'
   );

-- Target sales: any sale containing a targeted line item/vendor
CREATE TEMP TABLE _target_sales ON COMMIT DROP AS
SELECT DISTINCT si.sale_id AS id
FROM public.sale_items si
WHERE si.consignor_id IN (SELECT id FROM _target_consignors)
   OR si.item_id IN (SELECT id FROM _target_items)
   OR LOWER(COALESCE(si.name, '')) LIKE '%snowboard%'
   OR (
     (LOWER(COALESCE(si.name, '')) LIKE '%test%' OR LOWER(COALESCE(si.sku, '')) LIKE '%test%')
     AND LOWER(COALESCE(si.name, '')) NOT LIKE '%greatest%'
     AND LOWER(COALESCE(si.sku, '')) NOT LIKE '%greatest%'
   );

-- Target user accounts linked to targeted consignors
CREATE TEMP TABLE _target_users ON COMMIT DROP AS
SELECT u.id
FROM public.users u
WHERE u.consignor_id IN (SELECT id FROM _target_consignors);

-- Delete dependent records first
DELETE FROM public.refunds
WHERE sale_id IN (SELECT id FROM _target_sales);

DELETE FROM public.sales
WHERE id IN (SELECT id FROM _target_sales);

DELETE FROM public.items
WHERE id IN (SELECT id FROM _target_items);

-- Remove user-authored chat messages first to satisfy sender identity check constraint
DELETE FROM public.chat_messages
WHERE sender_type = 'user'
  AND sender_user_id IN (SELECT id FROM _target_users);

DELETE FROM public.users
WHERE consignor_id IN (SELECT id FROM _target_consignors);

DELETE FROM public.consignors
WHERE id IN (SELECT id FROM _target_consignors);

-- Remove Shopify test connection rows
DELETE FROM public.shopify_config
WHERE LOWER(COALESCE(store_name, '')) = 'ravenpos-test-2'
   OR LOWER(COALESCE(consignor_name, '')) = 'ravenliatest'
   OR LOWER(COALESCE(store_name, '')) LIKE '%ravenlia%'
   OR LOWER(COALESCE(store_name, '')) LIKE '%ravenpos-test%';

COMMIT;
