ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS accepts_marketing BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.customers.accepts_marketing IS 'Customer has explicitly opted in to marketing emails';
