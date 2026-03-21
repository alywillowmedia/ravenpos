-- Shared POS terminal settings (store-wide, admin-managed)
-- Allows Stripe Terminal location/mode to persist across all accounts.

CREATE TABLE IF NOT EXISTS public.pos_terminal_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  reader_mode TEXT NOT NULL DEFAULT 'simulated' CHECK (reader_mode IN ('simulated', 'live')),
  stripe_location_id TEXT NOT NULL DEFAULT '',
  auto_reconnect BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.pos_terminal_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS pos_terminal_settings_updated_at ON public.pos_terminal_settings;
CREATE TRIGGER pos_terminal_settings_updated_at
  BEFORE UPDATE ON public.pos_terminal_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pos_terminal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view POS terminal settings" ON public.pos_terminal_settings;
CREATE POLICY "Authenticated can view POS terminal settings"
ON public.pos_terminal_settings
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage POS terminal settings" ON public.pos_terminal_settings;
CREATE POLICY "Admins can manage POS terminal settings"
ON public.pos_terminal_settings
FOR ALL
USING ((SELECT is_admin()))
WITH CHECK ((SELECT is_admin()));

GRANT SELECT ON public.pos_terminal_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pos_terminal_settings TO authenticated;
