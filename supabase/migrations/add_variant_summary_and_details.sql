-- Migration: Rename variant to variant_summary and add details fields
-- This migration updates the items table to support the new field structure

-- Step 1: Add new columns
ALTER TABLE items 
  ADD COLUMN variant_summary VARCHAR(25),
  ADD COLUMN other_details_1 VARCHAR(40),
  ADD COLUMN other_details_2 VARCHAR(40);

-- Step 2: Copy data from variant to variant_summary (truncate to 25 chars if needed)
UPDATE items 
SET variant_summary = LEFT(variant, 25)
WHERE variant IS NOT NULL;

-- Step 3: Drop the old variant column
ALTER TABLE items DROP COLUMN variant;

-- Note: If you want to keep backward compatibility during transition,
-- you can keep both columns temporarily and drop variant later
