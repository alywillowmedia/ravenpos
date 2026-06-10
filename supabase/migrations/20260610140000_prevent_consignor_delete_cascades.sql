-- Keep vendor/consignor history immutable. Vendor removal should be handled by
-- setting consignors.is_active = false, not by deleting the consignor row.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_consignor_id_fkey;
ALTER TABLE public.users
  ADD CONSTRAINT users_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_consignor_id_fkey;
ALTER TABLE public.items
  ADD CONSTRAINT items_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_consignor_id_fkey;
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.booth_rent_payments
  DROP CONSTRAINT IF EXISTS booth_rent_payments_consignor_id_fkey;
ALTER TABLE public.booth_rent_payments
  ADD CONSTRAINT booth_rent_payments_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.marketing_fee_allocations
  DROP CONSTRAINT IF EXISTS marketing_fee_allocations_consignor_id_fkey;
ALTER TABLE public.marketing_fee_allocations
  ADD CONSTRAINT marketing_fee_allocations_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.consignor_rate_schedules
  DROP CONSTRAINT IF EXISTS consignor_rate_schedules_consignor_id_fkey;
ALTER TABLE public.consignor_rate_schedules
  ADD CONSTRAINT consignor_rate_schedules_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_consignor_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_consignor_id_fkey;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_consignor_id_fkey;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.vendor_ledger_entries
  DROP CONSTRAINT IF EXISTS vendor_ledger_entries_consignor_id_fkey;
ALTER TABLE public.vendor_ledger_entries
  ADD CONSTRAINT vendor_ledger_entries_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_pricing_discounts
  DROP CONSTRAINT IF EXISTS inventory_pricing_discounts_consignor_id_fkey;
ALTER TABLE public.inventory_pricing_discounts
  ADD CONSTRAINT inventory_pricing_discounts_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_payout_deductions
  DROP CONSTRAINT IF EXISTS invoice_payout_deductions_consignor_id_fkey;
ALTER TABLE public.invoice_payout_deductions
  ADD CONSTRAINT invoice_payout_deductions_consignor_id_fkey
  FOREIGN KEY (consignor_id) REFERENCES public.consignors(id) ON DELETE RESTRICT;
