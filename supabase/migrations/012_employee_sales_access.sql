-- Employee Sales Access Migration
-- Allows employees (anonymous users via PIN auth) to read and insert sales data
-- This enables customer order history viewing and POS transaction processing

-- ================================================
-- Sales table policies for employee access
-- ================================================

-- Allow anonymous/employee read access to sales (for order history)
CREATE POLICY "Anyone can read sales" ON sales
  FOR SELECT USING (true);

-- Allow anyone to insert sales (for POS transactions)
CREATE POLICY "Anyone can insert sales" ON sales
  FOR INSERT WITH CHECK (true);

-- ================================================
-- Sale Items table policies for employee access
-- ================================================

-- Allow read access to sale_items (for order history details)
CREATE POLICY "Anyone can read sale_items" ON sale_items
  FOR SELECT USING (true);

-- Allow anyone to insert sale_items (for POS transactions)
CREATE POLICY "Anyone can insert sale_items" ON sale_items
  FOR INSERT WITH CHECK (true);
