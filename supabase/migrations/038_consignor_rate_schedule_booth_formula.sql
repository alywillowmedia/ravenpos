-- Add booth formula fields to scheduled consignor rate changes
-- so future terms can carry sqft/cost-per-sqft, not only total rent.

ALTER TABLE consignor_rate_schedules
ADD COLUMN IF NOT EXISTS booth_square_feet DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS booth_cost_per_square_foot DECIMAL(10,2);

-- Backfill existing scheduled rows from their total booth rent.
UPDATE consignor_rate_schedules
SET booth_square_feet = monthly_booth_rent,
    booth_cost_per_square_foot = 1
WHERE monthly_booth_rent > 0
  AND booth_square_feet IS NULL
  AND booth_cost_per_square_foot IS NULL;

UPDATE consignor_rate_schedules
SET booth_square_feet = 0
WHERE booth_square_feet IS NULL;

UPDATE consignor_rate_schedules
SET booth_cost_per_square_foot = 0
WHERE booth_cost_per_square_foot IS NULL;

CREATE OR REPLACE FUNCTION sync_consignor_rate_schedule_booth_rent()
RETURNS TRIGGER AS $$
BEGIN
  NEW.booth_square_feet := GREATEST(COALESCE(NEW.booth_square_feet, 0), 0);
  NEW.booth_cost_per_square_foot := GREATEST(COALESCE(NEW.booth_cost_per_square_foot, 0), 0);
  NEW.monthly_booth_rent := ROUND((NEW.booth_square_feet * NEW.booth_cost_per_square_foot)::numeric, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consignor_rate_schedules_sync_booth_rent ON consignor_rate_schedules;
CREATE TRIGGER consignor_rate_schedules_sync_booth_rent
BEFORE INSERT OR UPDATE ON consignor_rate_schedules
FOR EACH ROW EXECUTE FUNCTION sync_consignor_rate_schedule_booth_rent();

COMMENT ON COLUMN consignor_rate_schedules.booth_square_feet IS 'Scheduled booth square footage effective on effective_date.';
COMMENT ON COLUMN consignor_rate_schedules.booth_cost_per_square_foot IS 'Scheduled booth monthly cost per square foot effective on effective_date.';
