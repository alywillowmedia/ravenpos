-- RavenPOS Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories table (for tax rates)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  tax_rate DECIMAL(5,4) DEFAULT 0.0530,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO categories (name, tax_rate) VALUES
  ('Clothing', 0.0530),
  ('Accessories', 0.0530),
  ('Collectibles', 0.0530),
  ('Books', 0.0000),
  ('Furniture', 0.0530),
  ('Electronics', 0.0530),
  ('Art', 0.0530),
  ('Jewelry', 0.0530),
  ('Vintage', 0.0530),
  ('Other', 0.0530);

-- Consignors table
CREATE TABLE consignors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consignor_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  booth_location TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  commission_split DECIMAL(3,2) DEFAULT 0.60,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items table
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  variant TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  quantity INTEGER DEFAULT 1,
  qty_unlabeled INTEGER DEFAULT 0,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales table
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  cash_tendered DECIMAL(10,2),
  change_given DECIMAL(10,2)
);

-- Sale items table (snapshot of item at time of sale)
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  consignor_id UUID NOT NULL REFERENCES consignors(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  commission_split DECIMAL(3,2) NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_items_consignor ON items(consignor_id);
CREATE INDEX idx_items_sku ON items(sku);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_consignor ON sale_items(consignor_id);
CREATE INDEX idx_sales_completed_at ON sales(completed_at);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER consignors_updated_at
  BEFORE UPDATE ON consignors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (enable for all tables)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignors ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- Policies: Allow all operations for authenticated and anon users (MVP - no auth)
CREATE POLICY "Allow all on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on consignors" ON consignors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on items" ON items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on sales" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on sale_items" ON sale_items FOR ALL USING (true) WITH CHECK (true);
