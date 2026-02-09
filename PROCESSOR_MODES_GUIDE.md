# Unified Email Processing System

## Overview

The MailSuite backend now supports **both Phase 1 (bounce-only) and Phase 2 (full inbox)** email processing through a unified system. By default, it runs the **Enhanced Processor** which includes ALL Phase 1 functionality plus Phase 2 features.

## How It Works

### Default Mode (Recommended) ✅

**Enhanced Processor runs with a single command:**

```bash
npm run dev    # Starts API server
npm run worker # Starts email worker with Enhanced Processor
```

**What Enhanced Processor does:**

- ✅ Stores ALL emails (not just bounces)
- ✅ Classifies emails into categories
- ✅ Groups emails into threads
- ✅ **Detects and tracks bounces (Phase 1 compatibility)**
- ✅ Provides full inbox API

**Result:** One processor handles everything efficiently!

## Processor Modes

You can configure which processor runs via the `PROCESSOR_MODE` environment variable:

### Mode 1: Enhanced (Default) - RECOMMENDED ✅

```bash
# In .env file
PROCESSOR_MODE=enhanced
```

**Runs:** Enhanced Processor only  
**Features:** Full Phase 2 + Phase 1 bounce detection  
**Use When:** Production deployment (recommended)  
**Benefits:**

- Single processor handles everything
- Most efficient
- Includes all features

### Mode 2: Legacy

```bash
# In .env file
PROCESSOR_MODE=legacy
```

**Runs:** Original Processor only  
**Features:** Phase 1 bounce detection only  
**Use When:**

- You want to temporarily disable Phase 2 features
- Testing backward compatibility
- Rolling back to Phase 1

### Mode 3: Both

```bash
# In .env file
PROCESSOR_MODE=both
```

**Runs:** Enhanced Processor + Legacy Processor  
**Features:** Both processors run on same emails  
**Use When:**

- Testing migration from Phase 1 to Phase 2
- Comparing results between processors
- Ensuring backward compatibility

**Note:** This mode is redundant since Enhanced already includes bounce detection, but useful for testing.

## How to Use with npm run dev

The system works seamlessly with your existing commands:

### Start Everything

```bash
# Terminal 1: Start API server
npm run dev

# Terminal 2: Start email worker
npm run worker
```

That's it! By default, the Enhanced Processor runs and handles both bounce detection AND full email processing.

### Change Processor Mode

```bash
# Edit your .env file
PROCESSOR_MODE=enhanced  # Or 'legacy' or 'both'

# Restart worker
# Press Ctrl+C to stop, then:
npm run worker
```

## What Each Processor Does

### Enhanced Processor (Phase 2)

**File:** `services/email-worker/enhanced-processor.js`

```javascript
For each email:
1. ✅ Check if already processed (skip duplicates)
2. ✅ Classify email (BOUNCE, TRANSACTIONAL, HUMAN, etc.)
3. ✅ Group into thread/conversation
4. ✅ Store full email metadata in 'emails' table
5. ✅ Update thread statistics
6. ✅ IF email is a BOUNCE:
   - Extract bounce information
   - Store in 'email_bounces' table (Phase 1)
   - Create bounce event
```

### Legacy Processor (Phase 1)

**File:** `services/email-worker/processor.js`

```javascript
For each email:
1. ❓ Check if it's a bounce email
2. ✅ IF bounce:
   - Extract bounce information
   - Store in 'email_bounces' table
3. ❌ Ignores non-bounce emails
```

## Backward Compatibility

### Phase 1 APIs Still Work ✅

Even with Enhanced Processor, all Phase 1 bounce APIs work perfectly:

```bash
# Get bounces (Phase 1 API)
curl -X GET "http://localhost:3000/api/v1/bounces" \
  -H "Authorization: Bearer $TOKEN"

# Get bounce stats (Phase 1 API)
curl -X GET "http://localhost:3000/api/v1/bounces/stats" \
  -H "Authorization: Bearer $TOKEN"
```

### Database Tables

**Phase 1 tables** (still used):

- `email_bounces` - Bounce records
- `email_bounce_events` - Bounce event history

**Phase 2 tables** (new):

