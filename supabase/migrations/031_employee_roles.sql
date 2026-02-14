-- Employee role/type management
-- Adds admin-manageable employee_roles and removes hardcoded employment_type check constraint.

CREATE TABLE IF NOT EXISTS employee_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_roles_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_roles_name_lower_unique
  ON employee_roles (lower(name));

CREATE INDEX IF NOT EXISTS idx_employee_roles_active_sort
  ON employee_roles (is_active, sort_order, name);

DROP TRIGGER IF EXISTS update_employee_roles_updated_at ON employee_roles;
CREATE TRIGGER update_employee_roles_updated_at
  BEFORE UPDATE ON employee_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE employee_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage employee roles" ON employee_roles;
CREATE POLICY "Admins can manage employee roles" ON employee_roles
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

INSERT INTO employee_roles (name, sort_order)
VALUES
  ('Production', 10),
  ('Sales', 20),
  ('Shipping Dept.', 30)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'employees'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%employment_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employees DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
