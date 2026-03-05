-- Harden employee auth surface:
-- 1) Stop public enumeration of device authorization tokens.
-- 2) Add server-side table for PIN brute-force throttling.

-- Remove permissive SELECT policy that allowed any caller to read all device tokens.
DROP POLICY IF EXISTS "Anyone can verify device tokens" ON public.device_authorizations;

-- Track PIN verification attempts per anonymous auth user.
CREATE TABLE IF NOT EXISTS public.employee_pin_attempts (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);

ALTER TABLE public.employee_pin_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage employee PIN attempts" ON public.employee_pin_attempts;
CREATE POLICY "Service role can manage employee PIN attempts"
  ON public.employee_pin_attempts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
