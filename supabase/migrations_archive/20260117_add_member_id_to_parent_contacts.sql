-- Migration: Add member_id to parent_contacts table
-- This allows linking parent contacts to church members

-- Add member_id column to parent_contacts table
-- Note: members.id is BIGINT, not UUID
ALTER TABLE parent_contacts
ADD COLUMN IF NOT EXISTS member_id BIGINT REFERENCES members(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_parent_contacts_member_id ON parent_contacts(member_id);

-- Add comment explaining the column
COMMENT ON COLUMN parent_contacts.member_id IS 'Links parent contact to a church member record';
