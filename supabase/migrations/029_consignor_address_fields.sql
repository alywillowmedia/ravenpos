-- Expanded consignor address fields
-- Keeps legacy `address` for backward compatibility while adding structured fields.

ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN consignors.address_line_2 IS 'Secondary street information such as unit, suite, or apartment.';
COMMENT ON COLUMN consignors.city IS 'City portion of consignor address.';
COMMENT ON COLUMN consignors.state IS 'State or province portion of consignor address.';
COMMENT ON COLUMN consignors.postal_code IS 'ZIP/postal code portion of consignor address.';
COMMENT ON COLUMN consignors.country IS 'Country portion of consignor address.';