- `emails` - All email storage
- `email_threads` - Conversation grouping
- `email_labels` - Custom labels
- `email_label_assignments` - Label assignments

## Performance

### Single Processor (Enhanced) - RECOMMENDED

```
Mailbox with 100 new emails:
- Time: ~10-15 seconds
- Operations:
  ✅ Classify 100 emails
  ✅ Create/update threads
  ✅ Store 100 emails
  ✅ Detect ~2-5 bounces (if any)
  ✅ Store bounce records
```

### Both Processors (Testing Mode)

```
Mailbox with 100 new emails:
- Time: ~15-20 seconds
- Operations:
  ✅ Enhanced: Same as above
  ✅ Legacy: Process again for bounces (redundant)

⚠️ Warning: This mode is 30-40% slower
```

## Migration Path

### From Phase 1 to Phase 2

```bash
# Step 1: Run Phase 2 database migration
# Execute: database/phase2_inbox_intelligence.sql

# Step 2: Keep using 'legacy' mode initially (optional)
PROCESSOR_MODE=legacy

# Step 3: Test with 'both' mode
PROCESSOR_MODE=both
npm run worker

# Step 4: Verify both work correctly
# Check logs, test APIs

# Step 5: Switch to 'enhanced' mode (final)
PROCESSOR_MODE=enhanced
npm run worker
```

### Rolling Back

If you need to rollback to Phase 1:

```bash
# Option 1: Use legacy mode
PROCESSOR_MODE=legacy

# Option 2: Revert scheduler.js
git checkout HEAD -- services/email-worker/scheduler.js

# Restart worker
npm run worker
```

## Troubleshooting

### Check which processor is running

```bash
# Start worker and look for this line:
npm run worker

# Output:
🚀 Email worker scheduler started
⚙️  Processor Mode: ENHANCED
⏰ Running every 5 minutes
```

### Emails not being stored in 'emails' table

**Cause:** Legacy mode is active  
**Solution:** Switch to enhanced mode

```bash
# In .env
PROCESSOR_MODE=enhanced
```

### Bounces not being detected

**Cause:**

1. Database migration not run
2. Classification not detecting bounces

**Solution:**

```bash
# Check if bounce detection works
# Look for this in logs:
🏷️  Classified as: BOUNCE (Undelivered Mail...)
🔍 Processing bounce for: failed@example.com
```

### Duplicate emails in database

**Cause:** Both mode running unnecessarily  
**Solution:** Switch to enhanced mode only

```bash
PROCESSOR_MODE=enhanced
```

The Enhanced Processor checks for duplicates, so this shouldn't happen:

```javascript
// Check if message already exists
const { data: existing } = await this.db
  .from("emails")
  .select("id")
  .eq("mailbox_id", mailbox.id)
  .eq("uid", message.uid)
  .maybeSingle();

if (existing) {
  console.log(`⏭️  Skipping duplicate message UID ${message.uid}`);
  return;
}
```

### Performance is slow

**If using 'both' mode:** Switch to 'enhanced' only

```bash
PROCESSOR_MODE=enhanced
```

**If using 'enhanced' mode:** Check:

1. Database indexes are created
2. Mailbox has reasonable email count
3. No network issues with IMAP

## Best Practices

### For Production ✅

```bash
# .env
PROCESSOR_MODE=enhanced
```

**Why:**

- Most efficient
- Handles everything
- Best performance

### For Testing

```bash
# .env
PROCESSOR_MODE=both
```

**Why:**

- Compare results
- Verify migration
- Ensure backward compatibility

### For Gradual Migration

```bash
# Week 1: Test Phase 2
PROCESSOR_MODE=both

# Week 2: Monitor and compare
# Check logs, verify data

# Week 3: Switch to Phase 2 only
PROCESSOR_MODE=enhanced
```

## Summary

✅ **Default behavior:** Enhanced Processor runs everything (Phase 1 + Phase 2)  
✅ **Single command:** `npm run worker` starts the configured processor  
✅ **Backward compatible:** Phase 1 APIs still work perfectly  
✅ **Configurable:** Switch modes via `PROCESSOR_MODE` env variable  
✅ **Efficient:** One processor handles all email processing

**Recommendation:** Use `PROCESSOR_MODE=enhanced` (default) for production! 🚀
