-- Add last_synced_at column to mailboxes table
-- This column tracks the timestamp of the last successful sync
-- Run this in your Supabase SQL Editor
-- Add the column if it doesn't exist
ALTER TABLE mailboxes
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_mailboxes_last_synced_at ON mailboxes(last_synced_at);
-- Update existing records to set last_synced_at to created_at initially
UPDATE mailboxes
SET last_synced_at = created_at
WHERE last_synced_at IS NULL
    AND created_at IS NOT NULL;
-- Verify the column was added
SELECT column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'mailboxes'
    AND column_name = 'last_synced_at';