-- Active employees can record purchases from dealers and view purchase
-- history. Each purchase must be attributed to the employee recording it.
-- Editing and deleting recorded purchases stays admin-only because those
-- rows feed the till count's dealer cash deductions.

DROP POLICY IF EXISTS "Employees can select dealer_purchases" ON public.dealer_purchases;
CREATE POLICY "Employees can select dealer_purchases" ON public.dealer_purchases
FOR SELECT TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can insert dealer_purchases" ON public.dealer_purchases;
CREATE POLICY "Employees can insert dealer_purchases" ON public.dealer_purchases
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.current_employee_id()) IS NOT NULL
  AND processed_by_employee = (SELECT public.current_employee_id())
);

DROP POLICY IF EXISTS "Employees can select dealer_purchase_items" ON public.dealer_purchase_items;
CREATE POLICY "Employees can select dealer_purchase_items" ON public.dealer_purchase_items
FOR SELECT TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

-- Line items may only be attached to a purchase the same employee recorded.
DROP POLICY IF EXISTS "Employees can insert dealer_purchase_items" ON public.dealer_purchase_items;
CREATE POLICY "Employees can insert dealer_purchase_items" ON public.dealer_purchase_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dealer_purchases p
    WHERE p.id = dealer_purchase_id
      AND p.processed_by_employee = (SELECT public.current_employee_id())
  )
);

GRANT SELECT, INSERT ON public.dealer_purchases TO authenticated;
GRANT SELECT, INSERT ON public.dealer_purchase_items TO authenticated;
