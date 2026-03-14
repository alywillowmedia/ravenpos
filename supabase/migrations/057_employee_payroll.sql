-- Employee payroll setup and payout tracking

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.payroll_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer TEXT NOT NULL UNIQUE CHECK (employer IN ('Ravenlia', 'Alywillow')),
  legal_name TEXT NOT NULL,
  fein TEXT,
  tax_state TEXT NOT NULL,
  state_withholding_method TEXT NOT NULL DEFAULT 'custom_rate'
    CHECK (state_withholding_method IN ('custom_rate', 'virginia_brackets')),
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  state_income_tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  local_income_tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  state_unemployment_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  state_unemployment_wage_base DECIMAL(10,2) NOT NULL DEFAULT 7000,
  futa_rate DECIMAL(7,4) NOT NULL DEFAULT 0.006,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payroll_business_profiles
  ADD COLUMN IF NOT EXISTS state_withholding_method TEXT NOT NULL DEFAULT 'custom_rate';
ALTER TABLE public.payroll_business_profiles
  DROP CONSTRAINT IF EXISTS payroll_business_profiles_state_withholding_method_check;
ALTER TABLE public.payroll_business_profiles
  ADD CONSTRAINT payroll_business_profiles_state_withholding_method_check
  CHECK (state_withholding_method IN ('custom_rate', 'virginia_brackets'));
ALTER TABLE public.payroll_business_profiles
  ADD COLUMN IF NOT EXISTS state_unemployment_wage_base DECIMAL(10,2) NOT NULL DEFAULT 7000;

CREATE TRIGGER payroll_business_profiles_updated_at
  BEFORE UPDATE ON public.payroll_business_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_payroll_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  tax_classification TEXT NOT NULL CHECK (tax_classification IN ('w2', '1099')),
  federal_filing_status TEXT NOT NULL DEFAULT 'single'
    CHECK (federal_filing_status IN ('single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household')),
  step_2_checked BOOLEAN NOT NULL DEFAULT false,
  dependents_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  other_income DECIMAL(10,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
  extra_withholding DECIMAL(10,2) NOT NULL DEFAULT 0,
  federal_exempt BOOLEAN NOT NULL DEFAULT false,
  state_exempt BOOLEAN NOT NULL DEFAULT false,
  state_additional_withholding DECIMAL(10,2) NOT NULL DEFAULT 0,
  state_personal_exemptions INTEGER NOT NULL DEFAULT 0,
  state_additional_exemptions INTEGER NOT NULL DEFAULT 0,
  backup_withholding_enabled BOOLEAN NOT NULL DEFAULT false,
  prior_ytd_wages DECIMAL(10,2) NOT NULL DEFAULT 0,
  prior_ytd_social_security_wages DECIMAL(10,2) NOT NULL DEFAULT 0,
  prior_ytd_medicare_wages DECIMAL(10,2) NOT NULL DEFAULT 0,
  prior_ytd_federal_withheld DECIMAL(10,2) NOT NULL DEFAULT 0,
  prior_ytd_state_withheld DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.employee_payroll_profiles
  ADD COLUMN IF NOT EXISTS state_personal_exemptions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.employee_payroll_profiles
  ADD COLUMN IF NOT EXISTS state_additional_exemptions INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER employee_payroll_profiles_updated_at
  BEFORE UPDATE ON public.employee_payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  business_profile_id UUID REFERENCES public.payroll_business_profiles(id) ON DELETE SET NULL,
  payroll_profile_id UUID REFERENCES public.employee_payroll_profiles(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hours_worked DECIMAL(10,2) NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross_pay DECIMAL(10,2) NOT NULL DEFAULT 0,
  federal_withholding DECIMAL(10,2) NOT NULL DEFAULT 0,
  social_security_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  medicare_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  additional_medicare_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  state_withholding DECIMAL(10,2) NOT NULL DEFAULT 0,
  local_withholding DECIMAL(10,2) NOT NULL DEFAULT 0,
  contractor_backup_withholding DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(10,2) NOT NULL DEFAULT 0,
  employer_social_security_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  employer_medicare_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  employer_futa_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  employer_suta_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_method TEXT NOT NULL DEFAULT 'direct_deposit'
    CHECK (payout_method IN ('direct_deposit', 'check', 'cash', 'other')),
  check_number TEXT,
  notes TEXT,
  created_by_admin_id UUID,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_payouts_period_valid CHECK (period_end >= period_start)
);

ALTER TABLE public.employee_payouts
  ADD COLUMN IF NOT EXISTS payout_method TEXT NOT NULL DEFAULT 'direct_deposit';
ALTER TABLE public.employee_payouts
  DROP CONSTRAINT IF EXISTS employee_payouts_payout_method_check;
ALTER TABLE public.employee_payouts
  ADD CONSTRAINT employee_payouts_payout_method_check
  CHECK (payout_method IN ('direct_deposit', 'check', 'cash', 'other'));
ALTER TABLE public.employee_payouts
  ADD COLUMN IF NOT EXISTS check_number TEXT;

CREATE INDEX IF NOT EXISTS idx_payroll_business_profiles_employer
  ON public.payroll_business_profiles(employer);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_profiles_employee
  ON public.employee_payroll_profiles(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_payouts_employee
  ON public.employee_payouts(employee_id, paid_at DESC);

ALTER TABLE public.payroll_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage payroll business profiles" ON public.payroll_business_profiles;
CREATE POLICY "Admins can manage payroll business profiles"
ON public.payroll_business_profiles
FOR ALL USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage employee payroll profiles" ON public.employee_payroll_profiles;
CREATE POLICY "Admins can manage employee payroll profiles"
ON public.employee_payroll_profiles
FOR ALL USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage employee payouts" ON public.employee_payouts;
CREATE POLICY "Admins can manage employee payouts"
ON public.employee_payouts
FOR ALL USING (is_admin())
WITH CHECK (is_admin());

COMMENT ON TABLE public.payroll_business_profiles IS 'Employer-level payroll tax configuration used for employee payout calculations.';
COMMENT ON TABLE public.employee_payroll_profiles IS 'Employee tax setup used to estimate withholding for payroll runs.';
COMMENT ON TABLE public.employee_payouts IS 'Recorded employee payout runs and their tax calculations.';
