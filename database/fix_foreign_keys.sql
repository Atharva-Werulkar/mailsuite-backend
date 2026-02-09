-- Add foreign key relationship between email_bounces and mailboxes
-- Run this in Supabase SQL Editor
-- First, check if the relationship already exists
DO $$ BEGIN -- Add foreign key constraint for mailbox_id
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'email_bounces_mailbox_id_fkey'
) THEN
ALTER TABLE email_bounces
ADD CONSTRAINT email_bounces_mailbox_id_fkey FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE;
RAISE NOTICE 'Foreign key constraint added successfully';
ELSE RAISE NOTICE 'Foreign key constraint already exists';
END IF;
END $$;
-- Create index for faster joins
CREATE INDEX IF NOT EXISTS idx_email_bounces_mailbox_id ON email_bounces(mailbox_id);
-- Verify the relationship
SELECT tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'email_bounces'
    AND kcu.column_name = 'mailbox_id';