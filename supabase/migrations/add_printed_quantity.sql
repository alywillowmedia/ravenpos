-- Migration: Add printed_quantity column to items table
-- Run this in Supabase SQL Editor to update existing databases

-- Add the printed_quantity column with default value 0
ALTER TABLE items ADD COLUMN IF NOT EXISTS printed_quantity INTEGER DEFAULT 0;

-- Set existing items to 0 printed (they haven't been tracked yet)
UPDATE items SET printed_quantity = 0 WHERE printed_quantity IS NULL;
