-- Store Credit System (MVP)
-- Adds customer store credit balances and tracks credit used on sales

-- Customer balance
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS store_credit DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Ensure balances cannot go negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_store_credit_non_negative'
  ) THEN
    ALTER TABLE customers
    ADD CONSTRAINT customers_store_credit_non_negative CHECK (store_credit >= 0);
  END IF;
END $$;

-- Track how much store credit was used for a sale
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS store_credit_used DECIMAL(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_store_credit_used_non_negative'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_store_credit_used_non_negative CHECK (store_credit_used >= 0);
  END IF;
END $$;

-- Atomic balance adjustment helper
CREATE OR REPLACE FUNCTION adjust_customer_store_credit(
  p_customer_id UUID,
  p_amount_change NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount_change = 0 THEN
    SELECT store_credit INTO v_new_balance
    FROM customers
    WHERE id = p_customer_id;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;

    RETURN ROUND(v_new_balance, 2);
  END IF;

  UPDATE customers
  SET store_credit = ROUND((store_credit + p_amount_change)::NUMERIC, 2)
  WHERE id = p_customer_id
    AND (store_credit + p_amount_change) >= 0
  RETURNING store_credit INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id) THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    RAISE EXCEPTION 'Insufficient store credit';
  END IF;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_customer_store_credit(UUID, NUMERIC) TO anon, authenticated;

COMMENT ON COLUMN customers.store_credit IS 'Available customer store credit balance';
COMMENT ON COLUMN sales.store_credit_used IS 'Store credit amount applied to this sale';
