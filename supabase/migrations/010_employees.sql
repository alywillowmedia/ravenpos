-- Employee Management System Migration
-- Creates employees table, time_entries table, and adds employee tracking to sales

-- ================================================
-- Employees Table
-- Stores employee information for PIN-based auth
-- ================================================
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,  -- SHA-256 hash of PIN
  pin_salt TEXT NOT NULL,  -- Unique salt per employee
  hourly_rate DECIMAL(10,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure we can look up by active status
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

-- Apply updated_at trigger
CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================
-- Time Entries Table
-- Tracks employee clock in/out times
-- ================================================
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  total_hours DECIMAL(10,2),  -- Calculated on clock out
  notes TEXT,  -- Admin can add notes about the shift
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for time entries queries
CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_open ON time_entries(employee_id) WHERE clock_out IS NULL;

-- ================================================
-- Add employee tracking to sales
-- ================================================
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS processed_by_employee UUID REFERENCES employees(id);

CREATE INDEX IF NOT EXISTS idx_sales_employee ON sales(processed_by_employee);

-- ================================================
-- Row Level Security
-- ================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "Admins can manage employees" ON employees;
DROP POLICY IF EXISTS "Admins can manage time entries" ON time_entries;
DROP POLICY IF EXISTS "Service role bypass for employees" ON employees;
DROP POLICY IF EXISTS "Service role bypass for time entries" ON time_entries;

-- Only authenticated admin users can view/manage employees
CREATE POLICY "Admins can manage employees" ON employees
  FOR ALL USING (is_admin());

-- Only authenticated admin users can view/manage time entries
CREATE POLICY "Admins can manage time entries" ON time_entries
  FOR ALL USING (is_admin());

-- Allow service role to bypass RLS (for edge function)
-- The service role key automatically bypasses RLS, so no explicit policy needed
-- But we create one for clarity
CREATE POLICY "Service role bypass for employees" ON employees
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role bypass for time entries" ON time_entries
  FOR ALL USING (auth.role() = 'service_role');
