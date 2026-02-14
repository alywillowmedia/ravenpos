-- Optional future activation date for consignors

ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS scheduled_active_date DATE;

CREATE INDEX IF NOT EXISTS idx_consignors_scheduled_active_date
  ON consignors (scheduled_active_date);

COMMENT ON COLUMN consignors.scheduled_active_date IS
  'If set to a future date, consignor is treated as scheduled until this date.';

