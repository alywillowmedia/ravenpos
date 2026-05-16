-- Add split tender support to POS sales.
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS payment_breakdown JSONB;

ALTER TABLE public.sales
DROP CONSTRAINT IF EXISTS valid_payment_method;

ALTER TABLE public.sales
DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE public.sales
ADD CONSTRAINT valid_payment_method
CHECK (payment_method IN ('cash', 'card', 'check', 'split'));

CREATE INDEX IF NOT EXISTS idx_sales_payment_breakdown_gin
ON public.sales
USING GIN (payment_breakdown)
WHERE payment_breakdown IS NOT NULL;

COMMENT ON COLUMN public.sales.payment_method IS 'Payment method: cash, check, card (Stripe Terminal), or split tender.';
COMMENT ON COLUMN public.sales.payment_breakdown IS 'Tender breakdown for split payments, stored as cash/card/check entries with amounts and optional tender details.';
