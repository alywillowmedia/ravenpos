-- Vendor storefront profile + item visibility controls

-- ================================================
-- Consignor storefront profile fields
-- ================================================
ALTER TABLE public.consignors
  ADD COLUMN IF NOT EXISTS storefront_display_name TEXT,
  ADD COLUMN IF NOT EXISTS storefront_description TEXT,
  ADD COLUMN IF NOT EXISTS storefront_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS storefront_header_image_url TEXT,
  ADD COLUMN IF NOT EXISTS storefront_show_items BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storefront_images_only BOOLEAN NOT NULL DEFAULT false;

-- ================================================
-- Item-level storefront controls
-- ================================================
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS show_in_public_browse BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storefront_featured BOOLEAN NOT NULL DEFAULT false;

-- Optimize browse queries (public catalog)
CREATE INDEX IF NOT EXISTS idx_items_public_browse
  ON public.items (created_at DESC)
  WHERE quantity > 0
    AND is_listed = true
    AND show_in_public_browse = true;

-- Optimize vendor featured query
CREATE INDEX IF NOT EXISTS idx_items_storefront_featured
  ON public.items (consignor_id, updated_at DESC)
  WHERE quantity > 0
    AND is_listed = true
    AND storefront_featured = true;
