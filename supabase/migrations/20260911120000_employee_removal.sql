-- Preserve employee references and history while distinguishing removal from deactivation.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- Removed profiles cannot regain PIN or portal access until explicitly restored.
ALTER TABLE public.employees ADD CONSTRAINT employees_removed_inactive
    CHECK (removed_at IS NULL OR is_active = false);
