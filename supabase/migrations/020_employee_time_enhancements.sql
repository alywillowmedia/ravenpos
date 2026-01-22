-- Employee Time Management Enhancements Migration
-- Adds employee categorization fields, time entry editing, and audit trail

-- ================================================
-- Employee Categorization Fields
-- ================================================

-- Employer field (Ravenlia or Alywillow)
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS employer TEXT CHECK (employer IN ('Ravenlia', 'Alywillow'));

-- Employment type field
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS employment_type TEXT CHECK (employment_type IN ('Production', 'Sales', 'Shipping Dept.'));

-- ================================================
-- Time Entry Enhancements
-- ================================================

-- Lunch break tracking (in minutes)
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS lunch_break_minutes INTEGER DEFAULT 0;

-- Audit trail for admin edits
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS edited_by_admin_id UUID REFERENCES auth.users(id);

ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- ================================================
-- Create indexes for new columns
-- ================================================
CREATE INDEX IF NOT EXISTS idx_employees_employer ON employees(employer);
CREATE INDEX IF NOT EXISTS idx_employees_employment_type ON employees(employment_type);
CREATE INDEX IF NOT EXISTS idx_time_entries_edited ON time_entries(edited_at) WHERE edited_at IS NOT NULL;
