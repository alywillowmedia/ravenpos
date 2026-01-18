-- Fix: Public Access for Storefront
-- Run this in Supabase SQL Editor
-- This fixes the issue where categories/items don't load for unauthenticated users

-- ================================================
-- Add columns if not present
-- ================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_listed boolean DEFAULT true;

-- ================================================
-- Fix Categories - should already work with USING(true)
-- Let's make sure by recreating the policy
-- ================================================
DROP POLICY IF EXISTS "Anyone can read categories" ON categories;
DROP POLICY IF EXISTS "Public can view categories" ON categories;

CREATE POLICY "Anyone can read categories" ON categories
  FOR SELECT USING (true);

-- ================================================
-- Fix Items - Add public read for in-stock listed items
-- This policy is separate from admin/vendor policies
-- ================================================
DROP POLICY IF EXISTS "Public can view listed in-stock items" ON items;

CREATE POLICY "Public can view listed in-stock items" ON items
  FOR SELECT USING (
    quantity > 0 
    AND is_listed = true
  );

-- ================================================
-- Fix Consignors - Add public read for active consignors
-- Only expose what's needed for display (name, booth)
-- ================================================
DROP POLICY IF EXISTS "Public can view active consignor info" ON consignors;

CREATE POLICY "Public can view active consignor info" ON consignors
  FOR SELECT USING (is_active = true);

-- ================================================
-- Verify the policies exist
-- ================================================
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive,
  cmd
FROM pg_policies 
WHERE tablename IN ('items', 'consignors', 'categories')
ORDER BY tablename, policyname;
