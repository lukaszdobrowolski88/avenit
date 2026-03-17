-- Migration: Add household_id to members table
-- This allows linking church members to households for the check-in system

-- Add household_id column to members table
ALTER TABLE members
ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_members_household_id ON members(household_id);

-- Add comment explaining the column
COMMENT ON COLUMN members.household_id IS 'Links member to a household for the kids check-in system';
