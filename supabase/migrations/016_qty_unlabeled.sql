-- Migration: Replace printed_quantity with qty_unlabeled
-- This fixes the logic issue where adding inventory didn't properly track new labels needed
--
-- OLD MODEL: printed_quantity = how many labels have ever been printed (only increased)
-- NEW MODEL: qty_unlabeled = how many items currently need labels (decreases when printed, increases when stock added)

-- Step 1: Add the new column
ALTER TABLE items ADD COLUMN IF NOT EXISTS qty_unlabeled INTEGER DEFAULT 0;

-- Step 2: Convert existing data
-- qty_unlabeled = quantity - printed_quantity (items that don't have labels yet)
-- Use GREATEST to ensure we don't get negative values
UPDATE items
SET qty_unlabeled = GREATEST(0, quantity - COALESCE(printed_quantity, 0))
WHERE qty_unlabeled = 0 OR qty_unlabeled IS NULL;

-- Step 3: Drop the old column (optional - can keep for rollback safety)
-- Uncomment this line after verifying the migration works:
-- ALTER TABLE items DROP COLUMN IF EXISTS printed_quantity;

-- For new items, qty_unlabeled should default to the quantity (all need labels)
-- This is handled in application code when creating items
