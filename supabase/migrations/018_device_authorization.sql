-- Device Authorization System Migration
-- Requires admin to authorize a device before employees can access the login page

-- ================================================
-- Device Authorizations Table
-- Stores device tokens with expiration
-- ================================================
CREATE TABLE IF NOT EXISTS device_authorizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_token TEXT NOT NULL UNIQUE,
  authorized_by UUID REFERENCES auth.users(id),
  authorized_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  device_name TEXT,  -- Optional label (e.g., "Front Register")
  revoked_at TIMESTAMPTZ,  -- For manual revocation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_device_auth_token ON device_authorizations(device_token);
CREATE INDEX IF NOT EXISTS idx_device_auth_expires ON device_authorizations(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_auth_revoked ON device_authorizations(revoked_at);

-- ================================================
-- Row Level Security
-- ================================================
ALTER TABLE device_authorizations ENABLE ROW LEVEL SECURITY;

-- Only admins can manage device authorizations
DROP POLICY IF EXISTS "Admins can manage device authorizations" ON device_authorizations;
CREATE POLICY "Admins can manage device authorizations" ON device_authorizations
  FOR ALL USING (is_admin());

-- Allow anon to verify tokens (needed for employee login check)
DROP POLICY IF EXISTS "Anyone can verify device tokens" ON device_authorizations;
CREATE POLICY "Anyone can verify device tokens" ON device_authorizations
  FOR SELECT USING (true);
