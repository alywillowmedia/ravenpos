-- Public home hero settings (admin-managed, publicly readable)

CREATE TABLE IF NOT EXISTS public.storefront_home_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  store_name TEXT NOT NULL DEFAULT 'Ravenlia Galleria',
  hero_badge_text TEXT NOT NULL DEFAULT 'Curated Marketplace',
  hero_heading TEXT NOT NULL DEFAULT 'Ravenlia Galleria',
  hero_subheading TEXT NOT NULL DEFAULT 'Where art lives, stories linger, and community gathers.',
  hero_body TEXT NOT NULL DEFAULT 'Explore local antiques, handmade goods, and uncommon finds online, then visit us in person.',
  hero_search_placeholder TEXT NOT NULL DEFAULT 'Search for items...',
  hero_primary_cta_label TEXT,
  hero_primary_cta_href TEXT,
  hero_background_image_url TEXT,
  hero_feature_image_url TEXT,
  hero_accent_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.storefront_home_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS storefront_home_settings_updated_at ON public.storefront_home_settings;
CREATE TRIGGER storefront_home_settings_updated_at
  BEFORE UPDATE ON public.storefront_home_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.storefront_home_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view storefront home settings" ON public.storefront_home_settings;
CREATE POLICY "Public can view storefront home settings"
ON public.storefront_home_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage storefront home settings" ON public.storefront_home_settings;
CREATE POLICY "Admins can manage storefront home settings"
ON public.storefront_home_settings
FOR ALL
USING ((SELECT is_admin()))
WITH CHECK ((SELECT is_admin()));

GRANT SELECT ON public.storefront_home_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.storefront_home_settings TO authenticated;
