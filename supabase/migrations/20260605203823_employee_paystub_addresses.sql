-- Structured payroll addresses and payout-time paystub identity snapshots.

ALTER TABLE public.payroll_business_profiles
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.employee_payouts
  ADD COLUMN IF NOT EXISTS employer_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS employer_fein_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS employer_address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS employee_address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.employee_payouts
  DROP CONSTRAINT IF EXISTS employee_payouts_employer_address_snapshot_object_check;

ALTER TABLE public.employee_payouts
  ADD CONSTRAINT employee_payouts_employer_address_snapshot_object_check
  CHECK (jsonb_typeof(employer_address_snapshot) = 'object');

ALTER TABLE public.employee_payouts
  DROP CONSTRAINT IF EXISTS employee_payouts_employee_address_snapshot_object_check;

ALTER TABLE public.employee_payouts
  ADD CONSTRAINT employee_payouts_employee_address_snapshot_object_check
  CHECK (jsonb_typeof(employee_address_snapshot) = 'object');

COMMENT ON COLUMN public.payroll_business_profiles.address_line_1 IS
  'Primary mailing street address used on employee paystubs.';
COMMENT ON COLUMN public.payroll_business_profiles.address_line_2 IS
  'Secondary mailing address line used on employee paystubs.';
COMMENT ON COLUMN public.payroll_business_profiles.city IS
  'Business payroll mailing address city.';
COMMENT ON COLUMN public.payroll_business_profiles.state IS
  'Business payroll mailing address state or province.';
COMMENT ON COLUMN public.payroll_business_profiles.postal_code IS
  'Business payroll mailing address ZIP or postal code.';
COMMENT ON COLUMN public.payroll_business_profiles.country IS
  'Business payroll mailing address country.';

COMMENT ON COLUMN public.employees.address_line_1 IS
  'Employee mailing street address used for payroll records and paystubs.';
COMMENT ON COLUMN public.employees.address_line_2 IS
  'Employee secondary mailing address line used for payroll records and paystubs.';
COMMENT ON COLUMN public.employees.city IS
  'Employee mailing address city.';
COMMENT ON COLUMN public.employees.state IS
  'Employee mailing address state or province.';
COMMENT ON COLUMN public.employees.postal_code IS
  'Employee mailing address ZIP or postal code.';
COMMENT ON COLUMN public.employees.country IS
  'Employee mailing address country.';

COMMENT ON COLUMN public.employee_payouts.employer_name_snapshot IS
  'Employer legal name captured when the payout was recorded for historical paystub accuracy.';
COMMENT ON COLUMN public.employee_payouts.employer_fein_snapshot IS
  'Employer FEIN captured when the payout was recorded for historical paystub accuracy.';
COMMENT ON COLUMN public.employee_payouts.employer_address_snapshot IS
  'Employer mailing address captured when the payout was recorded for historical paystub accuracy.';
COMMENT ON COLUMN public.employee_payouts.employee_name_snapshot IS
  'Employee name captured when the payout was recorded for historical paystub accuracy.';
COMMENT ON COLUMN public.employee_payouts.employee_address_snapshot IS
  'Employee mailing address captured when the payout was recorded for historical paystub accuracy.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_business_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payroll_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payouts TO authenticated;

GRANT ALL ON public.employees TO service_role;
GRANT ALL ON public.payroll_business_profiles TO service_role;
GRANT ALL ON public.employee_payroll_profiles TO service_role;
GRANT ALL ON public.employee_payouts TO service_role;
