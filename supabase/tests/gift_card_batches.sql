BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT * FROM no_plan();
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

\set aly 'a1000000-0000-0000-0000-000000000001'
\set other 'a1000000-0000-0000-0000-000000000002'
\set sale_aly 'b1000000-0000-0000-0000-000000000001'
\set sale_other 'b1000000-0000-0000-0000-000000000002'

INSERT INTO public.consignors (id, consignor_number, name, business_name, commission_split, consignor_pays_card_fee, is_active)
VALUES
  (:'aly', 'GCT-1', 'Gift Test Aly', 'Gift Test Organics', 0.60, FALSE, TRUE),
  (:'other', 'GCT-2', 'Gift Test Other', 'Gift Test Antiques', 0.60, FALSE, TRUE);

CREATE FUNCTION pg_temp.add_sale(p_sale_id UUID, p_consignor_id UUID, p_price NUMERIC, p_tax NUMERIC)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO public.sales (id, completed_at, subtotal, tax_amount, total, payment_method, discount_total, payment_breakdown)
  VALUES (p_sale_id, NOW(), p_price, p_tax, p_price + p_tax, 'cash', 0,
    JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('method', 'cash', 'amount', p_price + p_tax)));
  INSERT INTO public.sale_items (sale_id, consignor_id, sku, name, price, quantity, commission_split, discount_amount, consignor_pays_card_fee)
  VALUES (p_sale_id, p_consignor_id, 'GCT-' || LEFT(p_sale_id::TEXT, 8), 'Gift test item', p_price, 1, 0.60, 0, FALSE);
$$;

-- Redeems and checks the deferred vendor rule right away, the way a commit would.
CREATE FUNCTION pg_temp.redeem_now(p_card UUID, p_amount NUMERIC, p_sale UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.apply_gift_card_change(p_card, -p_amount, 'sale_redemption', p_sale);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END;
$$;

SELECT pg_temp.add_sale(:'sale_aly', :'aly', 20.00, 1.40);
SELECT pg_temp.add_sale(:'sale_other', :'other', 20.00, 1.40);

-- A batch creates every card, sharing one batch id, vendor and payment.
CREATE TEMP TABLE batch AS
SELECT * FROM public.create_gift_card_batch(
  '[{"amount": 50, "recipient_name": "Margaret", "message": "Enjoy"},
    {"amount": 25, "recipient_name": " ", "recipient_email": "dana@example.test", "theme": "birthday"},
    {"amount": 25}]'::JSONB,
  :'aly', 'alywillow', 'The Hollis family', NULL, 'cash', NULL
);

SELECT is((SELECT COUNT(*)::INT FROM batch), 3, 'batch creates one card per row');
SELECT is((SELECT COUNT(DISTINCT batch_id)::INT FROM batch), 1, 'cards in a batch share a batch id');
SELECT is((SELECT COUNT(DISTINCT code)::INT FROM batch), 3, 'every card gets its own code');
SELECT is((SELECT COUNT(*)::INT FROM batch WHERE consignor_id = :'aly'), 3, 'every card is tied to the vendor');
SELECT is((SELECT theme FROM batch WHERE original_amount = 50), 'alywillow', 'cards take the batch theme');
SELECT is((SELECT theme FROM batch WHERE recipient_email = 'dana@example.test'), 'birthday', 'a card can override the theme');
SELECT is((SELECT recipient_name FROM batch WHERE recipient_email = 'dana@example.test'), NULL, 'blank names are stored as null');
SELECT is((SELECT COUNT(*)::INT FROM batch WHERE from_name = 'The Hollis family'), 3, 'from name applies to every card');
SELECT is(
  (SELECT SUM(g.current_balance) FROM public.gift_cards g WHERE g.batch_id = (SELECT batch_id FROM batch LIMIT 1)),
  100.00::NUMERIC, 'balances start at the amounts sold');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.gift_cards g
   WHERE g.batch_id = (SELECT batch_id FROM batch LIMIT 1) AND g.purchase_payment_method = 'cash'),
  3, 'each card records how it was paid for, so till counts still add up');

SELECT throws_ok(
  $$SELECT * FROM public.create_gift_card_batch('[]'::JSONB)$$,
  'Add at least one gift card', 'an empty batch is refused');
SELECT throws_ok(
  $$SELECT * FROM public.create_gift_card_batch('[{"amount": 25}, {"amount": 0}]'::JSONB)$$,
  'Gift card amount must be greater than 0', 'a zero amount is refused');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.gift_cards WHERE batch_id IS NOT NULL AND batch_id <> (SELECT batch_id FROM batch LIMIT 1)
     AND created_at >= NOW() - INTERVAL '1 minute' AND original_amount = 25 AND recipient_name IS NULL AND consignor_id IS NULL),
  0, 'a refused batch leaves no cards behind');

-- Lookup reports the vendor.
SELECT is(
  (SELECT consignor_name FROM public.get_gift_card_by_code((SELECT code FROM batch WHERE original_amount = 50))),
  'Gift Test Organics', 'lookup names the vendor a card is tied to');

-- A vendor card pays for that vendor's items, up to items plus tax.
SELECT lives_ok(
  format($$SELECT pg_temp.redeem_now(%L, 21.40, %L)$$, (SELECT id FROM batch WHERE original_amount = 50), :'sale_aly'),
  'a vendor card pays for that vendor''s items and their tax');
SELECT throws_like(
  format($$SELECT pg_temp.redeem_now(%L, 5.00, %L)$$, (SELECT id FROM batch WHERE original_amount = 50), :'sale_aly'),
  '%only good for Gift Test Organics items%', 'a vendor card cannot cover more than that vendor''s items');
SELECT throws_like(
  format($$SELECT pg_temp.redeem_now(%L, 5.00, %L)$$, (SELECT id FROM batch WHERE original_amount = 50), :'sale_other'),
  '%this sale has none%', 'a vendor card is refused on a sale with none of that vendor''s items');
SELECT is(
  (SELECT current_balance FROM public.gift_cards WHERE id = (SELECT id FROM batch WHERE original_amount = 50)),
  28.60::NUMERIC, 'refused redemptions do not touch the balance');

-- A store-wide card is not restricted.
CREATE TEMP TABLE store_card AS
SELECT * FROM public.create_gift_card_batch('[{"amount": 30}]'::JSONB, NULL, 'ravenlia', NULL, NULL, 'card', 'pi_test');
SELECT lives_ok(
  format($$SELECT pg_temp.redeem_now(%L, 21.40, %L)$$, (SELECT id FROM store_card), :'sale_other'),
  'a store-wide card pays for any vendor''s items');

SELECT * FROM finish();
ROLLBACK;
