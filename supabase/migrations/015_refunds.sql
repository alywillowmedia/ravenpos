-- Refund System Migration
-- Adds refunds table and refund_status to sales

-- Create refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  refund_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  stripe_refund_id TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  processed_by UUID, -- Future: employee reference
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add refund_status to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS refund_status TEXT 
CHECK (refund_status IS NULL OR refund_status IN ('partial', 'full'));

-- Indexes for refunds table
CREATE INDEX IF NOT EXISTS idx_refunds_sale_id ON refunds(sale_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_customer_id ON refunds(customer_id);

-- Enable RLS on refunds
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Allow all operations on refunds (matching existing MVP pattern)
CREATE POLICY "Allow all on refunds" ON refunds FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE refunds IS 'Tracks all refunds issued for sales';
COMMENT ON COLUMN refunds.items IS 'JSON array of {item_id, sale_item_id, quantity, restocked}';
COMMENT ON COLUMN refunds.stripe_refund_id IS 'Stripe Refund ID for card payment refunds';
COMMENT ON COLUMN sales.refund_status IS 'null = no refund, partial = some items refunded, full = all items refunded';
