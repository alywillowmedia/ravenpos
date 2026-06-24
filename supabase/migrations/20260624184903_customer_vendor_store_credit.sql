-- Add vendor-scoped customer store credit balances.
--
-- General customer store credit stays on public.customers.store_credit.
-- Vendor-specific balances live here and are redeemed only when checkout is
-- explicitly scoped to that vendor.

CREATE TABLE IF NOT EXISTS public.customer_vendor_store_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE CASCADE,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_vendor_store_credits_non_negative CHECK (balance >= 0),
  CONSTRAINT customer_vendor_store_credits_unique_pair UNIQUE (customer_id, consignor_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_vendor_store_credits_customer
ON public.customer_vendor_store_credits(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_vendor_store_credits_consignor
ON public.customer_vendor_store_credits(consignor_id);

DROP TRIGGER IF EXISTS update_customer_vendor_store_credits_updated_at
ON public.customer_vendor_store_credits;
CREATE TRIGGER update_customer_vendor_store_credits_updated_at
BEFORE UPDATE ON public.customer_vendor_store_credits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_vendor_store_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated app users can manage customer vendor store credits"
ON public.customer_vendor_store_credits;
CREATE POLICY "Authenticated app users can manage customer vendor store credits"
ON public.customer_vendor_store_credits
FOR ALL
TO authenticated
USING (public.is_ravenpos_app_actor())
WITH CHECK (public.is_ravenpos_app_actor());

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.customer_vendor_store_credits
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.adjust_customer_vendor_store_credit(
  p_customer_id UUID,
  p_consignor_id UUID,
  p_amount_change NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount_change NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to adjust customer vendor store credit';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF p_consignor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.consignors WHERE id = p_consignor_id) THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  v_amount_change := ROUND(COALESCE(p_amount_change, 0)::NUMERIC, 2);

  IF v_amount_change = 0 THEN
    SELECT balance INTO v_new_balance
    FROM public.customer_vendor_store_credits
    WHERE customer_id = p_customer_id
      AND consignor_id = p_consignor_id;

    RETURN ROUND(COALESCE(v_new_balance, 0)::NUMERIC, 2);
  END IF;

  IF v_amount_change > 0 THEN
    INSERT INTO public.customer_vendor_store_credits (
      customer_id,
      consignor_id,
      balance
    )
    VALUES (
      p_customer_id,
      p_consignor_id,
      v_amount_change
    )
    ON CONFLICT (customer_id, consignor_id)
    DO UPDATE SET
      balance = ROUND((public.customer_vendor_store_credits.balance + EXCLUDED.balance)::NUMERIC, 2),
      updated_at = NOW()
    RETURNING balance INTO v_new_balance;

    RETURN ROUND(v_new_balance::NUMERIC, 2);
  END IF;

  UPDATE public.customer_vendor_store_credits
  SET balance = ROUND((balance + v_amount_change)::NUMERIC, 2)
  WHERE customer_id = p_customer_id
    AND consignor_id = p_consignor_id
    AND (balance + v_amount_change) >= 0
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.customer_vendor_store_credits
      WHERE customer_id = p_customer_id
        AND consignor_id = p_consignor_id
    ) THEN
      RAISE EXCEPTION 'Insufficient vendor store credit';
    END IF;

    RAISE EXCEPTION 'Insufficient vendor store credit';
  END IF;

  RETURN ROUND(v_new_balance::NUMERIC, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_customer_vendor_store_credit(UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_customer_vendor_store_credit(UUID, UUID, NUMERIC)
TO authenticated, service_role;

COMMENT ON TABLE public.customer_vendor_store_credits IS 'Available customer store credit balances scoped to a specific consignor/vendor. This is a checkout redemption limit only, not a vendor payout liability or payout deduction source.';
COMMENT ON COLUMN public.customer_vendor_store_credits.balance IS 'Available vendor-specific store credit balance for this customer and consignor.';
