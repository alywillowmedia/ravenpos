-- Scheduled consignor commission and booth-rent changes

CREATE TABLE IF NOT EXISTS consignor_rate_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  commission_split DECIMAL(3,2) NOT NULL CHECK (commission_split >= 0 AND commission_split <= 1),
  monthly_booth_rent DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (monthly_booth_rent >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consignor_rate_schedules_unique_effective_date UNIQUE (consignor_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_consignor_rate_schedules_consignor_date
  ON consignor_rate_schedules (consignor_id, effective_date DESC);

ALTER TABLE consignor_rate_schedules ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_consignor_rate_schedules_updated_at ON consignor_rate_schedules;
CREATE TRIGGER update_consignor_rate_schedules_updated_at
  BEFORE UPDATE ON consignor_rate_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Admins can manage consignor rate schedules" ON consignor_rate_schedules;
CREATE POLICY "Admins can manage consignor rate schedules" ON consignor_rate_schedules
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

