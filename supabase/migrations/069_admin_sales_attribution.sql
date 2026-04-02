-- Track which authenticated user processed a sale (admin/vendor portal users)
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS processed_by_user UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_processed_by_user ON sales(processed_by_user);
