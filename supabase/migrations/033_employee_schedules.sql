-- Employee schedules for admin planning

CREATE TABLE IF NOT EXISTS employee_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_schedules_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_employee_schedules_date
  ON employee_schedules (shift_date);

CREATE INDEX IF NOT EXISTS idx_employee_schedules_employee_date
  ON employee_schedules (employee_id, shift_date);

DROP TRIGGER IF EXISTS update_employee_schedules_updated_at ON employee_schedules;
CREATE TRIGGER update_employee_schedules_updated_at
  BEFORE UPDATE ON employee_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE employee_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read employee schedules" ON employee_schedules;
CREATE POLICY "Anyone can read employee schedules" ON employee_schedules
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage employee schedules" ON employee_schedules;
CREATE POLICY "Admins can manage employee schedules" ON employee_schedules
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
