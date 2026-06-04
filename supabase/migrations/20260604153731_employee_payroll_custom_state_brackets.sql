-- Add employer-configurable progressive state withholding brackets.

ALTER TABLE public.payroll_business_profiles
  ADD COLUMN IF NOT EXISTS custom_state_standard_deduction DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_state_brackets JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.payroll_business_profiles
  DROP CONSTRAINT IF EXISTS payroll_business_profiles_state_withholding_method_check;

ALTER TABLE public.payroll_business_profiles
  ADD CONSTRAINT payroll_business_profiles_state_withholding_method_check
  CHECK (state_withholding_method IN ('custom_rate', 'custom_brackets', 'virginia_brackets'));

ALTER TABLE public.payroll_business_profiles
  DROP CONSTRAINT IF EXISTS payroll_business_profiles_custom_state_brackets_array_check;

ALTER TABLE public.payroll_business_profiles
  ADD CONSTRAINT payroll_business_profiles_custom_state_brackets_array_check
  CHECK (jsonb_typeof(custom_state_brackets) = 'array');

COMMENT ON COLUMN public.payroll_business_profiles.custom_state_standard_deduction IS
  'Annual deduction amount subtracted before applying custom progressive state withholding brackets.';

COMMENT ON COLUMN public.payroll_business_profiles.custom_state_brackets IS
  'Manual progressive state withholding brackets. Each item stores threshold, baseTax, and rate as decimal values.';
