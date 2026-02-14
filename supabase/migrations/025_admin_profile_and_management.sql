-- Admin profile fields and admin account management support

ALTER TABLE users
ADD COLUMN IF NOT EXISTS full_name TEXT;

UPDATE users
SET full_name = INITCAP(REPLACE(SPLIT_PART(email, '@', 1), '.', ' '))
WHERE full_name IS NULL;

COMMENT ON COLUMN users.full_name IS 'Display name for admin/vendor users.';
