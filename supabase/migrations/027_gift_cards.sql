-- Gift cards
-- Separate from customer store credit

CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  original_amount DECIMAL(10,2) NOT NULL CHECK (original_amount > 0),
  current_balance DECIMAL(10,2) NOT NULL CHECK (current_balance >= 0),
  recipient_name TEXT,
  recipient_email TEXT,
  from_name TEXT,
  purchaser_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  purchase_payment_method TEXT CHECK (purchase_payment_method IN ('cash', 'card')),
  purchase_payment_intent_id TEXT,
  message TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_redeemed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_active_balance ON gift_cards(is_active, current_balance);
CREATE INDEX IF NOT EXISTS idx_gift_cards_recipient_email ON gift_cards(recipient_email);

ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on gift_cards" ON gift_cards;
CREATE POLICY "Allow all on gift_cards" ON gift_cards FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS gift_card_used DECIMAL(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_gift_card_used_non_negative'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_gift_card_used_non_negative CHECK (gift_card_used >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'gift_cards_updated_at'
  ) THEN
    CREATE TRIGGER gift_cards_updated_at
      BEFORE UPDATE ON gift_cards
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_gift_card_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := 'GC-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM gift_cards WHERE code = candidate);
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION create_gift_card(
  p_amount NUMERIC,
  p_recipient_name TEXT DEFAULT NULL,
  p_recipient_email TEXT DEFAULT NULL,
  p_from_name TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_purchaser_customer_id UUID DEFAULT NULL,
  p_purchase_payment_method TEXT DEFAULT NULL,
  p_purchase_payment_intent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  original_amount NUMERIC,
  current_balance NUMERIC,
  recipient_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC;
  v_method TEXT;
BEGIN
  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_method := NULLIF(TRIM(LOWER(COALESCE(p_purchase_payment_method, ''))), '');

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Gift card amount must be greater than 0';
  END IF;

  IF v_method IS NOT NULL AND v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  RETURN QUERY
  INSERT INTO gift_cards (
    code,
    original_amount,
    current_balance,
    recipient_name,
    recipient_email,
    from_name,
    purchaser_customer_id,
    purchase_payment_method,
    purchase_payment_intent_id,
    message
  )
  VALUES (
    generate_gift_card_code(),
    v_amount,
    v_amount,
    NULLIF(TRIM(COALESCE(p_recipient_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_recipient_email, '')), ''),
    NULLIF(TRIM(COALESCE(p_from_name, '')), ''),
    p_purchaser_customer_id,
    v_method,
    NULLIF(TRIM(COALESCE(p_purchase_payment_intent_id, '')), ''),
    NULLIF(TRIM(COALESCE(p_message, '')), '')
  )
  RETURNING gift_cards.id, gift_cards.code, gift_cards.original_amount, gift_cards.current_balance, gift_cards.recipient_email;
END;
$$;

CREATE OR REPLACE FUNCTION get_gift_card_by_code(
  p_code TEXT
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  current_balance NUMERIC,
  is_active BOOLEAN,
  recipient_name TEXT,
  recipient_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.code,
    ROUND(g.current_balance::NUMERIC, 2) AS current_balance,
    g.is_active,
    g.recipient_name,
    g.recipient_email
  FROM gift_cards g
  WHERE g.code = UPPER(TRIM(COALESCE(p_code, '')))
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_gift_card(
  p_code TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_amount NUMERIC;
  v_new_balance NUMERIC;
  v_exists BOOLEAN;
BEGIN
  v_code := UPPER(TRIM(COALESCE(p_code, '')));
  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);

  IF v_code = '' THEN
    RAISE EXCEPTION 'Gift card code is required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Redeem amount must be greater than 0';
  END IF;

  UPDATE gift_cards
  SET
    current_balance = ROUND((current_balance - v_amount)::NUMERIC, 2),
    last_redeemed_at = NOW(),
    is_active = CASE
      WHEN ROUND((current_balance - v_amount)::NUMERIC, 2) <= 0 THEN FALSE
      ELSE is_active
    END
  WHERE code = v_code
    AND is_active = TRUE
    AND current_balance >= v_amount
  RETURNING current_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    SELECT EXISTS(SELECT 1 FROM gift_cards WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Gift card not found';
    END IF;

    IF EXISTS(SELECT 1 FROM gift_cards WHERE code = v_code AND is_active = FALSE) THEN
      RAISE EXCEPTION 'Gift card is inactive';
    END IF;

    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  RETURN ROUND(v_new_balance::NUMERIC, 2);
END;
$$;

CREATE OR REPLACE FUNCTION restore_gift_card_balance(
  p_code TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_amount NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  v_code := UPPER(TRIM(COALESCE(p_code, '')));
  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);

  IF v_code = '' THEN
    RAISE EXCEPTION 'Gift card code is required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Restore amount must be greater than 0';
  END IF;

  UPDATE gift_cards
  SET
    current_balance = ROUND((current_balance + v_amount)::NUMERIC, 2),
    is_active = TRUE
  WHERE code = v_code
  RETURNING current_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  RETURN ROUND(v_new_balance::NUMERIC, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION create_gift_card(NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gift_card_by_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_gift_card(TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restore_gift_card_balance(TEXT, NUMERIC) TO anon, authenticated;
