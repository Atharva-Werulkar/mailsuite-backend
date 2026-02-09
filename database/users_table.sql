-- Create users table for custom JWT authentication
-- Run this in your Supabase SQL Editor
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
-- Add RLS policies (optional but recommended)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- Users can read their own data
CREATE POLICY "Users can read own data" ON users FOR
SELECT USING (auth.uid() = id);
-- Update the existing tables to reference the new users table
-- Only if you want to migrate from Supabase auth to custom auth
-- ALTER TABLE mailboxes DROP CONSTRAINT IF EXISTS mailboxes_user_id_fkey;
-- ALTER TABLE mailboxes ADD CONSTRAINT mailboxes_user_id_fkey 
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
-- ALTER TABLE email_bounces DROP CONSTRAINT IF EXISTS email_bounces_user_id_fkey;
-- ALTER TABLE email_bounces ADD CONSTRAINT email_bounces_user_id_fkey 
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;