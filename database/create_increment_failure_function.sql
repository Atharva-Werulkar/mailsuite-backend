-- Create increment_failure function for updating bounce records
-- This function atomically increments the failure count and updates last_failed_at
-- Run this in your Supabase SQL Editor
CREATE OR REPLACE FUNCTION public.increment_failure(bounce_id UUID) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
UPDATE email_bounces
SET failure_count = failure_count + 1,
    last_failed_at = NOW()
WHERE id = bounce_id;
END;
$$;
-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_failure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_failure(UUID) TO service_role;
-- Verify the function was created
SELECT routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name = 'increment_failure';