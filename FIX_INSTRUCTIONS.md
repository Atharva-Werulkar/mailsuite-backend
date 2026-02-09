# 🔧 Fix Instructions

## Issues Fixed

### 1. ✅ Missing `increment_failure` Database Function

**Error:** `Could not find the function public.increment_failure(bounce_id)`

### 2. ✅ False Bounce Detection (HTML/URLs as emails)

**Error:** Invalid strings like `img src="..."` and `https://...` detected as bounce emails

## Database Setup Required

### Step 1: Create the `increment_failure` Function

Run this SQL in your **Supabase SQL Editor**:

```sql
-- File: database/create_increment_failure_function.sql
CREATE OR REPLACE FUNCTION public.increment_failure(bounce_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE email_bounces
  SET
    failure_count = failure_count + 1,
    last_failed_at = NOW()
  WHERE id = bounce_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_failure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_failure(UUID) TO service_role;
```

### Step 2: Add `last_synced_at` Column (Optional)

If you're still getting the `last_synced_at` error, run this:

```sql
-- File: database/add_last_synced_at_column.sql
ALTER TABLE mailboxes
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_mailboxes_last_synced_at ON mailboxes(last_synced_at);
```

## Code Changes Applied

### ✅ Enhanced Bounce Detector (`bounce-detector.js`)

- Added `isValidEmail()` method with comprehensive validation
- Rejects URLs (http://, https://)
- Rejects HTML tags and characters
- Rejects UUIDs
- Validates email length and domain
- Prevents false positives

### ✅ Improved Processor (`processor.js`)

- Added fallback mechanism if `increment_failure` function doesn't exist
- Added validation check before processing bounces
- Better error handling and logging

## Testing

### 1. Restart Your Server

```bash
npm run dev
```

### 2. Monitor Logs

You should see:

```
✅ Processed 100 messages, found X bounces
🆕 New bounce recorded for valid-email@example.com
```

**You should NOT see:**

- ❌ Bounces with HTML content
- ❌ Bounces with URLs
- ❌ Error: "Could not find the function"

### 3. Verify Database

Check that bounces only contain valid email addresses:

```sql
SELECT email, bounce_type, failure_count
FROM email_bounces
ORDER BY created_at DESC
LIMIT 10;
```

## What Was Fixed

| Issue                | Before                              | After                             |
| -------------------- | ----------------------------------- | --------------------------------- |
| **Missing Function** | ❌ Error thrown, bounce not updated | ✅ Fallback to direct UPDATE      |
| **HTML as Email**    | ❌ `img src="..."` saved as bounce  | ✅ Rejected by validation         |
| **URLs as Email**    | ❌ `https://...` saved as bounce    | ✅ Rejected by validation         |
| **UUIDs as Email**   | ❌ `20e1b6da-...@gmail.com` saved   | ✅ Rejected by UUID pattern check |

## Summary

1. **Run the SQL** in Supabase SQL Editor (`create_increment_failure_function.sql`)
2. **Restart the server** (`npm run dev`)
3. **Monitor logs** - false positives should disappear
4. **Check database** - only valid emails should be stored

Done! 🎉
1. **Run the SQL** in Supabase SQL Editor (`create_increment_failure_function.sql`)
2. **Restart the server** (`npm run dev`)
3. **Monitor logs** - false positives should disappear
4. **Check database** - only valid emails should be stored

Done! 🎉
