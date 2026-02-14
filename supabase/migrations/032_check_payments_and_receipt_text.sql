-- Add check payment support and check number tracking.

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS check_number TEXT;

ALTER TABLE sales
DROP CONSTRAINT IF EXISTS valid_payment_method;

ALTER TABLE sales
DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE sales
ADD CONSTRAINT valid_payment_method
CHECK (payment_method IN ('cash', 'card', 'check'));

ALTER TABLE refunds
DROP CONSTRAINT IF EXISTS refunds_payment_method_check;

ALTER TABLE refunds
DROP CONSTRAINT IF EXISTS valid_refund_payment_method;

ALTER TABLE refunds
ADD CONSTRAINT valid_refund_payment_method
CHECK (payment_method IN ('cash', 'card', 'check'));

CREATE INDEX IF NOT EXISTS idx_sales_check_number
  ON sales(check_number)
  WHERE check_number IS NOT NULL;

COMMENT ON COLUMN sales.payment_method IS 'Payment method: cash, check, or card (Stripe Terminal)';
COMMENT ON COLUMN sales.check_number IS 'Optional check number for check payments.';
