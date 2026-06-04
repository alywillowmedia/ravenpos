-- Track partial invoice payments and reconcile vendor invoices from payouts.

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE public.invoices
SET amount_paid = total
WHERE status = 'paid'
  AND amount_paid = 0;

ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
ADD CONSTRAINT invoices_status_check
CHECK (status IN ('unpaid', 'partially_paid', 'paid'));

ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_amount_paid_check;

ALTER TABLE public.invoices
ADD CONSTRAINT invoices_amount_paid_check
CHECK (amount_paid >= 0 AND amount_paid <= total);

ALTER TABLE public.payouts
ADD COLUMN IF NOT EXISTS invoice_deduction NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.amount_paid IS 'Total amount applied to this invoice through direct payments or payout deductions.';
COMMENT ON COLUMN public.payouts.invoice_deduction IS 'Total vendor invoice balance deducted from this payout.';

CREATE TABLE IF NOT EXISTS public.invoice_payout_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payout_id UUID NOT NULL REFERENCES public.payouts(id) ON DELETE CASCADE,
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payout_deductions_invoice
  ON public.invoice_payout_deductions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payout_deductions_payout
  ON public.invoice_payout_deductions(payout_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payout_deductions_consignor
  ON public.invoice_payout_deductions(consignor_id, created_at DESC);

ALTER TABLE public.invoice_payout_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated app users can manage invoice payout deductions"
ON public.invoice_payout_deductions;
CREATE POLICY "Authenticated app users can manage invoice payout deductions"
ON public.invoice_payout_deductions
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Vendors can read own invoice payout deductions"
ON public.invoice_payout_deductions;
CREATE POLICY "Vendors can read own invoice payout deductions"
ON public.invoice_payout_deductions
FOR SELECT
USING (
  get_user_role() = 'vendor'
  AND consignor_id = get_user_consignor_id()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payout_deductions TO authenticated;
GRANT ALL ON public.invoice_payout_deductions TO service_role;
