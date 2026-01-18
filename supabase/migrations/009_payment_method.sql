-- Add payment method tracking to sales table
-- Supports cash and card (Stripe Terminal) payments

-- Add payment_method column with default 'cash' for existing records
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

-- Add stripe_payment_intent_id for card payments
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Add check constraint for valid payment methods
ALTER TABLE sales
ADD CONSTRAINT valid_payment_method
CHECK (payment_method IN ('cash', 'card'));

-- Add index for payment method queries
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);

-- Comment for documentation
COMMENT ON COLUMN sales.payment_method IS 'Payment method: cash or card (Stripe Terminal)';
COMMENT ON COLUMN sales.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for card transactions';
