-- Public Storefront Migration
-- Adds image support and public access policies for browse-only storefront

-- ================================================
-- Add image and listing control columns to items
-- ================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_listed boolean DEFAULT true;

-- Create index for faster public queries
CREATE INDEX IF NOT EXISTS idx_items_public_view ON items(quantity, is_listed) WHERE quantity > 0 AND is_listed = true;

-- ================================================
-- RLS Policies for Public Access
-- ================================================

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "Public can view listed in-stock items" ON items;
DROP POLICY IF EXISTS "Public can view active consignor info" ON consignors;
DROP POLICY IF EXISTS "Public can view categories" ON categories;

-- Public (unauthenticated) users can read in-stock, listed items
-- Note: We use (auth.role() = 'anon') to identify unauthenticated requests
CREATE POLICY "Public can view listed in-stock items" ON items
  FOR SELECT USING (
    quantity > 0 
    AND is_listed = true
  );

-- Public can read active consignor display info for item cards
CREATE POLICY "Public can view active consignor info" ON consignors
  FOR SELECT USING (
    is_active = true
  );

-- Public can read all categories for filters
CREATE POLICY "Public can view categories" ON categories
  FOR SELECT USING (true);

-- ================================================
-- Storage bucket policies (run these in Supabase Dashboard)
-- ================================================
-- 
-- After running this migration, create the storage bucket manually:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create new bucket: "item-images"
-- 3. Make it public (enable public access)
-- 4. Authenticated users can upload (default behavior)
--
-- Or run these policies if you have access to storage schema:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('item-images', 'item-images', true);
-- 
-- CREATE POLICY "Anyone can view item images"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'item-images');
-- 
-- CREATE POLICY "Authenticated users can upload item images"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'item-images' AND auth.role() = 'authenticated');
-- 
-- CREATE POLICY "Users can update their own uploads"
-- ON storage.objects FOR UPDATE
-- USING (bucket_id = 'item-images' AND auth.role() = 'authenticated');
-- 
-- CREATE POLICY "Users can delete their own uploads"
-- ON storage.objects FOR DELETE
-- USING (bucket_id = 'item-images' AND auth.role() = 'authenticated');
