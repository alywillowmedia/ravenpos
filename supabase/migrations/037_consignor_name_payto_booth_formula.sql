-- Consignor contact + payout recipient + booth formula updates
-- Adds separate business/individual naming fields, pay-to selection,
-- and booth-rent formula inputs while keeping legacy columns in sync.

ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS pay_to_type TEXT NOT NULL DEFAULT 'business'
    CHECK (pay_to_type IN ('business', 'individual')),
ADD COLUMN IF NOT EXISTS booth_square_feet DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS booth_cost_per_square_foot DECIMAL(10,2);

-- Backfill business name from existing display name.
UPDATE consignors
SET business_name = name
WHERE business_name IS NULL
  AND name IS NOT NULL
  AND btrim(name) <> '';

-- Preserve existing monthly rent values for legacy rows by seeding formula inputs.
UPDATE consignors
SET booth_square_feet = monthly_booth_rent,
    booth_cost_per_square_foot = 1
WHERE monthly_booth_rent > 0
  AND booth_square_feet IS NULL
  AND booth_cost_per_square_foot IS NULL;

-- Normalize formula inputs for rows without rent.
UPDATE consignors
SET booth_square_feet = 0
WHERE booth_square_feet IS NULL;

UPDATE consignors
SET booth_cost_per_square_foot = 0
WHERE booth_cost_per_square_foot IS NULL;

CREATE OR REPLACE FUNCTION sync_consignor_derived_fields()
RETURNS TRIGGER AS $$
DECLARE
  full_name TEXT;
BEGIN
  NEW.first_name := NULLIF(btrim(COALESCE(NEW.first_name, '')), '');
  NEW.last_name := NULLIF(btrim(COALESCE(NEW.last_name, '')), '');
  NEW.business_name := NULLIF(btrim(COALESCE(NEW.business_name, '')), '');
  NEW.pay_to_type := COALESCE(NEW.pay_to_type, 'business');

  NEW.booth_square_feet := GREATEST(COALESCE(NEW.booth_square_feet, 0), 0);
  NEW.booth_cost_per_square_foot := GREATEST(COALESCE(NEW.booth_cost_per_square_foot, 0), 0);
  NEW.monthly_booth_rent := ROUND((NEW.booth_square_feet * NEW.booth_cost_per_square_foot)::numeric, 2);

  full_name := NULLIF(btrim(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), '');
  NEW.name := COALESCE(NEW.business_name, full_name, NULLIF(btrim(COALESCE(NEW.name, '')), ''), 'Unnamed Consignor');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consignors_sync_derived_fields ON consignors;
CREATE TRIGGER consignors_sync_derived_fields
BEFORE INSERT OR UPDATE ON consignors
FOR EACH ROW EXECUTE FUNCTION sync_consignor_derived_fields();

COMMENT ON COLUMN consignors.business_name IS 'Business or DBA name for the consignor.';
COMMENT ON COLUMN consignors.first_name IS 'Primary individual first name for the consignor.';
COMMENT ON COLUMN consignors.last_name IS 'Primary individual last name for the consignor.';
COMMENT ON COLUMN consignors.pay_to_type IS 'Determines payout recipient: business or individual.';
COMMENT ON COLUMN consignors.booth_square_feet IS 'Booth size in square feet used for rent formula.';
COMMENT ON COLUMN consignors.booth_cost_per_square_foot IS 'Monthly booth cost per square foot.';
