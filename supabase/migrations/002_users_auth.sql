-- Authentication & User Roles Migration
-- Run this in Supabase SQL Editor after the initial schema
-- 
-- IMPORTANT: If you already ran the previous migration, run the cleanup SQL first:
-- DROP POLICY IF EXISTS "Users can read own record" ON users;
-- DROP POLICY IF EXISTS "Admins can read all users" ON users;
-- DROP POLICY IF EXISTS "Admins can insert users" ON users;
-- DROP POLICY IF EXISTS "Admins can update users" ON users;
-- DROP POLICY IF EXISTS "Admins can delete users" ON users;
-- DROP TABLE IF EXISTS users;
-- Then run this file.

-- Create users table to link Supabase Auth to roles
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'vendor')),
  consignor_id uuid REFERENCES consignors(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_consignor ON users(consignor_id);

-- ================================================
-- Create helper function to check admin status
-- This uses SECURITY DEFINER to bypass RLS and prevent infinite recursion
-- ================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM users WHERE id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get user's consignor_id
CREATE OR REPLACE FUNCTION get_user_consignor_id()
RETURNS uuid AS $$
DECLARE
  cid uuid;
BEGIN
  SELECT consignor_id INTO cid FROM users WHERE id = auth.uid();
  RETURN cid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- RLS Policies for users table
-- ================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Admins can read all users" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can update users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Users can always read their own record (no recursion - direct id check)
CREATE POLICY "Users can read own record" ON users
  FOR SELECT USING (auth.uid() = id);

-- Admins can read all users (uses function to avoid recursion)
CREATE POLICY "Admins can read all users" ON users
  FOR SELECT USING (is_admin());

-- Admins can insert users
CREATE POLICY "Admins can insert users" ON users
  FOR INSERT WITH CHECK (is_admin());

-- Admins can update users
CREATE POLICY "Admins can update users" ON users
  FOR UPDATE USING (is_admin());

-- Admins can delete users
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (is_admin());

-- ================================================
-- Update existing table policies for role-based access
-- ================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all on categories" ON categories;
DROP POLICY IF EXISTS "Allow all on consignors" ON consignors;
DROP POLICY IF EXISTS "Allow all on items" ON items;
DROP POLICY IF EXISTS "Allow all on sales" ON sales;
DROP POLICY IF EXISTS "Allow all on sale_items" ON sale_items;

-- Also drop any policies we may have created before
DROP POLICY IF EXISTS "Anyone can read categories" ON categories;
DROP POLICY IF EXISTS "Admins can modify categories" ON categories;
DROP POLICY IF EXISTS "Admins full access on consignors" ON consignors;
DROP POLICY IF EXISTS "Vendors can read own consignor" ON consignors;
DROP POLICY IF EXISTS "Vendors can update own consignor" ON consignors;
DROP POLICY IF EXISTS "Admins full access on items" ON items;
DROP POLICY IF EXISTS "Vendors can read own items" ON items;
DROP POLICY IF EXISTS "Vendors can insert own items" ON items;
DROP POLICY IF EXISTS "Vendors can update own items" ON items;
DROP POLICY IF EXISTS "Vendors can delete own items" ON items;
DROP POLICY IF EXISTS "Admins full access on sales" ON sales;
DROP POLICY IF EXISTS "Vendors can read sales with their items" ON sales;
DROP POLICY IF EXISTS "Admins full access on sale_items" ON sale_items;
DROP POLICY IF EXISTS "Vendors can read own sale items" ON sale_items;

-- ================================================
-- Categories: Everyone can read, admins can modify
-- ================================================
CREATE POLICY "Anyone can read categories" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Admins can modify categories" ON categories
  FOR ALL USING (is_admin());

-- ================================================
-- Consignors: Admins full access, vendors see only their own
-- ================================================
CREATE POLICY "Admins full access on consignors" ON consignors
  FOR ALL USING (is_admin());

CREATE POLICY "Vendors can read own consignor" ON consignors
  FOR SELECT USING (
    get_user_role() = 'vendor' 
    AND get_user_consignor_id() = id
  );

CREATE POLICY "Vendors can update own consignor" ON consignors
  FOR UPDATE USING (
    get_user_role() = 'vendor' 
    AND get_user_consignor_id() = id
  );

-- ================================================
-- Items: Admins full access, vendors manage their own items
-- ================================================
CREATE POLICY "Admins full access on items" ON items
  FOR ALL USING (is_admin());

CREATE POLICY "Vendors can read own items" ON items
  FOR SELECT USING (
    get_user_role() = 'vendor' 
    AND get_user_consignor_id() = consignor_id
  );

CREATE POLICY "Vendors can insert own items" ON items
  FOR INSERT WITH CHECK (
    get_user_role() = 'vendor' 
    AND get_user_consignor_id() = consignor_id
  );

CREATE POLICY "Vendors can update own items" ON items
  FOR UPDATE USING (
    get_user_role() = 'vendor' 
    AND get_user_consignor_id() = consignor_id
  );

CREATE POLICY "Vendors can delete own items" ON items
  FOR DELETE USING (
    get_user_role() = 'vendor' 
    AND get_user_consignor_id() = consignor_id
  );

-- ================================================
-- Sales: Admins full access, vendors read only
-- ================================================
CREATE POLICY "Admins full access on sales" ON sales
  FOR ALL USING (is_admin());

CREATE POLICY "Vendors can read sales with their items" ON sales
  FOR SELECT USING (
    get_user_role() = 'vendor' 
    AND EXISTS (
      SELECT 1 FROM sale_items 
      WHERE sale_items.sale_id = sales.id 
      AND sale_items.consignor_id = get_user_consignor_id()
    )
  );

-- ================================================
-- Sale Items: Admins full access, vendors read only their items
-- ================================================
CREATE POLICY "Admins full access on sale_items" ON sale_items
  FOR ALL USING (is_admin());

CREATE POLICY "Vendors can read own sale items" ON sale_items
  FOR SELECT USING (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );
