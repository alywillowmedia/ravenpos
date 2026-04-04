-- Allow admins to customize the idle image shown on the customer-facing POS display.
ALTER TABLE IF EXISTS public.pos_terminal_settings
ADD COLUMN IF NOT EXISTS customer_display_image_url TEXT;
