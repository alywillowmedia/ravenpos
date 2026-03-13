-- Allow permanent (non-expiring) device authorizations.
ALTER TABLE public.device_authorizations
ALTER COLUMN expires_at DROP NOT NULL;
