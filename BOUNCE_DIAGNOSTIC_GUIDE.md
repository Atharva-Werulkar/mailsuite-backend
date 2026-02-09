# 🔍 Bounce Diagnostic Extraction Guide

## Issue: "No diagnostic information available"

This happens when the bounce detector cannot extract the error reason from bounce emails.

## ✅ What I Fixed

### Enhanced Diagnostic Extraction with 15+ Patterns

The bounce detector now checks for:

1. **Standard SMTP formats**
   - `550 5.1.1 User not found`
   - `550 <5.1.1> Mailbox not available`

2. **Gmail bounce formats**
   - "Address not found. Your message wasn't delivered..."
   - "The email account that you tried to reach does not exist..."

3. **Outlook/Exchange formats**
   - "Delivery has failed to these recipients..."
   - "Did not reach the following recipient..."

4. **RFC 3463 Diagnostic-Code**
   - `Diagnostic-Code: smtp; 550 User unknown`

5. **Common error phrases**
   - "User not found"
   - "Mailbox full"
   - "Account disabled"
   - "Quota exceeded"

## 🧪 Testing & Debugging

### 1. Check Current Bounce Reasons

Query your database:

```sql
SELECT
  email,
  error_code,
  reason,
  bounce_type,
  failure_count,
  last_failed_at
FROM email_bounces
ORDER BY last_failed_at DESC
LIMIT 20;
```

### 2. Enable Debug Mode

Add to your `.env` file:

```env
DEBUG_BOUNCES=true
```

This will log the first 500 characters of bounce emails where diagnostics couldn't be extracted.

### 3. Restart and Monitor

```bash
npm run dev
```

Watch for new log lines:

```
🔍 Bounce detected - Email: user@example.com, Code: 550, Reason: User not found...
```

If you see:

```
⚠️ No diagnostic extracted. Body sample:
[email content here]
---
```

This shows the actual email content that couldn't be parsed.

## 📋 Common Bounce Email Formats

### Gmail Bounce Example

```
Delivery Status Notification (Failure)

Address not found
Your message wasn't delivered to user@example.com because the address couldn't be found.

550-5.1.1 The email account that you tried to reach does not exist.
```

### Outlook Bounce Example

```
Delivery has failed to these recipients or groups:

user@example.com
The recipient's mailbox is full and can't accept messages now.
```

### Standard SMTP Bounce

```
550 5.1.1 <user@example.com>: Recipient address rejected: User unknown
```

## 🔧 If Still Getting "No diagnostic information"

### Option 1: Share Sample Bounce Email

1. Enable `DEBUG_BOUNCES=true` in `.env`
2. Check server logs for the body sample
3. Share the sample (remove sensitive info) so I can add specific patterns

### Option 2: Manual Database Check

Check if 1-2 bounces actually DO have diagnostic info:

```sql
SELECT email, reason, bounce_type
FROM email_bounces
WHERE reason != 'No diagnostic information available'
LIMIT 5;
```

If some work, the patterns are correct but certain email formats need more patterns.

### Option 3: Add Custom Patterns

If your bounce emails have a unique format, add custom patterns in [bounce-detector.js](d:\Flutter%20Projects\mailsuite-backend\services\email-worker\bounce-detector.js):

```javascript
extractDiagnostic(body) {
  const diagnosticPatterns = [
    // Add your custom pattern here
    /your-custom-pattern-here:\s*(.+?)(?:\n|$)/i,

    // ... existing patterns
  ];
}
```

## 📊 Expected Results After Fix

**Before:**

```sql
| email              | reason                              | bounce_type |
|--------------------|-------------------------------------|-------------|
| user@example.com   | No diagnostic information available | HARD        |
| test@test.com      | No diagnostic information available | UNKNOWN     |
```

**After:**

```sql
| email              | reason                                                  | bounce_type |
|--------------------|---------------------------------------------------------|-------------|
| user@example.com   | 550-5.1.1 The email account does not exist             | HARD        |
| test@test.com      | Recipient address rejected: User unknown in local table | HARD        |
| full@example.com   | Mailbox full and can't accept messages                 | SOFT        |
```

## 🎯 Summary

1. ✅ **15+ new diagnostic patterns** added
2. ✅ **Debug logging** available with `DEBUG_BOUNCES=true`
3. ✅ **Detailed bounce info** logged during processing
4. 🔄 **Restart server** to apply changes
5. 📊 **Check logs** for "🔍 Bounce detected" messages

The diagnostic extraction should now work for most common bounce email formats (Gmail, Outlook, Exchange, standard SMTP).
