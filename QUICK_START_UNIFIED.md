# 🚀 Quick Start Guide - Unified Email Processing

## ✨ What You Have Now

Both Phase 1 (bounce detection) and Phase 2 (full inbox) work together through a **unified system** that runs with a **single `npm run dev` command**.

### Key Point: Enhanced Processor Includes Everything! 🎉

The **Enhanced Processor** already includes ALL Phase 1 bounce detection functionality. You don't need to run both processors - one command does everything!

## 🏃 Quick Start (3 Steps)

### Step 1: Configure Environment

Add this to your `.env` file (if not already there):

```env
# Email Worker Configuration
# Options: 'enhanced' (default), 'legacy', 'both'
PROCESSOR_MODE=enhanced
```

**Tip:** If you don't set `PROCESSOR_MODE`, it defaults to `enhanced` automatically!

### Step 2: Run Database Migration (If Not Done)

```bash
# In Supabase SQL Editor, execute:
# database/phase2_inbox_intelligence.sql
```

### Step 3: Start Everything

```bash
# Single command starts both API server AND email worker!
npm run dev
```

**That's it!** ✅ Everything runs together:

- API server handling requests (cyan output)
- Email worker syncing emails every 5 minutes (green output)
- Both bounce detection AND full email processing active

**Want to run them separately?**

```bash
npm run api     # API server only
npm run worker  # Email worker only
```

## 📊 What's Running?

When you run `npm run dev`, you'll see both outputs in color:

```
[API] Server listening at http://0.0.0.0:3000
[API] API documentation available at http://localhost:3000/docs
[WORKER] 🚀 Email worker scheduler started
[WORKER] ⚙️  Processor Mode: ENHANCED
[WORKER] ⏰ Running every 5 minutes

💡 Processor Modes:
  - enhanced (default): Phase 2 - Full email processing + bounce detection
  - legacy: Phase 1 - Bounce detection only
  - both: Run both processors (for testing/migration)

🔧 To change mode, set PROCESSOR_MODE environment variable
```

Then every 5 minutes you'll see:

```
[WORKER] 🔄 Starting email sync... 2026-02-09T...
[WORKER] 📋 Processor Mode: ENHANCED
[WORKER] 📬 Found 1 active mailbox(es)
[WORKER] 📬 Processing mailbox: your@email.com
[WORKER] 📨 Processing 10 new messages...
[WORKER] 🏷️  Classified as: TRANSACTIONAL (Password reset req...)
[WORKER] 🧵 Creating new thread for: Password reset
[WORKER] ✅ Stored email: abc-123-uuid
[WORKER] ✅ Updated thread abc-456-uuid: 1 messages
[WORKER] 🏷️  Classified as: BOUNCE (Undelivered Mail...)
[WORKER] 🔍 Processing bounce for: failed@example.com
[WORKER] 🆕 New bounce recorded for failed@example.com
[WORKER] ✅ Processed 10/10 messages (1 bounces)
[WORKER] ✅ Email sync completed
```

## 🎯 Processor Modes Explained

### Mode 1: Enhanced (Default) ⭐ RECOMMENDED

```bash
# .env
PROCESSOR_MODE=enhanced
```

**What it does:**

- ✅ Stores ALL emails in database
- ✅ Classifies each email (7 categories)
- ✅ Groups emails into threads
- ✅ Detects and tracks bounces (Phase 1)
- ✅ Provides full inbox API

**Use for:** Production (this is the best option!)

### Mode 2: Legacy

```bash
# .env
PROCESSOR_MODE=legacy
```

**What it does:**

- ✅ Detects and tracks bounces only
- ❌ Does NOT store other emails
- ❌ No classification
- ❌ No threading

**Use for:** If you want Phase 1 behavior only

### Mode 3: Both (Testing)

```bash
# .env
PROCESSOR_MODE=both
```

**What it does:**

- ✅ Runs Enhanced Processor (all features)
- ✅ Also runs Legacy Processor (bounces only)
- ⚠️ Processes emails twice (slower)

**Use for:** Testing migration, comparing results

## 🔄 Switching Modes

Change mode anytime by editing `.env`:

```bash
# 1. Stop the server (Ctrl+C)

# 2. Edit .env
PROCESSOR_MODE=enhanced  # or 'legacy' or 'both'

# 3. Restart everything
npm run dev
```

## 📡 Testing the APIs

### Phase 1 APIs (Still Work!) ✅

