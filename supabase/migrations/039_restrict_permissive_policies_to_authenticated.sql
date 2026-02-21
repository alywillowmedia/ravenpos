-- Restrict previously permissive RLS policies to logged-in users only.
-- This keeps broad access semantics, but removes anonymous/public access.

-- customers
DROP POLICY IF EXISTS "Allow all on customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated can manage customers" ON public.customers;
CREATE POLICY "Authenticated can manage customers"
ON public.customers
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- gift_cards
DROP POLICY IF EXISTS "Allow all on gift_cards" ON public.gift_cards;
DROP POLICY IF EXISTS "Authenticated can manage gift_cards" ON public.gift_cards;
CREATE POLICY "Authenticated can manage gift_cards"
ON public.gift_cards
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- payouts
DROP POLICY IF EXISTS "Allow all on payouts" ON public.payouts;
DROP POLICY IF EXISTS "Authenticated can manage payouts" ON public.payouts;
CREATE POLICY "Authenticated can manage payouts"
ON public.payouts
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- refunds
DROP POLICY IF EXISTS "Allow all on refunds" ON public.refunds;
DROP POLICY IF EXISTS "Authenticated can manage refunds" ON public.refunds;
CREATE POLICY "Authenticated can manage refunds"
ON public.refunds
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- shopify_config
DROP POLICY IF EXISTS "Allow all on shopify_config" ON public.shopify_config;
DROP POLICY IF EXISTS "Authenticated can manage shopify_config" ON public.shopify_config;
CREATE POLICY "Authenticated can manage shopify_config"
ON public.shopify_config
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- sync_log
DROP POLICY IF EXISTS "Allow all on sync_log" ON public.sync_log;
DROP POLICY IF EXISTS "Authenticated can manage sync_log" ON public.sync_log;
CREATE POLICY "Authenticated can manage sync_log"
ON public.sync_log
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- sale_items
DROP POLICY IF EXISTS "Anyone can insert sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated can insert sale_items" ON public.sale_items;
CREATE POLICY "Authenticated can insert sale_items"
ON public.sale_items
FOR INSERT
TO authenticated
WITH CHECK (true);

-- sales
DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can insert sales" ON public.sales;
CREATE POLICY "Authenticated can insert sales"
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can update sales" ON public.sales;
CREATE POLICY "Authenticated can update sales"
ON public.sales
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- time_entries
DROP POLICY IF EXISTS "Anyone can insert time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated can insert time entries" ON public.time_entries;
CREATE POLICY "Authenticated can insert time entries"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated can update time entries" ON public.time_entries;
CREATE POLICY "Authenticated can update time entries"
ON public.time_entries
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
