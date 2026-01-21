-- Custom Discounts Support
-- Adds discount columns to sales and sale_items tables

-- Order-level discounts stored as JSONB on sales
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS discounts JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS discount_total DECIMAL(10,2) DEFAULT 0;

-- Item-level discount columns on sale_items
ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed')),
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_reason TEXT;

-- Index for analytics on discounted sales
CREATE INDEX IF NOT EXISTS idx_sales_discount_total ON sales(discount_total) WHERE discount_total > 0;

-- Comments for documentation
COMMENT ON COLUMN sales.discounts IS 'Array of order-level discounts: [{type, value, reason, calculatedAmount}]';
COMMENT ON COLUMN sales.discount_total IS 'Total dollar amount of all discounts applied to this sale';
COMMENT ON COLUMN sale_items.discount_type IS 'Type of item-level discount: percentage or fixed';
COMMENT ON COLUMN sale_items.discount_value IS 'Discount value: percentage (0-100) or dollar amount';
COMMENT ON COLUMN sale_items.discount_amount IS 'Calculated dollar amount discounted from this line item';
COMMENT ON COLUMN sale_items.discount_reason IS 'Optional reason/note for the discount';