```bash
# Set your token
export TOKEN="your-access-token"

# Get bounces (Phase 1)
curl -X GET "http://localhost:3000/api/v1/bounces" \
  -H "Authorization: Bearer $TOKEN"

# Get bounce stats (Phase 1)
curl -X GET "http://localhost:3000/api/v1/bounces/stats" \
  -H "Authorization: Bearer $TOKEN"
```

### Phase 2 APIs (New!) ✨

```bash
# List all emails
curl -X GET "http://localhost:3000/api/v1/emails" \
  -H "Authorization: Bearer $TOKEN"

# Get category counts
curl -X GET "http://localhost:3000/api/v1/emails/categories" \
  -H "Authorization: Bearer $TOKEN"

# Filter by category
curl -X GET "http://localhost:3000/api/v1/emails?category=HUMAN" \
  -H "Authorization: Bearer $TOKEN"

# Get unread emails
curl -X GET "http://localhost:3000/api/v1/emails?is_read=false" \
  -H "Authorization: Bearer $TOKEN"

# List threads
curl -X GET "http://localhost:3000/api/v1/threads" \
  -H "Authorization: Bearer $TOKEN"

# Get thread with all messages
curl -X GET "http://localhost:3000/api/v1/threads/:thread_id" \
  -H "Authorization: Bearer $TOKEN"
```

## 🐛 Troubleshooting

### Worker Not Starting

**Check:**

```bash
# Verify environment variables
cat .env | grep SUPABASE_URL
cat .env | grep SUPABASE_SERVICE_ROLE_KEY

# Check Node version (should be 18+)
node --version
```

### Bounces Not Being Detected

**Check:**

1. Enhanced processor is running (default)
2. Emails are actually bounce messages
3. Look for classification logs: `Classified as: BOUNCE`

```bash
# The worker runs automatically with npm run dev
# Look for [WORKER] prefix in logs:
[WORKER] 🏷️  Classified as: BOUNCE (...)
[WORKER] 🔍 Processing bounce for: email@example.com
```

### No Emails Showing Up

**Check:**

1. Database migration was run
2. Not using legacy mode
3. Mailbox is actually receiving emails

```bash
# Verify mode
cat .env | grep PROCESSOR_MODE

# Should be 'enhanced' or not set (defaults to enhanced)
```

### Want to Test Both Processors

```bash
# Set to both mode
# Edit .env:
PROCESSOR_MODE=both

# Restart
npm run dev

# You'll see both running:
[WORKER] 🔄 Running BOTH processors for your@email.com
```

## 📚 Documentation References

- **[PROCESSOR_MODES_GUIDE.md](./PROCESSOR_MODES_GUIDE.md)** - Detailed explanation of processor modes
- **[PHASE_2_SUMMARY.md](./PHASE_2_SUMMARY.md)** - Phase 2 feature overview
- **[PHASE_2_IMPLEMENTATION_GUIDE.md](./PHASE_2_IMPLEMENTATION_GUIDE.md)** - Complete deployment guide

## 🎉 Success Checklist

After running `npm run dev`, verify:

- [x] Both API and Worker start without errors
- [x] Worker shows "Processor Mode: ENHANCED"
- [x] API server listening on port 3000
- [x] Worker connects to mailboxes successfully
- [x] Worker processes emails and shows classification
- [x] Detects bounces (if any bounce emails exist)
- [x] Updates last_synced_uid in mailboxes table
- [x] API endpoints respond correctly
- [x] Health check works: `curl http://localhost:3000/health`

## 💡 Best Practices

### For Production

```bash
# .env
PROCESSOR_MODE=enhanced  # ← Use this!
```

### For Development

```bash
# npm run dev includes nodemon auto-restart for both API and Worker!
npm run dev           # Starts both API + Worker with auto-restart

# Or run them separately if needed:
npm run api           # API only with auto-restart
npm run worker        # Worker only with auto-restart
```

### For Testing Migration

```bash
# Week 1: Test with 'both' mode
PROCESSOR_MODE=both

# Week 2: Switch to 'enhanced' only
PROCESSOR_MODE=enhanced
```

## 🚀 You're All Set

Your MailSuite backend now runs:

- ✅ Phase 1 bounce detection
- ✅ Phase 2 full email processing
- ✅ Single unified command
- ✅ Configurable modes
- ✅ Backward compatible

**Start coding your Flutter app and consume these APIs!** 📱

---

**Questions?**

- Check the processor mode guide
- Review the logs
- Test the APIs with curl

**Need help?**

- Review [PROCESSOR_MODES_GUIDE.md](./PROCESSOR_MODES_GUIDE.md)
- Check worker logs for errors
- Verify database migration ran successfully
